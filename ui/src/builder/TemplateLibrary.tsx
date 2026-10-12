import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  FileText,
  LayoutTemplate,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { Alert, Button, Input, Select, Switch } from "antd";
import {
  solutionTemplates,
  getSolutionTemplate,
  templateDefaults,
  type SolutionTemplate,
  type TemplateConfiguration,
} from "../../../core/solution-templates.mjs";
import "./studio.css";

export const PENDING_TEMPLATE_KEY = "wanx-builder:template-configuration";
export function pendingTemplate(): TemplateConfiguration | undefined {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_TEMPLATE_KEY) || "null",
    );
    return value && getSolutionTemplate(value.templateId)
      ? { ...templateDefaults(value.templateId), ...value }
      : undefined;
  } catch {
    return undefined;
  }
}
export function TemplateMark({ accent = "sage" }: { accent?: string }) {
  return (
    <span className={"studio-template-icon " + accent}>
      <LayoutTemplate size={21} />
    </span>
  );
}
export function TemplatePreview({
  template: t,
  name,
  compact = false,
}: {
  template: SolutionTemplate;
  name?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={"studio-preview " + t.accent + (compact ? " compact" : "")}
      aria-label={`${t.name}示例预览`}
    >
      <div className="studio-preview-chrome">
        <span />
        <span />
        <span />
        <small>{name || t.name}</small>
      </div>
      <div className="studio-preview-app">
        <div className="studio-preview-rail">
          <span className="studio-preview-logo">
            <LayoutTemplate size={15} />
          </span>
          <FileText size={14} />
          <MessageSquare size={14} />
        </div>
        <div className="studio-preview-content">
          <div className="studio-preview-heading">
            <small>你的专属助手</small>
            <strong>{name || t.name}</strong>
          </div>
          {t.layout === "conversation" ? (
            <>
              <div className="studio-preview-question">{t.exampleInput}</div>
              <div className="studio-preview-answer">
                <Sparkles size={14} />
                <div>
                  <b>{t.exampleTitle}</b>
                  {t.exampleLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div
              className={
                "studio-preview-columns " +
                (t.layout === "form-results" ? "form-layout" : "")
              }
            >
              <div className="studio-preview-input">
                <span>
                  {t.layout === "form-results" ? "任务输入" : "参考资料"}
                </span>
                <div className="studio-preview-drop">
                  {t.layout === "materials-editor" ? (
                    <Upload size={17} />
                  ) : (
                    <FileText size={17} />
                  )}
                  <small>
                    {t.layout === "materials-editor"
                      ? "添加资料，或粘贴内容"
                      : "填写问题与背景"}
                  </small>
                </div>
                <div className="studio-preview-line" />
                <div className="studio-preview-line short" />
                <span className="studio-preview-action">
                  {t.actionLabel}
                  <ArrowRight size={11} />
                </span>
              </div>
              <div className="studio-preview-document">
                <small>{t.outputTitle}</small>
                <b>{t.exampleTitle}</b>
                {t.exampleLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <div className="studio-preview-line" />
                <div className="studio-preview-line short" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  connected: boolean;
  onUse: (configuration: TemplateConfiguration) => void;
  busy?: boolean;
  error?: string;
  initial?: TemplateConfiguration;
}
export default function TemplateLibrary({
  connected,
  onUse,
  busy = false,
  error,
  initial,
}: Props) {
  const [category, setCategory] = useState("全部模板"),
    [search, setSearch] = useState(""),
    [config, setConfig] = useState<TemplateConfiguration | null>(
      initial || null,
    );
  useEffect(() => {
    if(config) sessionStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(config));
    else sessionStorage.removeItem(PENDING_TEMPLATE_KEY);
  }, [config]);
  const selected = config ? getSolutionTemplate(config.templateId) : null;
  const categories = [
    "全部模板",
    ...new Set(solutionTemplates.map((t) => t.category)),
  ];
  const visible = solutionTemplates.filter(
    (t) =>
      (category === "全部模板" || t.category === category) &&
      `${t.name}${t.description}${t.bestFor.join("")}`.includes(search.trim()),
  );
  const update = (patch: Partial<TemplateConfiguration>) =>
    setConfig((c) => (c ? { ...c, ...patch } : c));
  const valid =
    config &&
    ["name", "goal", "audience", "tone"].every((k) =>
      String(config[k as keyof TemplateConfiguration]).trim(),
    );
  if (selected && config)
    return (
      <section className="studio-template-detail">
        <div className="studio-detail-top">
          <button
            onClick={() => {
              setConfig(null);
              sessionStorage.removeItem(PENDING_TEMPLATE_KEY);
            }}
            disabled={busy}
          >
            <ArrowLeft size={16} />
            返回模板库
          </button>
          <span>
            选择模板 <ArrowRight size={12} />
            <b>配置应用</b>
            <ArrowRight size={12} />
            试用与交付
          </span>
        </div>
        <div className="studio-detail-grid">
          <div className="studio-detail-showcase">
            <div className="studio-kicker">{selected.category} / 模板预览</div>
            <h1>{selected.headline}</h1>
            <p>{selected.description}</p>
            <TemplatePreview template={selected} name={config.name} />
            <div className="studio-demo-caption">
              示例内容，仅展示应用结构；创建后通过真实任务试用。
            </div>
            <div className="studio-included">
              <h3>模板已经为你准备好</h3>
              {selected.steps.map((s, i) => (
                <div key={s}>
                  <span>0{i + 1}</span>
                  <p>{s}</p>
                  <Check size={15} />
                </div>
              ))}
            </div>
          </div>
          <form
            className="studio-configuration"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) onUse(config);
            }}
          >
            <div className="studio-config-heading">
              <SlidersHorizontal size={20} />
              <div>
                <h2>让它适合你</h2>
                <p>默认配置已备好，你只需调整需要的部分。</p>
              </div>
            </div>
            <label htmlFor="template-app-name">
              应用名称
              <Input
                id="template-app-name"
                value={config.name}
                maxLength={120}
                disabled={busy}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label htmlFor="template-audience">
              给谁使用
              <Input
                id="template-audience"
                value={config.audience}
                maxLength={120}
                disabled={busy}
                onChange={(e) => update({ audience: e.target.value })}
              />
            </label>
            <label htmlFor="template-goal">
              希望它完成什么
              <Input.TextArea
                id="template-goal"
                value={config.goal}
                maxLength={2000}
                rows={4}
                disabled={busy}
                onChange={(e) => update({ goal: e.target.value })}
              />
            </label>
            <label htmlFor="template-tone">
              表达风格
              <Select
                id="template-tone"
                value={config.tone}
                disabled={busy}
                options={[
                  "清晰、自然",
                  "简洁、直接",
                  "严谨、专业",
                  "温暖、耐心",
                ].map((v) => ({ value: v, label: v }))}
                onChange={(tone) => update({ tone })}
              />
            </label>
            <div className="studio-confirm-option">
              <div>
                <b>执行前由我确认</b>
                <p>每次运行模板任务前，先确认一次。</p>
              </div>
              <Switch
                aria-label="执行前由我确认"
                checked={config.confirm}
                disabled={busy}
                onChange={(confirm) => update({ confirm })}
              />
            </div>
            <div className="studio-capability-note">
              <CheckCheck size={17} />
              <div>
                <b>先用已有能力开始</b>
                <p>模型理解与生成 · 模板说明型技能</p>
                <small>
                  {connected
                    ? "创建后核验当前盒子的能力，连接器可按需添加。"
                    : "连接万象后核验能力。此模板默认使用手动输入，无须先接业务系统。"}
                </small>
              </div>
            </div>
            {error && <Alert type="error" message={error} showIcon />}
            <Button
              className="studio-create"
              type="primary"
              htmlType="submit"
              size="large"
              loading={busy}
              disabled={!valid}
              icon={<ArrowRight size={16} />}
            >
              {connected ? "创建我的应用" : "连接万象，继续配置"}
            </Button>
            <p className="studio-config-foot">
              创建后可继续通过对话调整。模板不会自动发送消息或修改外部系统。
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
            从已有能力，开始你的应用
          </div>
          <h1>
            选一个起点，
            <br />
            做成你的应用。
          </h1>
          <p>
            从预设的任务模板开始，配置用途、工作方式和界面。
            <br />
            剩下的细节，和 AI 一起完善。
          </p>
        </div>
        <div className="studio-start-guide">
          <div>
            <span>01</span>
            <b>选一个模板</b>
            <small>先看到应用的样子</small>
          </div>
          <div>
            <span>02</span>
            <b>调整你的配置</b>
            <small>方法、内容与能力</small>
          </div>
          <div>
            <span>03</span>
            <b>试用，再安装</b>
            <small>验证实际任务结果</small>
          </div>
        </div>
      </header>
      <div className="studio-library-controls">
        <div role="tablist" aria-label="模板分类">
          {categories.map((c) => (
            <button
              role="tab"
              aria-selected={category === c}
              className={category === c ? "active" : ""}
              key={c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="studio-search">
          <Search size={16} />
          <input
            aria-label="搜索模板"
            placeholder="搜索用途或模板"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="清空搜索" onClick={() => setSearch("")}>
              ×
            </button>
          )}
        </div>
      </div>
      <div className="studio-template-grid">
        {visible.map((t, i) => (
          <button
            key={t.id}
            className="studio-template-card"
            aria-label={`查看${t.name}模板`}
            onClick={() => setConfig(templateDefaults(t.id))}
          >
            <div className={"studio-card-preview " + t.accent}>
              <TemplatePreview template={t} compact />
              {i === 0 && category === "全部模板" && !search && (
                <span className="studio-recommended">推荐起点</span>
              )}
            </div>
            <div className="studio-card-description">
              <div>
                <TemplateMark accent={t.accent} />
                <h2>{t.name}</h2>
                <ArrowRight size={17} />
              </div>
              <p>{t.description}</p>
              <footer>
                {t.bestFor.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </footer>
            </div>
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="studio-no-results">
          <Search size={24} />
          <h3>没有找到匹配的模板</h3>
          <p>试试“写作”“简报”或选择另一分类。</p>
          <Button
            onClick={() => {
              setSearch("");
              setCategory("全部模板");
            }}
          >
            查看全部模板
          </Button>
        </div>
      )}
      <div className="studio-library-foot">
        <LayoutTemplate size={17} />
        <span>模板提供起点，能力决定边界。</span>
        <p>每个模板都由 WANX 已有能力组合，新增需求会先检查是否可实现。</p>
      </div>
    </section>
  );
}
