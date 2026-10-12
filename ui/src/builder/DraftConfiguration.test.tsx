import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import {
  instantiateTemplate,
  templateDefaults,
} from "../../../core/solution-templates.mjs";
import DraftConfiguration from "./DraftConfiguration";
const { saveConfiguredDraft } = vi.hoisted(() => ({
  saveConfiguredDraft: vi.fn(),
}));
vi.mock("./api", () => ({ saveConfiguredDraft }));
it("edits the expert purpose as well as its visible description and preserves unsaved configuration", async () => {
  const definition = instantiateTemplate(
    "app-config-test",
    templateDefaults("weekly"),
  );
  saveConfiguredDraft.mockImplementation(
    async (_a, _t, _old, edited) => edited,
  );
  const props = {
    definition,
    agentId: "a",
    threadId: "t",
    canChange: false,
    onSaved: vi.fn(),
    onDiscuss: vi.fn(),
  };
  const view = render(<DraftConfiguration {...props} />);
  expect(screen.getByLabelText("应用用途")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
  view.rerender(<DraftConfiguration {...props} canChange />);
  fireEvent.change(screen.getByLabelText("应用用途"), {
    target: { value: "只整理风险\n标明未确认项" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
  const next = saveConfiguredDraft.mock.calls[0][3];
  expect(next.description).toBe("只整理风险\n标明未确认项");
  expect(next.expert.systemPrompt).toContain(
    "任务目标：只整理风险\n标明未确认项",
  );
  expect(next.expert.systemPrompt).toContain("使用者：团队负责人");
  expect(next.expert.systemPrompt).toContain("skills/template-weekly/SKILL.md");
  expect(screen.getByLabelText("应用用途")).toHaveValue(next.description);
});
