import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Select, Switch } from "antd";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  LayoutTemplate,
  RefreshCw,
  Search,
  Check,
} from "lucide-react";
import {
  standardApps,
  taskTypes,
  directoryMetadata,
  standardDefaults,
  type StandardApp,
  type StandardConfiguration,
} from "../../../core/standard-apps.mjs";
import { loadStandardDirectory } from "./standardApi";
import { TemplateMark } from "./TemplateLibrary";
import "./standard.css";
export const STANDARD_PENDING = "wanx-builder:standard-configuration";
export function pendingStandard(): StandardConfiguration | undefined {
  try {
    const c = JSON.parse(sessionStorage.getItem(STANDARD_PENDING) || "null");
    return c && typeof c.appId === "string" && typeof c.name === "string"
      ? c
      : undefined;
  } catch {
    return undefined;
  }
}
export function StandardPreview({ app }: { app: StandardApp }) {
  const t = taskTypes.find((t) => t.id === app.categoryId)!;
  const tasks = app.quickPrompts.slice(0, 3).map((p) => p.title);
  if (!tasks.length) tasks.push("处理当前任务");
  return (
    <div
      className={"standard-mini " + app.categoryId + " " + app.accent}
      aria-label={app.name + "任务界面示意"}
    >
      <div className="standard-mini-bar">
        <span />
        <span />
        <span />
        <small>{app.name}</small>
      </div>
      <div className="standard-mini-body">
        <div className="standard-mini-tasks">
          {tasks.map((x, i) => (
            <span className={i === 0 ? "active" : ""} key={x}>
              {x}
            </span>
          ))}
        </div>
        <div className="standard-mini-main">
          <strong>{tasks[0]}</strong>
          <div className="standard-mini-input">{t.input}</div>
          {t.format === "table" ? (
            <>
              <div className="standard-mini-metrics">
                <b>指标</b>
                <b>趋势</b>
                <b>依据</b>
              </div>
              <div className="standard-mini-bars">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="standard-mini-table">
                对象　　结果　　说明
                <br />
                ——　　——　　——
              </div>
            </>
          ) : t.format === "board" ? (
            <div className="standard-mini-board">
              {["待了解", "待比较", "待确认"].map((x) => (
                <div key={x}>
                  <b>{x}</b>
                  <p>方案与依据</p>
                </div>
              ))}
            </div>
          ) : t.format === "checklist" ? (
            <div className="standard-mini-checks">
              {["确认目标与范围", "执行任务与核对", "查看结果与反馈"].map(
                (x) => (
                  <p key={x}>
                    <Check size={10} />
                    {x}
                  </p>
                ),
              )}
            </div>
          ) : (
            <div className="standard-mini-document">
              <FileText size={15} />
              <b>{t.output}</b>
              <i />
              <i />
              <i />
            </div>
          )}
          <span className="standard-mini-run">运行任务 →</span>
        </div>
      </div>
    </div>
  );
}
interface Props {
  connected: boolean;
  onUse: (app: StandardApp, config: StandardConfiguration) => void;
  busy?: boolean;
  error?: string;
}
export default function StandardLibrary({
  connected,
  onUse,
  busy = false,
  error,
}: Props) {
  const [apps, setApps] = useState(standardApps),
    [warnings, setWarnings] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [tick, setTick] = useState(0);
  const [category, setCategory] = useState("all"),
    [source, setSource] = useState("all"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(24);
  const [config, setConfig] = useState<StandardConfiguration | undefined>(
    pendingStandard,
  );
  useEffect(() => {
    if (config)
      sessionStorage.setItem(STANDARD_PENDING, JSON.stringify(config));
    else sessionStorage.removeItem(STANDARD_PENDING);
  }, [config]);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    setLoading(true);
    void loadStandardDirectory()
      .then((r) => {
        if (active) {
          setApps(r.apps);
          setWarnings(r.warnings);
        }
      })
      .catch((e) => {
        if (active) setWarnings([String(e)]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connected, tick]);
  const selected = config && apps.find((a) => a.id === config.appId);
  const filtered = useMemo(
    () =>
      apps.filter(
        (a) =>
          (category === "all" || a.categoryId === category) &&
          (source === "all" || a.sourceKind === source) &&
          `${a.name} ${a.description} ${a.quickPrompts
            .map((p) => p.title)
            .join(" ")}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [apps, category, source, search],
  );
  const update = (patch: Partial<StandardConfiguration>) =>
    setConfig((c) => (c ? { ...c, ...patch } : c));
  if (selected && config)
    return (
      <section className="studio-template-detail">
        <div className="studio-detail-top">
          <button onClick={() => setConfig(undefined)} disabled={busy}>
            <ArrowLeft size={16} />
            返回应用库
          </button>
          <span>选择应用 → 修改应用 → 试用与交付</span>
        </div>
        <div className="studio-detail-grid">
          <div className="studio-detail-showcase">
            <div className="studio-kicker">
              {selected.category} ·{" "}
              {selected.sourceKind === "builtin"
                ? "WANX 内置专家"
                : selected.sourceKind === "market"
                ? "专家市场"
                : "已发布专家"}
            </div>
            <h1>{selected.name}</h1>
            <p>{selected.description}</p>
            <StandardPreview app={selected} />
            <div className="studio-demo-caption">
              界面结构示意。真实结果由应用智能体执行任务后产生。
            </div>
            <div className="studio-included">
              <h3>这个应用提供的任务</h3>
              {selected.quickPrompts.map((p, i) => (
                <div key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>
                    <b>{p.title}</b>
                    <br />
                    {p.description}
                  </p>
                  <Check size={14} />
                </div>
              ))}
            </div>
          </div>
          <form
            className="studio-configuration"
            onSubmit={(e) => {
              e.preventDefault();
              onUse(selected, config);
            }}
          >
            <div className="studio-config-heading">
              <LayoutTemplate />
              <div>
                <h2>把它变成你的应用</h2>
                <p>沿用专家的方法与技能，在 Builder 中继续修改。</p>
              </div>
            </div>
            <label htmlFor="standard-name">
              应用名称
              <Input
                id="standard-name"
                value={config.name}
                maxLength={120}
                disabled={busy}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label htmlFor="standard-goal">
              我的用途
              <Input.TextArea
                id="standard-goal"
                value={config.goal}
                rows={4}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => update({ goal: e.target.value })}
              />
            </label>
            <label htmlFor="standard-audience">
              给谁使用
              <Input
                id="standard-audience"
                value={config.audience}
                maxLength={120}
                disabled={busy}
                onChange={(e) => update({ audience: e.target.value })}
              />
            </label>
            <label>
              表达风格
              <Select
                value={config.tone}
                disabled={busy}
                options={[
                  "清晰、自然",
                  "简洁、直接",
                  "严谨、专业",
                  "温暖、耐心",
                ].map((value) => ({ label: value, value }))}
                onChange={(tone) => update({ tone })}
              />
            </label>
            <div className="studio-confirm-option">
              <div>
                <b>执行前由我确认</b>
                <p>原生工具审批仍然生效。</p>
              </div>
              <Switch
                aria-label="执行前由我确认"
                checked={config.confirm}
                disabled={busy}
                onChange={(confirm) => update({ confirm })}
              />
            </div>
            <div className="studio-capability-note">
              <div>
                <b>来源与能力</b>
                <p>{selected.expertId}</p>
                <small>
                  {selected.skillSlugs.length} 项专家技能 ·{" "}
                  {taskTypes.find((t) => t.id === selected.categoryId)?.summary}
                </small>
              </div>
            </div>
            {selected.availability === "unavailable" && (
              <Alert
                type="warning"
                message="所选盒子尚未提供这位内置专家，请更新盒子的专家目录。"
              />
            )}
            {error && <Alert type="error" message={error} />}
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              loading={busy}
              disabled={
                selected.availability === "unavailable" ||
                !config.name.trim() ||
                !config.goal.trim() ||
                !config.audience.trim()
              }
              icon={<ArrowRight size={16} />}
            >
              {connected ? "使用此应用，进入 Builder" : "连接万象，使用此应用"}
            </Button>
            <p className="studio-config-foot">
              使用时通过 WANX
              安装现有专家技能。你可以在构建对话里修改内容、功能和
              UI，再通过应用自己的任务界面试用。
            </p>
          </form>
        </div>
      </section>
    );
  return (
    <section className="studio-library">
      <header className="studio-library-heading">
        <div>
          <div className="studio-kicker">
            <span />
            从专家能力，选择你的应用
          </div>
          <h1>
            选一个应用，
            <br />
            改成你需要的样子。
          </h1>
          <p>
            创作、分析、检查、学习与执行，各有适合任务的界面。
            <br />在 Builder 中对话修改，用应用自己的 UI 完成任务。
          </p>
        </div>
        <div className="standard-directory-summary">
          <b>{apps.length}</b>
          <span>标准应用</span>
          <small>
            {apps.filter((a) => a.sourceKind === "builtin").length} 位内置专家 ·{" "}
            {apps.filter((a) => a.sourceKind === "market").length} 位市场专家
          </small>
          <small>
            {connected
              ? "目录来自所连接的 WANX"
              : "目录快照 · " + directoryMetadata.capturedAt}
          </small>
        </div>
      </header>
      {warnings.map((w) => (
        <Alert
          key={w}
          type="warning"
          message={w}
          style={{ marginBottom: 12 }}
        />
      ))}
      <div className="standard-directory-controls">
        <Input
          prefix={<Search size={15} />}
          aria-label="搜索标准应用"
          placeholder="搜索应用、专家或任务"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(24);
          }}
        />
        <Select
          aria-label="专家来源"
          value={source}
          onChange={(v) => {
            setSource(v);
            setLimit(24);
          }}
          options={[
            { value: "all", label: "全部来源" },
            { value: "builtin", label: "WANX 内置" },
            { value: "market", label: "专家市场" },
            { value: "published", label: "已发布专家" },
          ]}
        />
        {connected && (
          <Button
            icon={<RefreshCw size={14} />}
            loading={loading}
            onClick={() => setTick((t) => t + 1)}
          >
            刷新目录
          </Button>
        )}
      </div>
      <div
        className="standard-category-tabs"
        role="tablist"
        aria-label="应用任务类型"
      >
        {[{ id: "all", name: "全部应用" }, ...taskTypes].map((t) => (
          <button
            role="tab"
            aria-selected={category === t.id}
            className={category === t.id ? "active" : ""}
            key={t.id}
            onClick={() => {
              setCategory(t.id);
              setLimit(24);
            }}
          >
            {t.name}
            <small>
              {
                apps.filter((a) => t.id === "all" || a.categoryId === t.id)
                  .length
              }
            </small>
          </button>
        ))}
      </div>
      <div className="studio-template-grid">
        {filtered.slice(0, limit).map((a) => (
          <button
            className="studio-template-card"
            key={a.id}
            aria-label={"查看" + a.name + "应用"}
            onClick={() => setConfig(standardDefaults(a))}
          >
            <div className={"studio-card-preview " + a.accent}>
              <StandardPreview app={a} />
            </div>
            <div className="studio-card-description">
              <div>
                <TemplateMark accent={a.accent} />
                <h2>{a.name}</h2>
                <ArrowRight size={15} />
              </div>
              <p>{a.description}</p>
              <footer>
                <span>{a.category}</span>
                <span>
                  {a.sourceKind === "builtin"
                    ? "内置专家"
                    : a.sourceKind === "market"
                    ? "专家市场"
                    : "已发布专家"}
                </span>
                <span>{a.quickPrompts.length || 1} 项任务</span>
              </footer>
            </div>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="studio-no-results">
          没有匹配的应用，请调整搜索或分类。
        </div>
      )}
      {filtered.length > limit && (
        <Button
          className="standard-load-more"
          onClick={() => setLimit((n) => n + 24)}
        >
          继续查看 · 还有 {filtered.length - limit} 个应用
        </Button>
      )}
    </section>
  );
}
