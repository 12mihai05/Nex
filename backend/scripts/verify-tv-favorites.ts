import "../src/env.js";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {getDatabase,closeDatabase} from "../src/db/client.js";
import {user} from "../src/db/schema.js";
import {getConfig} from "../src/config.js";
import {EpgService} from "../src/services/epg/service.js";
import {createEpgProvider} from "../src/services/epg/provider.js";
process.env.BETTER_AUTH_URL="http://localhost:8789";process.env.ALLOWED_ORIGINS="http://localhost:8789";
const {default:app}=await import("../src/app.js");
const accounts:Array<{id:string;token:string}>=[];
function check(value:unknown,code:string):asserts value{if(!value)throw new Error(code);}
async function call(path:string,method="GET",body?:unknown,index=0){return app.request(`http://localhost:8789/api${path}`,{method,headers:{"content-type":"application/json",authorization:`Bearer ${accounts[index]!.token}`},...(body?{body:JSON.stringify(body)}:{})});}
async function data(path:string,method="GET",body?:unknown,index=0):Promise<any>{const r=await call(path,method,body,index);check(r.ok,`HTTP_${r.status}`);return (await r.json() as {data:unknown}).data;}
try{
  for(let i=0;i<2;i++){
    const r=await app.request("http://localhost:8789/api/auth/sign-up/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"TV verification",email:`nex-verify-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),inviteCode:getConfig().NEX_INVITE_CODE})});check(r.ok,"SIGNUP_FAILED");accounts.push({id:(await r.json() as {user:{id:string}}).user.id,token:r.headers.get("set-auth-token")!});
    await data("/me/settings","PUT",{country:"RO"},i);
  }
  const anonymous=await app.request("http://localhost:8789/api/tv/channels");check(anonymous.status===401,"AUTH_MISSING");
  const initialTaste=JSON.stringify(await data("/me/taste"));
  const hbo=await data("/tv/channels?q=HBO");const target=hbo.find((c:any)=>!c.available&&/HD/.test(c.name));check(target,"NO_PENDING_TEST_CHANNEL");
  await data("/me/channel-favorites","PUT",{channelId:target.id,favorite:true});
  check((await data("/tv/channels?favorites=true")).some((c:any)=>c.id===target.id),"FAVORITE_NOT_SAVED");
  check((await data("/tv/channels?favorites=true","GET",undefined,1)).length===0,"OTHER_USER_LEAK");
  check(JSON.stringify(await data("/me/taste"))===initialTaste,"CHANNEL_CHANGED_MOVIE_TASTE");
  const sync=await new EpgService(getDatabase(),createEpgProvider("RO")).sync();
  const schedule=await data(`/tv/channel-schedule?id=${encodeURIComponent(target.id)}`);check(schedule.length>0,"FAVORITE_NOT_IMPORTED");check(schedule.every((p:any)=>p.favorite&&p.channel.id===target.id),"SCHEDULE_SCOPE");
  const discovery=await data("/tv/discover");check(discovery.live.some((p:any)=>p.channel.id===target.id),"LIVE_FAVORITE_MISSING");
  check(discovery.live.some((p:any)=>!p.favorite),"NONFAVORITES_HIDDEN");
  const privateResponse=await call("/tv/discover");check(privateResponse.headers.get("cache-control")?.includes("no-store"),"PRIVATE_CACHE_HEADER");
  await data("/me/settings","PUT",{country:"GB"});
  check((await call("/me/channel-favorites","PUT",{channelId:target.id,favorite:true})).status===404,"CROSS_COUNTRY_WRITE");
  check((await data(`/tv/channel-schedule?id=${encodeURIComponent(target.id)}`)).length===0,"CROSS_COUNTRY_READ");
  await data("/me/settings","PUT",{country:"RO"});
  await data("/me/channel-favorites","PUT",{channelId:target.id,favorite:false});
  check((await data("/tv/channels?favorites=true")).length===0,"UNFAVORITE_FAILED");
  console.log(JSON.stringify({status:"pass",checks:["auth","owner isolation","country isolation","fresh favorite","pending channel imported","nonfavorites retained","movie taste unchanged","private cache headers","unfavorite"],channel:target.name,programmes:schedule.length,importedRows:sync.importedRows}));
}catch(error){console.error(JSON.stringify({status:"fail",code:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"VERIFICATION_FAILED"}));process.exitCode=1;}
finally{for(const account of accounts)await getDatabase().delete(user).where(eq(user.id,account.id));await closeDatabase();console.log(JSON.stringify({removed:accounts.length}));}
