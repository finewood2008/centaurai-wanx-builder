import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Tag } from "antd";
import { request } from "../api/request";
import { readCenter, type CenterState, type Product } from "./api";
import "./builder.css";

export default function ApplicationCenter() {
  const navigate = useNavigate();
  const [items, setItems] = useState<
    {
      application_id: string;
      name: string;
      description: string;
      state: CenterState;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [instance, setInstance] = useState<{
    active_version: string | null;
    target_version: string | null;
    status: string;
  } | null>(null);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const p = await window.wanxBuilder!.call<Product>("product");
      setProduct(p);
      if (p.kind === "application") {
        setInstance(
          await request(
            `/applications/${encodeURIComponent(p.applicationId)}/instance`,
          ),
        );
        return;
      }
      const products = await request<
        { application_id: string; name: string; description: string }[]
      >("/admin/applications");
      setItems(
        await Promise.all(
          products
            .filter((item) => item.application_id !== p.applicationId)
            .map(async (item) => ({
              ...item,
              state: await readCenter(item.application_id),
            })),
        ),
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="builder-home">
      <header>
        <div>
          <span className="builder-eyebrow">WANX / APPLICATIONS</span>
          <h1>应用中心</h1>
          <p>应用的定义、版本、试用、构建和用户实例，在这里保持一致。</p>
        </div>
        <Button loading={busy} onClick={() => void load()}>
          刷新
        </Button>
      </header>
      {error && <Alert type="error" message={error} />}
      {product?.kind === "application" ? (
        <section className="builder-record">
          <h3>{product.name}</h3>
          <p>本机版本 v{product.version}</p>
          <p>
            {instance?.active_version
              ? "工作区版本 v" + instance.active_version
              : "尚未完成安装"}
          </p>
          <Tag>
            {instance?.status === "ready" ? "配置已就绪" : "等待完成连接"}
          </Tag>
          <Button onClick={() => navigate("/builder")}>打开我的应用</Button>
        </section>
      ) : (
        <div className="builder-grid">
          {items.map((item) => (
            <section className="builder-project" key={item.application_id}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <p>
                {item.state.draft
                  ? `草稿 v${item.state.draft.definition.version}`
                  : "尚未关联构建草稿"}{" "}
                · {item.state.versions.length} 个版本
              </p>
              <p>
                {item.state.runs.filter((r) => r.kind === "trial").length}{" "}
                次试用 ·{" "}
                {item.state.runs.filter((r) => r.kind === "build").length}{" "}
                次构建 · {item.state.instances.length} 个用户实例
              </p>
              {item.state.versions
                .filter((v) => v.published_at)
                .map((v) => (
                  <Tag key={v.version}>已发布 v{v.version}</Tag>
                ))}
              {item.state.instances.map((i) => (
                <p key={i.agent_id}>
                  {i.active_version
                    ? "正在使用 v" + i.active_version
                    : "首次安装"}
                  {i.status === "failed" ? " · 更新需重试" : ""}
                </p>
              ))}
              {item.state.draft && (
                <Button
                  onClick={() =>
                    navigate("/chat/" + item.state.draft!.project_agent_id)
                  }
                >
                  继续构建
                </Button>
              )}
            </section>
          ))}
        </div>
      )}
      {!busy && !error && product?.kind === "builder" && !items.length && (
        <p>创建第一个应用后，它会出现在这里。</p>
      )}
    </div>
  );
}
