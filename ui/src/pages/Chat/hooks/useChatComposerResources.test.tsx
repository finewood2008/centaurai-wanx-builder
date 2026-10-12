/**
 * useChatComposerResources.test.tsx — per-expert knowledge base selection.
 *
 * Regression for the "remember KB selection" bug: one global selection array
 * + a touched flag reset on expert switch meant Expert B's selection leaked
 * into (or replaced) Expert A's remembered selection when switching back.
 * Selection is now persisted per expert (chatStorage) and restored on switch.
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/modules/connectors", () => ({
  connectorsApi: {
    listInstances: vi.fn().mockResolvedValue([
      {
        status: "active",
        has_credentials: true,
        mcp_server_name: "c1",
        display_name: "C1",
        owner_user_id: 7,
        kind: "mcp",
      },
      {
        status: "active",
        has_credentials: true,
        mcp_server_name: "c2",
        display_name: "C2",
        owner_user_id: 7,
        kind: "mcp",
      },
    ]),
  },
}));
vi.mock("../../../api/modules/provider", () => ({
  providerApi: { listResolvedModels: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../../api/modules/preferences", () => ({
  preferencesApi: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../../../api/modules/octopThreads", () => ({
  octopThreadsApi: { patch: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../../api/request", () => ({
  request: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../api/modules/knowledgeBases", () => ({
  knowledgeBasesApi: {
    getCapability: vi.fn().mockResolvedValue({ usable: true }),
    list: vi.fn().mockResolvedValue([
      { id: "k1", default_open: false, owner_user_id: 7 },
      { id: "k2", default_open: false, owner_user_id: 7 },
      { id: "k3", default_open: false, owner_user_id: 7 },
      { id: "k4", default_open: false, owner_user_id: 7 },
    ]),
  },
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: 7 }),
}));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({
    agents: [
      { agent_id: "expertA", knowledge_base_ids: ["k1"] },
      { agent_id: "expertB", knowledge_base_ids: ["k3"] },
    ],
  }),
}));

import { useChatComposerResources } from "./useChatComposerResources";
import type { ConversationMode } from "../utils/conversationMode";

beforeEach(() => {
  localStorage.clear();
});

describe("conversation mode during the first send", () => {
  it.each(["ask", "plan"] as const)(
    "retains %s while the new thread is created",
    (mode) => {
      const { result, rerender } = renderHook(
        ({
          threadId,
          sticky,
        }: {
          threadId: string | null;
          sticky: ConversationMode | undefined;
        }) =>
          useChatComposerResources(
            "expertA",
            threadId,
            null,
            null,
            null,
            sticky,
          ),
        {
          initialProps: { threadId: null, sticky: undefined } as {
            threadId: string | null;
            sticky: ConversationMode | undefined;
          },
        },
      );
      act(() => result.current.handleConversationModeChange(mode));
      rerender({ threadId: "__pending__", sticky: mode });
      expect(result.current.conversationMode).toBe(mode);
      rerender({ threadId: "new-real-thread", sticky: mode });
      expect(result.current.conversationMode).toBe(mode);
      rerender({ threadId: null, sticky: undefined });
      expect(result.current.conversationMode).toBe("craft");
    },
  );
});

describe("useChatComposerResources — per-expert KB selection", () => {
  it("restores expert A's manual selection after switching A -> B -> A", async () => {
    const threadId = "thread-existing"; // existing session → saved prefs apply
    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: string }) =>
        useChatComposerResources(agentId, threadId),
      { initialProps: { agentId: "expertA" } },
    );

    // A starts with its expert default (k1)
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k1"]),
    );

    // user manually adds k2 in expert A
    act(() => result.current.handleKnowledgeBaseIdsChange(["k1", "k2"]));
    expect(result.current.selectedKnowledgeBaseIds).toEqual(["k1", "k2"]);

    // switch to expert B: B's own default, nothing leaked from A
    rerender({ agentId: "expertB" });
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k3"]),
    );

    // user selects k3+k4 in expert B
    act(() => result.current.handleKnowledgeBaseIdsChange(["k3", "k4"]));

    // switch back to expert A: remembered k1+k2 (was: k3/k4 leak or reset)
    rerender({ agentId: "expertA" });
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k1", "k2"]),
    );

    // and back to B: remembered k3+k4
    rerender({ agentId: "expertB" });
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k3", "k4"]),
    );
  });

  it("does not leak a cleared selection across experts", async () => {
    const threadId = "thread-existing";
    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: string }) =>
        useChatComposerResources(agentId, threadId),
      { initialProps: { agentId: "expertA" } },
    );
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k1"]),
    );

    // user clears A's selection entirely (explicit empty is a choice)
    act(() => result.current.handleKnowledgeBaseIdsChange([]));

    rerender({ agentId: "expertB" });
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual(["k3"]),
    );
    act(() => result.current.handleKnowledgeBaseIdsChange(["k4"]));

    rerender({ agentId: "expertA" });
    await waitFor(() =>
      expect(result.current.selectedKnowledgeBaseIds).toEqual([]),
    );
  });

  it("connectors get the same per-expert isolation (aligned with KB fix)", async () => {
    const threadId = "thread-existing";
    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: string }) =>
        useChatComposerResources(agentId, threadId),
      { initialProps: { agentId: "expertA" } },
    );
    await waitFor(() => expect(result.current.chatConnectors.length).toBe(2));

    // manual connector selection in A (saved per agent)
    act(() => result.current.handleConnectorsChange(["c1"]));
    expect(result.current.selectedConnectors).toEqual(["c1"]);

    // switch to B: A's c1 must NOT leak; B has no saved prefs / defaults
    rerender({ agentId: "expertB" });
    await waitFor(() => expect(result.current.selectedConnectors).toEqual([]));

    // manual selection in B, then back to A: each expert remembers its own
    act(() => result.current.handleConnectorsChange(["c2"]));
    rerender({ agentId: "expertA" });
    await waitFor(() =>
      expect(result.current.selectedConnectors).toEqual(["c1"]),
    );
    rerender({ agentId: "expertB" });
    await waitFor(() =>
      expect(result.current.selectedConnectors).toEqual(["c2"]),
    );
  });
});

describe("composed application resources", () => {
  it("only presents connectors declared by the application and omits knowledge", async () => {
    const { result } = renderHook(() =>
      useChatComposerResources("expertA", null, null, null, null, null, null, {
        connectors: ["c2"],
        knowledge: false,
      }),
    );
    await waitFor(() =>
      expect(
        result.current.chatConnectors.map((c) => c.mcp_server_name),
      ).toEqual(["c2"]),
    );
    expect(result.current.chatKnowledgeBases).toBeUndefined();
    expect(result.current.selectedKnowledgeBaseIds).toEqual([]);
  });
  it("does not discover connectors when the application declares none", async () => {
    const { connectorsApi } = await import("../../../api/modules/connectors");
    vi.mocked(connectorsApi.listInstances).mockClear();
    const { result } = renderHook(() =>
      useChatComposerResources("expertA", null, null, null, null, null, null, {
        connectors: [],
        knowledge: false,
      }),
    );
    expect(result.current.chatConnectors).toEqual([]);
    expect(connectorsApi.listInstances).not.toHaveBeenCalled();
  });
});
