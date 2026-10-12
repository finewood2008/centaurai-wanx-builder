import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleDefinition,validateDefinition,cleanPath,actionPrompt,canonicalDefinition} from '../core/definition.mjs';
import {createHash} from 'node:crypto';
import {assertBuildSource,scopedReceipts} from '../core/build-guard.mjs';
import {operationRegistry} from 'centaurai-wanx';

test('portable schema round-trips and confines generated writes',()=>{
 const def=exampleDefinition();assert.deepEqual(validateDefinition(JSON.parse(JSON.stringify(def))),def);
 for(const path of ['../private','/etc/passwd','outputs/../auth','a//b','a/./b','a\\b'])assert.throws(()=>cleanPath(path));
 const bad=structuredClone(def);bad.components.find(c=>c.kind==='editor').path='skills/secret.md';assert.throws(()=>validateDefinition(bad),/EDITOR_PATH/);
 bad.components=[];bad.actions[0].resultPath='builder/application.json';assert.throws(()=>validateDefinition(bad),/RESULT_PATH/);
 assert.match(actionPrompt(def,'draft',{goal:'draft'}),/outputs\/draft.md/);
});
test('credential-shaped values, reserved identity and ambiguous skills are rejected',()=>{
 const def=exampleDefinition();def.expert.systemPrompt='sk-'+ 'a'.repeat(40);assert.throws(()=>validateDefinition(def),/CREDENTIAL/);
 const good=exampleDefinition();good.applicationId='zhijun';assert.throws(()=>validateDefinition(good),/APPLICATION_ID/);
 const dup=exampleDefinition();dup.dependencies.skills.push(dup.dependencies.skills[0]);assert.throws(()=>validateDefinition(dup),/DUPLICATE_SKILL/);
});
function context({mode='craft',active=false,definition=exampleDefinition(),project=true}={}){
 return {client:{native:{invoke:async(id)=>{
  const op=operationRegistry.find(o=>o.operationId===id);assert.ok(op);
  const body=op.path.endsWith('/lifecycle')?{capability_report:{ready:true},draft:{definition_hash:createHash('sha256').update(canonicalDefinition(definition)).digest('hex')},versions:[{version:definition.version,definition_hash:createHash('sha256').update(canonicalDefinition(definition)).digest('hex')}]}:op.path.endsWith('/history')?{conversation_mode:mode,turn_active:active}:op.path.endsWith('/file')?{content:JSON.stringify(definition)}:{description:project?'WANX_BUILDER_PROJECT:'+definition.applicationId:'other'};
  return {status:200,body};
 }}}};
}
test('host rejects Ask/Plan, running turns, non-projects and changed drafts before packaging',async()=>{
 const input={agentId:'AGENT1',threadId:'thread',definition:exampleDefinition()};
 assert.deepEqual(await assertBuildSource(context(),input),input.definition);
 for(const options of [{mode:'ask'},{mode:'plan'},{active:true},{project:false}])await assert.rejects(assertBuildSource(context(options),input));
 const changed=exampleDefinition();changed.name='changed';await assert.rejects(assertBuildSource(context({definition:changed}),input),/DEFINITION_CHANGED/);
});
test('build records never cross user or box scope',()=>{
 const records=[{userId:1,boxId:'a'},{userId:2,boxId:'a'},{userId:1,boxId:'b'}];
 assert.deepEqual(scopedReceipts(records,{user:{id:1},box:{id:'a'}}),[records[0]]);
 assert.deepEqual(scopedReceipts(records,{}),[]);
});
test('missing ids and ambiguous confirmations cannot become executable UI',()=>{
 const def=exampleDefinition();delete def.actions[0].id;assert.throws(()=>validateDefinition(def),/INVALID_ID/);
 const other=exampleDefinition();other.actions[0].requiresConfirmation='true';assert.throws(()=>validateDefinition(other),/INVALID_CONFIRMATION/);
 const secret=exampleDefinition();secret.dependencies.credentials={password:'fake'};assert.throws(()=>validateDefinition(secret),/CREDENTIAL/);
});
test('automations cannot bypass confirmation or create a tight execution loop',()=>{
 const def=exampleDefinition();def.automations=[{id:'daily',name:'daily',actionId:'compare',trigger:'interval:1'}];assert.throws(()=>validateDefinition(def),/TRIGGER/);
 def.automations[0].trigger='cron:0 9 * * *';def.actions[0].requiresConfirmation=true;assert.throws(()=>validateDefinition(def),/AUTOMATION_ACTION/);
});
