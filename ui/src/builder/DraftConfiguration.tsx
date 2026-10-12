import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Select, Switch } from "antd";
import { ArrowDown, ArrowUp, Plus, Save, X } from "lucide-react";
import {
  canonicalDefinition,
  templates,
  type ApplicationDefinition,
  type AppComponent,
} from "../../../core/definition.mjs";
import { saveConfiguredDraft } from "./api";

interface Props {
  definition: ApplicationDefinition;
  agentId: string;
  threadId: string | null;
  canChange: boolean;
  onSaved: () => void;
  onDiscuss: (text: string) => void;
}
export default function DraftConfiguration({
  definition,
  agentId,
  threadId,
  canChange,
  onSaved,
  onDiscuss,
}: Props) {
  const [base, setBase] = useState(definition),
    [draft, setDraft] = useState(definition),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const seen = useRef(definition);
  useEffect(() => {
    if (seen.current !== definition) {
      seen.current = definition;
      if (!dirty) {
        setBase(definition);
        setDraft(definition);
      }
    }
  }, [definition, dirty]);
  function update(patch: Partial<ApplicationDefinition>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setSaved(false);
  }
  function move(index: number, delta: number) {
    const items = [...draft.components];
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    update({ components: items });
  }
  function add(kind: AppComponent["kind"]) {
    const id = kind + "-" + crypto.randomUUID().slice(0, 6);
    const item: AppComponent = {
      id,
      kind,
      title:
        kind === "text"
          ? "使用说明"
          : kind === "chat"
          ? "继续交流"
          : kind === "list"
          ? "已保存的结果"
          : "任务进度",
      ...(kind === "text"
        ? { text: "在这里介绍应用的使用方法。" }
        : kind === "list"
        ? { path: "outputs" }
        : {}),
    };
    update({ components: [...draft.components, item] });
  }
  const conflict =
    canonicalDefinition(base) !== canonicalDefinition(definition);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await saveConfiguredDraft(agentId, threadId!, base, draft);
      setBase(next);
      setDraft(next);
      setDirty(false);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }
  if (definition.schemaVersion !== 2)
    return (
      <p className="studio-config-notice">
        这个项目使用旧版定义。请先创建新版草稿，再调整配置。
      </p>
    );
  return (
    <div className="studio-draft-form">
      <p className="studio-config-notice">
        模板已提供默认结构。修改以下配置，或在左侧告诉 AI 你想怎么调整。
      </p>
      {conflict && dirty && (
        <Alert
          type="warning"
          message="对话已经更新了配置。你的未保存内容仍保留，保存前请核对最新版本。"
          action={
            <Button
              size="small"
              onClick={() => {
                setBase(definition);
                setDraft(definition);
                setDirty(false);
              }}
            >
              加载最新配置
            </Button>
          }
        />
      )}
      <section>
        <h4>
          <span className="studio-config-section-number">01</span>用途与工作方式
        </h4>
        <label htmlFor="draft-name">
          应用名称
          <Input
            id="draft-name"
            maxLength={120}
            value={draft.name}
            onChange={(e) =>
              update({
                name: e.target.value,
                components: draft.components.map((c) =>
                  c.kind === "text" && c.title === draft.name
                    ? { ...c, title: e.target.value }
                    : c,
                ),
              })
            }
            disabled={!canChange}
          />
        </label>
        <label htmlFor="draft-goal">
          应用用途
          <Input.TextArea
            id="draft-goal"
            rows={3}
            value={draft.description}
            onChange={(e) => {
              const description = e.target.value;
              const prompt = draft.expert.systemPrompt.replace(
                /^任务目标：[\s\S]*?(?=\n使用者：|\n当前配置用途：|$)/m,
                `任务目标：${description}`,
              );
              update({
                description,
                expert: {
                  ...draft.expert,
                  systemPrompt:
                    prompt === draft.expert.systemPrompt &&
                    !prompt.includes(`任务目标：${description}`)
                      ? prompt.replace(/\n当前配置用途：[\s\S]*$/, "") +
                        `\n当前配置用途：${description}`
                      : prompt,
                },
              });
            }}
            disabled={!canChange}
          />
        </label>
        <label htmlFor="draft-welcome">
          欢迎语
          <Input.TextArea
            id="draft-welcome"
            rows={2}
            value={draft.expert.welcomeMessage}
            onChange={(e) =>
              update({
                expert: { ...draft.expert, welcomeMessage: e.target.value },
              })
            }
            disabled={!canChange}
          />
        </label>
        <details>
          <summary
            style={{ fontSize: 12, color: "#779181", cursor: "pointer" }}
          >
            调整专家工作方式
          </summary>
          <label htmlFor="draft-method">
            <Input.TextArea
              id="draft-method"
              aria-label="专家工作方式"
              rows={7}
              value={draft.expert.systemPrompt}
              onChange={(e) =>
                update({
                  expert: { ...draft.expert, systemPrompt: e.target.value },
                })
              }
              disabled={!canChange}
            />
          </label>
        </details>
      </section>
      <section>
        <h4>
          <span className="studio-config-section-number">02</span>应用界面
        </h4>
        <label htmlFor="draft-layout">
          布局
          <Select
            id="draft-layout"
            value={draft.ui?.templateId}
            disabled={!canChange}
            options={templates.map((t) => ({ label: t.name, value: t.id }))}
            onChange={(templateId) =>
              update({
                ui: {
                  templateId,
                  templateVersion: 1,
                } as ApplicationDefinition["ui"],
              })
            }
          />
        </label>
        <p className="studio-config-foot">
          调整现有组件的顺序；输入和结果组件保留任务绑定。
        </p>
        {draft.components.map((c, i) => (
          <div className="studio-component-row" key={c.id}>
            <span>{c.title}</span>
            <Button
              type="text"
              size="small"
              aria-label={`上移${c.title}`}
              icon={<ArrowUp size={12} />}
              disabled={!canChange || i === 0}
              onClick={() => move(i, -1)}
            />
            <Button
              type="text"
              size="small"
              aria-label={`下移${c.title}`}
              icon={<ArrowDown size={12} />}
              disabled={!canChange || i === draft.components.length - 1}
              onClick={() => move(i, 1)}
            />
            {["text", "chat", "progress", "list"].includes(c.kind) ? (
              <Button
                type="text"
                size="small"
                aria-label={`移除${c.title}`}
                disabled={!canChange}
                icon={<X size={12} />}
                onClick={() =>
                  update({
                    components: draft.components.filter((x) => x.id !== c.id),
                  })
                }
              />
            ) : (
              <span style={{ flex: "0 0 24px" }} />
            )}
          </div>
        ))}
        <Select
          aria-label="添加界面组件"
          value={null}
          placeholder={
            <span>
              <Plus size={11} /> 添加组件
            </span>
          }
          disabled={!canChange}
          style={{ width: "100%", marginTop: 12 }}
          options={[
            { value: "text", label: "使用说明" },
            { value: "chat", label: "继续交流" },
            { value: "progress", label: "任务进度" },
            { value: "list", label: "结果列表" },
          ]}
          onChange={add}
        />
      </section>
      <section>
        <h4>
          <span className="studio-config-section-number">03</span>执行与确认
        </h4>
        <p className="studio-config-foot">
          打开后，运行这项任务前先征求你的确认。外部工具的原生审批仍然生效。
        </p>
        {draft.actions.map((action) => (
          <div className="studio-action-confirm" key={action.id}>
            <span>{action.label}</span>
            <Switch
              aria-label={`${action.label}前确认`}
              checked={action.requiresConfirmation}
              disabled={!canChange}
              onChange={(requiresConfirmation) =>
                update({
                  actions: draft.actions.map((a) =>
                    a.id === action.id ? { ...a, requiresConfirmation } : a,
                  ),
                })
              }
            />
          </div>
        ))}
        <Button
          type="text"
          size="small"
          onClick={() =>
            onDiscuss(
              "请根据当前模板配置，先检查盒子上可用的能力，再用选择题帮我确认是否需要添加连接器或已有技能。不要自动安装或授权。",
            )
          }
        >
          和 AI 一起调整能力
        </Button>
      </section>
      {error && <Alert type="error" message={error} />}{" "}
      {saved && (
        <Alert
          type="success"
          message="配置已保存到应用中心草稿。可在预览中查看，再进行真实试用。"
        />
      )}
      <div className="studio-sticky-save">
        <Button
          type="primary"
          icon={<Save size={14} />}
          disabled={!canChange || !dirty || conflict}
          loading={saving}
          onClick={() => void save()}
        >
          保存配置
        </Button>
        <small>
          {!canChange
            ? "在 Craft 模式下保存配置。"
            : dirty
            ? "修改尚未保存"
            : "配置与当前草稿一致"}
        </small>
      </div>
    </div>
  );
}
