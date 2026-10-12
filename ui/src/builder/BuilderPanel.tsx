import { migrateDraft } from "./api";
import {
  capabilityReport,
  capabilityStatusLabels,
  type CapabilityReport,
} from "./capabilities";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Input, Tag, Tabs, Tooltip } from "antd";
import {
  ArrowLeft,
  Expand,
  RefreshCw,
  Play,
  Package,
  History,
  X,
} from "lucide-react";
import { useAgent, type OctopAgent } from "../context/AgentContext";
import {
  readDefinition,
  isMissing,
  registerApplication,
  recordTrial,
  assertCraft,
  createTrial,
  snapshotVersion,
  saveDraft,
  readCenter,
  publishVersion,
  digest,
  PROJECT_MARKER,
  TRIAL_MARKER,
  type ApplicationDefinition,
  type BuildReceipt,
  type Product,
  type CenterState,
  type CenterVersion,
} from "./api";
import ApplicationCanvas from "./ApplicationCanvas";
import DraftConfiguration from "./DraftConfiguration";
import "./builder.css";
interface Props {
  onClose?: () => void;
  agent: OctopAgent | null;
  threadId: string | null;
  mode: "ask" | "plan" | "craft";
  busy: boolean;
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}
export default function BuilderPanel({
  onClose,
  agent,
  threadId,
  mode,
  busy,
  onSend,
  onPrefill,
}: Props) {
  const navigate = useNavigate();
  const { refresh, setActiveAgent } = useAgent();
  const [product, setProduct] = useState<Product | null>(null),
    [definition, setDefinition] = useState<ApplicationDefinition | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [wide, setWide] = useState(false),
    [tick, setTick] = useState(0),
    [tab, setTab] = useState("configure"),
    [selected, setSelected] = useState(""),
    [edit, setEdit] = useState(""),
    [receipts, setReceipts] = useState<BuildReceipt[]>([]),
    [versions, setVersions] = useState<CenterVersion[]>([]),
    [center, setCenter] = useState<CenterState | null>(null),
    [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const project = agent?.description?.startsWith(PROJECT_MARKER),
    trial = agent?.description?.startsWith(TRIAL_MARKER);
  const owner = trial
    ? agent!.description!.slice(TRIAL_MARKER.length).split(":")[0]
    : agent?.agent_id;
  const enabled =
    !!agent && (project || trial || product?.kind === "application");
  useEffect(() => {
    void window.wanxBuilder?.call<Product>("product").then(setProduct);
  }, []);
  useEffect(() => {
    setDefinition(null);
    setError("");
    setNotice("");
    setSelected("");
    setEdit("");
  }, [agent?.agent_id]);
  useEffect(() => {
    if (!agent || !enabled) return;
    let active = true;
    const load = () =>
      readDefinition(agent.agent_id)
        .then((d) => {
          if (active) {
            setDefinition(d);
            setError("");
            if (project)
              void readCenter(d.applicationId)
                .then((s) => {
                  if (active)
                    setCapabilities(
                      s.capability_catalog
                        ? capabilityReport(d, s.capability_catalog)
                        : null,
                    );
                })
                .catch(() => {
                  if (active) setCapabilities(null);
                });
          }
        })
        .catch((e) => {
          if (active) {
            setDefinition(null);
            setError(
              "应用定义尚未就绪：" + String(e instanceof Error ? e.message : e),
            );
          }
        });
    void load();
    const timer = busy ? setInterval(() => void load(), 4000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [agent?.agent_id, enabled, busy, tick]);
  const loadVersions = useCallback(async () => {
    if (!agent || !project) return;
    try {
      const def = await readDefinition(agent.agent_id);
      const state = await readCenter(def.applicationId);
      setCenter(state);
      setVersions(state.versions);
    } catch (e) {
      setVersions([]);
      if (!isMissing(e)) setError(String(e));
    }
  }, [agent?.agent_id, project]);
  useEffect(() => {
    if (tab === "versions") void loadVersions();
  }, [tab, loadVersions]);
  useEffect(() => {
    void window.wanxBuilder
      ?.call<BuildReceipt[]>("builds")
      .then(setReceipts)
      .catch(() => {});
  }, [tick]);
  async function operation(fn: () => Promise<void>) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await assertCraft(agent!.agent_id, threadId);
      await fn();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setWorking(false);
    }
  }
  if (!enabled || !agent) return null;
  const current = definition;
  const canChange = mode === "craft" && !busy && !working;
  return (
    <aside
      className={"builder-panel" + (wide ? " wide" : "")}
      aria-label="应用工作区"
    >
      <div className="builder-panel-head">
        <div>
          <h3>{current?.name || "应用工作区"}</h3>
          <small>
            {project
              ? "应用配置 · 草稿"
              : trial
              ? "独立实例 · 真实试用"
              : "我的应用"}{" "}
            {current?.version && " / v" + current.version}
          </small>
        </div>
        <div>
          {onClose && (
            <Button
              type="text"
              aria-label="收起应用预览"
              icon={<X size={15} />}
              onClick={onClose}
            />
          )}
          <Tooltip title="刷新定义与结果">
            <Button
              type="text"
              icon={<RefreshCw size={15} />}
              onClick={() => setTick((t) => t + 1)}
            />
          </Tooltip>
          <Tooltip title="展开工作区">
            <Button
              type="text"
              icon={<Expand size={15} />}
              onClick={() => setWide(!wide)}
            />
          </Tooltip>
        </div>
      </div>
      <div className="builder-toolbar">
        {trial && (
          <Button
            size="small"
            icon={<ArrowLeft size={13} />}
            onClick={() => navigate("/chat/" + owner)}
          >
            返回构建
          </Button>
        )}
        {project && current && (
          <>
            <Button
              size="small"
              icon={<Play size={13} />}
              disabled={!canChange}
              onClick={() =>
                void operation(async () => {
                  await snapshotVersion(agent.agent_id, current, threadId!);
                  const target = await createTrial(agent.agent_id, current);
                  await refresh();
                  setActiveAgent(target.agent_id);
                  navigate("/chat/" + target.agent_id);
                })
              }
            >
              真实试用
            </Button>
            {tab !== "versions" && (
              <Button size="small" onClick={() => setTab("versions")}>
                安装与更新
              </Button>
            )}
            {tab === "versions" && (
              <>
                <Button
                  size="small"
                  icon={<History size={13} />}
                  disabled={!canChange}
                  onClick={() =>
                    void operation(async () => {
                      await snapshotVersion(agent.agent_id, current, threadId!);
                      setNotice("已保存到应用中心；此版本内容已固定。");
                      await loadVersions();
                    })
                  }
                >
                  保存版本
                </Button>
                <Button
                  size="small"
                  disabled={!canChange}
                  onClick={() =>
                    void operation(async () => {
                      await registerApplication(agent.agent_id, current);
                      setNotice(
                        "已在当前盒子登记，并仅向你本人开放。平台产品身份和独立安装连接仍需真实验证。",
                      );
                    })
                  }
                >
                  登记应用
                </Button>
                <Button
                  size="small"
                  icon={<Package size={13} />}
                  disabled={!canChange}
                  onClick={() =>
                    void operation(async () => {
                      await snapshotVersion(agent.agent_id, current, threadId!);
                      const receipt =
                        await window.wanxBuilder!.call<BuildReceipt | null>(
                          "package",
                          {
                            definition: current,
                            agentId: agent.agent_id,
                            threadId,
                            sessionId: window.wanxDesktop?.sessionToken(),
                          },
                        );
                      if (receipt) {
                        setTick((t) => t + 1);
                        await loadVersions();
                        setNotice(
                          "本机测试包已生成，构建记录已保存到应用中心。完成真实试用后可发布自用版本。",
                        );
                        setTab("versions");
                      }
                    })
                  }
                >
                  生成 Mac 测试包
                </Button>
                <Button
                  size="small"
                  disabled={!canChange}
                  onClick={() =>
                    void operation(async () => {
                      await saveDraft(agent.agent_id, threadId, current);
                      setNotice("草稿已同步到应用中心。");
                    })
                  }
                >
                  同步草稿
                </Button>
              </>
            )}
          </>
        )}
        {trial && current && (
          <Button
            size="small"
            disabled={!canChange}
            onClick={() =>
              void operation(async () => {
                const record = await recordTrial(
                  agent.agent_id,
                  threadId,
                  current,
                );
                setNotice(
                  `已记录 ${record.outputs.length} 项实际输出与原生工具执行证据。请检查结果是否达到预期。`,
                );
              })
            }
          >
            记录试用结果
          </Button>
        )}
        {working && <Tag>处理中</Tag>}
      </div>
      {project && current?.schemaVersion === 1 && (
        <Alert
          type="info"
          message="这是旧版定义。创建新版草稿后，可按已有能力重新组合。"
          action={
            <Button
              disabled={!canChange}
              onClick={() =>
                void operation(async () => {
                  await migrateDraft(agent.agent_id, threadId!, current);
                  setTick((t) => t + 1);
                  setNotice("已创建新版草稿，已发布版本保持不变。");
                })
              }
            >
              创建新版草稿
            </Button>
          }
        />
      )}
      {project && (
        <div className="builder-pane-tabs">
          <Tabs
            size="small"
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "configure", label: "配置" },
              { key: "preview", label: "预览" },
              { key: "definition", label: "能力" },
              { key: "versions", label: "交付" },
            ]}
          />
        </div>
      )}
      <div className="builder-panel-body">
        {error && (
          <Alert type="error" message={error} style={{ marginBottom: 12 }} />
        )}
        {notice && (
          <Alert type="info" message={notice} style={{ marginBottom: 12 }} />
        )}
        {current && project && tab === "configure" && (
          <DraftConfiguration
            key={agent.agent_id}
            definition={current}
            agentId={agent.agent_id}
            threadId={threadId}
            canChange={canChange}
            onSaved={() => setTick((t) => t + 1)}
            onDiscuss={onPrefill}
          />
        )}
        {current && (tab === "preview" || !project) && (
          <>
            <Tag
              color={project ? "default" : "green"}
              style={{ marginBottom: 12 }}
            >
              {project ? "演示预览 · 不执行任务" : "真实工作区"}
            </Tag>
            <ApplicationCanvas
              definition={current}
              agentId={agent.agent_id}
              threadId={threadId}
              demo={!!project}
              busy={busy}
              craft={mode === "craft"}
              onSend={onSend}
              onSelect={project ? setSelected : undefined}
              selected={selected}
              refreshKey={tick + (busy ? 1 : 0)}
            />
          </>
        )}
        {current && project && tab === "definition" && (
          <>
            <h4>应用目标</h4>
            <p className="builder-note">{current.description}</p>
            <div className="builder-capability-links">
              <Button size="small" onClick={() => navigate("/connectors")}>
                管理连接器
              </Button>
              <Button size="small" onClick={() => navigate("/builder/skills")}>
                技能
              </Button>
            </div>
            <h4>验收样例</h4>
            <ul
              style={{
                paddingLeft: 20,
                margin: "12px 0",
                fontSize: 13,
                lineHeight: 1.8,
              }}
            >
              {current.acceptance.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <h4>能力依赖</h4>
            {current.schemaVersion === 2 &&
              (!capabilities ? (
                <p className="builder-note">状态未知，刷新后重试。</p>
              ) : (
                <>
                  <p className="builder-note">
                    {capabilities.ready
                      ? "配置依赖已就绪，仍需真实任务验证。"
                      : "部分依赖尚未就绪，可以继续修改草稿。"}
                  </p>
                  {capabilities.items.map((item) => (
                    <div className="builder-capability-row" key={item.id}>
                      <span>{item.label}</span>
                      <Tag
                        color={item.status === "available" ? "green" : "orange"}
                      >
                        {capabilityStatusLabels[item.status]}
                      </Tag>
                      {item.status !== "available" &&
                        [
                          "connector",
                          "connector-catalog",
                          "skill-package",
                          "skill-catalog",
                        ].includes(item.kind) && (
                          <Button
                            size="small"
                            onClick={() =>
                              navigate(
                                item.kind.startsWith("connector")
                                  ? "/connectors"
                                  : "/builder/skills",
                              )
                            }
                          >
                            {item.kind.startsWith("connector")
                              ? "连接器设置"
                              : "技能设置"}
                          </Button>
                        )}
                    </div>
                  ))}
                  <Button
                    size="small"
                    onClick={() =>
                      void readCenter(current.applicationId)
                        .then((s) =>
                          setCapabilities(
                            s.capability_catalog
                              ? capabilityReport(current, s.capability_catalog)
                              : null,
                          ),
                        )
                        .catch((e) => setError(String(e)))
                    }
                  >
                    重新检查能力
                  </Button>
                </>
              ))}
            <p className="builder-note">
              连接器：{current.dependencies.connectors.join("、") || "未指定"}
              <br />
              技能：
              {current.dependencies.skills.map((s) => s.slug).join("、") ||
                "未指定"}
            </p>
            <details>
              <summary>查看应用定义</summary>
              <pre className="builder-schema">
                {JSON.stringify(current, null, 2)}
              </pre>
            </details>
            <Button
              style={{ marginTop: 16 }}
              onClick={() =>
                onPrefill(
                  "请在当前模式下检查 builder/application.json：核对专家、界面动作和依赖是否与我们的方案一致，说明还缺什么。",
                )
              }
            >
              一起检查方案
            </Button>
          </>
        )}
        {project && tab === "versions" && (
          <>
            <h4>安装产物</h4>
            {receipts
              .filter((r) => r.applicationId === current?.applicationId)
              .map((r) => (
                <div className="builder-record" key={r.definitionHash}>
                  <b>v{r.version} · Mac</b>
                  <small>{r.builtAt}</small>
                  <Tag>打包已完成</Tag>
                  <Tag>
                    {r.installationVerified ? "安装已验证" : "安装待验证"}
                  </Tag>
                  <Button
                    size="small"
                    onClick={() =>
                      void window.wanxBuilder?.call("reveal", {
                        hash: r.definitionHash,
                      })
                    }
                  >
                    在访达中查看
                  </Button>
                </div>
              ))}
            <p className="builder-note">
              本机测试包需要目标产品在 WANX
              上完成登记与授权后才能登录。构建成功不代表真实盒子验收。
            </p>
            <h4>应用中心版本</h4>
            {versions.map((version) => (
              <div className="builder-record" key={version.version}>
                <b>v{version.version}</b>
                <Tag>{version.published_at ? "已发布自用" : "待验证"}</Tag>
                <Button
                  size="small"
                  disabled={
                    !canChange ||
                    !!version.published_at ||
                    !center?.runs.some(
                      (r) =>
                        r.version === version.version &&
                        r.kind === "trial" &&
                        r.status === "completed",
                    ) ||
                    !center?.runs.some(
                      (r) =>
                        r.version === version.version &&
                        r.kind === "build" &&
                        r.status === "completed",
                    )
                  }
                  onClick={() =>
                    void operation(async () => {
                      await registerApplication(
                        agent.agent_id,
                        version.definition,
                      );
                      await publishVersion(
                        agent.agent_id,
                        threadId!,
                        version.definition,
                      );
                      await loadVersions();
                      setNotice(
                        "自用版本已发布，可以打开安装包连接你的应用实例。",
                      );
                    })
                  }
                >
                  发布自用版本
                </Button>
                <Button
                  size="small"
                  disabled={!canChange}
                  onClick={() =>
                    void operation(async () => {
                      if (
                        (await digest(version.definition)) !==
                        version.definition_hash
                      )
                        throw new Error("快照校验失败");
                      if (
                        version.definition.applicationId !==
                        current?.applicationId
                      )
                        throw new Error("应用标识不匹配");
                      const draft = await migrateDraft(
                        agent.agent_id,
                        threadId!,
                        version.definition,
                      );
                      setTick((t) => t + 1);
                      setNotice(
                        `已复制为 v${draft.version} 的新版草稿，已发布版本保持原样。`,
                      );
                    })
                  }
                >
                  恢复为草稿
                </Button>
              </div>
            ))}
            <h4>试用与构建</h4>
            {center?.runs.map((run) => (
              <div className="builder-record" key={run.run_id}>
                <b>
                  v{run.version} ·{" "}
                  {run.kind === "trial" ? "真实试用" : "Mac 构建"}
                </b>
                <span>
                  {
                    {
                      prepared: "待执行",
                      running: "进行中",
                      completed: "已记录结果",
                      failed: "未完成，可重试",
                    }[run.status]
                  }
                </span>
                {run.kind === "trial" && (
                  <small>
                    输出已记录不代表内容质量、技能和连接器均已验收。
                  </small>
                )}
              </div>
            ))}
            <h4>用户实例</h4>
            {center?.instances.map((instance) => (
              <div className="builder-record" key={instance.agent_id}>
                <b>
                  {instance.active_version
                    ? "已安装 v" + instance.active_version
                    : "首次安装"}
                </b>
                <span>
                  {instance.status === "ready"
                    ? "配置已就绪"
                    : instance.status === "failed"
                    ? "更新未完成，重新连接可继续"
                    : "正在更新"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      {project && selected && (
        <div className="builder-select-tip">
          <span>
            已选中：{current?.components.find((c) => c.id === selected)?.title}
          </span>
          <Input.Search
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            placeholder="描述希望如何修改…"
            enterButton="放入对话"
            onSearch={() => {
              onPrefill(
                `关于应用界面组件 ${selected}：${edit}。请遵循当前模式处理。`,
              );
              setEdit("");
            }}
          />
        </div>
      )}
    </aside>
  );
}
