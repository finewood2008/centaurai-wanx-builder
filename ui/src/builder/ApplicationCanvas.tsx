import StructuredResult from "./StructuredResult";
import "./standard.css";
import { octopThreadsApi } from "../api/modules/octopThreads";
import { assertCapabilities } from "./capabilities";
import { templates } from "../../../core/definition.mjs";
import { useEffect, useState, useRef } from "react";
import { Button, Input, Alert, Modal, Tag } from "antd";
import { Download, Save, Upload, RefreshCw } from "lucide-react";
import { request } from "../api/request";
import { uploadFile } from "../api/modules/upload";
import {
  readFile,
  writeFile,
  isMissing,
  assertCraft,
  type ApplicationDefinition,
} from "./api";
import {
  actionPrompt,
  cleanPath,
  type AppComponent,
} from "../../../core/definition.mjs";
interface Props {
  definition: ApplicationDefinition;
  agentId: string;
  threadId: string | null;
  demo: boolean;
  busy: boolean;
  craft: boolean;
  onSend: (text: string) => void;
  onSelect?: (id: string) => void;
  selected?: string;
  refreshKey?: number;
}
export default function ApplicationCanvas({
  definition,
  agentId,
  threadId,
  demo,
  busy,
  craft,
  onSend,
  onSelect,
  selected,
  refreshKey,
}: Props) {
  const [task, setTask] = useState(definition.actions[0]?.id);
  useEffect(() => {
    if (!definition.actions.some((a) => a.id === task))
      setTask(definition.actions[0]?.id);
  }, [definition, task]);
  const standard =
    definition.ui?.templateId &&
    !["conversation", "form-results", "materials-editor"].includes(
      definition.ui.templateId,
    );
  const [fields, setFields] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  async function run(id: string) {
    const action = definition.actions.find((a) => a.id === id);
    if (!action || demo || busy || !craft) return;
    const execute = async () => {
      setChecking(true);
      setError("");
      try {
        const prompt = actionPrompt(definition, id, fields);
        await assertCapabilities(agentId, definition, id);
        onSend(prompt);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setChecking(false);
      }
    };
    if (action.requiresConfirmation)
      Modal.confirm({
        title: action.label,
        content:
          "确认后将按此应用的规则执行。外部工具的授权与审批仍由 WANX 处理。",
        okText: "确认执行",
        cancelText: "取消",
        onOk: execute,
      });
    else execute();
  }
  return (
    <div
      className={
        "builder-canvas template-" +
        (definition.ui?.templateId || "materials-editor")
      }
    >
      {definition.ui && (
        <p className="builder-template-label">
          {templates.find((t) => t.id === definition.ui?.templateId)?.name}
        </p>
      )}
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
        />
      )}
      {standard && (
        <nav className="task-ui-header" aria-label="应用任务">
          {definition.actions.map((a) => (
            <button
              key={a.id}
              className={task === a.id ? "active" : ""}
              onClick={() => {
                setTask(a.id);
                setFields(prev=>({materials:prev.materials||""}));
              }}
            >
              {a.label}
            </button>
          ))}
        </nav>
      )}
      {definition.components
        .filter((c) => !standard || !c.actionId || c.actionId === task)
        .map((c) => (
          <section
            key={c.id}
            className={
              "builder-widget kind-" +
              c.kind +
              (selected === c.id ? " selected" : "")
            }
            onClick={() => onSelect?.(c.id)}
          >
            <h4>{c.title}</h4>
            {c.kind === "text" && <p>{c.text}</p>}
            {c.kind === "chat" && (
              <p>在左侧继续对话，可以补充资料、修改要求或追问结果。</p>
            )}
            {c.kind === "form" && (
              <>
                <Input.TextArea
                  placeholder={
                    definition.actions
                      .flatMap((a) => a.inputs ?? [])
                      .find((f) => f.id === (c.field || c.id))?.label ||
                    "写下这次的目标和要求…"
                  }
                  value={fields[c.field || c.id] || ""}
                  onChange={(e) =>
                    setFields({ ...fields, [c.field || c.id]: e.target.value })
                  }
                  autoSize={{ minRows: 3, maxRows: 8 }}
                />
                <div className="builder-widget-controls">
                  {c.actionId && (
                    <Button
                      type="primary"
                      disabled={demo || busy || checking || !craft}
                      onClick={() => void run(c.actionId!)}
                    >
                      {
                        definition.actions.find((a) => a.id === c.actionId)
                          ?.label
                      }
                    </Button>
                  )}
                </div>
              </>
            )}
            {c.kind === "confirm" && c.actionId && (
              <Button
                disabled={demo || busy || checking || !craft}
                onClick={() => void run(c.actionId!)}
              >
                {definition.actions.find((a) => a.id === c.actionId)?.label}
              </Button>
            )}
            {c.kind === "upload" && (
              <>
                <label>
                  <Button
                    icon={<Upload size={14} />}
                    disabled={demo || busy || checking || !craft}
                    onClick={() =>
                      document.getElementById("builder-upload-" + c.id)?.click()
                    }
                  >
                    选择资料
                  </Button>
                  <input
                    id={"builder-upload-" + c.id}
                    type="file"
                    multiple
                    hidden
                    disabled={demo || busy || checking || !craft}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      try {
                        await assertCraft(agentId, threadId);
                        const paths: string[] = [];
                        for (const f of files) {
                          if (f.size > 1800000)
                            throw new Error(
                              "当前标准 SDK 通道仅支持小于 1.8 MB 的附件，请先拆分资料。",
                            );
                          const result = await uploadFile(agentId, f);
                          paths.push(result.workspace_path || result.path);
                        }
                        setFields((prev) => ({
                          ...prev,
                          materials: [prev.materials, ...paths]
                            .filter(Boolean)
                            .join("\n"),
                        }));
                      } catch (err) {
                        setError(String(err));
                      }
                    }}
                  />
                </label>
                {fields.materials && <pre>{fields.materials}</pre>}
              </>
            )}
            {(c.kind === "editor" || c.kind === "detail") && c.path && (
              <FileWidget
                key={agentId + ":" + c.path}
                component={c}
                agentId={agentId}
                threadId={threadId}
                demo={demo}
                editable={c.kind === "editor" && craft && !busy}
                refreshKey={refreshKey}
              />
            )}
            {c.kind === "list" && c.path && (
              <FileList
                agentId={agentId}
                path={c.path}
                demo={demo}
                refreshKey={refreshKey}
              />
            )}
            {["table", "chart", "board", "checklist"].includes(c.kind) &&
              c.path && (
                <StructuredResult
                  component={c}
                  agentId={agentId}
                  demo={demo}
                  refreshKey={refreshKey}
                />
              )}
            {c.kind === "progress" && (
              <TaskStatus
                agentId={agentId}
                threadId={threadId}
                demo={demo}
                busy={busy}
                refreshKey={refreshKey}
              />
            )}
          </section>
        ))}
      <div className="builder-widget-controls">
        {definition.actions
          .filter(
            (a) => !definition.components.some((c) => c.actionId === a.id),
          )
          .map((a) => (
            <Button
              key={a.id}
              disabled={demo || busy || checking || !craft}
              onClick={() => void run(a.id)}
            >
              {a.label}
            </Button>
          ))}
      </div>
      {!demo && !craft && (
        <p className="builder-note">
          当前为只读模式。切换到 Craft 后可执行任务和保存编辑。
        </p>
      )}
    </div>
  );
}
function exportMarkdown(name: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.split("/").pop() || "document.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function FileWidget({
  component: c,
  agentId,
  threadId,
  demo,
  editable,
  refreshKey,
}: {
  component: AppComponent;
  agentId: string;
  threadId: string | null;
  demo: boolean;
  editable: boolean;
  refreshKey?: number;
}) {
  const [text, setText] = useState(""),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void readFile(agentId, c.path!)
      .then((content) => {
        if (active && !dirtyRef.current) {
          setText(content);
          setStatus("");
        }
      })
      .catch((e) => {
        if (active)
          setStatus(isMissing(e) ? "执行后，结果会显示在这里。" : String(e));
      });
    return () => {
      active = false;
    };
  }, [agentId, c.path, demo, refreshKey]);
  async function save() {
    setSaving(true);
    try {
      await assertCraft(agentId, threadId);
      await writeFile(agentId, c.path!, text);
      setDirty(false);
      setStatus("已保存");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setSaving(false);
    }
  }
  if (demo)
    return (
      <div className="builder-placeholder">
        {c.kind === "editor"
          ? "可编辑的文稿将在这里出现"
          : "真实结果将在这里显示"}
      </div>
    );
  return (
    <>
      {c.kind === "editor" ? (
        <Input.TextArea
          value={text}
          readOnly={!editable}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          autoSize={{ minRows: 6, maxRows: 20 }}
        />
      ) : (
        <pre>{text}</pre>
      )}
      <div className="builder-widget-controls">
        {c.kind === "editor" && (
          <Button
            size="small"
            icon={<Save size={13} />}
            loading={saving}
            disabled={!dirty || !editable}
            onClick={() => void save()}
          >
            保存
          </Button>
        )}
        <Button
          size="small"
          icon={<Download size={13} />}
          disabled={!text}
          onClick={() => exportMarkdown(c.path!, text)}
        >
          导出 Markdown
        </Button>
        {dirty && <Tag>尚未保存</Tag>}
      </div>
      {status && <p className="builder-note">{status}</p>}
    </>
  );
}
function FileList({
  agentId,
  path,
  demo,
  refreshKey,
}: {
  agentId: string;
  path: string;
  demo: boolean;
  refreshKey?: number;
}) {
  const [files, setFiles] = useState<
      { path: string; name?: string; is_dir?: boolean }[]
    >([]),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{ path: string; text: string } | null>(
      null,
    ),
    [tick, setTick] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void request<typeof files>(
      `/agents/${encodeURIComponent(
        agentId,
      )}/workspace/tree?from_workspace=true&path=${encodeURIComponent(path)}`,
    )
      .then((rows) => {
        if (active) {
          setFiles(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(isMissing(e) ? "还没有文稿。" : String(e));
      });
    return () => {
      active = false;
    };
  }, [agentId, path, demo, refreshKey, tick]);
  if (demo) return <p className="builder-note">保存的文稿会按文件列出。</p>;
  return (
    <>
      <Button
        type="text"
        size="small"
        icon={<RefreshCw size={12} />}
        onClick={() => setTick((t) => t + 1)}
      >
        刷新
      </Button>
      {files
        .filter((f) => !f.is_dir)
        .map((f) => (
          <button
            className="builder-file"
            key={f.path}
            onClick={async () => {
              try {
                const p = cleanPath(f.path.replace(/^\//, ""));
                setPreview({ path: p, text: await readFile(agentId, p) });
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {f.name || f.path}
          </button>
        ))}
      {error && <p className="builder-note">{error}</p>}
      <Modal
        title={preview?.path}
        open={!!preview}
        footer={
          <Button
            onClick={() =>
              preview && exportMarkdown(preview.path, preview.text)
            }
          >
            导出
          </Button>
        }
        onCancel={() => setPreview(null)}
      >
        <pre className="builder-schema">{preview?.text}</pre>
      </Modal>
    </>
  );
}

function TaskStatus({
  agentId,
  threadId,
  demo,
  busy,
  refreshKey,
}: {
  agentId: string;
  threadId: string | null;
  demo: boolean;
  busy: boolean;
  refreshKey?: number;
}) {
  const [status, setStatus] = useState("等待任务");
  useEffect(() => {
    if (demo || !threadId) return;
    let active = true;
    const read = () =>
      octopThreadsApi
        .history(agentId, threadId)
        .then((h) => {
          if (active)
            setStatus(
              h.hitl_pending
                ? "等待你的回答或执行确认"
                : h.turn_active
                ? "任务正在执行"
                : h.messages.at(-1)?.status === "error"
                ? "任务未完成，请查看对话后重试"
                : h.messages.length
                ? "本轮执行已结束，请检查实际结果"
                : "等待任务",
            );
        })
        .catch(() => {
          if (active) setStatus("连接中断，恢复连接后重新检查");
        });
    void read();
    const timer = busy ? setInterval(() => void read(), 4000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [agentId, threadId, demo, busy, refreshKey]);
  return (
    <div className="builder-status">
      <i />
      <span>{demo ? "演示预览 · 尚未执行" : status}</span>
    </div>
  );
}
