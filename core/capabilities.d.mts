import type { CapabilityRef } from "./definition.mjs";
export type CapabilityStatus =
  | "available"
  | "installation_required"
  | "authorization_required"
  | "unsupported"
  | "unknown";
export interface CatalogItem {
  kind: CapabilityRef["kind"];
  source: string;
  label: string;
  status: CapabilityStatus;
}
export interface CapabilityReport {
  ready: boolean;
  items: (CapabilityRef & { status: CapabilityStatus })[];
  reason?: string;
}
export const capabilityStatusLabels: Record<CapabilityStatus, string>;
export function capabilityReport(
  value: unknown,
  catalog: CatalogItem[],
): CapabilityReport;
