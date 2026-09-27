import "../src/env.js";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase, closeDatabase } from "../src/db/client.js";
import { user } from "../src/db/schema.js";
import { getConfig } from "../src/config.js";
import type { ContentItem, RankedContent, TasteSignal } from "../src/domain/types.js";

// All users and credentials are synthetic, kept in memory, and removed in finally.
// Only allowlisted public catalog fields, timings and assertion names are logged.
process.env.BETTER_AUTH_URL = "http://localhost:8789";
process.env.ALLOWED_ORIGINS = "http://localhost:8789";
const { default: app } = await import("../src/app.js");
const db = getDatabase();
const accounts: Array<{id:string; token:string; password:string}> = [];
let passed=0, failed=0;
function check(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
async function run(name:string, fn:()=>Promise<void>) {
  const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7);
  if(only && !name.includes(only)) return;
  const start=Date.now();
  try { await fn(); passed++; console.log(JSON.stringify({case:name,status:"pass",ms:Date.now()-start})); }
  catch(error) { failed++; const code=error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:"UNEXPECTED_FAILURE"; console.log(JSON.stringify({case:name,status:"fail",code,ms:Date.now()-start})); }
}
async function request(path:string, method="GET", body?:unknown, index=0) {
  return app.request(`http://localhost:8789/api${path}`,{method,headers:{"content-type":"application/json",...(accounts[index]?{authorization:`Bearer ${accounts[index]!.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function data<T>(path:string,method="GET",body?:unknown,index=0):Promise<T> {
  const response=await request(path,method,body,index);
  check(response.ok,`HTTP_${response.status}`);
  return ((await response.json()) as {data:T}).data;
}
const key=(i:ContentItem)=>`${i.mediaType}:${i.id}`;
const sample=(items:ContentItem[])=>items.slice(0,5).map(i=>({title:i.title,type:i.mediaType,genres:i.genres,runtime:i.runtimeMinutes,providers:i.availability.filter(a=>a.access==="included").map(a=>a.providerName)}));
type Chat={sessionId:string;blocks:Array<{type:string;content?:string;items?:ContentItem[];action?:{type:string;id:string}}>};
const cards=(chat:Chat)=>chat.blocks.flatMap(b=>b.type==="movie_carousel"?b.items??[]:[]);
let picks:RankedContent[]=[], sessionId="", reminderId="";
type Program={id:string;title:string;startAt:string;endAt:string};
let future:Program|undefined;
try {
  for(let i=0;i<2;i++) {
    const password=randomUUID()+randomUUID();
    const response=await request("/auth/sign-up/email","POST",{name:"Synthetic journey",email:`nex-verify-${randomUUID()}@example.test`,password,inviteCode:getConfig().NEX_INVITE_CODE},-1);
    check(response.ok,"SIGNUP_FAILED"); const value=await response.json() as {user:{id:string}};
    accounts.push({id:value.user.id,token:response.headers.get("set-auth-token")!,password});
  }
  await run("auth_all_private_routes",async()=>{
    for(const path of ["/me/settings","/me/taste","/me/watchlist","/me/history","/me/reminders","/providers","/tv/live","/tv/upcoming","/search?q=Arrival","/title/movie/329865"])
      check((await request(path,"GET",undefined,-1)).status===401,"ANONYMOUS_READ_ALLOWED");
    check((await request("/recommend","POST",{viewerIds:[accounts[1]!.id]})).status===403,"OTHER_VIEWER_ALLOWED");
  });
  await run("settings_country_services_languages",async()=>{
    await data("/me/settings","PUT",{country:"RO",timezone:"Europe/Bucharest",services:[{providerId:8,providerName:"Netflix"},{providerId:1899,providerName:"Max"}],audioLanguages:["en"],subtitleLanguages:["ro"],remindersEnabled:true});
    await data("/me/settings","PUT",{appearance:"light",subtitleLanguages:["en"]});
    const settings=await data<{languages:Array<{kind:string;languageCode:string}>}>("/me/settings");
    check(settings.languages.some(l=>l.kind==="audio"&&l.languageCode==="en"),"PARTIAL_SETTINGS_ERASED_AUDIO");
    check((await data<unknown[]>("/providers")).length>0,"NO_PROVIDERS");
  });
  await run("onboarding_and_cold_start",async()=>{
    const analysis=await data<{signals:TasteSignal[]}>("/onboarding/analyze","POST",{description:"I enjoy thoughtful science fiction and mysteries. I like Arrival and dislike musicals and gore.",favorites:[{id:329865,mediaType:"movie",title:"Arrival"}],genres:["Science Fiction","Mystery"],moods:[]});
    console.log(JSON.stringify({observation:"onboarding",signals:analysis.signals.map(s=>({dimension:s.dimension,key:s.key,score:s.score}))}));
    picks=await data<RankedContent[]>("/recommend","POST",{filter:{mediaType:"movie"}});
    console.log(JSON.stringify({observation:"cold_start",items:sample(picks.map(p=>p.item)),reasons:picks.slice(0,3).map(p=>p.reason)}));
    check(picks.length>=3,"TOO_FEW_COLD_START_PICKS");
    check(picks.every(p=>p.item.availability.some(a=>a.access==="included"&&[8,1899].includes(a.providerId))),"UNOWNED_DISCOVERY");
    check(picks.slice(0,5).some(p=>p.item.genres.some(g=>/science fiction|mystery/i.test(g))),"NO_TASTE_MATCH_IN_TOP_FIVE");
    check(analysis.signals.some(s=>s.score<0),"ONBOARDING_NEGATIVES_MISSING");
  });
  await run("search_exact_and_availability",async()=>{
    for(const q of ["Arrival","Where can I watch Arrival?"]) {
      const results=await data<ContentItem[]>(`/search?q=${encodeURIComponent(q)}`);
      check(results.some(i=>i.id===329865&&i.mediaType==="movie"),"EXACT_LOOKUP_MISSING_ARRIVAL");
      check(results.filter(i=>i.id===329865).every(i=>i.availability.every(a=>a.owned===[8,1899].includes(a.providerId))),"SEARCH_OWNERSHIP_INCORRECT");
    }
  });
  await run("constrained_recommendations",async()=>{
    const result=await data<RankedContent[]>("/recommend","POST",{filter:{mediaType:"movie",genres:["Comedy"],maxRuntimeMinutes:100}});
    console.log(JSON.stringify({observation:"short_comedy",items:sample(result.map(r=>r.item))}));
    check(result.length>0,"EMPTY_FEASIBLE_COMEDY");
    check(result.every(r=>r.item.mediaType==="movie"&&r.item.genres.includes("Comedy")&&r.item.runtimeMinutes!==null&&r.item.runtimeMinutes<=100),"HARD_CONSTRAINT_VIOLATION");
    const impossible=await data<RankedContent[]>("/recommend","POST",{filter:{maxRuntimeMinutes:1,minRuntimeMinutes:500}});
    check(impossible.length===0,"IMPOSSIBLE_FILTER_RELAXED");
  });
  await run("watchlist_history_feedback_and_isolation",async()=>{
    const item=picks[0]?.item; check(item,"NO_PICK");
    const body={tmdbId:item.id,mediaType:item.mediaType,title:item.title};
    await data("/me/watchlist","POST",body); await data("/me/watchlist","POST",body);
    check((await data<unknown[]>("/me/watchlist")).length===1,"WATCHLIST_NOT_IDEMPOTENT");
    check((await data<unknown[]>("/me/watchlist","GET",undefined,1)).length===0,"WATCHLIST_LEAK");
    await request(`/me/watchlist/${item.mediaType}/${item.id}`,"DELETE",undefined,1);
    check((await data<unknown[]>("/me/watchlist")).length===1,"CROSS_USER_DELETE");
    await data("/me/feedback","PUT",{...body,reaction:"dislike"});
    await data("/me/history","POST",body);
    const next=await data<RankedContent[]>("/recommend","POST",{filter:{mediaType:"movie"}});
    check(next.every(r=>key(r.item)!==key(item)),"WATCHED_DISLIKED_RETURNED");
    check((await data<unknown[]>("/me/history","GET",undefined,1)).length===0,"HISTORY_LEAK");
    check((await data<unknown[]>("/me/taste","GET",undefined,1)).length===0,"TASTE_LEAK");
  });
  await run("surprise_rejection",async()=>{
    const first=await data<RankedContent>("/surprise","POST",{maxRuntimeMinutes:120});
    check((first.item.runtimeMinutes??999)<=120,"SURPRISE_RUNTIME");
    check((await request("/me/rejections","POST",{tmdbId:first.item.id,mediaType:first.item.mediaType})).status===204,"REJECT_FAILED");
    const second=await data<RankedContent>("/surprise","POST",{maxRuntimeMinutes:120});
    check(key(first.item)!==key(second.item),"SURPRISE_REPEATED");
  });
  await run("chat_context_and_temporary_taste",async()=>{
    const before=(await data<TasteSignal[]>("/me/taste")).map(s=>[s.dimension,s.key,Number(s.score.toFixed(4)),s.evidenceCount,s.source]);
    const first=await data<Chat>("/chat","POST",{message:"Tonight recommend comedy movies on Netflix under 100 minutes."}); sessionId=first.sessionId;
    console.log(JSON.stringify({observation:"first_chat",blocks:first.blocks.map(b=>({type:b.type,content:b.content,count:b.items?.length}))}));
    check(cards(first).length>0,"CHAT_NO_COMEDY");
    const next=await data<Chat>("/chat","POST",{sessionId,message:"Other options please, but under 90 minutes instead."});
    const items=cards(next); console.log(JSON.stringify({observation:"chat_followup",items:sample(items)}));
    check(items.length>0,"FOLLOWUP_EMPTY");
    check(items.every(i=>i.mediaType==="movie"&&i.genres.includes("Comedy")&&(i.runtimeMinutes??999)<=90&&i.availability.some(a=>a.providerId===8&&a.access==="included")),"FOLLOWUP_LOST_CONSTRAINTS");
    const after=(await data<TasteSignal[]>("/me/taste")).map(s=>[s.dimension,s.key,Number(s.score.toFixed(4)),s.evidenceCount,s.source]);
    check(JSON.stringify(before)===JSON.stringify(after),"TEMPORARY_CHANGED_TASTE");
    check((await request("/chat","POST",{sessionId,message:"Show the same titles"},1)).status===404,"CONVERSATION_LEAK");
  });
  await run("chat_add_remove_reference",async()=>{
    const lookup=await data<Chat>("/chat","POST",{message:"Where can I watch Arrival?"});
    const target=cards(lookup)[0]; check(target?.id===329865,"CHAT_LOOKUP_WRONG");
    await data("/chat","POST",{sessionId:lookup.sessionId,message:"Add the first one to my watchlist."});
    check((await data<Array<{tmdbId:number}>>("/me/watchlist")).some(i=>i.tmdbId===329865),"CHAT_ADD_FAILED");
    await data("/chat","POST",{sessionId:lookup.sessionId,message:"Remove the first one from my watchlist."});
    check(!(await data<Array<{tmdbId:number}>>("/me/watchlist")).some(i=>i.tmdbId===329865),"CHAT_REMOVE_FAILED");
  });
  await run("tv_country_and_reminder_lifecycle",async()=>{
    const programs=await data<Program[]>("/tv/upcoming?hours=48");
    future=programs.find(p=>Date.parse(p.startAt)>Date.now()+15*60_000); check(future,"NO_FUTURE_EPG");
    const reminder=await data<{id:string;notifyAt:string}>("/me/reminders","POST",{epgProgramId:future.id,offsetMinutes:10}); reminderId=reminder.id;
    check(Date.parse(reminder.notifyAt)===Date.parse(future.startAt)-600000,"REMINDER_TIME_WRONG");
    const edited=await data<{id:string}>("/me/reminders","POST",{epgProgramId:future.id,offsetMinutes:5});
    check(edited.id===reminderId,"REMINDER_DUPLICATED");
    check((await data<unknown[]>("/me/reminders","GET",undefined,1)).length===0,"REMINDER_LEAK");
    check((await request(`/me/reminders/${reminderId}`,"DELETE",undefined,1)).status===404,"REMINDER_CROSS_DELETE");
    check((await data<unknown[]>("/me/reminders")).length===1,"REMINDER_REMOVED_BY_OTHER");
    await data("/me/settings","PUT",{country:"BG"});
    const bg=await data<Program[]>("/tv/upcoming"); check(bg.length>0&&bg.every(p=>p.id.startsWith("iptv-org:BG:")),"COUNTRY_EPG_WRONG");
    await data("/me/settings","PUT",{country:"RO"});
    check((await request(`/me/reminders/${reminderId}`,"DELETE")).status===204,"REMINDER_CANCEL_FAILED");
    check((await data<unknown[]>("/me/reminders")).length===0,"REMINDER_CANCEL_NOT_PERSISTED");
  });
  await run("reminder_validation_and_disabled",async()=>{
    check(future,"NO_FUTURE_EPG");
    check((await request("/me/reminders","POST",{epgProgramId:future.id,offsetMinutes:-1})).status===400,"NEGATIVE_OFFSET_ACCEPTED");
    await data("/me/settings","PUT",{remindersEnabled:false});
    check((await request("/me/reminders","POST",{epgProgramId:future.id,offsetMinutes:0})).status===409,"DISABLED_REMINDER_WRONG_STATUS");
    await data("/me/settings","PUT",{remindersEnabled:true});
    check((await request("/me/reminders","POST",{epgProgramId:"not-a-program",offsetMinutes:0})).status===404,"MISSING_PROGRAM_WRONG_STATUS");
    const live=await data<Program[]>("/tv/live");
    if(live[0]) check((await request("/me/reminders","POST",{epgProgramId:live[0].id,offsetMinutes:0})).status===409,"PAST_REMINDER_WRONG_STATUS");
  });
  await run("chat_tv_tomorrow_and_reminder_actions",async()=>{
    const response=await data<Chat>("/chat","POST",{message:"Show the TV schedule for tomorrow."});
    const programs=response.blocks.flatMap(b=>b.type==="tv_carousel"?(b.items as unknown as Program[])??[]:[]);
    check(programs.length>0,"TV_TOMORROW_EMPTY");
    check(programs.every(p=>Date.parse(p.startAt)>Date.now()),"TV_TOMORROW_RETURNED_PAST");
    const created=await data<Chat>("/chat","POST",{sessionId:response.sessionId,message:"Remind me about the first one 5 minutes before."});
    check(created.blocks.some(b=>b.action?.type==="setReminder"),"CHAT_REMINDER_ACTION_MISSING");
    const cancelled=await data<Chat>("/chat","POST",{sessionId:response.sessionId,message:"Cancel the reminder for the first one."});
    check(cancelled.blocks.some(b=>b.action?.type==="cancelReminder"),"CHAT_CANCEL_ACTION_MISSING");
    check((await data<unknown[]>("/me/reminders")).length===0,"CHAT_CANCEL_DID_NOT_PERSIST");
  });
  await run("invalid_input_and_private_sync",async()=>{
    check((await request("/tv/upcoming?hours=abc")).status===400,"INVALID_HOURS_NOT_REJECTED");
    check((await request("/internal/epg/sync","POST")).status===401,"SYNC_UNPROTECTED");
    check((await request("/me/settings","PUT",{country:"XX",timezone:"not/a/timezone"})).status===400,"INVALID_REGION_TIMEZONE");
  });
  await run("different_personas_and_explicit_correction",async()=>{
    await data("/me/settings","PUT",{country:"RO",services:[{providerId:8,providerName:"Netflix"},{providerId:1899,providerName:"Max"}]},1);
    await data("/onboarding/analyze","POST",{description:"I enjoy documentaries about nature and real people. I dislike horror and gore.",favorites:[],genres:["Documentary"],moods:[]},1);
    const documentary=await data<RankedContent[]>("/recommend","POST",{filter:{mediaType:"movie"}},1);
    console.log(JSON.stringify({observation:"documentary_persona",items:sample(documentary.map(r=>r.item))}));
    check(documentary.length>=3,"DOCUMENTARY_COLD_START_EMPTY");
    check(documentary.slice(0,5).filter(r=>r.item.genres.includes("Documentary")).length>=3,"DOCUMENTARY_PERSONA_NOT_PERSONALIZED");
    const overlap=documentary.slice(0,5).filter(r=>picks.slice(0,5).some(p=>key(p.item)===key(r.item))).length;
    check(overlap<=2,"PERSONAS_TOO_SIMILAR");
    await data("/me/taste","PUT",{signals:[{dimension:"genre",key:"documentary",score:-1,confidence:1,evidenceCount:1,source:"explicit_edit"},{dimension:"genre",key:"comedy",score:1,confidence:1,evidenceCount:1,source:"explicit_edit"}]},1);
    const corrected=await data<RankedContent[]>("/recommend","POST",{filter:{mediaType:"movie"}},1);
    console.log(JSON.stringify({observation:"corrected_comedy_persona",items:sample(corrected.map(r=>r.item))}));
    check(corrected.slice(0,5).filter(r=>r.item.genres.includes("Comedy")).length>=3,"CORRECTION_NOT_REFLECTED");
    check(corrected.slice(0,5).every(r=>!r.item.genres.includes("Documentary")),"CORRECTION_IGNORED");
  });
  await run("account_deletion_and_token_revocation",async()=>{
    check((await request("/auth/delete-user","POST",{password:accounts[1]!.password},1)).ok,"ACCOUNT_DELETE_FAILED");
    check((await request("/me/settings","GET",undefined,1)).status===401,"DELETED_TOKEN_VALID");
    check((await request("/me/settings")).ok,"OTHER_ACCOUNT_DAMAGED");
    check((await request("/auth/sign-out","POST",{})).ok,"LOGOUT_FAILED");
    check((await request("/me/settings")).status===401,"LOGOUT_TOKEN_VALID");
  });
} catch(error) {
  failed++; console.log(JSON.stringify({case:"setup",status:"fail",code:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"SETUP_FAILED"}));
} finally {
  for(const account of accounts) await db.delete(user).where(eq(user.id,account.id));
  await closeDatabase();
  console.log(JSON.stringify({summary:{passed,failed,temporaryAccountsRemoved:accounts.length}}));
  if(failed) process.exitCode=1;
}
