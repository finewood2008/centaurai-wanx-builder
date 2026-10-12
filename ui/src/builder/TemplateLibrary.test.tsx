import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TemplateLibrary, {
  pendingTemplate,
  PENDING_TEMPLATE_KEY,
} from "./TemplateLibrary";
describe("template-first entry", () => {
  it("browses and configures offline without creating a blank project", () => {
    const use = vi.fn();
    render(<TemplateLibrary connected={false} onUse={use} />);
    expect(
      screen.getAllByRole("button", { name: /^查看.*模板$/ }),
    ).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("搜索模板"), {
      target: { value: "每周简报" },
    });
    expect(
      screen.getAllByRole("button", { name: /^查看.*模板$/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "查看每周简报模板" }));
    expect(use).not.toHaveBeenCalled();
    expect(screen.getByLabelText("应用名称")).toHaveValue("每周简报");
    fireEvent.change(screen.getByLabelText("应用名称"), {
      target: { value: "我的周报" },
    });
    expect(pendingTemplate()?.name).toBe('我的周报');
    fireEvent.click(screen.getByRole("button", { name: "连接万象，继续配置" }));
    expect(use).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "weekly", name: "我的周报" }),
    );
  });
  it("rejects corrupt pending selections and offers a useful search reset", () => {
    sessionStorage.setItem(
      PENDING_TEMPLATE_KEY,
      JSON.stringify({ templateId: "invalid" }),
    );
    expect(pendingTemplate()).toBeUndefined();
    render(<TemplateLibrary connected onUse={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("搜索模板"), {
      target: { value: "not available" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查看全部模板" }));
    expect(
      screen.getAllByRole("button", { name: /^查看.*模板$/ }),
    ).toHaveLength(6);
  });
});
