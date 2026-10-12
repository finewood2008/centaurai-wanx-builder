import type {ApplicationDefinition} from './definition.mjs';
export interface StandardApp {id:string;expertId:string;slug:string;sourceKind:'builtin'|'market'|'published';name:string;description:string;categoryId:string;category:string;accent:string;layout:string;scene:string;quickPrompts:{title:string;description:string;prompt:string}[];skillSlugs:string[];method:string;welcome:string;availability:string;snapshotDate:string;}
export interface StandardConfiguration {appId:string;name:string;goal:string;audience:string;tone:string;confirm:boolean;}
export const taskTypes:{id:string;name:string;accent:string;input:string;output:string;format:string;summary:string}[];
export const standardApps:StandardApp[];
export const directoryMetadata:{capturedAt:string;builtinCount:number;marketCount:number;marketSource:string};
export function textOf(v:unknown):string;
export function classifyExpert(v:any):string;
export function normalizeExpert(v:any,sourceKind?:string):StandardApp;
export function getStandardApp(id:string):StandardApp;
export function standardDefaults(app:StandardApp):StandardConfiguration;
export function standardBrief(app:StandardApp,config:StandardConfiguration):string;
export function instantiateStandardApp(id:string,app:StandardApp,config:StandardConfiguration,bindings?:{packages:string[];tools:string[];connectors:string[];nativeTemplate?:string}):ApplicationDefinition;
