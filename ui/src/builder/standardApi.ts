import { request } from "../api/request";
import {
  standardApps,
  normalizeExpert,
  instantiateStandardApp,
  standardBrief,
  standardDefaults,
  type StandardApp,
  type StandardConfiguration,
} from "../../../core/standard-apps.mjs";
import {
  createProject,
  writeFile,
  startAgent,
} from "./api";
import { skillPackagesApi } from "../api/modules/skillPackages";
import type { OctopAgent } from "../context/AgentContext";
const tools = [
  "current_time",
  "web_fetch",
  "browser_use",
  "tavily_search",
  "brave_search",
  "google_search",
  "kimi_search",
  "searchfree_search",
  "generate_image",
  "generate_video",
];
export async function loadStandardDirectory() {
  const results = await Promise.allSettled([
    request<any[]>("/experts"),
    request<{ items: any[] }>("/experts/hub"),
    request<any[]>("/experts/published"),
  ]);
  const apps = new Map(
    standardApps.map((a) => [a.id, { ...a, availability: "snapshot" }]),
  );
  const warnings: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      warnings.push(
        ["内置专家", "专家市场", "已发布专家"][i] +
          "目录读取失败，当前显示已有快照。",
      );
      continue;
    }
    const source = ["builtin", "market", "published"][i];
    const items = Array.isArray(r.value) ? r.value : r.value.items;
    for (const raw of items) {
      const n = normalizeExpert({ ...raw, availability: "available" }, source);
      const old = apps.get(n.id);
      apps.set(n.id, {
        ...old,
        ...n,
        method: n.method || old?.method || "",
        quickPrompts: n.quickPrompts.length
          ? n.quickPrompts
          : old?.quickPrompts || [],
      });
    }
    if (i === 0)
      for (const [id, a] of apps)
        if (
          a.sourceKind === "builtin" &&
          !items.some((x: any) => x.id === a.expertId)
        )
          apps.set(id, { ...a, availability: "unavailable" });
  }
  return { apps: [...apps.values()], warnings };
}
export async function createStandardProject(
  selected: StandardApp,
  config: StandardConfiguration,
) {
  const url =
    selected.sourceKind === "market"
      ? `/experts/hub/${encodeURIComponent(selected.slug)}`
      : selected.sourceKind === "published"
      ? `/experts/published/${encodeURIComponent(selected.expertId)}`
      : `/experts/${encodeURIComponent(selected.expertId)}`;
  const detail = await request<any>(url);
  const app: StandardApp = {
    ...selected,
    ...normalizeExpert(detail, selected.sourceKind),
    skillSlugs: detail.skill_slugs || selected.skillSlugs,
  };
  if (!app.method)
    throw Error("专家的完整方法尚未就绪，请更新盒子专家目录后重试。");
  const path =
    selected.sourceKind === "market"
      ? url + "/install"
      : selected.sourceKind === "published"
      ? url + "/install"
      : `/agents/from-expert/${encodeURIComponent(selected.expertId)}`;
  const source = await request<
    OctopAgent & { hub_skill_errors?: string[]; copy_skill_errors?: string[] }
  >(path, {
    method: "POST",
    body: JSON.stringify({
      name: config.name + " · 专家能力源",
      description: "WANX_BUILDER_EXPERT_SOURCE:" + selected.id,
      conversation_mode: "craft",
    }),
  });
  if (source.hub_skill_errors?.length || source.copy_skill_errors?.length)
    throw Error("专家技能安装未完成，请在 WANX 原生技能入口处理后重试。");
  const native = await request<{ template_name?: string }>(
    `/agents/${source.agent_id}`,
  );
  let packages: string[] = [];
  try {
    if (source.state !== "running") await startAgent(source.agent_id);
    const skills = await request<{ slug: string; kind: string }[]>(
      `/agents/${source.agent_id}/skills`,
    );
    const existing = skills.filter((s) => s.kind === "workspace");
    if (app.skillSlugs.some((slug) => !existing.some((s) => s.slug === slug)))
      throw Error("专家依赖的技能尚未全部安装，当前不能交付此应用。");
    if (existing.length) {
      const pkg = await skillPackagesApi.create({
        name: config.name + " · 标准专家能力",
        description: "从 WANX 已有专家复制；来源 " + selected.id,
      });
      for (const skill of existing)
        await skillPackagesApi.pushFromWorkspace(source.agent_id, skill.slug, {
          package_id: pkg.id,
        });
      packages = [pkg.id];
    }
  } finally {
    await request(`/agents/${source.agent_id}/stop`, { method: "POST" }).catch(
      () => {},
    );
  }
  const agent=await createProject(config.name,config.goal,undefined,id=>instantiateStandardApp(id,app,config,{nativeTemplate:native.template_name,packages,tools:tools.filter(t=>app.method.includes(t)),connectors:[]}));
  await writeFile(
    agent.agent_id,
    "builder/template.md",
    standardBrief(app, config),
  );
  await writeFile(
    agent.agent_id,
    "builder/expert-source.md",
    `# 来源专家\n\n${app.sourceKind}/${app.expertId}\n\n${app.method}`,
  );
  return agent;
}
export { standardDefaults };
