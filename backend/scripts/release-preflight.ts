import '../src/env.js';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {getConfig} from '../src/config.js';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';

// Never log credentials, environment payloads, database URLs or user rows.
try {
  const c=getConfig(),token=process.env.VERCEL_TOKEN,project=process.env.VERCEL_PROJECT_ID,team=process.env.VERCEL_ORG_ID;
  if(!token||!project||!team)throw new Error('DEPLOYMENT_CONFIGURATION_MISSING');
  async function api(path:string){const r=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(team!)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`VERCEL_HTTP_${r.status}`);return r.json();}
  const p=await api(`/v9/projects/${project}`);
  if(p.name!=='nex'||p.rootDirectory!=='backend')throw new Error('UNEXPECTED_PROJECT');
  const env=await api(`/v10/projects/${project}/env?decrypt=true`);
  const production=(env.envs??[]).filter((e:any)=>e.target?.includes('production')&&!e.gitBranch);
  const remoteUrl=production.find((e:any)=>e.key==='TURSO_DATABASE_URL')?.value;
  if(!/^libsql:\/\//.test(c.TURSO_DATABASE_URL))throw new Error('REMOTE_DATABASE_REQUIRED');
  const db=getDatabase();
  if(remoteUrl){if(remoteUrl!==c.TURSO_DATABASE_URL)throw new Error('DATABASE_TARGET_NOT_VERIFIED');}
  else {
    // Vercel sensitive values are unreadable. Prove identity via an isolated
    // disposable account created on the known production API, then delete it.
    const base='https://nex-three-omega.vercel.app',email=`nex-release-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
    const response=await fetch(base+'/api/auth/sign-up/email',{method:'POST',redirect:'error',headers:{Origin:base,'Content-Type':'application/json','X-Nex-Invite':c.NEX_INVITE_CODE},body:JSON.stringify({name:'Synthetic release check',email,password}),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('IDENTITY_PROBE_SIGNUP_FAILED');
    const data=await response.json() as {user?:{id?:string};token?:string};
    const session=response.headers.get('set-auth-token')||data.token;
    if(!session)throw new Error('IDENTITY_PROBE_SESSION_MISSING');
    const match=await db.all<{id:string}>(sql`SELECT id FROM user WHERE email = ${email}`).catch(()=>[]);
      const deleted=await fetch(base+'/api/auth/delete-user',{method:'POST',redirect:'error',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:JSON.stringify({password}),signal:AbortSignal.timeout(60000)});
      if(!deleted.ok)throw new Error('IDENTITY_PROBE_CLEANUP_FAILED');
      console.log(JSON.stringify({productionDatabaseIdentityProbe:true,testAccountDeleted:true}));
    if(match.length!==1||match[0]?.id!==data.user?.id)throw new Error('DATABASE_TARGET_NOT_VERIFIED');
  }
  const before=await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table'");
  const cols=await db.all<{name:string}>('PRAGMA table_info(profiles)');
  console.log(JSON.stringify({schemaTables:before.map(r=>r.name),profileColumns:cols.map(r=>r.name)}));
  const latest=before.some(r=>r.name==='__drizzle_migrations')?await db.all('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'):[];
  const counts=await db.all('SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM profiles) AS profiles');
  console.log(JSON.stringify({project:p.name,branch:p.link?.productionBranch??'main',gitConnected:Boolean(p.link),databaseTargetVerified:true,tables:before.length,recommendationColumn:cols.some(r=>r.name==='recommendation_engine'),latestMigration:latest,counts,embeddingModel:production.find((e:any)=>e.key==='OPENAI_EMBEDDING_MODEL')?.value??'code default',embeddingDimensions:production.find((e:any)=>e.key==='OPENAI_EMBEDDING_DIMENSIONS')?.value??'code default'}));
  if(process.argv.includes('--migrate')){
    await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
    const after=await db.all('SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM profiles) AS profiles');
    const newCols=await db.all<{name:string}>('PRAGMA table_info(profiles)');
    if(!newCols.some(r=>r.name==='recommendation_engine'))throw new Error('MIGRATION_VERIFICATION_FAILED');
    await db.all('SELECT key FROM content_embeddings LIMIT 0');
    await db.all('SELECT user_id FROM user_recommendation_cache LIMIT 0');
    console.log(JSON.stringify({migrationApplied:true,countsAfter:after}));
  }
  if(process.argv.includes('--configure-model')){
    const settings=[{key:'OPENAI_EMBEDDING_MODEL',value:'text-embedding-3-large'},{key:'OPENAI_EMBEDDING_DIMENSIONS',value:'1024'}];
    const r=await fetch(`https://api.vercel.com/v10/projects/${project}/env?upsert=true&teamId=${encodeURIComponent(team)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(settings.map(s=>({...s,type:'plain',target:['production']}))),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`MODEL_CONFIG_HTTP_${r.status}`);
    console.log(JSON.stringify({productionEmbeddingSettingsUpdated:true}));
  }
}catch(e){console.log(JSON.stringify({releaseError:e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'PREFLIGHT_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;}
finally{await closeDatabase();}
