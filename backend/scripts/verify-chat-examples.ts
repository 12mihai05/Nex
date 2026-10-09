import '../src/env.js';
import {randomUUID} from 'node:crypto';
import {getConfig} from '../src/config.js';
import type {TasteSignal} from '../src/domain/types.js';

// Synthetic account only. Never print response bodies, credentials or auth headers.
const base=getConfig().BETTER_AUTH_URL;
const email=`nex-examples-qa-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
let token:string|null=null;
async function call(path:string,body?:unknown){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':getConfig().NEX_INVITE_CODE})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120_000)});}
try{
 const signup=await call('/api/auth/sign-up/email',{name:'Synthetic examples QA',email,password});
 if(!signup.ok)throw Error('SIGNUP_FAILED');token=signup.headers.get('set-auth-token');if(!token)throw Error('TOKEN_MISSING');
 const response=await call('/api/chat',{message:'I love movies like Arrival (2016) directed by Denis Villeneuve and Contact (1997), but I disliked Prometheus (2012) directed by Ridley Scott.'});
 if(!response.ok)throw Error('CHAT_FAILED');
 const read=await call('/api/me/taste');if(!read.ok)throw Error('TASTE_READ_FAILED');
 const {data}=await read.json() as {data:TasteSignal[]};
 const examples=data.filter(s=>s.example);
 const expected=new Map([[329865,1],[686,1],[70981,-1]]);
 if(examples.length!==3||examples.some(s=>Math.sign(s.score)!==expected.get(s.example!.tmdbId)||!s.meaning))throw Error('EXAMPLE_PERSISTENCE_FAILED');
 if(data.some(s=>['actor','director','genre','country'].includes(s.dimension)))throw Error('UNSTATED_TRAIT_SAVED');
 for(const path of ['/api/me/history','/api/me/feedback','/api/me/watchlist']){
  const r=await call(path);if(!r.ok||(await r.json() as {data:unknown[]}).data.length)throw Error('UNREQUESTED_LIBRARY_CHANGE');
 }
 console.log(JSON.stringify({verifiedExampleIds:examples.map(s=>s.example!.tmdbId),mixedSentiment:true,groundedMeaningsPersisted:true}));
 const correction=await call('/api/chat',{message:'I told you to exclude animes from my taste but to not exclude also animations or cartoons'});
 if(!correction.ok)throw Error('CORRECTION_FAILED');
 const after=await call('/api/me/taste');const updated=(await after.json() as {data:TasteSignal[]}).data;
 if(!updated.some(s=>s.dimension==='keyword'&&s.key==='anime'&&s.score<0)||updated.some(s=>s.score<0&&['genre','country','language'].includes(s.dimension)))throw Error('CORRECTION_SCOPE_FAILED');
 console.log(JSON.stringify({animeCorrectionPersisted:true,noBroadAnimationOrCountryDislike:true}));
}catch(error){
 const allowed=['SIGNUP_FAILED','TOKEN_MISSING','CHAT_FAILED','TASTE_READ_FAILED','EXAMPLE_PERSISTENCE_FAILED','UNSTATED_TRAIT_SAVED','UNREQUESTED_LIBRARY_CHANGE','CORRECTION_FAILED','CORRECTION_SCOPE_FAILED'];
 console.log(JSON.stringify({verificationFailed:error instanceof Error&&allowed.includes(error.message)?error.message:'REQUEST_FAILED'}));process.exitCode=1;
}finally{
 if(token){const result=await call('/api/auth/delete-user',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:result?.status===200}));if(result?.status!==200)process.exitCode=1;}
}
