import type { ApplicationDefinition } from './definition.mjs';
export interface TemplateConfiguration { templateId: string; name: string; goal: string; audience: string; tone: string; confirm: boolean; }
export interface SolutionTemplate { id:string; name:string; category:string; accent:string; layout:'materials-editor'|'form-results'|'conversation'; headline:string; description:string; audience:string; goal:string; inputLabel:string; actionLabel:string; outputTitle:string; steps:string[]; exampleInput:string; exampleTitle:string; exampleLines:string[]; bestFor:string[]; }
export const solutionTemplates: SolutionTemplate[];
export function getSolutionTemplate(id:string):SolutionTemplate;
export function templateDefaults(id:string):TemplateConfiguration;
export function instantiateTemplate(applicationId:string,config:TemplateConfiguration):ApplicationDefinition;
export function templateBrief(config:TemplateConfiguration):string;
