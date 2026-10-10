import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {user,releaseSubscriptions,releaseNotifications} from '../src/db/schema.js';

// Explicit synthetic data only, confined to two disposable accounts created here.
// This exercises populated inbox authorization/acknowledgements, not phone delivery.
const base='https://nex-three-omega.vercel.app';
const accounts:Array<{id:string;token:string;password:string}>=[];
const db=getDatabase();let stage='signup';
async function request(path:string,token:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});}
try{
  for(let i=0;i<2;i++){
    const email=`nex-inbox-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
    const response=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Nex-Invite':process.env.NEX_INVITE_CODE??''},body:JSON.stringify({email,password,name:'Disposable inbox QA'}),signal:AbortSignal.timeout(60000)});
    assert.equal(response.status,200);const body=await response.json() as {user:{id:string}};const token=response.headers.get('set-auth-token');assert.ok(token);
    accounts.push({id:body.user.id,token,password});
    assert.equal((await db.select().from(user).where(eq(user.email,email)))[0]?.id,body.user.id);
  }
  const [owner,other]=accounts;assert.ok(owner&&other);
  stage='synthetic inbox row';const subscriptionId=randomUUID(),id=randomUUID();
  await db.insert(releaseSubscriptions).values({id:subscriptionId,userId:owner.id,mediaType:'movie',tmdbId:1003596,kind:'cinema',country:'RO',enabled:false});
  await db.insert(releaseNotifications).values({id,userId:owner.id,subscriptionId,eventKey:'synthetic-verification',country:'RO',mediaType:'movie',tmdbId:1003596,title:'Synthetic inbox verification',body:'Test data, not a real release announcement.',releaseDate:'2026-10-10'});
  async function inbox(token:string,pending=false){const r=await request(`/api/me/notifications?pending=${pending}`,token);assert.equal(r.status,200);return (await r.json() as {data:{items:Array<{id:string;readAt:string|null;popupAt:string|null}>}}).data.items;}
  stage='ownership';assert.equal((await inbox(owner.token))[0]?.id,id);assert.equal((await inbox(other.token)).length,0);
  assert.equal((await request('/api/me/notifications/ack',other.token,'POST',{ids:[id],kind:'read'})).status,204);
  assert.equal((await inbox(owner.token))[0]?.readAt,null);
  stage='popup acknowledgement';assert.equal((await request('/api/me/notifications/ack',owner.token,'POST',{ids:[id],kind:'popup'})).status,204);
  assert.equal((await inbox(owner.token,true)).length,0);assert.equal((await inbox(owner.token))[0]?.readAt,null);
  stage='read acknowledgement';assert.equal((await request('/api/me/notifications/ack',owner.token,'POST',{ids:[id],kind:'read'})).status,204);assert.ok((await inbox(owner.token))[0]?.readAt);
  stage='country isolation';assert.equal((await request('/api/me/settings',owner.token,'PUT',{country:'GB'})).status,200);assert.equal((await inbox(owner.token)).length,0);
  console.log(JSON.stringify({populatedInboxVerified:true,ownerIsolation:true,readAndPopupSeparate:true,countryIsolation:true,syntheticDataOnly:true}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{
  let deleted=0;
  for(const a of accounts){const response=await request('/api/auth/delete-user',a.token,'POST',{password:a.password}).catch(()=>null);if(response?.status===200)deleted++;else process.exitCode=1;}
  if(accounts.length){const remaining=await db.select({id:releaseNotifications.id}).from(releaseNotifications).where(inArray(releaseNotifications.userId,accounts.map(a=>a.id)));if(remaining.length)process.exitCode=1;console.log(JSON.stringify({testAccountsDeleted:deleted,createdAccounts:accounts.length,syntheticInboxRowsRemaining:remaining.length}));}
  await closeDatabase();
}
