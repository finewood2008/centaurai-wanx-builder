import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {_electron}=require('playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {definition,packageDir,versions}=JSON.parse(await readFile(join(root,'verification/e2e-project.json'),'utf8'));
const {port}=JSON.parse(await readFile(join(process.env.WANX_BUILDER_E2E_HOME || '/tmp/wanx-builder-e2e-home','ready.json'),'utf8'));
let appPath=resolve(process.argv[2]||join(packageDir,`${definition.applicationId}-${definition.version}.app`));
const userData=await mkdtemp(join(tmpdir(),'wanx-independent-ui-'));
const env={...process.env,WANX_BUILDER_USER_DATA:userData};delete env.ELECTRON_RUN_AS_NODE;
let electron,page;const errors=[];
async function launch(){
 electron=await _electron.launch({executablePath:join(appPath,'Contents/MacOS/Electron'),args:[],env,timeout:20000});
 page=await electron.firstWindow({timeout:20000});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)console.error(r.status(),new URL(r.url()).pathname);});
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));
 await page.waitForLoadState('domcontentloaded');
 await page.evaluate(()=>localStorage.setItem('octop:ui-locale','zh'));await page.reload();
 await page.getByRole('button',{name:'连接服务',exact:true}).click();
 await page.getByLabel('手动输入地址').fill(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:/^连\s*接$/}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:/^登\s*录$/}).click({trial:true});
 await page.getByLabel('账号',{exact:true}).fill('admin');
 await page.getByLabel('密码',{exact:true}).fill('TestPass12');
 await page.getByRole('button',{name:/^登\s*录$/}).click();
 await page.getByRole('complementary',{name:'应用工作区'}).waitFor();
}
async function api(path,init={}){return page.evaluate(async({path,init})=>{const r=await fetch('/api'+path,{...init,headers:{'content-type':'application/json',authorization:'Bearer '+window.wanxDesktop.sessionToken()}});const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};},{path,init});}
try{
 await launch();
 const id=await page.evaluate(()=>location.pathname.split('/')[2]);
 const who=await api('/auth/me');assert.equal(who.body.application_id,definition.applicationId);
 const thread=await api(`/agents/${id}/threads`,{method:'POST'});assert.equal(thread.status,201);
 await api(`/agents/${id}/threads/${thread.body.thread_id}`,{method:'PATCH',body:JSON.stringify({conversation_mode:'craft'})});
 await page.goto(new URL(`/chat/${id}/${thread.body.thread_id}`,page.url()).href);
 const editor=page.locator('.builder-widget').filter({has:page.getByRole('heading',{name:'我的文稿',exact:true})});
 await editor.getByRole('textbox').fill('隔离测试文稿：保存后应在重新打开应用时保留。');
 await editor.getByRole('button',{name:'保存',exact:true}).click();
 await editor.getByText('已保存',{exact:true}).waitFor();
 await electron.evaluate(({session},path)=>{globalThis.fixtureDownload=new Promise((resolve,reject)=>session.defaultSession.once('will-download',(_event,item)=>{item.setSavePath(path);item.once('done',(_event,state)=>state==='completed'?resolve(state):reject(Error(state)));}));},join(root,'verification/exported-fixture.md'));
 await editor.getByRole('button',{name:'导出 Markdown'}).click();
 await Promise.race([electron.evaluate(()=>globalThis.fixtureDownload),new Promise((_,reject)=>setTimeout(()=>reject(Error('export did not complete')),20000))]);
 assert.equal(await readFile(join(root,'verification/exported-fixture.md'),'utf8'),'隔离测试文稿：保存后应在重新打开应用时保留。');
 /* Screenshots are captured separately in the visible acceptance window. */
 await electron.close();
 appPath=join(packageDir,`${definition.applicationId}-${versions[1]}.app`);
 await launch();
 assert.equal(await page.evaluate(()=>location.pathname.split('/')[2]),id);
 const file=await api(`/agents/${id}/workspace/file?from_workspace=true&path=outputs%2Fdraft.md`);
 assert.equal(file.body.content,'隔离测试文稿：保存后应在重新打开应用时保留。');
 assert.equal((await page.getByRole('button',{name:'我的应用',exact:true}).count()),0);
 const instance=await api(`/applications/${definition.applicationId}/instance`);
 assert.equal(instance.body.active_version,versions[1]);
 assert.equal(instance.body.status,'ready');
 assert.deepEqual(errors,[]);
 await writeFile(join(root,'verification/independent-e2e.json'),JSON.stringify({passed:true,applicationId:definition.applicationId,scope:'installed standalone bundle + isolated native server; synthetic LLM',profileStable:true,updatedVersion:versions[1],draftPersisted:true,markdownExported:true,pageErrors:errors},null,2));
 console.log('Independent application identity, editor, export, restart and persisted profile passed.');
}catch(e){if(page&&!page.isClosed()){console.error(await page.locator('body').innerText());/* Screenshots are captured separately in the visible acceptance window. */}throw e;}
finally{await electron?.close();await rm(userData,{recursive:true,force:true});}
