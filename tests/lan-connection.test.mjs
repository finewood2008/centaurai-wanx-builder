import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDesktopSession,normalizeDirectURL} from '../shell/session.mjs';
import {probeWanx} from '../vendor/zhijun/lan-discovery.mjs';
import {operationRegistry} from 'centaurai-wanx';
const user={id:1,application_id:'wanx-builder',username:'synthetic',role:'admin',permissions:[]};
function fixture(options={}) {
 const calls=[];let status=200,closed=0,offline=false;
 const service=createDesktopSession({
  probe:async endpoint=>({endpoint,name:'Test WANX',transport:'http'}),
  fetcher:async(url,input)=>{calls.push({url,...input});return Response.json({access_token:'test-token-'+new URL(url).host});},
  discoveryFactory:()=>({scan:async()=>({services:[{endpoint:'http://192.168.1.2:8088',name:'Test WANX'}]}),close(){}}),
  transportFactory:({baseURL,token})=>({
   capabilities:{maxRequestBodyBytes:2000000},
   async request(input){calls.push({url:baseURL+input.path,token:await token()});if(offline)throw new TypeError('fetch failed');return {status,headers:{"content-type":"application/json"},chunks:(async function*(){yield new TextEncoder().encode(JSON.stringify(user));})(),close:async()=>{}};},
   async close(){closed++;},
  }),...options,
 });
 return {service,calls,revoke:()=>status=401,status:value=>status=value,offline:value=>offline=value,get closed(){return closed;}};
}
test('LAN connection validates explicit private origins and sends no credentials during discovery',async()=>{
 for(const url of ['http://169.254.169.254','http://8.8.8.8','http://u:p@192.168.1.2','http://192.168.1.2/api','http://192.168.1.2/?token=x'])assert.throws(()=>normalizeDirectURL(url));
 assert.equal(normalizeDirectURL('http://192.168.1.2:8088/'),'http://192.168.1.2:8088');
 const calls=[];const result=await probeWanx('http://192.168.1.2:8088',async(url,options)=>{calls.push(options);return Response.json(url.endsWith('/api/health')?{ok:true,db:true}:url.endsWith('/api/auth/captcha')?{provider:'none'}:{product:'wanx',protocol:1,name:'Box',version:'1'});});
 assert.equal(result.name,'Box');assert.ok(calls.every(c=>c.redirect==='error'&&!c.headers.Authorization));
});
test('selected service survives restart without saving credentials; switching invalidates the old scope',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builder-lan-'));const f=fixture({dataDirectory:dir});
 try{
  await assert.rejects(f.service.action('connection.login',{username:'synthetic',password:'test-password'}),/CONNECTION_REQUIRED/);
  const found=await f.service.action('connection.search');assert.equal(found.scope,'client-lan');assert.equal(f.calls.length,0);
  await f.service.action('connection.select',{address:found.services[0].endpoint});
  const state=await f.service.action('connection.login',{username:'synthetic',password:'test-password'});
  assert.equal(state.user.application_id,'wanx-builder');assert.equal(JSON.parse(f.calls[0].body).application_id,'wanx-builder');
  assert.doesNotMatch(JSON.stringify(state),/test-token|test-password|access_token/);
  await f.service.action('connection.select',{address:'http://192.168.1.3:8088'});
  assert.throws(()=>f.service.requireCurrent(state.sessionId),/SESSION_CLOSED/);
  assert.ok(!f.calls.some(c=>c.url.includes('192.168.1.3')&&c.token));
  assert.doesNotMatch(await readFile(join(dir,'selected-service.json'),'utf8'),/test-password|test-token/);
  await f.service.close();const next=fixture({dataDirectory:dir});const restored=await next.service.action('state');assert.equal(restored.selected.endpoint,'http://192.168.1.3:8088');assert.equal(restored.phase,'disconnected');await next.service.close();
 }finally{await f.service.close();await rm(dir,{recursive:true,force:true});}
});
test('late login cannot revive a disconnected session; revocation drops application permissions',async()=>{
 let release,started;const wait=new Promise(r=>release=r),begun=new Promise(r=>started=r);
 const f=fixture({fetcher:async()=>{started();await wait;return Response.json({access_token:'test-token'});}});
 await f.service.action('connection.select',{address:'http://192.168.1.2:8088'});
 const login=f.service.action('connection.login',{username:'synthetic',password:'test-password'});await begun;await f.service.disconnect();release();await assert.rejects(login,/SESSION_CLOSED/);assert.equal(f.service.snapshot().user,null);await f.service.close();
 const g=fixture();await g.service.action('connection.select',{address:'http://192.168.1.2:8088'});const state=await g.service.action('connection.login',{username:'synthetic',password:'test-password'});g.revoke();await g.service.refresh();assert.throws(()=>g.service.requireCurrent(state.sessionId),/SESSION_CLOSED/);assert.equal(g.service.snapshot().user,null);await g.service.close();
});

test('native login error envelopes preserve safe codes without exposing the server message', async () => {
 for (const code of ['AUTH_FAILED', 'FORBIDDEN']) {
  const f = fixture({fetcher: async () => Response.json({error: {code, message: 'private server detail'}}, {status: 403})});
  try {
   await f.service.action('connection.select', {address: 'http://192.168.1.2:8088'});
   await assert.rejects(f.service.action('connection.login', {username: 'synthetic', password: 'test-password'}), {message: code});
   assert.equal(f.service.snapshot().reason, code);
   assert.equal(f.service.snapshot().user, null);
  } finally { await f.service.close(); }
 }
});

test('transient network failures retain the session and recover without another password', async () => {
 const f=fixture();
 try {
  await f.service.action('connection.select',{address:'http://192.168.1.2:8088'});
  const session=await f.service.action('connection.login',{username:'synthetic',password:'test-password'});
  const operation=operationRegistry.find(op=>op.path==='/api/auth/me'&&op.method==='GET');
  f.offline(true);
  await assert.rejects(f.service.stream(session.sessionId,operation.operationId,{}),/CONNECTION_LOST/);
  assert.equal(f.service.snapshot().phase,'reconnecting');
  assert.equal(f.service.snapshot().sessionId,session.sessionId);
  assert.deepEqual(f.service.snapshot().user,user);
  assert.throws(()=>f.service.requireCurrent(session.sessionId),/CONNECTION_LOST/);
  await f.service.refresh();
  assert.equal(f.service.snapshot().sessionId,session.sessionId);
  f.offline(false);
  await f.service.action('connection.retry');
  assert.equal(f.service.snapshot().phase,'ready');
  assert.equal(f.service.snapshot().reason,null);
  assert.equal(f.service.snapshot().sessionId,session.sessionId);
  assert.ok(f.service.requireCurrent(session.sessionId));
  assert.equal(f.calls.filter(c=>c.body).length,1);
 } finally {await f.service.close();}
});

test('service failures do not discard auth but revoked access still clears it', async () => {
 const f=fixture();
 try {
  await f.service.action('connection.select',{address:'http://192.168.1.2:8088'});
  const session=await f.service.action('connection.login',{username:'synthetic',password:'test-password'});
  f.status(503);await f.service.refresh();
  assert.equal(f.service.snapshot().phase,'reconnecting');
  assert.equal(f.service.snapshot().sessionId,session.sessionId);
  f.status(403);await f.service.refresh();
  assert.equal(f.service.snapshot().phase,'disconnected');
  assert.equal(f.service.snapshot().reason,'WANX_AUTH_REVOKED');
  assert.equal(f.service.snapshot().user,null);
  assert.throws(()=>f.service.requireCurrent(session.sessionId),/SESSION_CLOSED/);
 } finally {await f.service.close();}
});
