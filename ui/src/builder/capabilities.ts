import { connectorsApi } from "../api/modules/connectors";
import { skillPackagesApi } from "../api/modules/skillPackages";
import { agentToolsApi } from "../api/modules/agentTools";
import {
  capabilityReport,
  capabilityStatusLabels,
  type CatalogItem,
} from "../../../core/capabilities.mjs";
import type { ApplicationDefinition } from "../../../core/definition.mjs";
export { capabilityReport, capabilityStatusLabels };
export type { CapabilityReport } from "../../../core/capabilities.mjs";
export async function readCapabilityCatalog(
  agentId: string,
  definition?: ApplicationDefinition,
): Promise<CatalogItem[]> {
  const needs = (kind: string) =>
    !definition || definition.capabilities?.some((c) => c.kind === kind);
  const results = await Promise.allSettled([
    needs("connector-catalog") ? connectorsApi.catalog() : Promise.resolve([]),
    needs("connector") ? connectorsApi.listInstances() : Promise.resolve([]),
    needs("skill-package") ? skillPackagesApi.list() : Promise.resolve([]),
    needs("builtin")
      ? agentToolsApi.get(agentId)
      : Promise.resolve({ tools: [] }),
  ]);
  const catalog: CatalogItem[] = [
    {
      kind: "model",
      source: "default",
      label: "模型处理",
      status: "available",
    },
  ];
  const [connectors, instances, skills, tools] = results;
  if (connectors.status === "fulfilled")
    for (const c of connectors.value)
      catalog.push({
        kind: "connector-catalog",
        source: c.kind,
        label: c.name,
        status:
          c.phase === "available" ? "installation_required" : "unsupported",
      });
  else
    catalog.push({
      kind: "connector-catalog",
      source: "*",
      label: "连接器目录",
      status: "unknown",
    });
  if (instances.status === "fulfilled")
    for (const c of instances.value)
      catalog.push({
        kind: "connector",
        source: c.mcp_server_name,
        label: c.display_name,
        status:
          c.status === "active" && c.has_credentials
            ? "available"
            : "authorization_required",
      });
  else
    catalog.push({
      kind: "connector",
      source: "*",
      label: "连接器状态",
      status: "unknown",
    });
  if (skills.status === "fulfilled")
    for (const c of skills.value)
      catalog.push({
        kind: "skill-package",
        source: c.id,
        label: c.name,
        status: c.skill_count > 0 ? "available" : "installation_required",
      });
  else
    catalog.push({
      kind: "skill-package",
      source: "*",
      label: "技能状态",
      status: "unknown",
    });
  if (tools.status === "fulfilled")
    for (const c of tools.value.tools.filter((t) => t.source === "builtin"))
      catalog.push({
        kind: "builtin",
        source: c.name,
        label: c.label,
        status:
          c.available &&
          c.enabled &&
          [
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
          ].includes(c.name)
            ? "available"
            : "unsupported",
      });
  else
    catalog.push({
      kind: "builtin",
      source: "*",
      label: "工具状态",
      status: "unknown",
    });
  return catalog;
}
export async function assertCapabilities(
  agentId: string,
  definition: ApplicationDefinition,
  actionId?: string,
) {
  if (definition.schemaVersion !== 2) return; // Existing v1 installations keep their runtime.
  const report = capabilityReport(
    definition,
    await readCapabilityCatalog(agentId, definition),
  );
  const refs = actionId
    ? definition.actions.find((a) => a.id === actionId)?.capabilityIds
    : undefined;
  const missing = report.items.filter(
    (c) => (!refs || refs.includes(c.id)) && c.status !== "available",
  );
  if (missing.length)
    throw new Error(
      missing
        .map((c) => c.label + "：" + capabilityStatusLabels[c.status])
        .join("；") + "。请完成安装或授权后重试。",
    );
  return report;
}
