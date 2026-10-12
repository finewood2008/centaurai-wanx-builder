import {
  applicationCapabilities,
  migrateDefinition,
} from "../../../core/definition.mjs";
import { assertCapabilities } from "./capabilities";
import {
  instantiateTemplate,
  templateBrief,
  type TemplateConfiguration,
} from "../../../core/solution-templates.mjs";
import { request } from "../api/request";
import type { OctopAgent } from "../context/AgentContext";
import { octopThreadsApi } from "../api/modules/octopThreads";
import { skillPackagesApi } from "../api/modules/skillPackages";
import {
  actionPrompt,
  validateDefinition,
  exampleDefinition,
  canonicalDefinition,
  type ApplicationDefinition,
} from "../../../core/definition.mjs";
import {
  BUILDER_PROMPT,
  DEFINITION_GUIDE,
} from "../../../core/builder-prompt.mjs";
export { validateDefinition, exampleDefinition };
export type { ApplicationDefinition };
export const PROJECT_MARKER = "WANX_BUILDER_PROJECT:";
export const TRIAL_MARKER = "WANX_BUILDER_TRIAL:";
export interface Product {
  kind: "builder" | "application";
  applicationId: string;
  name: string;
  version: string;
  definition?: ApplicationDefinition;
}
export interface BuildReceipt {
  applicationId: string;
  version: string;
  path: string;
  definitionHash: string;
  builtAt: string;
  signature: string;
  notarized: boolean;
  installationVerified: boolean;
  artifactSha256: string;
  artifactHashKind: string;
}
export interface CenterVersion {
  application_id: string;
  version: string;
  definition_hash: string;
  definition: ApplicationDefinition;
  created_at: number;
  published_at: number | null;
}
export interface CenterRun {
  run_id: string;
  kind: "trial" | "build";
  version: string;
  definition_hash: string;
  status: "prepared" | "running" | "completed" | "failed";
  agent_id: string;
  thread_id: string | null;
  evidence: Record<string, unknown>;
}
export interface CenterState {
  capability_report?: import("./capabilities").CapabilityReport;
  capability_catalog?: import("../../../core/capabilities.mjs").CatalogItem[];
  draft: {
    project_agent_id: string;
    revision: number;
    definition_hash: string;
    definition: ApplicationDefinition;
  } | null;
  versions: CenterVersion[];
  runs: CenterRun[];
  instances: {
    agent_id: string;
    active_version: string | null;
    target_version: string | null;
    status: string;
  }[];
}
const centerPath = (app: string) =>
  `/admin/applications/${encodeURIComponent(app)}`;
export const readCenter = (app: string) =>
  request<CenterState>(centerPath(app) + "/lifecycle");

async function ensureApplication(agentId: string, def: ApplicationDefinition) {
  const products = await request<{ application_id: string }[]>(
    "/admin/applications",
  );
  if (products.some((p) => p.application_id === def.applicationId)) return;
  const agent = await request<{ default_model?: string }>(`/agents/${agentId}`);
  await request("/admin/applications", {
    method: "POST",
    body: JSON.stringify({
      application_id: def.applicationId,
      name: def.name,
      description: def.description,
      capabilities: applicationCapabilities(def),
      agent_template: {
        ...(def.schemaVersion === 2 ? { composition_schema: 2 } : {}),
        name: def.name,
        ...(def.expert.templateId?{template_name:def.expert.templateId}:{}),
        system_prompt: def.expert.systemPrompt,
        welcome_message: def.expert.welcomeMessage,
        ...(agent.default_model ? { default_model: agent.default_model } : {}),
      },
      resource_requirements: {},
    }),
  });
}
export async function saveDraft(
  agentId: string,
  threadId: string | null,
  definition: ApplicationDefinition,
) {
  definition = validateDefinition(definition);
  await ensureApplication(agentId, definition);
  const state = await readCenter(definition.applicationId);
  const hash = await digest(definition);
  if (state.draft && state.draft.project_agent_id !== agentId)
    throw new Error("这个应用已关联另一个构建项目。");
  if (state.draft?.definition_hash === hash) return state.draft;
  return request<NonNullable<CenterState["draft"]>>(
    centerPath(definition.applicationId) + "/draft",
    {
      method: "PUT",
      body: JSON.stringify({
        project_agent_id: agentId,
        thread_id: threadId,
        expected_revision: state.draft?.revision ?? 0,
        definition,
      }),
    },
  );
}
export async function publishVersion(
  agentId: string,
  threadId: string,
  def: ApplicationDefinition,
) {
  return request<CenterVersion>(
    centerPath(def.applicationId) + `/versions/${def.version}/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        project_agent_id: agentId,
        thread_id: threadId,
        definition_hash: await digest(def),
      }),
    },
  );
}
declare global {
  interface Window {
    wanxBuilder?: {
      call<T = unknown>(
        action: string,
        input?: Record<string, unknown>,
      ): Promise<T>;
    };
  }
}
export const readFile = (agentId: string, path: string) =>
  request<{ content: string }>(
    `/agents/${encodeURIComponent(
      agentId,
    )}/workspace/file?from_workspace=true&path=${encodeURIComponent(path)}`,
  ).then((r) => r.content);
export const writeFile = (agentId: string, path: string, content: string) =>
  request(
    `/agents/${encodeURIComponent(
      agentId,
    )}/workspace/file?from_workspace=true&path=${encodeURIComponent(path)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
export const readDefinition = async (agentId: string) =>
  validateDefinition(
    JSON.parse(await readFile(agentId, "builder/application.json")),
  );
export async function digest(def: ApplicationDefinition) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalDefinition(def)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function startAgent(id: string) {
  await request(`/agents/${encodeURIComponent(id)}/start`, { method: "POST" });
}
export async function assertCraft(agentId: string, threadId: string | null) {
  if (!threadId) throw new Error("请先在 Craft 模式开始一段构建对话。");
  const history = await octopThreadsApi.history(agentId, threadId);
  if (
    history.conversation_mode !== "craft" ||
    history.turn_active ||
    history.hitl_pending
  )
    throw new Error("请切换到 Craft 模式后执行此操作。");
}
export async function seedProject(
  agent: OctopAgent,
  name: string,
  configuration?: TemplateConfiguration,
  initialDefinition?: ApplicationDefinition,
) {
  if (agent.state !== "running") await startAgent(agent.agent_id);
  const appId = agent.description?.slice(PROJECT_MARKER.length).split("\n")[0];
  if (!appId) throw new Error("PROJECT_ID_MISSING");
  await writeFile(
    agent.agent_id,
    "builder/definition-guide.md",
    DEFINITION_GUIDE,
  );
  let exists = false;
  try {
    await readFile(agent.agent_id, "builder/application.json");
    exists = true;
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
  if (!exists)
    await writeFile(
      agent.agent_id,
      "builder/application.json",
      JSON.stringify(
        initialDefinition ?? (configuration
          ? instantiateTemplate(appId, configuration)
          : exampleDefinition(appId, name)),
        null,
        2,
      ),
    );
}
export function isMissing(error: unknown) {
  return (
    error instanceof Error &&
    /404|NOT_FOUND|not found|cannot read|不存在|未找到/i.test(error.message)
  );
}
export async function createProject(
  name: string,
  goal: string,
  configuration?: TemplateConfiguration,
  definitionFactory?: (id:string)=>ApplicationDefinition,
) {
  const applicationId = "app-" + crypto.randomUUID().slice(0, 12);
  if (configuration) instantiateTemplate(applicationId, configuration);
  const initialDefinition=definitionFactory?validateDefinition(definitionFactory(applicationId)):undefined;
  if(initialDefinition&&initialDefinition.applicationId!==applicationId)throw new Error("APPLICATION_ID_MISMATCH");
  const agent = await request<OctopAgent>("/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: PROJECT_MARKER + applicationId + "\n" + goal,
      system_prompt: BUILDER_PROMPT,
      welcome_message: configuration
        ? "模板已经准备好了。我们一起调整用途、工作方式和需要的能力，然后试用。"
        : "从现有配置继续，告诉我这次想调整什么。",
      icon_name: "panels-top-left",
      color: "#316c51",
    }),
  });
  await seedProject(agent, name, configuration, initialDefinition);
  if (configuration)
    await writeFile(
      agent.agent_id,
      "builder/template.md",
      templateBrief(configuration),
    );
  await writeFile(agent.agent_id, "builder/brief.md", `# ${name}\n\n${goal}\n`);
  await saveDraft(agent.agent_id, null, await readDefinition(agent.agent_id));
  return agent;
}

export async function saveConfiguredDraft(
  agentId: string,
  threadId: string,
  original: ApplicationDefinition,
  edited: ApplicationDefinition,
) {
  await assertCraft(agentId, threadId);
  const fresh = await readDefinition(agentId);
  const next = validateDefinition(edited);
  if (canonicalDefinition(fresh) !== canonicalDefinition(original)) {
    // Retry a partial save only when the workspace still contains this exact edit.
    const attempted = { ...next, version: fresh.version };
    if (canonicalDefinition(fresh) !== canonicalDefinition(attempted))
      throw new Error("配置已被对话更新，请刷新后再保存，避免覆盖刚才的修改。");
    next.version = fresh.version;
  }
  if (next.applicationId !== original.applicationId || next.schemaVersion !== 2)
    throw new Error("请在当前应用的新版草稿中修改配置。");
  const state = await readCenter(next.applicationId);
  if (state.versions.some((v) => v.version === next.version)) {
    const all = [...state.versions.map((v) => v.version), next.version];
    all.sort((a, b) => {
      const x = a.split(".").map(Number),
        y = b.split(".").map(Number);
      return x.map((n, i) => n - y[i]).find((n) => n !== 0) || 0;
    });
    const parts = all[all.length - 1].split(".").map(Number);
    parts[2]++;
    next.version = parts.join(".");
  }
  await writeFile(
    agentId,
    "builder/application.json",
    JSON.stringify(next, null, 2),
  );
  await saveDraft(agentId, threadId, next);
  return next;
}
export async function installSkills(
  agentId: string,
  def: ApplicationDefinition,
) {
  await request(`/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ skill_package_ids: def.dependencies.skillPackages }),
  });
  for (const packageId of def.dependencies.skillPackages) {
    const pkg = await skillPackagesApi.get(packageId);
    if (!pkg.skills.length) throw new Error("所选技能包尚未准备好。");
    await skillPackagesApi.copyToWorkspace(agentId, packageId, {
      skill_slugs: pkg.skills.map((skill) => skill.slug),
      overwrite: true,
    });
  }
  for (const skill of def.dependencies.skills) {
    if (def.schemaVersion === 2 && skill.files.length)
      throw new Error("只能添加说明型技能。");
    await writeFile(agentId, `skills/${skill.slug}/SKILL.md`, skill.content);
    for (const file of skill.files)
      await writeFile(
        agentId,
        `skills/${skill.slug}/${file.path}`,
        file.content,
      );
  }
  await request(`/agents/${encodeURIComponent(agentId)}/reload`, {
    method: "POST",
  });
}
export async function createTrial(
  projectId: string,
  def: ApplicationDefinition,
) {
  if (def.schemaVersion !== 2) throw new Error("请先转换为新版草稿。");
  await assertCapabilities(projectId, def);
  const hash = await digest(def);
  const marker = TRIAL_MARKER + projectId + ":" + hash;
  const agents = await request<OctopAgent[]>("/agents");
  let trial = agents.find((a) => a.description === marker);
  if (!trial)
    trial = await request<OctopAgent>("/agents", {
      method: "POST",
      body: JSON.stringify({
        name: def.name + " · 试用 " + hash.slice(0, 6),
        ...(def.expert.templateId?{template_name:def.expert.templateId}:{}),
        description: marker,
        system_prompt: def.expert.systemPrompt,
        welcome_message: def.expert.welcomeMessage,
        mcp_servers: def.dependencies.connectors,
        knowledge_base_ids: def.dependencies.knowledgeBases,
        color: "#86714a",
      }),
    });
  if (trial.state !== "running") await startAgent(trial.agent_id);
  await writeFile(
    trial.agent_id,
    "builder/application.json",
    JSON.stringify(def, null, 2),
  );
  await installSkills(trial.agent_id, def);
  const state = await readCenter(def.applicationId);
  const runId = "trial-" + trial.agent_id;
  if (!state.runs.some((r) => r.run_id === runId))
    await request(centerPath(def.applicationId) + "/runs", {
      method: "PUT",
      body: JSON.stringify({
        run_id: runId,
        version: def.version,
        definition_hash: hash,
        kind: "trial",
        status: "prepared",
        agent_id: trial.agent_id,
      }),
    });
  return trial;
}
export async function snapshotVersion(
  agentId: string,
  def: ApplicationDefinition,
  threadId: string,
) {
  if (def.schemaVersion !== 2) throw new Error("请先转换为新版草稿。");
  await saveDraft(agentId, threadId, def);
  await assertCapabilities(agentId, def);
  return request<CenterVersion>(centerPath(def.applicationId) + "/versions", {
    method: "POST",
    body: JSON.stringify({
      project_agent_id: agentId,
      thread_id: threadId,
      definition_hash: await digest(def),
    }),
  });
}
export async function runtimeProfile(product: Product) {
  const def = validateDefinition(product.definition);
  const base = `/applications/${encodeURIComponent(product.applicationId)}`;
  const authoritative = await request<CenterVersion>(
    base + `/versions/${product.version}`,
  );
  const hash = await digest(def);
  if (
    def.applicationId !== product.applicationId ||
    def.version !== product.version ||
    authoritative.definition_hash !== hash ||
    (await digest(authoritative.definition)) !== hash
  )
    throw new Error("安装包与应用中心登记的版本不一致，请重新生成安装包。");
  const install = (phase: "begin" | "complete" | "failed", error = "") =>
    request<{ agent_id: string; status: string }>(base + "/instance", {
      method: "POST",
      body: JSON.stringify({
        version: def.version,
        definition_hash: hash,
        phase,
        error,
      }),
    });
  const profile = await install("begin");
  if (!profile.agent_id) throw new Error("APPLICATION_PROFILE_UNAVAILABLE");
  const agentId = profile.agent_id;
  try {
    const agent = await request<OctopAgent>(
      `/agents/${encodeURIComponent(agentId)}`,
    );
    if (agent.state !== "running") await startAgent(agentId);
    await assertCapabilities(agentId, def);
    let installed = "";
    try {
      installed = await readFile(agentId, "builder/installed-version.txt");
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
    if (installed !== hash) {
      let previous: ApplicationDefinition | null = null;
      const bindings = await readKnowledgeBindings(agentId);
      let knowledgeBases = def.dependencies.knowledgeBases;
      if (def.dependencies.knowledgeBases.length) {
        const visible = await request<{ id: string }[]>("/knowledge-bases");
        knowledgeBases = def.dependencies.knowledgeBases.map((source) => {
          const target = bindings[source] || source;
          if (!visible.some((k) => k.id === target))
            throw new Error("请先为此应用绑定它自己的知识库，再继续连接。");
          return target;
        });
      }
      if (installed) {
        previous = await readDefinition(agentId);
        // The definition write can succeed while the final version marker fails.
        // Resume only the exact interrupted update, using its original version.
        try {
          const pending = JSON.parse(
            await readFile(agentId, "builder/update-pending.json"),
          );
          if (
            pending.fromHash === installed &&
            pending.toHash === hash &&
            pending.fromDefinition
          )
            previous = validateDefinition(pending.fromDefinition);
        } catch (e) {
          if (!isMissing(e)) throw e;
        }
        const before = previous.version.split(".").map(Number),
          after = def.version.split(".").map(Number);
        const change =
          after.map((v, i) => v - before[i]).find((v) => v !== 0) || 0;
        if (change <= 0)
          throw new Error(
            "当前工作区已有相同或更新版本。请为修改提升版本号，并使用新安装包。",
          );
      }
      await writeFile(
        agentId,
        "builder/update-pending.json",
        JSON.stringify({
          fromHash: installed,
          toHash: hash,
          fromDefinition: previous,
          startedAt: new Date().toISOString(),
        }),
      );
      await request(`/agents/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          system_prompt: def.expert.systemPrompt,
          welcome_message: def.expert.welcomeMessage,
          ...(def.dependencies.connectors.length ||
          previous?.dependencies.connectors.length
            ? { mcp_servers: def.dependencies.connectors }
            : {}),
          ...(knowledgeBases.length ||
          previous?.dependencies.knowledgeBases.length
            ? { knowledge_base_ids: knowledgeBases }
            : {}),
        }),
      });
      await installSkills(agentId, def);
      await installAutomations(agentId, def, previous);
      await writeFile(
        agentId,
        "builder/application.json",
        JSON.stringify(def, null, 2),
      );
      await writeFile(agentId, "builder/installed-version.txt", hash);
      await writeFile(
        agentId,
        "builder/update-pending.json",
        JSON.stringify({ toHash: hash, completedAt: new Date().toISOString() }),
      );
    }
    if (profile.status !== "ready") await install("complete");
    return agentId;
  } catch (error) {
    await install("failed", "应用配置更新未完成，请重新连接以继续。").catch(
      () => {},
    );
    throw error;
  }
}

export async function registerApplication(
  agentId: string,
  def: ApplicationDefinition,
) {
  const me = await request<{ id: number }>("/auth/me");
  const agent = await request<{ default_model?: string }>(`/agents/${agentId}`);
  const body = {
    application_id: def.applicationId,
    name: def.name,
    description: def.description,
    capabilities: applicationCapabilities(def),
    agent_template: {
      ...(def.schemaVersion === 2 ? { composition_schema: 2 } : {}),
      name: def.name,
      ...(def.expert.templateId?{template_name:def.expert.templateId}:{}),
      system_prompt: def.expert.systemPrompt,
      welcome_message: def.expert.welcomeMessage,
      ...(agent.default_model ? { default_model: agent.default_model } : {}),
    },
    resource_requirements: {},
  };
  const products = await request<
    { application_id: string; capabilities?: string[] }[]
  >("/admin/applications");
  const existing = products.find((p) => p.application_id === def.applicationId);
  if (existing) {
    const state = await readCenter(def.applicationId);
    if (
      state.instances.some((i) =>
        state.versions.some(
          (v) =>
            v.version === i.active_version && v.definition.schemaVersion === 1,
        ),
      )
    )
      body.capabilities = [
        ...new Set([...body.capabilities, ...(existing.capabilities ?? [])]),
      ];
    const { application_id: _, ...patch } = body;
    await request(`/admin/applications/${def.applicationId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } else
    await request("/admin/applications", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const deployment = await request<{
    resource_bindings: Record<string, string>;
    configuration: Record<string, unknown>;
  }>(`/admin/applications/${def.applicationId}/deployment`);
  await request(`/admin/applications/${def.applicationId}/deployment`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      resource_bindings: deployment.resource_bindings,
      configuration: deployment.configuration,
    }),
  });
  await request(`/admin/applications/${def.applicationId}/access`, {
    method: "PUT",
    body: JSON.stringify({ user_id: me.id, enabled: true }),
  });
  const record = {
    type: "box-registration",
    applicationId: def.applicationId,
    definitionHash: await digest(def),
    registeredAt: new Date().toISOString(),
    remoteIdentityVerified: false,
  };
  await writeFile(
    agentId,
    "builder/verification/registration.json",
    JSON.stringify(record, null, 2),
  );
  return record;
}
export async function recordTrial(
  agentId: string,
  threadId: string | null,
  def: ApplicationDefinition,
) {
  if (!threadId) throw new Error("先执行一次真实任务。");
  const history = await octopThreadsApi.history(agentId, threadId);
  if (history.turn_active || history.hitl_pending)
    throw new Error("请等待任务和执行确认完成。");
  const outputs = [];
  for (const action of def.actions) {
    try {
      const content = await readFile(agentId, action.resultPath);
      outputs.push({
        path: action.resultPath,
        bytes: new TextEncoder().encode(content).length,
      });
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
  }
  const record = await request<CenterRun>(
    centerPath(def.applicationId) + "/runs",
    {
      method: "PUT",
      body: JSON.stringify({
        run_id: "trial-" + agentId,
        version: def.version,
        definition_hash: await digest(def),
        kind: "trial",
        status: "completed",
        agent_id: agentId,
        thread_id: threadId,
      }),
    },
  );
  return { ...record, outputs };
}

export async function readKnowledgeBindings(
  agentId: string,
): Promise<Record<string, string>> {
  try {
    return JSON.parse(
      await readFile(agentId, "builder/knowledge-bindings.json"),
    );
  } catch (e) {
    if (!isMissing(e)) throw e;
    return {};
  }
}
export async function bindRuntimeKnowledge(
  product: Product,
  bindings: Record<string, string>,
) {
  const profile = await request<{ agent_id: string }>(
    `/applications/${product.applicationId}/profile`,
    { method: "POST" },
  );
  await startAgent(profile.agent_id);
  const visible = await request<{ id: string }[]>("/knowledge-bases");
  for (const source of product.definition!.dependencies.knowledgeBases) {
    if (!visible.some((k) => k.id === bindings[source]))
      throw new Error("请选择此应用可用的知识库。");
  }
  await writeFile(
    profile.agent_id,
    "builder/knowledge-bindings.json",
    JSON.stringify(bindings),
  );
}

async function installAutomations(
  agentId: string,
  def: ApplicationDefinition,
  previous: ApplicationDefinition | null = null,
) {
  if (!def.automations.length && !previous?.automations.length) return;
  const jobs = await request<
    { id: string; session_key?: string; enabled: boolean }[]
  >(`/agents/${agentId}/cron`);
  for (const task of previous?.automations ?? []) {
    if (def.automations.some((current) => current.id === task.id)) continue;
    const job = jobs.find(
      (item) => item.session_key === "builder-task-" + task.id,
    );
    if (job)
      await request(`/agents/${agentId}/cron/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      });
  }
  for (const task of def.automations) {
    const key = "builder-task-" + task.id;
    const existing = jobs.find((job) => job.session_key === key);
    const body = {
      name: task.name,
      trigger: task.trigger,
      prompt: actionPrompt(def, task.actionId),
      session_key: key,
      fresh_thread: false,
      mcp_servers: def.dependencies.connectors,
    };
    // Installation prepares jobs disabled. User enables them in the native Tasks UI;
    // updates preserve that user's enabled/paused choice and existing task history.
    await request(
      `/agents/${agentId}/cron${existing ? "/" + existing.id : ""}`,
      {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({
          ...body,
          ...(!existing ? { enabled: false } : {}),
        }),
      },
    );
  }
}

export async function migrateDraft(
  agentId: string,
  threadId: string,
  definition: ApplicationDefinition,
) {
  await assertCraft(agentId, threadId);
  const next = migrateDefinition(definition);
  const state = await readCenter(next.applicationId);
  const versions = [
    next.version,
    ...state.versions.map((v) => v.version),
    ...(state.draft ? [state.draft.definition.version] : []),
  ];
  versions.sort((a, b) => {
    const x = a.split(".").map(Number),
      y = b.split(".").map(Number);
    return x.map((n, i) => n - y[i]).find((n) => n !== 0) || 0;
  });
  const parts = versions[versions.length - 1].split(".").map(Number);
  parts[2]++;
  next.version = parts.join(".");
  await writeFile(
    agentId,
    "builder/application.json",
    JSON.stringify(next, null, 2),
  );
  await writeFile(agentId, "builder/definition-guide.md", DEFINITION_GUIDE);
  await saveDraft(agentId, threadId, next);
  return next;
}
