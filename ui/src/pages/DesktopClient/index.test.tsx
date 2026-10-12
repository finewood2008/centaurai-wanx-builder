import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import DesktopClient from "./index";
import type { DesktopClientState } from "../../utils/desktopClient";

vi.mock("../../context/AgentContext", () => ({
  AgentProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../context/LayoutModeContext", () => ({
  LayoutModeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../context/VoiceOutputContext", () => ({
  VoiceOutputProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../builder/useProduct", () => ({ useProduct: () => null }));
vi.mock("../../layouts/MainLayout", async () => {
  const { DesktopClientBar } = await import("./index");
  return { default: () => <><DesktopClientBar /><input aria-label="未发送内容" /></> };
});

describe("desktop reconnect", () => {
  it("keeps the current workbench and unsent input across reconnect", async () => {
    const state = {
      phase: "ready", selected: null, box: { id: "box", name: "Test box", mode: "http" },
      sessionId: "test-session", user: null, reason: null,
    } satisfies DesktopClientState;
    let notify!: (value: DesktopClientState) => void;
    const action = vi.fn().mockResolvedValue(state);
    window.wanxDesktop = {
      action, sessionToken: () => state.sessionId, currentBoxId: () => "box",
      subscribe: (cb) => { notify = cb; return () => {}; },
    };
    try {
      const view = render(<MemoryRouter><DesktopClient /></MemoryRouter>);
      const input = await screen.findByLabelText("未发送内容");
      fireEvent.change(input, { target: { value: "保留我的修改" } });
      act(() => notify({ ...state, phase: "reconnecting", reason: "CONNECTION_LOST" }));
      expect(screen.getByText("连接中断，正在重连")).toBeVisible();
      expect(screen.getByLabelText("未发送内容")).toBe(input);
      expect(input).toHaveValue("保留我的修改");
      fireEvent.click(screen.getByText("重试连接"));
      expect(action).toHaveBeenCalledWith("connection.retry");
      act(() => notify(state));
      await waitFor(() => expect(screen.getByText("已连接")).toBeVisible());
      expect(input).toHaveValue("保留我的修改");
      view.unmount();
    } finally { delete window.wanxDesktop; }
  });
});
