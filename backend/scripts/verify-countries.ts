import "../src/env.js";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {getConfig} from "../src/config.js";
import {getDatabase,closeDatabase} from "../src/db/client.js";
import {user} from "../src/db/schema.js";
process.env.BETTER_AUTH_URL="http://localhost:8789";
process.env.ALLOWED_ORIGINS="http://localhost:8789";
const {default:app}=await import("../src/app.js");
let userId="",token="",failed=0;
function check(value:unknown,code:string):asserts value {if(!value)throw new Error(code);}
async function call(path:string,method="GET",body?:unknown):Promise<any> {
  const response=await app.request(`http://localhost:8789/api${path}`,{method,headers:{"content-type":"application/json",authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
  check(response.ok,`HTTP_${response.status}`);return response.json();
}
try {
  const response=await app.request("http://localhost:8789/api/auth/sign-up/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Country verification",email:`nex-verify-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),inviteCode:getConfig().NEX_INVITE_CODE})});
  check(response.ok,"SIGNUP_FAILED");userId=((await response.json()) as {user:{id:string}}).user.id;token=response.headers.get("set-auth-token")!;
  for(const country of ["RO","BG","GB","ES","FR","CH","IT","DE","MD"]) {
    try {
      await call("/me/settings","PUT",{country});
      const upcoming=await call("/tv/upcoming?country=US");
      const live=await call("/tv/live?country=US");
      check(upcoming.meta.country===country,"WRONG_REGION");
      check(upcoming.data.length>0,"EMPTY_EPG");
      check([...upcoming.data,...live.data].every((p:{id:string})=>p.id.startsWith(`iptv-org:${country}:`)),"CROSS_COUNTRY_LEAK");
      const providers=await call("/providers");
      console.log(JSON.stringify({country,status:"pass",upcoming:upcoming.data.length,live:live.data.length,providers:providers.data.length,coverage:upcoming.meta.coverage}));
    }catch(error){failed++;console.log(JSON.stringify({country,status:"fail",code:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"FAILED"}));}
  }
  await call("/me/settings","PUT",{country:"RO"});
  const chat=(await call("/chat","POST",{message:"Show TV in France tomorrow."})).data;
  const programs=chat.blocks.flatMap((b:any)=>b.type==="tv_carousel"?b.items:[]);
  check(programs.length>0&&programs.every((p:any)=>p.id.startsWith("iptv-org:FR:")),"EXPLICIT_CHAT_REGION_FAILED");
  check((await call("/me/settings")).data.profile.country==="RO","CHAT_CHANGED_SETTINGS");
  check((await call("/tv/upcoming")).data.every((p:any)=>p.id.startsWith("iptv-org:RO:")),"CHAT_CONTAMINATED_BROWSE");
  const reset=(await call("/chat","POST",{sessionId:chat.sessionId,message:"What is on TV tomorrow?"})).data;
  const defaultPrograms=reset.blocks.flatMap((b:any)=>b.type==="tv_carousel"?b.items:[]);
  check(defaultPrograms.length>0&&defaultPrograms.every((p:any)=>p.id.startsWith("iptv-org:RO:")),"IMPLICIT_CHAT_REGION_DID_NOT_RESET");
  console.log(JSON.stringify({case:"explicit_chat_override_without_settings_mutation",status:"pass"}));
}catch(error){failed++;console.log(JSON.stringify({case:"country_verification",status:"fail",code:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"FAILED"}));}
finally {
  if(userId)await getDatabase().delete(user).where(eq(user.id,userId));
  await closeDatabase();console.log(JSON.stringify({failed,temporaryAccountRemoved:Boolean(userId)}));if(failed)process.exitCode=1;
}
