import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import {standardApps} from '../../../core/standard-apps.mjs';
import StandardLibrary, {
  pendingStandard,
  STANDARD_PENDING,
} from "./StandardLibrary";
import StructuredResult from "./StructuredResult";
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("./api", () => ({
  readFile,
  isMissing: (e: Error) => e.message.includes("404"),
}));
vi.mock("./standardApi", () => ({ loadStandardDirectory: vi.fn() }));
it("all experts are searchable and selecting one preserves the specific tasks and configuration", () => {
  sessionStorage.removeItem(STANDARD_PENDING);
  const onUse = vi.fn();
  render(<StandardLibrary connected={false} onUse={onUse} />);
  fireEvent.change(screen.getByLabelText("搜索标准应用"), {
    target: { value: "证券观察员" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "查看老钱 · 证券观察员应用" }),
  );
  expect(screen.getAllByText(standardApps.find(a=>a.expertId==='stock-assistant')!.quickPrompts[0].title)[0]).toBeVisible();
  fireEvent.change(screen.getByLabelText("应用名称"), {
    target: { value: "我的证券观察" },
  });
  expect(pendingStandard()?.name).toBe("我的证券观察");
  fireEvent.click(screen.getByRole("button", { name: "连接万象，使用此应用" }));
  expect(onUse).toHaveBeenCalledWith(
    expect.objectContaining({
      expertId: "stock-assistant",
      categoryId: "analysis-dashboard",
    }),
    expect.objectContaining({ name: "我的证券观察" }),
  );
});
it("task data is rendered as real table values, while broken JSON is reported and demo never reads a file", async () => {
  const c = {
    id: "result",
    kind: "table" as const,
    title: "分析结果",
    path: "outputs/task.json",
  };
  readFile.mockResolvedValue(
    JSON.stringify({ columns: ["对象", "数值"], rows: [["A", 42]] }),
  );
  const view = render(
    <StructuredResult component={c} agentId="a" demo={false} refreshKey={0} />,
  );
  expect(await screen.findByText("42")).toBeVisible();
  readFile.mockResolvedValue("invalid JSON");
  view.rerender(
    <StructuredResult component={c} agentId="a" demo={false} refreshKey={1} />,
  );
  await waitFor(() =>
    expect(screen.getByText(/结果格式需要修复/)).toBeVisible(),
  );
  const count = readFile.mock.calls.length;
  view.rerender(
    <StructuredResult component={c} agentId="a" demo refreshKey={2} />,
  );
  expect(readFile.mock.calls.length).toBe(count);
});
