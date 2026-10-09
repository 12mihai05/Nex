import '../src/env.js';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getConfig} from '../src/config.js';

// Only synthetic credentials enter the Flutter test process. Never send backend
// API keys, deployment tokens or database credentials to the mobile application.
const base=getConfig().BETTER_AUTH_URL;
const email=`nex-mobile-qa-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
let token:string|null=null;
async function call(path:string,body:unknown){return fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':getConfig().NEX_INVITE_CODE})},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});}
try {
 const r=await call('/api/auth/sign-up/email',{name:'Synthetic mobile QA',email,password});
 if(r.status!==200)throw new Error('SIGNUP_FAILED');token=r.headers.get('set-auth-token');if(!token)throw new Error('TOKEN_MISSING');
 const settings=await fetch(base+'/api/me/settings',{method:'PUT',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({country:'RO',timezone:'Europe/Bucharest',onboardingComplete:true,remindersEnabled:true})});
 if(!settings.ok)throw new Error('SETTINGS_FAILED');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>! /^(OPENAI_|TMDB_|TURSO_|BETTER_AUTH_|NEX_|EPG_|VERCEL_)/i.test(k)));
 const flutter=fileURLToPath(new URL('../../.tooling/flutter/bin/flutter.bat',import.meta.url));
 const code=await new Promise<number|null>((resolve,reject)=>{
  const child=spawn('cmd.exe',['/d','/c',flutter,'test','test/live_backend_test.dart',`--dart-define=API_BASE_URL=${base}`],{cwd:fileURLToPath(new URL('../../mobile',import.meta.url)),env:{...env,NEX_TEST_EMAIL:email,NEX_TEST_PASSWORD:password},stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',resolve);
 });
 if(code!==0)throw new Error('MOBILE_TEST_FAILED');
}catch {console.log('Mobile verification failed; secret values withheld.');process.exitCode=1;}
finally {if(token){const r=await call('/api/auth/delete-user',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
