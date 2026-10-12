import { useEffect, useState } from "react";
import { Alert } from "antd";
import { CheckCircle2, Circle } from "lucide-react";
import { readFile, isMissing } from "./api";
import type { AppComponent } from "../../../core/definition.mjs";
export default function StructuredResult({
  component,
  agentId,
  demo,
  refreshKey,
}: {
  component: AppComponent;
  agentId: string;
  demo: boolean;
  refreshKey: unknown;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (demo) {
      setData(null);
      return;
    }
    let active = true;
    void readFile(agentId, component.path!)
      .then((raw) => {
        const p = JSON.parse(raw);
        if (!p || Array.isArray(p) || typeof p !== "object")
          throw Error("需要 JSON 对象");
        if (active) {
          setData(p);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(isMissing(e) ? "" : String(e.message || e));
        }
      });
    return () => {
      active = false;
    };
  }, [agentId, component.path, demo, refreshKey]);
  if (error)
    return <Alert type="error" message={"结果格式需要修复：" + error} />;
  if (!data)
    return (
      <div className="structured-empty">
        {demo
          ? "任务执行后，这里显示实际结果。"
          : "尚无结果，请选择任务并运行。"}
      </div>
    );
  const show = (v: unknown) =>
    typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  if (component.kind === "table")
    return Array.isArray(data.columns) && Array.isArray(data.rows) ? (
      <div className="structured-result">
        <table>
          <thead>
            <tr>
              {data.columns.slice(0, 30).map((c: unknown, i: number) => (
                <th key={i}>{show(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 500).map((r: unknown, i: number) => (
              <tr key={i}>
                {(Array.isArray(r) ? r : [r])
                  .slice(0, 30)
                  .map((v: unknown, j: number) => (
                    <td key={j}>{show(v)}</td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Alert
        type="error"
        message="结果缺少 columns 或 rows，请修复任务输出格式。"
      />
    );
  if (component.kind === "chart") {
    const ms = Array.isArray(data.metrics)
      ? data.metrics.filter(
          (m: any) => typeof m.value === "number" && Number.isFinite(m.value),
        )
      : [];
    const max = Math.max(1, ...ms.map((m: any) => Math.abs(m.value)));
    return ms.length ? (
      <div className="structured-chart">
        {ms.slice(0, 30).map((m: any, i: number) => (
          <div key={i}>
            <span>{show(m.label)}</span>
            <span
              className="bar"
              style={{ width: (Math.abs(m.value) / max) * 65 + "%" }}
            />
            <b>
              {m.value} {show(m.unit)}
            </b>
          </div>
        ))}
      </div>
    ) : (
      <div className="structured-empty">
        这项结果没有数值指标，明细仍可查看。
      </div>
    );
  }
  if (!Array.isArray(data.items))
    return (
      <Alert type="error" message="结果缺少 items，请修复任务输出格式。" />
    );
  if (component.kind === "board")
    return (
      <div className="structured-board">
        {data.items.slice(0, 100).map((m: any, i: number) => (
          <article className="structured-card" key={i}>
            <small>{show(m.status)}</small>
            <b>{show(m.title)}</b>
            <p>{show(m.detail)}</p>
          </article>
        ))}
      </div>
    );
  return (
    <div className="structured-checklist">
      {data.items.slice(0, 100).map((m: any, i: number) => (
        <div key={i}>
          {m.checked === true ? (
            <CheckCircle2 size={18} />
          ) : (
            <Circle size={18} />
          )}
          <section>
            <b>{show(m.title)}</b>
            <p>{show(m.detail)}</p>
          </section>
        </div>
      ))}
    </div>
  );
}
