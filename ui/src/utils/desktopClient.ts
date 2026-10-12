import type { OctopUser } from "../api/modules/auth";
import type { NavSection } from "../layouts/sidebarNav";
export interface LanService {
  endpoint: string;
  name: string;
  version?: string;
  advertised?: boolean;
  transport?: string;
}
export interface DesktopClientState {
  phase: "disconnected" | "connecting" | "reconnecting" | "ready";
  selected: LanService | null;
  box: { id: string; name: string; mode: "http" | "https" } | null;
  user: OctopUser | null;
  sessionId: string | null;
  reason: string | null;
}
interface DesktopClientBridge {
  action<T = DesktopClientState>(
    action: string,
    input?: Record<string, unknown>,
  ): Promise<T>;
  sessionToken(): string;
  currentBoxId(): string;
  subscribe(callback: (state: DesktopClientState) => void): () => void;
}
declare global {
  interface Window {
    wanxDesktop?: DesktopClientBridge;
  }
}
export function isWanxDesktopClient(): boolean {
  return typeof window !== "undefined" && Boolean(window.wanxDesktop);
}
export function currentBoxScope(): string {
  return window.wanxDesktop?.currentBoxId() || window.location.origin;
}
/** Client tabs are independent of older server-side sidebar preferences. */
export function withClientTabs(
  sections: NavSection[],
  catalog: NavSection[],
): NavSection[] {
  const tabs = catalog
    .flatMap((section) => section.items)
    .filter((item) => ["builder", "boxes", "applications"].includes(item.key));
  const rest = sections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !["builder", "boxes", "applications"].includes(item.key),
    ),
  }));
  const first = rest.find((section) => !section.id);
  if (first) first.items = [...tabs, ...first.items];
  else rest.unshift({ items: tabs });
  return rest;
}
