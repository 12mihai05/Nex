import '../src/env.js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Real HTTP user journey; credentials and response bodies are never logged.
const base='https://nex-three-omega.vercel.app';
const password=randomUUID()+randomUUID();
let token:string|null=null, stage='signup';
const probe=process.argv.includes('--probe');
async function request(path:string,method='GET',body?:unknown) {
  return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',
    ...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
}
try {
  const signup=await request('/api/auth/sign-up/email','POST',{name:'Filter QA',email:`nex-viewing-${randomUUID()}@example.test`,password});
  assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
  stage='settings';assert.equal((await request('/api/me/settings','PUT',{country:'RO',services:[{providerId:8,providerName:'Netflix'},{providerId:119,providerName:'Prime Video'}]})).status,200);
  if(probe){
    for(const query of ['watchStatus=new','watchStatus=again','watchStatus=either','providerIds=8']){
      const response=await request(`/api/discovery?batch=0&${query}`);
      console.log(JSON.stringify({query,status:response.status}));
    }
  } else {
    type Item={id:number;mediaType:'movie'|'series';title:string;availability:Array<{providerId:number;access:string}>};
    type Rows={data:Array<{items:Array<{item:Item}>}>};
    let seed:Item|undefined;
    for(const mode of ['new','again','either']){
      stage=`home-${mode}`;
      const response=await request(`/api/discovery?batch=0&mediaType=movie&watchStatus=${mode}&providerIds=8`);
      assert.equal(response.status,200);
      const rows=await response.json() as Rows;
      const items=rows.data.flatMap(r=>r.items.map(i=>i.item));
      assert.ok(items.every(i=>i.availability.some(a=>a.providerId===8&&a.access==='included')));
      if(mode==='new'){assert.ok(items.length);seed=items[0];}
      if(mode==='again')assert.equal(items.length,0);
      console.log(JSON.stringify({stage,status:200,titles:items.length,selectedServiceOnly:true}));
    }
    assert.ok(seed);
    const action={tmdbId:seed.id,mediaType:seed.mediaType,title:seed.title};
    stage='seen-like';assert.equal((await request('/api/me/history','POST',action)).status,201);
    assert.equal((await request('/api/me/feedback','PUT',{...action,reaction:'like'})).status,200);
    for(const mode of ['new','again','either']){
      stage=`history-${mode}`;
      const response=await request(`/api/discovery?batch=0&watchStatus=${mode}&providerIds=8`);
      assert.equal(response.status,200);
      const items=(await response.json() as Rows).data.flatMap(r=>r.items.map(i=>i.item));
      const hasSeed=items.some(i=>i.id===seed!.id&&i.mediaType===seed!.mediaType);
      if(mode==='new')assert.equal(hasSeed,false);
      if(mode==='again'){assert.ok(hasSeed);assert.ok(items.every(i=>i.id===seed!.id&&i.mediaType===seed!.mediaType));}
      console.log(JSON.stringify({stage,status:200,containsSeenSeed:hasSeed,titles:items.length}));
    }
    for(const mode of ['new','again','either']){
      stage=`pick-${mode}`;
      const response=await request('/api/surprise','POST',{mediaType:'movie',providerIds:[8],watchStatus:mode});
      assert.equal(response.status,200);
      const item=(await response.json() as {data:{item:Item}}).data.item;
      assert.ok(item.availability.some(a=>a.providerId===8&&a.access==='included'));
      if(mode==='again')assert.equal(item.id,seed.id);
      if(mode==='new')assert.notEqual(item.id,seed.id);
      console.log(JSON.stringify({stage,status:200,selectedServiceOnly:true}));
    }
    stage='empty-provider-validation';assert.equal((await request('/api/surprise','POST',{providerIds:[]})).status,400);
    console.log(JSON.stringify({stage,passed:true}));
  }
} catch {console.log(JSON.stringify({stage,passed:false,details:'Sensitive response details suppressed'}));process.exitCode=1;}
finally {
  if(token){try{const r=await request('/api/auth/delete-user','POST',{password});assert.equal(r.status,200);
    assert.equal((await request('/api/me/settings')).status,401);console.log(JSON.stringify({testAccountDeleted:true,sessionRevoked:true}));
  }catch{console.log(JSON.stringify({cleanupFailed:true}));process.exitCode=1;}}
}
