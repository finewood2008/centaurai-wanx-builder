import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { createCentaurAIWanxClient, operationRegistry } from "centaurai-wanx";
import { createLANTransport } from "../core/lan-transport.mjs";
import {
  createLanDiscovery,
  lanOrigin,
  probeWanx,
} from "../vendor/zhijun/lan-discovery.mjs";

export const basePolicy = Object.freeze({
  applicationId: "wanx-builder",
  operations: operationRegistry.map((op) => op.operationId),
  sockets: [
    "chat",
    "notifications",
    "terminal",
    "browser-stream",
    "desktop-stream",
    "mobile-stream",
    "mobile-adb-shell",
  ],
});
export function normalizeDirectURL(raw) {
  try {
    return lanOrigin(raw);
  } catch {
    throw new Error("INVALID_BOX_URL");
  }
}

// Discovery and login follow Zhijun's local connection service. SDK use starts
// only after login, for application-scoped WANX business operations.
export function createDesktopSession({
  applicationId = "wanx-builder",
  dataDirectory,
  draftStore,
  discoveryFactory = createLanDiscovery,
  probe = probeWanx,
  fetcher = fetch,
  transportFactory = createLANTransport,
  emit = () => {},
} = {}) {
  const policy = { ...basePolicy, applicationId };
  let current,
    epoch = 0,
    discovery,
    selected = null,
    selectionLoaded = false;
  let selectionPromise,
    connectionQueue = Promise.resolve();
  let state = {
    phase: "disconnected",
    selected: null,
    box: null,
    user: null,
    sessionId: null,
    reason: null,
  };
  const snapshot = () => structuredClone(state);
  const publish = (patch) => {
    state = { ...state, ...patch };
    emit(snapshot());
    return snapshot();
  };
  const requireCurrent = (id) => {
    if (!current || current.id !== id)
      throw new Error("SESSION_CLOSED");
    if (state.phase !== "ready") throw new Error("CONNECTION_LOST");
    return current;
  };
  const assertCurrent = (context) => {
    if (current !== context || epoch !== context.epoch)
      throw new Error("SESSION_CLOSED");
  };
  async function loadSelection() {
    if (selectionLoaded) return;
    selectionPromise ??= (async () => {
      if (dataDirectory) {
        try {
          const saved = JSON.parse(
            await readFile(
              join(dataDirectory, "selected-service.json"),
              "utf8",
            ),
          );
          selected = {
            endpoint: normalizeDirectURL(saved.endpoint),
            name: String(saved.name || "WANX 服务").slice(0, 80),
          };
        } catch (error) {
          if (error.code !== "ENOENT") selected = null;
        }
      }
      selectionLoaded = true;
      publish({ selected });
    })();
    return selectionPromise;
  }
  async function disconnect(reason = null) {
    epoch++;
    const old = current;
    current = undefined;
    publish({
      phase: "disconnected",
      box: null,
      user: null,
      sessionId: null,
      reason,
    });
    await old?.client.close();
  }
  function reconnecting(context) {
    if (current === context)
      publish({ phase: "reconnecting", reason: "CONNECTION_LOST" });
  }
  async function refresh() {
    const context = current;
    if (!context) return;
    try {
      const reply = await context.client.modules.auth.me(
        {},
        { signal: AbortSignal.timeout(5000) },
      );
      assertCurrent(context);
      if ([401, 403].includes(reply.status) ||
          (reply.status === 200 && reply.body.application_id !== applicationId)) {
        await disconnect("WANX_AUTH_REVOKED");
        return;
      }
      if (reply.status !== 200) {
        reconnecting(context);
        return;
      }
      context.renew?.(reply.headers);
      publish({ phase: "ready", reason: null, user: reply.body });
    } catch {
      reconnecting(context);
    }
  }
  async function selectService(address) {
    const endpoint = normalizeDirectURL(address);
    const generation = epoch;
    const item = await probe(endpoint, fetcher);
    if (generation !== epoch) throw new Error("SESSION_CLOSED");
    // Validate the destination before invalidating the existing session.
    if (dataDirectory) {
      await mkdir(dataDirectory, { recursive: true });
      const file = join(dataDirectory, "selected-service.json");
      await writeFile(file + ".tmp", JSON.stringify(item), { mode: 0o600 });
      await rename(file + ".tmp", file);
    }
    await disconnect();
    selected = item;
    publish({ selected });
    return snapshot();
  }
  async function publicJSON(path, body) {
    if (!selected) throw new Error("CONNECTION_REQUIRED");
    const response = await fetcher(selected.endpoint + path, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) {
      const code = value.error?.code || value.code || value.detail?.code;
      throw new Error(
        typeof code === "string" && /^[A-Z_]+$/.test(code)
          ? code
          : "WANX_AUTH_FAILED",
      );
    }
    return value;
  }
  async function login({ username, password, captchaToken }) {
    if (!selected) throw new Error("CONNECTION_REQUIRED");
    await disconnect();
    const generation = epoch,
      target = selected;
    publish({ phase: "connecting", reason: null });
    let client;
    try {
      const reply = await publicJSON("/api/auth/login", {
        username,
        password,
        ...(captchaToken ? { captcha_token: captchaToken } : {}),
        application_id: applicationId,
      });
      if (typeof reply.access_token !== "string")
        throw new Error("WANX_AUTH_FAILED");
      if (generation !== epoch || target !== selected)
        throw new Error("SESSION_CLOSED");
      let token = reply.access_token;
      client = createCentaurAIWanxClient({
        policy,
        transport: transportFactory({
          baseURL: target.endpoint,
          token: async () => token,
        }),
      });
      const identity = await client.modules.auth.me();
      if (identity.status !== 200) throw new Error("WANX_AUTH_FAILED");
      if (identity.body.application_id !== applicationId)
        throw new Error("APPLICATION_SCOPE_MISMATCH");
      if (generation !== epoch || target !== selected)
        throw new Error("SESSION_CLOSED");
      current = {
        id: randomUUID(),
        epoch: generation,
        client,
        renew: (headers) => {
          if (headers["x-octop-access-token"])
            token = headers["x-octop-access-token"];
        },
      };
      return publish({
        phase: "ready",
        box: {
          id: target.endpoint,
          name: target.name,
          mode: new URL(target.endpoint).protocol.slice(0, -1),
        },
        user: identity.body,
        sessionId: current.id,
        reason: null,
      });
    } catch (error) {
      await client?.close();
      if (generation === epoch)
        publish({ phase: "disconnected", reason: error.code || error.message });
      throw error;
    }
  }
  return {
    snapshot,
    disconnect,
    requireCurrent,
    assertCurrent,
    async action(action, input = {}) {
      await loadSelection();
      if (action === "state") return snapshot();
      if (action === "connection.search") {
        discovery ??= discoveryFactory({
          seed: selected ? [selected.endpoint] : [],
          fetcher,
        });
        return { ...(await discovery.scan()), scope: "client-lan" };
      }
      if (action === "connection.captcha")
        return publicJSON("/api/auth/captcha");
      if (
        action === "connection.select" ||
        action === "connection.login" ||
        action === "connection.direct"
      ) {
        const requested = epoch;
        const next = connectionQueue.then(async () => {
          if (requested !== epoch) throw new Error("SESSION_CLOSED");
          if (action === "connection.select")
            return selectService(input.address);
          if (action === "connection.direct")
            await selectService(input.baseURL);
          return login(input);
        });
        connectionQueue = next.catch(() => {});
        return next;
      }
      if (action === "connection.disconnect") {
        await disconnect();
        return snapshot();
      }
      if (action === "connection.retry") {
        await refresh();
        return snapshot();
      }
      if (action === "draft.get" || action === "draft.put") {
        const context = requireCurrent(input.sessionId);
        const scope = {
          boxId: state.box.id,
          userId: state.user.id,
          applicationId: input.applicationId,
        };
        const permission = await context.client.applications.list();
        assertCurrent(context);
        if (permission.status !== 200)
          throw new Error("DRAFT_PERMISSION_DENIED");
        if (!draftStore) throw new Error("DRAFT_STORE_UNAVAILABLE");
        const result = await (action === "draft.put"
          ? draftStore.put(scope, input.value)
          : draftStore.get(scope));
        assertCurrent(context);
        return result;
      }
      throw new Error("UNKNOWN_CLIENT_ACTION");
    },
    async stream(sessionId, operationId, input, options) {
      const context = requireCurrent(sessionId);
      let response;
      try {
        response = await context.client.native.stream(
          operationId,
          input,
          options,
        );
      } catch (error) {
        if (
          current === context &&
          !options?.signal?.aborted &&
          (error instanceof TypeError ||
            /NETWORK|SESSION|NATIVE_HOST|CONNECT_FAILED/.test(error.code || ""))
        ) {
          reconnecting(context);
          throw new Error("CONNECTION_LOST", { cause: error });
        }
        throw error;
      }
      try {
        assertCurrent(context);
      } catch (error) {
        await response.close();
        throw error;
      }
      context.renew?.(response.headers);
      if (response.status === 401) {
        await response.close();
        await disconnect("WANX_AUTH_REVOKED");
        throw new Error("SESSION_CLOSED");
      }
      return { context, response };
    },
    async socket(sessionId, input, options) {
      const context = requireCurrent(sessionId);
      let socket;
      try {
        socket = await context.client.openSocket(input, options);
      } catch (error) {
        if (!options?.signal?.aborted && /CONNECT_FAILED/.test(error.code || ""))
          reconnecting(context);
        throw error;
      }
      try {
        assertCurrent(context);
      } catch (error) {
        await socket.close();
        throw error;
      }
      return { context, socket };
    },
    refresh,
    async close() {
      await disconnect();
      discovery?.close();
    },
  };
}
