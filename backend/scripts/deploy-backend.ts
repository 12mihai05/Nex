import '../src/env.js';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Upload an explicit backend-only allowlist. Never upload .env, databases,
// mobile files, node_modules, test accounts, logs, or local build artifacts.
const root=fileURLToPath(new URL('../../',import.meta.url));
const token=process.env.VERCEL_TOKEN,project=process.env.VERCEL_PROJECT_ID,team=process.env.VERCEL_ORG_ID;
if(!token||!project||!team) throw new Error('DEPLOYMENT_CONFIGURATION_MISSING');
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function api(path:string,body?:unknown){
  const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(team!)}`,{
    method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`VERCEL_HTTP_${response.status}`);
  return response.json() as Promise<Record<string,unknown>>;
}
try {
  if(process.argv[2]==='status'){
    if(!/^dpl_[a-zA-Z0-9]+$/.test(process.argv[3]??''))throw new Error('DEPLOYMENT_ID_REQUIRED');
    const d=await api(`/v13/deployments/${process.argv[3]}`);
    console.log(JSON.stringify({id:d.id,state:d.readyState,url:d.url,alias:d.alias,errorCode:d.errorCode}));
  } else {
    const p=await api(`/v9/projects/${project}`);
    if(p.name!=='nex'||p.rootDirectory!=='backend')throw new Error('UNEXPECTED_DEPLOYMENT_TARGET');
    const paths=['package.json','package-lock.json','backend/package.json','backend/tsconfig.json','backend/tsconfig.build.json','backend/vercel.json'];
    function collect(dir:string){for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){
      const path=`${dir}/${entry.name}`;
      if(entry.isSymbolicLink())throw new Error('SYMLINK_NOT_ALLOWED');
      if(entry.isDirectory())collect(path);
      else if(/\.(ts|json|xml)$/.test(path))paths.push(path);
      else throw new Error('UNEXPECTED_SOURCE_FILE');
    }}
    collect('backend/src');collect('backend/api');
    const secrets=['VERCEL_TOKEN','TURSO_AUTH_TOKEN','OPENAI_API_KEY','TMDB_READ_ACCESS_TOKEN','BETTER_AUTH_SECRET','NEX_INVITE_CODE','EPG_SYNC_SECRET'].map(k=>process.env[k]).filter((v):v is string=>Boolean(v&&v.length>=8));
    const files=paths.map(file=>{
      if(!lstatSync(resolve(root,file)).isFile())throw new Error('NON_REGULAR_SOURCE_FILE');
      const data=readFileSync(resolve(root,file));
      if(secrets.some(s=>data.includes(Buffer.from(s))))throw new Error('SOURCE_CONTAINS_SECRET');
      return {file,data:data.toString('base64'),encoding:'base64'};
    });
    const d=await api('/v13/deployments',{name:p.name,project,target:'production',files});
    console.log(JSON.stringify({id:d.id,state:d.readyState,url:d.url,files:files.length,backendOnly:true}));
  }
}catch(error){console.log(JSON.stringify({deploymentError:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'DEPLOYMENT_FAILED'}));process.exitCode=1;}
