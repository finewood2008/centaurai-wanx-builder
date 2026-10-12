export type ComponentKind =
  | "text"
  | "chat"
  | "upload"
  | "form"
  | "list"
  | "editor"
  | "detail"
  | "progress"
  | "confirm"
  | "table" | "chart" | "board" | "checklist";
export interface AppAction {
  id: string;
  label: string;
  prompt: string;
  resultPath: string;
  requiresConfirmation: boolean;
  capabilityIds?: string[];
  inputs?: { id: string; label: string; required: boolean }[];
}
export interface AppComponent {
  id: string;
  kind: ComponentKind;
  title: string;
  text?: string;
  actionId?: string;
  path?: string;
  field?: string;
}
export interface ApplicationDefinition {
  schemaVersion: 1 | 2;
  ui?: {
    templateId: "conversation" | "form-results" | "materials-editor" | "creation-studio" | "analysis-dashboard" | "operations-console" | "learning-studio" | "office-workbench" | "decision-room" | "service-planner" | "engineering-workbench";
    templateVersion: 1;
  };
  capabilities?: CapabilityRef[];
  applicationId: string;
  version: string;
  name: string;
  description: string;
  expert: { systemPrompt: string; welcomeMessage: string; templateId?:string };
  dependencies: {
    connectors: string[];
    knowledgeBases: string[];
    skillPackages: string[];
    skills: {
      slug: string;
      content: string;
      files: { path: string; content: string }[];
    }[];
  };
  components: AppComponent[];
  actions: AppAction[];
  automations: {
    id: string;
    name: string;
    actionId: string;
    trigger: string;
  }[];
  acceptance: string[];
}
export const componentKinds: ComponentKind[];
export function cleanPath(path: unknown): string;
export function validateDefinition(input: unknown): ApplicationDefinition;
export function canonicalDefinition(input: unknown): string;
export function exampleDefinition(
  applicationId?: string,
  name?: string,
): ApplicationDefinition;
export function actionPrompt(
  definition: unknown,
  actionId: string,
  fields?: Record<string, string>,
): string;

export interface CapabilityRef {
  id: string;
  kind:
    | "model"
    | "builtin"
    | "connector"
    | "connector-catalog"
    | "skill-package"
    | "skill-catalog"
    | "instruction-skill";
  source: string;
  label: string;
}
export const templates: { id: string; version: number; name: string }[];
export function migrateDefinition(input: unknown): ApplicationDefinition;
export function applicationCapabilities(input: unknown): string[];
