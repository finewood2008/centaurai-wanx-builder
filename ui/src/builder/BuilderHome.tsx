import { request } from "../api/request";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Select } from "antd";
import { ArrowRight, LayoutTemplate, Plus, RefreshCw } from "lucide-react";
import { useAgent } from "../context/AgentContext";
import {
  bindRuntimeKnowledge,
  type Product,
  startAgent,
  runtimeProfile,
  PROJECT_MARKER,
} from "./api";
import { useProduct } from "./useProduct";
import StandardLibrary, { STANDARD_PENDING } from "./StandardLibrary";
import { TemplateMark } from "./TemplateLibrary";
import { createStandardProject } from "./standardApi";
import type {
  StandardApp,
  StandardConfiguration,
} from "../../../core/standard-apps.mjs";
import "./studio.css";

export default function BuilderHome() {
  const product = useProduct(),
    navigate = useNavigate(),
    location = useLocation();
  const { agents, refresh, setActiveAgent } = useAgent();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const projects = agents.filter(
    (a) => a.description?.startsWith(PROJECT_MARKER),
  );
  useEffect(() => {
    if (product?.kind !== "application") return;
    let active = true;
    setBusy(true);
    void runtimeProfile(product)
      .then(async (id) => {
        await refresh();
        if (active) {
          setActiveAgent(id);
          navigate("/chat/" + id, { replace: true });
        }
      })
      .catch((e) => {
        if (active) setError(String(e.message || e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [product]);
  async function create(app: StandardApp, config: StandardConfiguration) {
    setBusy(true);
    setError("");
    try {
      const base = config.name.trim();
      let name = base;
      const names = new Set(agents.map((a) => a.name));
      for (let i = 2; names.has(name); i++) name = `${base} · ${i}`;
      const value = { ...config, name };
      sessionStorage.setItem(STANDARD_PENDING, JSON.stringify(value));
      const agent = await createStandardProject(app, value);
      await refresh();
      setActiveAgent(agent.agent_id);
      sessionStorage.removeItem(STANDARD_PENDING);
      navigate("/chat/" + agent.agent_id, {
        state: {
          builderStart: `我已选择“${app.name}”标准应用。原专家方法和我的选择已保存在 builder/template.md、builder/expert-source.md，定义已初始化。请沿用当前 applicationId 和已有配置，先核对真实能力，再只针对会影响用途的缺失信息用一道选择题确认。修改这个应用的内容、功能和任务 UI。对话框按需添加。不要重复询问已经填写的使用者、用途和风格。`,
        },
      });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  if (product?.kind === "application")
    return (
      <div className="builder-home">
        <h1>{product.name}</h1>
        <p>{busy ? "正在连接你的应用工作区…" : "应用尚未就绪"}</p>
        {error && <Alert type="error" message={error} />}
        {error &&
          product.definition?.schemaVersion === 1 &&
          product.definition.dependencies.knowledgeBases.length > 0 && (
            <KnowledgeBindings product={product} />
          )}
        <Button onClick={() => navigate("/boxes")}>连接与账号</Button>
        <Button onClick={() => window.location.reload()}>重试</Button>
      </div>
    );
  const apps = new URLSearchParams(location.search).get("view") === "apps";
  return (
    <div className="studio-home">
      {apps ? (
        <section className="studio-apps">
          <div className="studio-apps-header">
            <div>
              <div className="studio-kicker">你的应用工作室</div>
              <h1>我的应用</h1>
              <p>继续调整配置，或试用已经准备好的应用。</p>
            </div>
            <Button
              icon={<Plus size={15} />}
              onClick={() => navigate("/builder")}
            >
              选择标准应用
            </Button>
          </div>
          {error && <Alert type="error" message={error} />}
          <div className="studio-app-list">
            {projects.map((p) => (
              <button
                key={p.agent_id}
                className="studio-app-row"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (p.state !== "running") await startAgent(p.agent_id);
                    await refresh();
                    setActiveAgent(p.agent_id);
                    navigate("/chat/" + p.agent_id);
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <TemplateMark />
                <div>
                  <b>{p.name}</b>
                  <p>
                    {p.description?.split("\n").slice(1).join(" ") ||
                      "继续完善应用配置"}
                  </p>
                </div>
                <span>打开工作台</span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          {!projects.length && (
            <div className="studio-no-results">
              <LayoutTemplate size={28} />
              <h3>你的第一个应用，从模板开始</h3>
              <p>选一个接近需求的模板，稍作配置就能进入试用。</p>
              <Button type="primary" onClick={() => navigate("/builder")}>
                浏览应用
              </Button>
            </div>
          )}
          <Button
            type="text"
            style={{ marginTop: 20 }}
            icon={<RefreshCw size={14} />}
            onClick={() => void refresh()}
          >
            刷新应用
          </Button>
        </section>
      ) : (
        <StandardLibrary
          connected
          onUse={(app, c) => void create(app, c)}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}

function KnowledgeBindings({ product }: { product: Product }) {
  const [libraries, setLibraries] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [bindings, setBindings] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    void request<typeof libraries>("/knowledge-bases")
      .then(setLibraries)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <section>
      <p>为每项资料依赖选择当前应用的知识库。可以先到“知识库”导入资料。</p>
      {product.definition!.dependencies.knowledgeBases.map((source) => (
        <label key={source}>
          {source}
          <Select
            style={{ width: "100%" }}
            value={bindings[source]}
            options={libraries.map((k) => ({ label: k.name, value: k.id }))}
            onChange={(value) => setBindings({ ...bindings, [source]: value })}
          />
        </label>
      ))}
      <Button
        onClick={async () => {
          try {
            await bindRuntimeKnowledge(product, bindings);
            window.location.reload();
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        保存绑定并继续
      </Button>
      {error && <Alert type="error" message={error} />}
    </section>
  );
}
