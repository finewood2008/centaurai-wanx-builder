import { validateDefinition } from "./definition.mjs";
export const capabilityStatusLabels = {
  available: "已可用",
  installation_required: "待安装",
  authorization_required: "待授权",
  unsupported: "当前不支持",
  unknown: "状态未知",
};
export function capabilityReport(value, catalog) {
  const def = validateDefinition(value);
  if (def.schemaVersion !== 2)
    return { ready: false, items: [], reason: "请先转换为新版草稿" };
  const items = def.capabilities.map((ref) => {
    const entry = catalog.find(
      (c) => c.kind === ref.kind && c.source === ref.source,
    );
    let status =
      entry?.status ||
      (catalog.some((c) => c.kind === ref.kind && c.source === "*") ||
      ref.kind === "skill-catalog"
        ? "unknown"
        : "unsupported");
    if (ref.kind === "instruction-skill")
      status = def.dependencies.skills.some((s) => s.slug === ref.source)
        ? "available"
        : "unsupported";
    return { ...ref, status };
  });
  return { ready: items.every((c) => c.status === "available"), items };
}
