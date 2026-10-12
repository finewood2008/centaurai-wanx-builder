import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {_electron}=require('playwright');
const project=JSON.parse(await readFile(join(root,'verification/studio-040-project.json'),'utf8'));
const {port}=JSON.parse(await readFile(join(process.env.WANX_BUILDER_E2E_HOME||'/tmp/wanx-builder-040-e2e','ready.json'),'utf8'));
const userData=await mkdtemp(join(tmpdir(),'wanx-studio-config-'));
const env={...process.env,WANX_BUILDER_USER_DATA:userData};delete env.ELECTRON_RUN_AS_NODE;
const electron=await _electron.launch({executablePath:require('electron'),args:[root],env});
const page=await electron.firstWindow();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.getByRole('button',{name:'查看资料写作助手模板'}).waitFor();
 await page.getByRole('button',{name:'连接万象',exact:true}).last().click();
 await page.getByRole('button',{name:'连接服务',exact:true}).click();
 await page.getByLabel('手动输入地址').fill(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:/^连\s*接$/}).click();
 await page.getByLabel('手动输入地址').waitFor({state:'hidden'});
 await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('TestPass12');
 await page.getByRole('button',{name:/^登\s*录$/}).click();
 await page.getByRole('button',{name:'查看资料写作助手模板'}).waitFor();
 await page.goto(new URL(`/chat/${project.agentId}/${project.threadId}`,page.url()).href);
 await page.locator('#draft-goal').waitFor();
 await page.locator('#draft-goal').fill('整理项目风险，列出待确认的问题。');
 await page.getByRole('button',{name:'保存配置',exact:true}).click();
 await page.getByText('配置已保存到应用中心草稿。可在预览中查看，再进行真实试用。',{exact:true}).waitFor();
 const def=await page.evaluate(async(id)=>{
  const r=await fetch(`/api/agents/${id}/workspace/file?from_workspace=true&path=builder/application.json`,{headers:{authorization:'Bearer '+window.wanxDesktop.sessionToken()}});
  return JSON.parse((await r.json()).content);
 },project.agentId);
 assert.equal(def.version,'0.1.2');assert.equal(def.description,'整理项目风险，列出待确认的问题。');assert.ok(def.expert.systemPrompt.includes('任务目标：'+def.description));assert.ok(def.expert.systemPrompt.includes('使用者：团队负责人'));
 await page.getByTestId('conversation-mode-picker').click();await page.getByRole('button',{name:/Ask/}).click();
 assert.equal(await page.locator('#draft-goal').isDisabled(),true);
 await page.getByTestId('conversation-mode-picker').click();await page.getByRole('button',{name:/Craft/}).click();
 await page.reload();assert.equal(await page.locator('#draft-goal').inputValue(),def.description);
 assert.deepEqual(errors,[]);
 await writeFile(join(root,'verification/studio-040-configuration.json'),JSON.stringify({passed:true,scope:'isolated native WANX; direct configuration save; immutable version increment; mode gates; reload persists expert purpose',version:def.version,pageErrors:errors},null,2));
 if(process.env.WANX_BUILDER_UI_REVIEW==='1'){
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('隔离界面验收 · Builder 0.4.0');w.show();});
  console.log('UI_REVIEW_READY pid='+process.pid);
  await new Promise(resolve=>process.once('SIGUSR2',resolve));
 }
 console.log('Configuration lifecycle passed');
}catch(e){console.error(await page.locator('body').innerText());throw e;}
finally{await electron.close();await rm(userData,{recursive:true,force:true});}
