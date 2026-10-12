import {test} from 'node:test';
import assert from 'node:assert/strict';
import {standardApps,taskTypes,standardDefaults,instantiateStandardApp} from '../core/standard-apps.mjs';
import {validateDefinition} from '../core/definition.mjs';
test('complete expert inventory maps every source to a concrete task UI and preserves its method',()=>{
 assert.equal(standardApps.filter(a=>a.sourceKind==='builtin').length,27);assert.equal(standardApps.filter(a=>a.sourceKind==='market').length,55);
 for(const app of standardApps){const def=instantiateStandardApp('app-catalog-test',app,standardDefaults(app));assert.ok(taskTypes.some(t=>t.id===def.ui.templateId));assert.ok(def.expert.systemPrompt.includes(app.method));assert.ok(!def.components.some(c=>c.kind==='chat'));assert.deepEqual(def.dependencies.skills[0].files,[]);assert.ok(def.actions.every(a=>a.inputs.length>0));assert.ok(def.actions.every(a=>app.quickPrompts.length===0||app.quickPrompts.some(p=>a.prompt.includes(p.prompt))));}
});
test('task interaction differs between analysis, office, operations and decision experts',()=>{
 const byId=id=>{const a=standardApps.find(a=>a.expertId===id);return instantiateStandardApp('app-layout-test',a,standardDefaults(a));};
 assert.ok(byId('stock-assistant').components.some(c=>c.kind==='chart'));assert.ok(byId('stock-assistant').components.some(c=>c.kind==='table'));
 assert.ok(byId('office-automation').components.some(c=>c.kind==='editor'));assert.ok(byId('ops-engineer').components.some(c=>c.kind==='checklist'));assert.ok(byId('brainstorm-strategy').components.some(c=>c.kind==='board'));
 const app=standardApps.find(a=>a.expertId==='office-automation');const def=instantiateStandardApp('app-native-test',app,standardDefaults(app),{packages:['existing-package'],tools:[],connectors:[],nativeTemplate:app.expertId});assert.equal(validateDefinition(def).expert.templateId,'office-automation');assert.deepEqual(def.dependencies.skillPackages,['existing-package']);
});
import {normalizeExpert} from '../core/standard-apps.mjs';
test('native API text-file arrays preserve the expert persona instead of replacing it with an empty method',()=>{
 const expert=normalizeExpert({id:'office-automation',label:{zh:'办公专家'},file_contents:[{name:'SOUL.md',content:'Original office methodology'},{name:'IDENTITY.md',content:'Office persona'}]},'builtin');
 assert.ok(expert.method.includes('Original office methodology'));assert.ok(expert.method.includes('Office persona'));
});
