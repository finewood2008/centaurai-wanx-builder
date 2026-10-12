import { test } from 'node:test';
import assert from 'node:assert/strict';
import {solutionTemplates,templateDefaults,instantiateTemplate,templateBrief} from '../core/solution-templates.mjs';
import {validateDefinition,applicationCapabilities} from '../core/definition.mjs';
test('every starter produces an isolated v2 recipe using only model and instructional skills',()=>{
 for(const template of solutionTemplates){
  const config=templateDefaults(template.id),a=instantiateTemplate('app-template-test',config),b=instantiateTemplate('app-template-test',config);
  assert.equal(validateDefinition(a).schemaVersion,2);assert.equal(a.ui.templateId,template.layout);
  assert.deepEqual(a.files,undefined);assert.deepEqual(a.dependencies.connectors,[]);assert.deepEqual(a.dependencies.skills[0].files,[]);
  assert.deepEqual(a.actions[0].capabilityIds,['reasoning','method']);
  assert.ok(!applicationCapabilities(a).includes('connectors'));
  a.components.reverse();a.dependencies.skills[0].content='changed';
  assert.notDeepEqual(a,b);assert.notEqual(b.dependencies.skills[0].content,'changed');
 }
});
test('selected business configuration changes the real expert and task confirmation',()=>{
 const c={...templateDefaults('weekly'),name:'项目简报',goal:'只整理本周风险',audience:'项目经理',tone:'简洁、直接',confirm:true};
 const d=instantiateTemplate('app-weekly-test',c);
 assert.equal(d.name,c.name);assert.equal(d.description,c.goal);
 for(const value of [c.goal,c.audience,c.tone])assert.ok(d.expert.systemPrompt.includes(value));
 assert.equal(d.actions[0].requiresConfirmation,true);assert.ok(d.actions[0].prompt.includes('skills/template-weekly/SKILL.md'));
 assert.ok(templateBrief(c).includes('不是另一个历史应用'));
 assert.throws(()=>instantiateTemplate('app-test',{...c,templateId:'arbitrary-code'}));
 assert.throws(()=>instantiateTemplate('app-test',{...c,goal:''}));
});
