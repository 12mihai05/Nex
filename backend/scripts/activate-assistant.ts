import '../src/env.js';

// Deployment-only helper: never print environment values or provider responses.
const {VERCEL_TOKEN:token,VERCEL_PROJECT_ID:project,VERCEL_ORG_ID:team,TURSO_DATABASE_URL:database}=process.env;
async function main(){
  if(!token||!project||!team||!database||!database.startsWith('libsql://'))throw new Error('DEPLOYMENT_CONFIGURATION_MISSING');
  const request=async(path:string,body?:unknown)=>{
    const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(team)}`,{
      method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`VERCEL_HTTP_${response.status}`);return response.json();
  };
  const p=await request(`/v9/projects/${project}`);
  if(p.name!=='nex'||p.rootDirectory!=='backend')throw new Error('UNEXPECTED_DEPLOYMENT_TARGET');
  const env=await request(`/v10/projects/${project}/env?decrypt=true`);
  const production=(env.envs as Array<{id:string;key:string;value:string;target:string[]}>).filter(e=>e.target.includes('production'));
  const databaseEnv=production.find(e=>e.key==='TURSO_DATABASE_URL');
  if(!databaseEnv)throw new Error('PRODUCTION_DATABASE_MISSING');
  const decrypted=await request(`/v1/projects/${project}/env/${databaseEnv.id}`);
  const remote=typeof decrypted==='string'?decrypted:decrypted.value;
  // Sensitive Vercel variables may deliberately omit their value on reads.
  if(typeof remote==='string'&&remote.trim()!==database.trim())throw new Error('PRODUCTION_DATABASE_MISMATCH');
  if(process.argv.includes('--enable'))await request(`/v10/projects/${project}/env?upsert=true`,{key:'CHAT_ASSISTANT_MODE',value:'tools',type:'plain',target:['production']});
  console.log(JSON.stringify({project:'nex',backendOnly:true,productionDatabaseMatches:typeof remote==='string'?true:'not-readable',toolsEnabledForNextDeployment:process.argv.includes('--enable')}));
}
main().catch(error=>{console.error(error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'ACTIVATION_FAILED');process.exitCode=1;});
