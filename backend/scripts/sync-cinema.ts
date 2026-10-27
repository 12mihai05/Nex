import '../src/env.js';
import {fileURLToPath} from 'node:url';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {CinemaRepository} from '../src/repositories/cinema-repository.js';
import {LiveTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {CinemaMatcher} from '../src/services/cinema-matching.js';
import {CinemaImporter} from '../src/services/cinema-import.js';
import {chains,type CinemaChain} from '../src/domain/cinema.js';
import {contentItemSchema} from '../src/domain/types.js';

async function main(){
  const args=new Set(process.argv.slice(2));
  const local=args.has('--local');
  const apply=args.has('--apply');
  if(local)process.env.TURSO_DATABASE_URL=`file:${fileURLToPath(new URL('../../.tooling/cinema-trial.db',import.meta.url)).replaceAll('\\','/')}`;
  if(apply&&!local&&process.env.CINEMA_IMPORT_ENABLED!=='true')throw new Error('CINEMA_DISABLED');
  const token=process.env.TMDB_READ_ACCESS_TOKEN;if(!token)throw new Error('CINEMA_TMDB_NOT_CONFIGURED');
  const db=getDatabase();
  if(local)await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
  const repo=new CinemaRepository(db),catalog=new LiveTmdbRepository(token,db);
  const saved=(await Promise.all(chains.map(c=>repo.mappings(c)))).flat();
  const known=saved.flatMap(m=>m.tmdbId&&m.movieJson?[{item:contentItemSchema.parse(JSON.parse(m.movieJson)),aliases:[m.title,JSON.parse(m.evidenceJson).originalTitle??'']}]:[]);
  const matcher=new CinemaMatcher(token,catalog,500,known);
  const importer=new CinemaImporter(repo,CinemaImporter.dependencies(e=>matcher.match(e)));
  const selected=process.argv.find(v=>v.startsWith('--chain='))?.split('=')[1];
  if(selected&&!chains.includes(selected as CinemaChain))throw new Error('CINEMA_INVALID_CHAIN');
  const deadline=Date.now()+6*60000;
  let failed=0;
  for(const chain of selected?[selected as CinemaChain]:['cineplexx','cinema_city'] as const){
    const started=Date.now();
    try{console.log(JSON.stringify({...await importer.sync(chain,{dryRun:!apply,deadline}),elapsedMs:Date.now()-started}));}
    catch(error){
      failed++;
      if(apply)await repo.failure(chain,started).catch(()=>{});
      const message=error instanceof Error?error.message:'';
      console.error(JSON.stringify({chain,status:'failed',code:/^CINEMA_[A-Z_0-9]+$/.test(message)?message:'CINEMA_IMPORT_FAILED'}));
    }
  }
  console.log(JSON.stringify({matchRequests:matcher.requests,failed,local,dryRun:!apply}));
  if(failed)process.exitCode=1;
}
main().catch(()=>{console.error('CINEMA_SYNC_FAILED');process.exitCode=1;}).finally(closeDatabase);
