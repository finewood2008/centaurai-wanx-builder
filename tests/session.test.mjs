import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";
import { createDesktopSession, basePolicy as policy } from "../shell/session.mjs";
import { startGateway, cleanFrame } from "../shell/gateway.mjs";

const user = {
  id: 1,
  application_id: "wanx-builder",
  username: "synthetic",
  role: "admin",
  permissions: [],
  locale: "zh",
};
test("gateway preserves real SDK JSON, multipart, streamed downloads and sockets without exporting tokens", async () => {
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    requests.push({
      method: req.method,
      path: req.url,
      token: req.headers.authorization,
      type: req.headers["content-type"],
      body: Buffer.concat(parts),
    });
    if (req.url === "/api/health") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ok:true,db:true})); return; }
    if (req.url === "/api/auth/captcha") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({provider:"none"})); return; }
    if (req.url === "/api/auth/login") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ access_token: "private-native-test-token", user }),
      );
      return;
    }
    if (req.url === "/api/auth/me") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(user));
      return;
    }
    if (req.url === "/api/settings/capabilities") {
      res.setHeader("content-type", "application/json");
      res.setHeader("X-Octop-Access-Token", "renewed-native-test-token");
      res.end(
        JSON.stringify({
          sdk_management: { protocol_version: 1 },
          server_version: "synthetic",
        }),
      );
      return;
    }
    if (req.url.startsWith("/api/admin/applications")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ application_id: "synthetic-product" }));
      return;
    }
    if (req.url.startsWith("/api/agents/agent-test/workspace/download")) {
      res.setHeader("content-type", "application/octet-stream");
      res.write(Buffer.from([0, 1, 255]));
      res.end(Buffer.from([4, 5]));
      return;
    }
    if (req.url === "/api/agents/agent-test/upload") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ uploaded: true }));
      return;
    }
    res.statusCode = 409;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: "NATIVE_CONFLICT" }));
  });
  const upstreamSockets = new WebSocketServer({ server: upstream });
  let handshakeToken, receivedFrame;
  upstreamSockets.on("connection", (socket, req) => {
    handshakeToken = new URL(req.url, "http://localhost").searchParams.get(
      "token",
    );
    socket.on("message", (data) => {
      receivedFrame = JSON.parse(data.toString());
      socket.send(data.toString());
    });
  });
  await new Promise((done) => upstream.listen(0, "127.0.0.1", done));
  const directory = await mkdtemp(join(tmpdir(), "wanx-client-test-"));
  await writeFile(join(directory, "index.html"), "<h1>local computer UI</h1>");
  const service = createDesktopSession({ secureStore: {} });
  const state = await service.action("connection.direct", {
    baseURL: `http://127.0.0.1:${upstream.address().port}`,
    username: "synthetic",
    password: "synthetic-password",
  });
  const gateway = await startGateway({ service, directory });
  const auth = { Authorization: `Bearer ${state.sessionId}` };
  try {
    assert.match(
      await (await fetch(gateway.origin + "/boxes")).text(),
      /local computer UI/,
    );
    assert.equal((await fetch(gateway.origin + "/api/auth/me")).status, 401);
    assert.equal(
      (
        await fetch(gateway.origin + "/api/auth/me", {
          headers: { ...auth, Origin: "https://other.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(gateway.origin + "/api/auth/login", {
          method: "POST",
          headers: auth,
        })
      ).status,
      403,
    );
    const capabilities = await fetch(
      gateway.origin + "/api/settings/capabilities",
      { headers: auth },
    );
    assert.equal(capabilities.headers.get("x-octop-access-token"), null);
    assert.equal((await capabilities.json()).server_version, "synthetic");
    const created = await fetch(gateway.origin + "/api/admin/applications", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: "synthetic-product",
        capabilities: ["memory"],
      }),
    });
    assert.equal(created.status, 200);
    assert.equal(requests.at(-1).token, "Bearer renewed-native-test-token");
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      application_id: "synthetic-product",
      capabilities: ["memory"],
    });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([7, 8, 9])]), "synthetic.bin");
    const uploaded = await fetch(
      gateway.origin + "/api/agents/agent-test/upload",
      { method: "POST", headers: auth, body: form },
    );
    assert.equal(uploaded.status, 200);
    assert.match(requests.at(-1).type, /^multipart\/form-data/);
    assert.match(requests.at(-1).body.toString(), /synthetic\.bin/);
    const downloaded = await fetch(
      gateway.origin +
        "/api/agents/agent-test/workspace/download?path=synthetic.bin&from_workspace=true",
      { headers: auth },
    );
    assert.equal(downloaded.status, 200);
    assert.deepEqual(
      new Uint8Array(await downloaded.arrayBuffer()),
      new Uint8Array([0, 1, 255, 4, 5]),
    );
    const native409 = await fetch(gateway.origin + "/api/preferences", {
      headers: auth,
    });
    assert.equal(native409.status, 409);
    assert.equal((await native409.json()).code, "NATIVE_CONFLICT");
    const socket = new WebSocket(
      gateway.origin.replace("http:", "ws:") +
        "/api/desktop-stream/ws?token=" +
        state.sessionId,
    );
    await once(socket, "open");
    socket.send(
      JSON.stringify({ type: "start", mode: "view", token: state.sessionId }),
    );
    const [frame] = await once(socket, "message");
    assert.deepEqual(JSON.parse(frame.toString()), {
      type: "start",
      mode: "view",
    });
    assert.equal(handshakeToken, "renewed-native-test-token");
    assert.equal(receivedFrame.token, undefined);
    socket.close();
    await once(socket, "close");
    await service.disconnect();
    assert.equal(
      (
        await fetch(gateway.origin + "/api/admin/applications", {
          method: "POST",
          headers: auth,
        })
      ).status,
      401,
    );
  } finally {
    await service.close();
    await gateway.close();
    for (const socket of upstreamSockets.clients) socket.terminate();
    upstreamSockets.close();
    upstream.closeAllConnections();
    await new Promise((done) => upstream.close(done));
    await rm(directory, { recursive: true, force: true });
  }
});
test("socket caller credentials and unknown endpoints stay outside the SDK", () => {
  assert.throws(
    () => cleanFrame('{"token":"other-user-token"}', "local-session"),
    /PUBLIC_CREDENTIAL_OVERRIDE/,
  );
  assert.deepEqual(
    JSON.parse(
      cleanFrame('{"type":"start","token":"local-session"}', "local-session"),
    ),
    { type: "start" },
  );
  assert.equal(policy.sockets.length, 7);
});
