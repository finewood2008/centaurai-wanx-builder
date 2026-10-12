import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {_electron}=require('playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {port}=JSON.parse(await readFile(join(process.env.WANX_BUILDER_E2E_HOME || '/tmp/wanx-builder-e2e-home','ready.json'),'utf8'));
const artifacts=join(root,'verification');await mkdir(artifacts,{recursive:true});
const userData=await mkdtemp(join(tmpdir(),'wanx-builder-ui-'));
const env={...process.env,WANX_BUILDER_USER_DATA:userData};delete env.ELECTRON_RUN_AS_NODE;
const electron=await _electron.launch({executablePath:process.env.WANX_BUILDER_TEST_APP ? join(process.env.WANX_BUILDER_TEST_APP,'Contents/MacOS/Electron') : require('electron'),args:process.env.WANX_BUILDER_TEST_APP ? [] : [root],env});
console.log("electron launched");
const page=await electron.firstWindow({timeout:15000});page.setDefaultTimeout(15000);console.log("window opened");await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));const errors=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()});});
try{
 await page.waitForLoadState('domcontentloaded');console.log('page loaded',page.url());
 await page.evaluate(()=>localStorage.setItem('octop:ui-locale','zh'));await page.reload();

 await page.getByRole('button',{name:'连接服务',exact:true}).waitFor();
 /* Screenshots are captured separately in the visible acceptance window. */
 // Use only the documented test server, through the same signed-in native SDK gateway.
 await page.getByRole('button',{name:'连接服务',exact:true}).click();
 await page.getByLabel('手动输入地址').fill(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:/^连\s*接$/}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:/^登\s*录$/}).click({trial:true});
 await page.getByLabel('账号',{exact:true}).fill('admin');
 await page.getByLabel('密码',{exact:true}).fill('TestPass12');
 await page.getByRole('button',{name:/^登\s*录$/}).click();
 await page.getByRole('heading',{name:'你想做一个什么应用？'}).waitFor();
 /* Screenshots are captured separately in the visible acceptance window. */
 await page.getByPlaceholder('比如：把我的项目资料整理成每周简报，先给我确认，再导出文稿。').fill('构建一个资料整理与写作助手，用于隔离环境验证。');
 await page.getByRole('button',{name:'开始对话',exact:true}).click();
 await page.waitForURL(/\/chat\/[^/]+\/thr_/, {timeout:30000});
 assert.equal(await page.getByRole('complementary',{name:'应用与对话'}).count(),1);
 await page.getByTestId('chat-nav-records').waitFor({state:'visible'});
 assert.ok(await page.getByTestId('chat-nav-records').getByText('构建一个资料整理与写作助手，用于隔离').count() || (await page.getByTestId('chat-nav-records').innerText()).includes('构建一个资料整理'));
 assert.equal(await page.getByRole('complementary',{name:'应用工作区'}).count(),0);
 for (const label of ['知识库','记忆','个性化']) assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),0);
 async function showPreview(delivery=false) {
   const toggle=page.getByRole('button',{name:'查看应用',exact:true});
   await page.getByRole('complementary',{name:'应用与对话'}).waitFor();
   if (!(await page.getByRole('button',{name:'收起预览',exact:true}).isVisible())) { await toggle.waitFor({state:'visible'}); await toggle.click(); }
   await page.getByRole('complementary',{name:'应用工作区'}).waitFor();
   if(delivery) await page.getByRole('tab',{name:'版本与交付',exact:true}).click();
 }
 await showPreview();
 await page.getByRole('button',{name:'收起应用预览',exact:true}).click();
 assert.equal(await page.getByRole('complementary',{name:'应用工作区'}).count(),0);
 await showPreview();
 await page.getByText('演示预览 · 不执行任务',{exact:true}).waitFor();
 /* Screenshots are captured separately in the visible acceptance window. */
 const source=await page.evaluate(async()=>{
  const id=location.pathname.split('/')[2];
  const req=async(path,init={})=>{const r=await fetch('/api'+path,{...init,headers:{'content-type':'application/json','authorization':'Bearer '+window.wanxDesktop.sessionToken()}});return {status:r.status,body:await r.json()};};
  const agent=await req('/agents/'+id);
  const def=await req('/agents/'+id+'/workspace/file?from_workspace=true&path=builder/application.json');
  return {id,agent:agent.body,definition:JSON.parse(def.body.content)};
 });
 assert.ok(source.agent.description.startsWith('WANX_BUILDER_PROJECT:'));
 assert.equal(source.agent.application_id,'wanx-builder');
 await writeFile(join(artifacts,'e2e-project.json'),JSON.stringify({agentId:source.id,definition:source.definition},null,2));
 // Definition is rendered from persisted files, not a hardcoded preview.
 await page.getByText('方案与能力',{exact:true}).click();
 await page.getByText('source-comparison',{exact:false}).first().waitFor();
 /* Screenshots are captured separately in the visible acceptance window. */
 await showPreview(true);
 // API-level assertions through real SDK transport; native UI gates need a real thread.
 const gates=await page.evaluate(async()=>{
  const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='生成 Mac 测试包');
  return {packageButton:!!btn,tokenStored:localStorage.getItem('auth_token'),apiToken:window.wanxDesktop.sessionToken()};
 });
 assert.ok(gates.packageButton);assert.equal(gates.tokenStored,null);assert.ok(gates.apiToken);
 const thread=await page.evaluate(async(agentId)=>{
  const headers={'content-type':'application/json','authorization':'Bearer '+window.wanxDesktop.sessionToken()};
  const r=await fetch(`/api/agents/${agentId}/threads`,{method:'POST',headers});
  const data=await r.json();
  await fetch(`/api/agents/${agentId}/threads/${data.thread_id}`,{method:'PATCH',headers,body:JSON.stringify({conversation_mode:'craft'})});
  return data.thread_id;
 },source.id);
 await page.goto(new URL(`/chat/${source.id}/${thread}`,page.url()).href);
 await showPreview(true);
 await page.getByTestId('conversation-mode-picker').click();
 await page.getByRole('button',{name:/Ask/}).click();
 assert.equal(await page.getByRole('button',{name:'真实试用',exact:true}).isDisabled(),true);
 await page.getByTestId('conversation-mode-picker').click();
 await page.getByRole('button',{name:/Plan/}).click();
 assert.equal(await page.getByRole('button',{name:'保存版本',exact:true}).isDisabled(),true);
 await page.getByTestId('conversation-mode-picker').click();
 await page.getByRole('button',{name:/Craft/}).click();
 const packageDir=process.env.WANX_BUILDER_E2E_PACKAGES || join(artifacts,'packages');
 await mkdir(packageDir,{recursive:true});
 await electron.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},packageDir);
 async function api(path,init={}){return page.evaluate(async({path,init})=>{
  const r=await fetch('/api'+path,{...init,headers:{'content-type':'application/json',authorization:'Bearer '+window.wanxDesktop.sessionToken()}});
  const text=await r.text(); if(!r.ok)throw Error(r.status+' '+text);return text?JSON.parse(text):null;
 },{path,init});}
 const versions=[source.definition.version,'0.1.1'];
 for(const version of versions){
  const def={...source.definition,version};
  if(version!==source.definition.version){
   await api(`/agents/${source.id}/workspace/file?from_workspace=true&path=builder/application.json`,{method:'PUT',body:JSON.stringify({content:JSON.stringify(def)})});
   await page.reload();
   await showPreview(true);
  }
  await page.getByRole('button',{name:'保存版本',exact:true}).click();
  await page.getByText('已保存到应用中心；此版本内容已固定。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'真实试用',exact:true}).click();
  await page.getByText('独立实例 · 真实试用',{exact:false}).waitFor();
  const trialId=await page.evaluate(()=>location.pathname.split('/')[2]);
  const trialThread=await api(`/agents/${trialId}/threads`,{method:'POST'});
  await api(`/agents/${trialId}/threads/${trialThread.thread_id}`,{method:'PATCH',body:JSON.stringify({conversation_mode:'craft'})});
  await page.goto(new URL(`/chat/${trialId}/${trialThread.thread_id}`,page.url()).href);
  for(const action of def.actions){
    await page.getByRole('button',{name:action.label,exact:true}).click();
    await page.waitForFunction(async({agentId,path})=>{const r=await fetch(`/api/agents/${agentId}/workspace/file?from_workspace=true&path=${encodeURIComponent(path)}`,{headers:{authorization:'Bearer '+window.wanxDesktop.sessionToken()}});return r.ok && (await r.json()).content?.includes('隔离验证结果');},{agentId:trialId,path:action.resultPath},{timeout:45000});
    await page.getByRole('button',{name:'记录试用结果',exact:true}).waitFor();
    await page.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='记录试用结果');return b&&!b.disabled;});
  }
  await page.getByRole('button',{name:'记录试用结果',exact:true}).click();
  await page.getByText(/已记录 .* 项实际输出/).waitFor();
  await page.goto(new URL(`/chat/${source.id}/${thread}`,page.url()).href);
  await showPreview(true);
  await page.getByRole('button',{name:'生成 Mac 测试包',exact:true}).click();
  await page.getByText('本机测试包已生成，构建记录已保存到应用中心。完成真实试用后可发布自用版本。',{exact:true}).waitFor({timeout:180000});
  const card=page.locator('.builder-record').filter({has:page.getByText('v'+version,{exact:true})});
  await card.getByRole('button',{name:'发布自用版本',exact:true}).click();
  await page.getByText('自用版本已发布，可以打开安装包连接你的应用实例。',{exact:true}).waitFor();
 }
 const center=await api(`/admin/applications/${source.definition.applicationId}/lifecycle`);
 assert.equal(center.versions.filter(v=>v.published_at).length,2);
 assert.equal(center.runs.filter(r=>r.kind==='trial'&&r.status==='completed').length,2);
 assert.equal(center.runs.filter(r=>r.kind==='build'&&r.status==='completed').length,2);
 await writeFile(join(artifacts,'e2e-project.json'),JSON.stringify({agentId:source.id,threadId:thread,definition:source.definition,versions,packageDir},null,2));
 await page.goto(new URL('/applications',page.url()).href);
 await page.getByRole('heading',{name:source.definition.name,exact:true}).waitFor();
 await writeFile(join(artifacts,'e2e-project.json'),JSON.stringify({agentId:source.id,threadId:thread,definition:source.definition,versions,packageDir},null,2));

 await writeFile(join(artifacts,'desktop-e2e.json'),JSON.stringify({passed:errors.length===0,scope:'isolated native backend; synthetic LLM, no real box/model/connector acceptance',pageErrors:errors,failedRequests:failed},null,2));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,failedRequests:failed,pageErrors:errors}));
 if(process.env.WANX_BUILDER_UI_REVIEW==='1'){
  await page.goto(new URL(`/chat/${source.id}/${thread}`,page.url()).href);
  await page.getByRole('button',{name:'查看应用',exact:true}).waitFor();
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('界面验证（隔离数据） · Builder 0.2.1');w.show();});
  console.log('UI_REVIEW_READY pid='+process.pid);
  await new Promise(resolve=>process.once('SIGUSR2',resolve));
 }

}catch(e){console.error(e);/* Screenshots are captured separately in the visible acceptance window. */console.error(await page.locator('body').innerText());throw e;}
finally{await electron.close();await rm(userData,{recursive:true,force:true});}
