import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleDefinition } from "../../../core/definition.mjs";
const { readiness } = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("./capabilities", () => ({ assertCapabilities: readiness }));
vi.mock("./api", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("NOT_FOUND")),
  writeFile: vi.fn(),
  isMissing: () => true,
  assertCraft: vi.fn(),
}));
vi.mock("../api/request", () => ({ request: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/modules/octopThreads", () => ({
  octopThreadsApi: { history: vi.fn().mockResolvedValue({ messages: [] }) },
}));
import ApplicationCanvas from "./ApplicationCanvas";
beforeEach(() => {
  readiness.mockReset().mockResolvedValue({ ready: true });
});
afterEach(cleanup);
describe("template actions", () => {
  it.each(["conversation", "form-results", "materials-editor"] as const)(
    "%s validates input and invokes the bound native action",
    async (templateId) => {
      const definition = exampleDefinition();
      definition.ui = { templateId, templateVersion: 1 };
      definition.actions[1].inputs = [
        { id: "goal", label: "写作目标", required: true },
      ];
      const send = vi.fn();
      render(
        <ApplicationCanvas
          definition={definition}
          agentId="app"
          threadId="thread"
          demo={false}
          busy={false}
          craft
          onSend={send}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "生成文稿" }));
      await screen.findByRole("alert");
      expect(send).not.toHaveBeenCalled();
      fireEvent.change(screen.getByPlaceholderText("写作目标"), {
        target: { value: "整理测试资料，保留来源" },
      });
      fireEvent.click(screen.getByRole("button", { name: "生成文稿" }));
      await waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.calls[0][0]).toContain("[WANX_ACTION:draft]");
      expect(send.mock.calls[0][0]).toContain("整理测试资料，保留来源");
      expect(readiness).toHaveBeenCalledWith("app", definition, "draft");
    },
  );
  it("blocks an unavailable dependency and allows retry after reauthorization", async () => {
    const send = vi.fn();
    readiness.mockRejectedValueOnce(new Error("连接器：待授权"));
    render(
      <ApplicationCanvas
        definition={exampleDefinition()}
        agentId="app"
        threadId="thread"
        demo={false}
        busy={false}
        craft
        onSend={send}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "整理资料" }));
    await screen.findByText("连接器：待授权");
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "整理资料" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
  });
});
