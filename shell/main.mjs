import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { createDesktopSession } from "./session.mjs";
import { startGateway } from "./gateway.mjs";
import { createDraftStore } from "./drafts.mjs";
import {
  packageMac,
  electronTemplate,
  verifyMacReceipt,
} from "../core/packager.mjs";
import {
  assertBuildSource,
  scopedReceipts,
  nativeCall,
} from "../core/build-guard.mjs";
import { canonicalDefinition } from "../core/definition.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const product = JSON.parse(await readFile(join(root, "product.json"), "utf8"));
app.setName(product.name);
app.setPath(
  "userData",
  process.env.WANX_BUILDER_USER_DATA
    ? resolve(process.env.WANX_BUILDER_USER_DATA)
    : join(app.getPath("appData"), product.applicationId),
);
let window,
  service,
  gateway,
  heartbeat,
  closing = false,
  building = false;
const trusted = (event) =>
  event.sender === window?.webContents &&
  event.senderFrame === window.webContents.mainFrame &&
  new URL(event.senderFrame.url).origin === gateway.origin;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    try {
      service = createDesktopSession({
        applicationId: product.applicationId,
        dataDirectory: app.getPath("userData"),
        draftStore: createDraftStore(
          join(app.getPath("userData"), "drafts.json"),
        ),
        emit: (state) => {
          if (window && !window.isDestroyed())
            window.webContents.send("wanx-desktop:state", state);
        },
      });
      gateway = await startGateway({
        service,
        directory: join(root, "dist-ui"),
      });
      window = new BrowserWindow({
        width: 1520,
        height: 960,
        minWidth: 1080,
        minHeight: 720,
        title: `${product.name} · ${product.version}`,
        backgroundColor: "#fafbfa",
        webPreferences: {
          preload: join(root, "shell/preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      window.on("page-title-updated", (event) => event.preventDefault());
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== gateway.origin) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(
            contents === window.webContents &&
              permission === "media" &&
              details.isMainFrame &&
              new URL(details.requestingUrl).origin === gateway.origin &&
              details.mediaTypes?.length > 0 &&
              details.mediaTypes.every((t) => t === "audio") &&
              service.snapshot().phase === "ready",
          ),
      );
      ipcMain.handle(
        "wanx-desktop:action",
        async (event, { action, input } = {}) => {
          if (!trusted(event)) return { ok: false, code: "UNTRUSTED_FRAME" };
          try {
            return {
              ok: true,
              value: await service.action(action, input),
              state: service.snapshot(),
            };
          } catch (e) {
            return {
              ok: false,
              code: /^[A-Z_]+$/.test(e.code || e.message)
                ? e.code || e.message
                : "CLIENT_REQUEST_FAILED",
              state: service.snapshot(),
            };
          }
        },
      );
      const readReceipts = async () => {
        try {
          return JSON.parse(
            await readFile(
              join(app.getPath("userData"), "builds.json"),
              "utf8",
            ),
          );
        } catch (e) {
          if (e.code === "ENOENT") return [];
          throw e;
        }
      };
      ipcMain.handle(
        "wanx-builder:action",
        async (event, { action, input = {} } = {}) => {
          if (!trusted(event)) throw new Error("UNTRUSTED_FRAME");
          if (action === "product") return product;
          if (action === "builds")
            return scopedReceipts(await readReceipts(), service.snapshot());
          if (action === "reveal") {
            const records = scopedReceipts(
              await readReceipts(),
              service.snapshot(),
            );
            const record = records.find((r) => r.definitionHash === input.hash);
            if (!record) throw new Error("ARTIFACT_NOT_FOUND");
            shell.showItemInFolder(record.path);
            return true;
          }
          if (product.kind !== "builder") throw new Error("BUILDER_ONLY");
          if (action === "package") {
            if (building) throw new Error("BUILD_IN_PROGRESS");
            const state = service.snapshot();
            const context = service.requireCurrent(input.sessionId);
            const source = await assertBuildSource(context, input);
            service.assertCurrent(context);
            const hash = createHash("sha256")
              .update(canonicalDefinition(source))
              .digest("hex");
            let receipt = scopedReceipts(await readReceipts(), state).find(
              (r) => r.definitionHash === hash,
            );
            if (receipt && !(await verifyMacReceipt(receipt))) receipt = null;
            const chosen = receipt
              ? null
              : await dialog.showOpenDialog(window, {
                  title: "选择安装包保存位置",
                  properties: ["openDirectory", "createDirectory"],
                });
            if (chosen?.canceled) return null;
            const def = await assertBuildSource(context, input);
            service.assertCurrent(context);
            building = true;
            const runId = "build-" + randomUUID();
            const recordBuild = (status, evidence = {}) =>
              nativeCall(
                context,
                "PUT",
                "/api/admin/applications/{application_id}/runs",
                {
                  path: { application_id: def.applicationId },
                  body: {
                    run_id: runId,
                    kind: "build",
                    status,
                    version: def.version,
                    definition_hash: createHash("sha256")
                      .update(canonicalDefinition(def))
                      .digest("hex"),
                    agent_id: input.agentId,
                    thread_id: input.threadId,
                    evidence,
                  },
                },
              );
            try {
              await recordBuild("running");
              receipt ??= await packageMac({
                root,
                template: electronTemplate(app.getPath("exe")),
                destination: chosen.filePaths[0],
                product,
                definition: def,
              });
              service.assertCurrent(context);
              const records = await readReceipts();
              if (
                !records.some(
                  (r) =>
                    r.definitionHash === receipt.definitionHash &&
                    r.boxId === state.box.id &&
                    r.userId === state.user.id,
                )
              )
                records.unshift({
                  ...receipt,
                  boxId: state.box.id,
                  userId: state.user.id,
                  agentId: input.agentId,
                });
              await mkdir(app.getPath("userData"), { recursive: true });
              await writeFile(
                join(app.getPath("userData"), "builds.json"),
                JSON.stringify(records),
              );
              await recordBuild("completed", {
                signature: receipt.signature,
                artifact_sha256: receipt.artifactSha256,
                artifact_hash_kind: receipt.artifactHashKind,
                artifact_name: receipt.path.split("/").pop(),
                platform: "macos",
                arch: "arm64",
              });
              return receipt;
            } catch (error) {
              await recordBuild("failed", {
                error: "本机打包未完成或尚未同步到应用中心，请检查连接并重试。",
              }).catch(() => {});
              throw error;
            } finally {
              building = false;
            }
          }
          throw new Error("UNKNOWN_BUILDER_ACTION");
        },
      );
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: product.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "编辑",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "显示",
            submenu: [{ role: "reload" }, { role: "togglefullscreen" }],
          },
        ]),
      );
      await window.loadURL(gateway.origin + "/builder");
      heartbeat = setInterval(() => void service.refresh(), 10000);
    } catch (e) {
      console.error("BUILDER_START_FAILED", e.message);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (closing || !service) return;
    event.preventDefault();
    closing = true;
    clearInterval(heartbeat);
    void Promise.allSettled([service.close(), gateway?.close()]).finally(() =>
      app.quit(),
    );
  });
}
