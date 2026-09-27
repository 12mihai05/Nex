import "../src/env.js";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

if (process.argv.includes("--local-db")) {
  process.env.TURSO_DATABASE_URL = "file:./backend/live-verification.db";
  delete process.env.TURSO_AUTH_TOKEN;
}
// Set only the local HTTP origin; never replace the application's AI credentials.
process.env.BETTER_AUTH_URL = "http://localhost:8788";
process.env.ALLOWED_ORIGINS = "http://localhost:8788,http://localhost:3000";
const { getDatabase, closeDatabase } = await import("../src/db/client.js");
const { getConfig } = await import("../src/config.js");
const config = getConfig();
const db = getDatabase();
const { user } = await import("../src/db/schema.js");
const createdIds: string[] = [];
const results: Array<Record<string,unknown>> = [];
const report = (name: string, data: Record<string,unknown>) => { const row={name,...data}; results.push(row); console.log(JSON.stringify(row)); };
function check(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
try {
  await migrate(db,{ migrationsFolder: fileURLToPath(new URL("../drizzle",import.meta.url)) });
  report("database",{status:"pass",mode:config.TURSO_DATABASE_URL.startsWith("file:")?"local":"turso"});
  const { default: app } = await import("../src/app.js");
  const request = async (path: string, method="GET", body?: unknown, token?: string) => app.request(`http://localhost:8788/api${path}`, { method, headers: { "content-type":"application/json", ...(token?{authorization:`Bearer ${token}`}:{}) }, ...(body?{body:JSON.stringify(body)}:{}) });
  const accounts: Array<{email:string;password:string;token:string}> = [];
  for (let i=0;i<2;i++) {
    const email=`nex-verify-${randomUUID()}@example.test`, password=randomUUID()+randomUUID();
    const r=await request("/auth/sign-up/email","POST",{name:"Nex verification",email,password,inviteCode:config.NEX_INVITE_CODE});
    check(r.status===200,"AUTH_SIGNUP_FAILED"); const data=await r.json() as {user:{id:string}};
    createdIds.push(data.user.id); const token=r.headers.get("set-auth-token"); check(token,"AUTH_BEARER_MISSING"); accounts.push({email,password,token});
  }
  const a=accounts[0]!, b=accounts[1]!;
  check((await request("/me/settings","GET",undefined,a.token)).status===200,"AUTH_PRIVATE_FAILED");
  check((await request("/me/settings")).status===401,"AUTH_ANONYMOUS_ALLOWED");
  check((await request("/auth/sign-up/email","POST",{name:"Invalid",email:"invalid@example.test",password:randomUUID(),inviteCode:"invalid"})).status===403,"INVITE_FAILED");
  await request("/me/taste","PUT",{signals:[{dimension:"genre",key:"science fiction",score:1,confidence:1,evidenceCount:1,source:"explicit_edit"}]},a.token);
  const other=await (await request("/me/taste","GET",undefined,b.token)).json() as {data:unknown[]}; check(other.data.length===0,"USER_ISOLATION_FAILED");
  await request("/auth/sign-out","POST",{},a.token);
  check((await request("/me/settings","GET",undefined,a.token)).status===401,"LOGOUT_FAILED");
  const login=await request("/auth/sign-in/email","POST",{email:a.email,password:a.password}); check(login.status===200,"SIGNIN_FAILED"); a.token=login.headers.get("set-auth-token")!;
  report("better_auth",{status:"pass",checks:["invite","signup","signin","bearer","isolation","logout"]});
  if (!process.argv.includes("--client-only")) {
  const { createTmdbRepository } = await import("../src/repositories/tmdb-repository.js");
  const catalog=createTmdbRepository();
  try {
    check(catalog.mode==="live","TMDB_NOT_CONFIGURED");
    const item=await catalog.getTitle("movie",329865,"RO",[8]); check(item?.title==="Arrival","TMDB_DETAIL_FAILED");
    const search=await catalog.search({query:"Arrival",region:"RO"}); check(search.some((x)=>x.id===329865),"TMDB_SEARCH_FAILED");
    const providers=await catalog.getProviders("RO"); check(providers.length>0,"TMDB_PROVIDERS_FAILED");
    report("tmdb",{status:"pass",title:item.title,providers:providers.length,availability:item.availability.length});
    const feedback=await request("/me/feedback","PUT",{tmdbId:item.id,mediaType:item.mediaType,reaction:"super_like"},a.token); check(feedback.status===200,"FEEDBACK_FAILED");
    const taste=await (await request("/me/taste","GET",undefined,a.token)).json() as {data:unknown[]}; check(taste.data.length>1,"FEEDBACK_NOT_LEARNED");
    report("feedback_learning",{status:"pass",dimensions:taste.data.length});
  } catch(e) { report("tmdb",{status:"failed",code:safeCode(e)}); }
  const { AiService }=await import("../src/services/ai.js"); const ai=new AiService();
  try {
    check(ai.mode==="live","AI_NOT_CONFIGURED");
    const taste=await ai.extractTaste("I love science fiction and generally hate musicals.",[]); check(taste.signals.length>0,"AI_TASTE_EMPTY");
    const intent=await ai.parseIntent("Recommend a comedy under 100 minutes tonight"); check(intent.intent==="DISCOVERY" && intent.maxRuntimeMinutes===100,"AI_INTENT_FAILED");
    const composed=await ai.compose("Recommend something",[]); check(composed.intro,"AI_COMPOSITION_EMPTY");
    report("openai",{status:"pass",checks:["taste","intent","composition"],signals:taste.signals.length});
  } catch(e) { report("openai",{status:"failed",code:safeCode(e),httpStatus:(e as {status?:number}).status}); }
  }
  if (process.argv.includes("--epg")) {
    const { EpgService }=await import("../src/services/epg/service.js"); const {createEpgProvider}=await import("../src/services/epg/provider.js");
    for (const country of ["RO","BG"]) {
      try { const epg=new EpgService(db,createEpgProvider(country)); const result=await epg.sync(); const entries=await epg.listWindow(new Date(),new Date(Date.now()+24*3_600_000),country); check(entries.length>0,"EPG_WINDOW_EMPTY"); report(`epg_${country}`,{status:"pass",...result,upcoming:entries.length}); }
      catch(e) { report(`epg_${country}`,{status:"failed",code:safeCode(e)}); }
    }
  }
  if (process.argv.includes("--flutter")) {
    const {serve}=await import("@hono/node-server"); const {spawn}=await import("node:child_process");
    const server=serve({fetch:app.fetch,port:8788});
    try {
      const flutter=fileURLToPath(new URL("../../.tooling/flutter/bin/flutter.bat",import.meta.url));
      const exit=await new Promise<number|null>((resolve)=>{
        const flutterEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/TURSO|OPENAI|TMDB|BETTER_AUTH|INVITE|SECRET|VERCEL|EPG_COUNTRY_SOURCES/i.test(key)));
        const child=spawn("cmd.exe",["/d","/c",flutter,"test","test/live_backend_test.dart","--dart-define=API_BASE_URL=http://localhost:8788",...(process.argv.includes("--render-only")?["--name","Browse"]:[])],{cwd:fileURLToPath(new URL("../../mobile",import.meta.url)),env:{...flutterEnv,NEX_TEST_EMAIL:a.email,NEX_TEST_PASSWORD:a.password},stdio:"inherit",windowsHide:true});
        child.on("exit",resolve); child.on("error",()=>resolve(1));
      });
      report("flutter_http",{status:exit===0?"pass":"failed"});
    } finally { server.close(); }
  }
} catch(e) { report("verification",{status:"failed",code:safeCode(e)}); }
finally {
  for (const id of createdIds) await db.delete(user).where(eq(user.id,id));
  await closeDatabase();
  if (results.some((r)=>r.status==="failed")) process.exitCode=1;
}
function safeCode(error: unknown): string {
  const e=error as {message?:string;name?:string;code?:string};
  return e.message && /^[A-Z][A-Z_]+$/.test(e.message) ? e.message : e.name ?? "INTEGRATION_FAILED";
}
