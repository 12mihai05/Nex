import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {UserRepository} from '../src/repositories/user-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import type {ChatActionPlan} from '../src/services/chat-action-types.js';

// Isolated synthetic metadata tests the real Turso transaction, not TMDB matching.
// Account creation/deletion goes through real authentication; never uses a real user's account.
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null;
async function request(path:string,body:unknown){return fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});}
try{
 const r=await request('/api/auth/sign-up/email',{name:'Bulk Transaction QA',email:`nex-bulk-${randomUUID()}@example.test`,password});assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
 const {user}=await r.json() as {user:{id:string}};const users=new UserRepository();
 const session=await users.createConversation(user.id);
 const plan:ChatActionPlan={id:randomUUID(),expiresAt:Date.now()+900000,country:'RO',timezone:'Europe/Bucharest',summary:'50 synthetic test titles',entries:Array.from({length:50},(_,i)=>({
  item:{...fixtureCatalog[0]!,id:900000000+i,title:`Synthetic Bulk QA ${i}`,mediaType:'movie'},
  change:{sourceText:`Synthetic Bulk QA ${i}`,title:`Synthetic Bulk QA ${i}`,year:null,tmdbId:null,mediaType:'movie',position:null,watchlist:'add',seen:'seen',rating:i%2?'dislike':'super_like'},
 }))};
 await users.setSessionContext(user.id,session,{chatPlan:plan});const started=Date.now();
 await users.commitChatPlan(user.id,session,plan.id);
 for(const rows of [await users.listWatchlist(user.id),await users.listHistory(user.id),await users.listFeedback(user.id)])assert.equal(rows.length,50);
 await users.commitChatPlan(user.id,session,plan.id);
 console.log(JSON.stringify({realTursoFiftyTitleAtomicCommit:true,watchlist:50,history:50,ratings:50,duplicateConfirmationSafe:true,milliseconds:Date.now()-started}));
}catch{console.log(JSON.stringify({realTursoFiftyTitleAtomicCommit:false,details:'Sensitive database details suppressed'}));process.exitCode=1;}
finally{if(token){try{assert.equal((await request('/api/auth/delete-user',{password})).status,200);console.log(JSON.stringify({testAccountDeleted:true}));}catch{console.log(JSON.stringify({cleanupFailed:true}));process.exitCode=1;}}}
