import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {UserRepository} from '../src/repositories/user-repository.js';
import {closeDatabase} from '../src/db/client.js';
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();let token:string|null=null;
const request=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
try{
 const signup=await request('/api/auth/sign-up/email',{name:'Parallel read QA',email:`nex-parallel-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 const {user}=await signup.json() as {user:{id:string}};assert.ok(user.id);
 const users=new UserRepository(),session=await users.createConversation(user.id);
 const jobs=[()=>users.getRecommendationState(user.id),()=>users.getSessionContext(user.id,session),()=>users.recentDisplayedItems(user.id,session),()=>users.sessionRecommendationKeys(user.id,session)];
 const samples:Array<{variant:string;ms:number}>=[];
 for(let round=0;round<4;round++)for(const variant of round%2?['parallel','sequential']:['sequential','parallel']){
   const start=performance.now();let results:unknown[];
   if(variant==='parallel')results=await Promise.all(jobs.map(f=>f()));else{results=[];for(const job of jobs)results.push(await job());}
   assert.equal(results.length,4);const sample={variant,ms:Math.round(performance.now()-start)};samples.push(sample);console.log(JSON.stringify(sample));
 }
 for(const variant of ['sequential','parallel']){const sorted=samples.filter(s=>s.variant===variant).map(s=>s.ms).sort((a,b)=>a-b);console.log(JSON.stringify({variant,medianMs:(sorted[1]!+sorted[2]!)/2}));}
}catch{console.log(JSON.stringify({failed:true,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const response=await request('/api/auth/delete-user',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:response?.status===200}));if(response?.status!==200)process.exitCode=1;}await closeDatabase();}
