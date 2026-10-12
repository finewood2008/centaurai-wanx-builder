import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import BuilderSidebar from "./BuilderSidebar";
import { useChatHistoryRail } from "../pages/Chat/hooks/useChatHistoryRail";
import { CHAT_HISTORY_RAIL_ID } from "../layouts/chatHistoryRail";

vi.mock("../context/AgentContext", () => ({
  useAgent: () => ({ agents: [], refresh: vi.fn(), setActiveAgent: vi.fn() }),
}));
vi.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("../components/AvatarDropdown", () => ({ default: () => null }));

function Chat() {
  const rail = useChatHistoryRail();
  const navigate = useNavigate();
  return (
    <>
      {rail && createPortal(<div>项目与会话</div>, rail)}
      <button onClick={() => navigate("/chat/project/thread")}>进入会话</button>
    </>
  );
}
function Shell() {
  const navigate = useNavigate();
  return (
    <>
      <BuilderSidebar />
      <button onClick={() => navigate("/chat/project")}>打开项目</button>
      <Routes>
        <Route path="/builder" element={<div>首页</div>} />
        <Route path="/chat/:agentId/:threadId?" element={<Chat />} />
      </Routes>
    </>
  );
}
describe("Builder project rail", () => {
  it("keeps a stable portal through home, project and new-thread navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/builder"]}>
        <Shell />
      </MemoryRouter>,
    );
    const rail = document.getElementById(CHAT_HISTORY_RAIL_ID);
    expect(rail).not.toBeNull();
    expect(rail).not.toBeVisible();
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText("打开项目"));
      await waitFor(() => expect(screen.getByText("项目与会话")).toBeVisible());
      fireEvent.click(screen.getByText("进入会话"));
      expect(document.getElementById(CHAT_HISTORY_RAIL_ID)).toBe(rail);
      expect(rail).toContainElement(screen.getByText("项目与会话"));
      fireEvent.click(screen.getByText("应用库"));
      await waitFor(() => expect(screen.queryByText("项目与会话")).toBeNull());
      expect(document.getElementById(CHAT_HISTORY_RAIL_ID)).toBe(rail);
      expect(rail).not.toBeVisible();
    }
  });
});
