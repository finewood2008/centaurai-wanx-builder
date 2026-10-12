import { beforeEach, describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
const { request, history } = vi.hoisted(() => ({
  request: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../api/request", () => ({ request }));
vi.mock("../api/modules/octopThreads", () => ({
  octopThreadsApi: { history },
}));
import {
  migrateDraft,
  assertCraft,
  runtimeProfile,
  exampleDefinition,
  digest,
  registerApplication,
} from "./api";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
});
describe("Builder app lifecycle", () => {
  it("requires an idle Craft thread including after mode changes", async () => {
    for (const value of [
      { conversation_mode: "ask" },
      { conversation_mode: "plan" },
      { conversation_mode: "craft", turn_active: true },
      { conversation_mode: "craft", hitl_pending: {} },
    ]) {
      history.mockResolvedValue(value);
      await expect(assertCraft("a", "t")).rejects.toThrow();
    }
    history.mockResolvedValue({ conversation_mode: "craft" });
    await expect(assertCraft("a", "t")).resolves.toBeUndefined();
  });
  it("installs only app configuration and skill files; retries interrupted setup", async () => {
    const def = exampleDefinition();
    const files = new Map<string, string>();
    let fail = true;
    request.mockImplementation(
      async (url: string, options?: { method?: string; body?: string }) => {
        if (url.includes("/versions/"))
          return { definition: def, definition_hash: await digest(def) };
        if (url.endsWith("/instance"))
          return { agent_id: "a", status: "installing" };
        if (url === "/agents/a") return { state: "running" };
        if (url.endsWith("/reload")) {
          if (fail) throw new Error("connection interrupted");
          return undefined;
        }
        const path = new URL("http://test" + url).searchParams.get("path");
        if (path) {
          if (options?.method === "PUT") {
            files.set(path, JSON.parse(options.body!).content);
            return {};
          }
          if (!files.has(path)) throw new Error("NOT_FOUND");
          return { content: files.get(path) };
        }
        throw new Error("unexpected request " + url);
      },
    );
    const product = {
      kind: "application" as const,
      applicationId: def.applicationId,
      name: def.name,
      version: def.version,
      definition: def,
    };
    await expect(runtimeProfile(product)).rejects.toThrow("interrupted");
    expect(files.has("builder/installed-version.txt")).toBe(false);
    fail = false;
    await expect(runtimeProfile(product)).resolves.toBe("a");
    expect(files.get("builder/installed-version.txt")).toBe(await digest(def));
    expect([...files.keys()].some((p) => p.startsWith("outputs/"))).toBe(false);
    const count = request.mock.calls.length;
    await runtimeProfile(product);
    expect(
      request.mock.calls
        .slice(count)
        .some(([, o]) => o?.method === "PATCH" || o?.method === "PUT"),
    ).toBe(false);
  });
  it("product registration grants only the signed-in user", async () => {
    request.mockImplementation(async (url: string) =>
      url === "/auth/me"
        ? { id: 7 }
        : url === "/admin/applications"
        ? []
        : url.endsWith("/deployment")
        ? { resource_bindings: {}, configuration: {} }
        : {},
    );
    await registerApplication("project", exampleDefinition());
    const call = request.mock.calls.find(([u]) => u.endsWith("/access"))!;
    expect(JSON.parse(call[1].body)).toEqual({ user_id: 7, enabled: true });
  });
  it("recovers an update after the definition was saved without losing user files", async () => {
    const previous = exampleDefinition();
    const next = { ...previous, version: "0.2.0" };
    const files = new Map([
      ["builder/application.json", JSON.stringify(previous)],
      ["builder/installed-version.txt", await digest(previous)],
      ["outputs/draft.md", "用户已保存的文稿"],
    ]);
    let failCommit = true;
    request.mockImplementation(
      async (url: string, options?: { method?: string; body?: string }) => {
        if (url.includes("/versions/")) {
          const value = url.endsWith(previous.version) ? previous : next;
          return { definition: value, definition_hash: await digest(value) };
        }
        if (url.endsWith("/instance"))
          return { agent_id: "a", status: "installing" };
        if (url === "/agents/a") return { state: "running" };
        if (url.endsWith("/reload")) return {};
        const path = new URL("http://test" + url).searchParams.get("path");
        if (path) {
          if (options?.method === "PUT") {
            if (path === "builder/installed-version.txt" && failCommit)
              throw new Error("connection interrupted");
            files.set(path, JSON.parse(options.body!).content);
            return {};
          }
          if (!files.has(path)) throw new Error("NOT_FOUND");
          return { content: files.get(path) };
        }
        throw new Error("unexpected request " + url);
      },
    );
    const product = {
      kind: "application" as const,
      applicationId: next.applicationId,
      name: next.name,
      version: next.version,
      definition: next,
    };
    await expect(runtimeProfile(product)).rejects.toThrow("interrupted");
    expect(JSON.parse(files.get("builder/application.json")!).version).toBe(
      "0.2.0",
    );
    failCommit = false;
    await expect(runtimeProfile(product)).resolves.toBe("a");
    expect(files.get("builder/installed-version.txt")).toBe(await digest(next));
    expect(files.get("outputs/draft.md")).toBe("用户已保存的文稿");
    await expect(
      runtimeProfile({
        ...product,
        version: previous.version,
        definition: previous,
      }),
    ).rejects.toThrow("更新版本");
  });
});

it("restores snapshots to a newer v2 draft without overwriting a released version", async () => {
  history.mockResolvedValue({ conversation_mode: "craft" });
  const old = exampleDefinition();
  request.mockImplementation(
    async (url: string, options?: { method?: string; body?: string }) => {
      if (url.endsWith("/lifecycle"))
        return {
          draft: null,
          versions: [{ version: "2.3.9" }],
          instances: [],
          runs: [],
        };
      if (url === "/admin/applications")
        return [{ application_id: old.applicationId }];
      return {};
    },
  );
  const result = await migrateDraft("a", "t", old);
  expect(result.version).toBe("2.3.10");
  expect(result.schemaVersion).toBe(2);
  expect(old.version).toBe("0.1.0");
  expect(request.mock.calls.some(([url]) => url.includes("/versions"))).toBe(
    false,
  );
});

import { saveConfiguredDraft } from "./api";
import {
  instantiateTemplate,
  templateDefaults,
} from "../../../core/solution-templates.mjs";
it("configuration saves preserve immutable versions and can retry a partially saved draft", async () => {
  history.mockResolvedValue({ conversation_mode: "craft" });
  const original = instantiateTemplate(
    "app-save-config",
    templateDefaults("weekly"),
  );
  const edited = { ...original, name: "新简报" };
  let fresh = original,
    fail = true;
  const drafts: any[] = [];
  request.mockImplementation(
    async (url: string, options?: { method?: string; body?: string }) => {
      const path = new URL("http://test" + url).searchParams.get("path");
      if (path === "builder/application.json") {
        if (options?.method === "PUT") {
          fresh = JSON.parse(options.body!).content;
          fresh = JSON.parse(fresh as unknown as string);
          return {};
        }
        return { content: JSON.stringify(fresh) };
      }
      if (url.endsWith("/lifecycle"))
        return {
          draft: null,
          versions: [{ version: "0.1.0" }],
          instances: [],
          runs: [],
        };
      if (url === "/admin/applications")
        return [{ application_id: original.applicationId }];
      if (url.endsWith("/draft")) {
        if (fail) {
          fail = false;
          throw new Error("connection interrupted");
        }
        drafts.push(JSON.parse(options!.body!));
        return {};
      }
      return {};
    },
  );
  await expect(saveConfiguredDraft("a", "t", original, edited)).rejects.toThrow(
    "connection interrupted",
  );
  expect(fresh.version).toBe("0.1.1");
  const result = await saveConfiguredDraft("a", "t", original, edited);
  expect(result.version).toBe("0.1.1");
  expect(result.name).toBe("新简报");
  expect(original.version).toBe("0.1.0");
  expect(drafts[0].definition).toEqual(fresh);
  fresh = { ...fresh, description: "对话已修改" };
  await expect(saveConfiguredDraft("a", "t", original, edited)).rejects.toThrow(
    "配置已被对话更新",
  );
  history.mockResolvedValue({ conversation_mode: "ask" });
  const count = request.mock.calls.length;
  await expect(saveConfiguredDraft("a", "t", fresh, edited)).rejects.toThrow(
    "Craft",
  );
  expect(request.mock.calls.length).toBe(count);
});
import { createProject } from './api';
it('standard applications save their actual initial definition once without a generic intermediate draft',async()=>{
 let created:any;const files=new Map<string,string>();const drafts:any[]=[];
 request.mockImplementation(async(url:string,options?:{method?:string;body?:string})=>{
  if(url==='/agents'&&options?.method==='POST'){const body=JSON.parse(options.body!);created={...body,agent_id:'new',state:'running'};return created;}
  if(url==='/agents/new')return {default_model:'openai/gpt-4o'};
  if(url==='/admin/applications')return options?.method==='POST'?{}:[];
  if(url.endsWith('/lifecycle'))return {draft:null,versions:[],runs:[],instances:[]};
  if(url.endsWith('/draft')){drafts.push(JSON.parse(options!.body!));return {};}
  const path=new URL('http://test'+url).searchParams.get('path');
  if(path){if(options?.method==='PUT'){files.set(path,JSON.parse(options.body!).content);return {};};if(!files.has(path))throw Error('404');return {content:files.get(path)};}
  return {};
 });
 const result=await createProject('标准应用','用户用途',undefined,id=>instantiateTemplate(id,templateDefaults('weekly')));
 expect(result.agent_id).toBe('new');expect(drafts).toHaveLength(1);expect(drafts[0].definition.dependencies.skills[0].slug).toBe('template-weekly');
 expect(JSON.parse(files.get('builder/application.json')!).applicationId).toBe(created.description.split('\n')[0].slice('WANX_BUILDER_PROJECT:'.length));
});
