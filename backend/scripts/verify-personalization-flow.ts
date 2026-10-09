import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { getConfig, resetConfigForTests } from '../src/config.js';
import { getDatabase, closeDatabase } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';

// Real integrations, isolated database. Never edit an existing person's account.
process.env.TURSO_DATABASE_URL='file:./personalization-journey.db';
process.env.NODE_ENV='test';
resetConfigForTests();
const report:{steps:Array<{step:string;status:number;ms:number}>;checks:string[];complete:boolean;failure?:string}={steps:[],checks:[],complete:false};
let token:string|null=null,userId:string|undefined,step='migration';
const password=randomUUID()+randomUUID(),base=getConfig().BETTER_AUTH_URL;
let request:(path:string,method?:string,body?:unknown)=>Promise<Response>;
try {
  await migrate(getDatabase(),{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
  const {default:app}=await import('../src/app.js');
  request=async(path,method='GET',body)=>{
    const start=performance.now();
    const r=await app.request(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':getConfig().NEX_INVITE_CODE})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    report.steps.push({step:path.split('?')[0]!,status:r.status,ms:Math.round(performance.now()-start)});
    console.log(JSON.stringify(report.steps.at(-1)));return r;
  };
  step='signup';const signup=await request('/api/auth/sign-up/email','POST',{name:'Synthetic personalization QA',email:`nex-semantic-${randomUUID()}@example.test`,password});
  assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);userId=(await signup.json()).user.id;assert.ok(userId);
  step='engine setting';assert.equal((await request('/api/me/settings','PUT',{country:'RO',recommendationEngine:'semantic'})).status,200);
  const settings=await (await request('/api/me/settings')).json();assert.equal(settings.data.profile.recommendationEngine,'semantic');
  step='chat story extraction';const chat=await request('/api/chat','POST',{message:'I love stories about ordinary people solving difficult practical problems together through ingenuity. I dislike graphic torture.'});assert.equal(chat.status,200);
  assert.ok((await chat.json()).data.blocks.some((b:{type:string})=>b.type==='confirmation'));
  const taste=(await (await request('/api/me/taste')).json()).data as Array<{dimension:string;key:string;meaning?:string;statement?:string;score:number}>;
  assert.ok(taste.some(t=>t.score>0&&t.meaning&&t.statement));assert.ok(taste.some(t=>t.score<0));report.checks.push('Chat → grounded preference → persisted Taste');
  step='home';const home=await request('/api/discovery','POST',{batch:0});assert.equal(home.status,200);
  const rows=(await home.json()).data;assert.ok(rows.length>0);
  assert.ok(rows.some((row:any)=>row.items.some((r:any)=>r.evidence.some((e:any)=>e.code==='semantic:interest'))));report.checks.push('Home response includes applied semantic evidence');
  step='mixed library';const chosen=rows[0].items[0].item,second=rows[0].items[1].item;
  const title=(item:any)=>({tmdbId:item.id,mediaType:item.mediaType,title:item.title});
  assert.equal((await request('/api/me/history','POST',title(chosen))).status,201);
  assert.equal((await request('/api/me/watchlist','POST',title(second))).status,201);
  assert.equal((await request('/api/me/feedback','PUT',{tmdbId:second.id,mediaType:second.mediaType,reaction:'super_like'})).status,200);
  const history=(await (await request('/api/me/history')).json()).data;
  assert.ok(!history.some((h:any)=>h.tmdbId===second.id&&h.mediaType===second.mediaType));report.checks.push('Seen, Want to see and Super Like remain independent');
  step='pick';const pick=await request('/api/surprise','POST',{mediaType:'movie',watchStatus:'new'});assert.equal(pick.status,200);
  const selection=(await pick.json()).data;assert.ok(selection.item.id!==chosen.id||selection.item.mediaType!==chosen.mediaType);assert.ok(selection.evidence.some((e:any)=>e.code.startsWith('semantic:')));report.checks.push('Pick applies semantic ranking and Seen exclusion');
  step='correction';const preference=taste.find(t=>t.score>0)!;
  assert.equal((await request('/api/me/taste','PUT',{signals:[{dimension:preference.dimension,key:preference.key,score:-1,confidence:1,evidenceCount:1,source:'explicit_edit'}]})).status,200);
  const changed=(await (await request('/api/me/taste')).json()).data.find((t:any)=>t.key===preference.key&&t.dimension===preference.dimension);assert.equal(changed.score,-1);assert.equal(changed.meaning,preference.meaning);
  step='forget';assert.equal((await request('/api/me/taste/entry?'+new URLSearchParams({dimension:preference.dimension,key:preference.key}),'DELETE')).status,204);
  assert.ok(!(await (await request('/api/me/taste')).json()).data.some((t:any)=>t.key===preference.key&&t.dimension===preference.dimension));report.checks.push('Edit/forget retains meaning or removes signal correctly');
  report.complete=true;
} catch {report.failure=step;process.exitCode=1;console.error('Verification failed at '+step+'; provider details withheld.');}
finally {
  if(token&&request!){const deletion=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);if(deletion?.status!==200){report.complete=false;report.failure='cleanup';process.exitCode=1;}}
  if(userId){const privateRows=await getDatabase().select().from(schema.userRecommendationCache).where(eq(schema.userRecommendationCache.userId,userId));if(privateRows.length){report.complete=false;report.failure='private cache cascade';process.exitCode=1;}else report.checks.push('Account deletion cascades new private caches');}
  await mkdir(new URL('../../docs/evaluations/',import.meta.url),{recursive:true});await writeFile(new URL('../../docs/evaluations/personalization-flow.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:report.complete,checks:report.checks,failure:report.failure}));await closeDatabase();
}
