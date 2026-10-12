import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exampleDefinition,validateDefinition,migrateDefinition,applicationCapabilities,actionPrompt} from '../core/definition.mjs';
import {capabilityReport} from '../core/capabilities.mjs';
test('v2 refuses generated programs, handlers, nonexistent references and duplicate result bindings',()=>{
 for(const change of [d=>d.dependencies.skills[0].files.push({path:'run.py',content:'print(1)'}),d=>d.components[0].onClick='evil()',d=>d.actions[0].capabilityIds=['invented'],d=>d.ui.templateId='arbitrary-html',d=>d.actions[1].resultPath=d.actions[0].resultPath,d=>d.dependencies.connectors.push('not-bound')]){
  const d=exampleDefinition();change(d);assert.throws(()=>validateDefinition(d));
 }
});
test('catalog absence, authorization, installation and unknown cannot be ready',()=>{
 for(const [kind,status] of [['connector','authorization_required'],['connector-catalog','installation_required'],['skill-catalog','unknown'],['builtin','unsupported']]){
  const d=exampleDefinition();d.capabilities.push({id:'dependency',kind,source:'test',label:'测试'});d.actions[0].capabilityIds.push('dependency');if(kind==='connector')d.dependencies.connectors.push('test');
  const catalog=[{kind:'model',source:'default',status:'available'},{kind,source:'test',status}];
  assert.equal(capabilityReport(d,catalog).ready,false);assert.equal(capabilityReport(d,catalog).items.at(-1).status,status);
 }
 assert.equal(capabilityReport(exampleDefinition(),[]).ready,false);
});
test('migration does not mutate a legacy version and refuses script skills',()=>{
 const old=JSON.parse(readFileSync(new URL('./legacy_fixture.json',import.meta.url),'utf8'));const original=JSON.stringify(old);
 const migrated=migrateDefinition(old);assert.equal(migrated.schemaVersion,2);assert.equal(JSON.stringify(old),original);assert.equal(validateDefinition(old).schemaVersion,1);
 old.dependencies.skills[0].files.push({path:'legacy.js',content:'x'});assert.throws(()=>migrateDefinition(old),/执行文件/);
});
test('required UI input prevents execution and registration asks only for needed capabilities',()=>{
 const d=exampleDefinition();const field=d.components.find(c=>c.kind==='form');d.actions[0].inputs=[{id:field.field||field.id,label:'目标',required:true}];
 assert.throws(()=>actionPrompt(d,d.actions[0].id,{}),/请填写/);
 assert.match(actionPrompt(d,d.actions[0].id,{[field.field||field.id]:'hello'}),/WANX_ACTION/);
 assert.ok(!applicationCapabilities(d).includes('memory'));assert.ok(!applicationCapabilities(d).includes('knowledge'));assert.ok(!applicationCapabilities(d).includes('connectors'));
});
