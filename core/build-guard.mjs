import { operationRegistry } from "centaurai-wanx";
import { createHash } from "node:crypto";
import { validateDefinition, canonicalDefinition } from "./definition.mjs";
export async function nativeCall(context, method, path, params = {}) {
  const operation = operationRegistry.find(
    (op) => op.method === method && op.path === path,
  );
  if (!operation) throw new Error("SDK_OPERATION_UNAVAILABLE");
  const response = await context.client.native.invoke(
    operation.operationId,
    params,
  );
  if (response.status < 200 || response.status >= 300)
    throw new Error("BOX_REQUEST_FAILED");
  return response.body;
}
export async function assertBuildSource(context, input) {
  const path = { agent_id: input.agentId, thread_id: input.threadId };
  const history = await nativeCall(
    context,
    "GET",
    "/api/agents/{agent_id}/threads/{thread_id}/history",
    { path, query: { limit: 1 } },
  );
  if (
    history.conversation_mode !== "craft" ||
    history.turn_active ||
    history.hitl_pending
  )
    throw new Error("IDLE_CRAFT_REQUIRED");
  const agent = await nativeCall(context, "GET", "/api/agents/{agent_id}", {
    path: { agent_id: input.agentId },
  });
  if (!agent.description?.startsWith("WANX_BUILDER_PROJECT:"))
    throw new Error("BUILDER_PROJECT_REQUIRED");
  const file = await nativeCall(
    context,
    "GET",
    "/api/agents/{agent_id}/workspace/file",
    {
      path: { agent_id: input.agentId },
      query: { from_workspace: true, path: "builder/application.json" },
    },
  );
  const definition = validateDefinition(JSON.parse(file.content));
  if (
    JSON.stringify(definition) !==
    JSON.stringify(validateDefinition(input.definition))
  )
    throw new Error("DEFINITION_CHANGED_REFRESH_REQUIRED");
  if (
    agent.description.split("\n")[0] !==
    "WANX_BUILDER_PROJECT:" + definition.applicationId
  )
    throw new Error("APPLICATION_ID_CHANGED");
  const state = await nativeCall(
    context,
    "GET",
    "/api/admin/applications/{application_id}/lifecycle",
    {
      path: { application_id: definition.applicationId },
    },
  );
  const hash = createHash("sha256")
    .update(canonicalDefinition(definition))
    .digest("hex");
  if (
    !state.versions.some(
      (v) => v.version === definition.version && v.definition_hash === hash,
    )
  )
    throw new Error("SAVE_APPLICATION_CENTER_VERSION_FIRST");
  if (definition.schemaVersion !== 2) throw new Error("MIGRATE_DEFINITION_FIRST");
  if (!state.capability_report?.ready || state.draft?.definition_hash !== hash)
    throw new Error("CAPABILITIES_NOT_READY_REFRESH_REQUIRED");
  return definition;
}
export function scopedReceipts(records, state) {
  return records.filter(
    (r) => r.userId === state.user?.id && r.boxId === state.box?.id,
  );
}
