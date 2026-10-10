import '../src/env.js';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {fileURLToPath} from 'node:url';
import * as schema from '../src/db/schema.js';
import {LiveTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {calendarDay} from '../src/domain/releases.js';
const client=createClient({url:':memory:'});
try{
  if(!process.env.TMDB_READ_ACCESS_TOKEN)throw new Error('MISSING_CONFIG');
  const db=drizzle(client,{schema});await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
  const catalog=new LiveTmdbRepository(process.env.TMDB_READ_ACCESS_TOKEN,db);
  for(const query of ['Avengers: Doomsday','Doomsday','Avangers Doomsday']){
    const start=Date.now();const items=await catalog.search({query,region:'RO',summaryOnly:true});
    console.log(JSON.stringify({query,ms:Date.now()-start,titles:items.slice(0,5).map(i=>({id:i.id,title:i.title,date:i.releaseDate}))}));
  }
  const found=await catalog.search({query:'Avengers: Doomsday',region:'RO',summaryOnly:true});
  if(found[0])console.log(JSON.stringify(await catalog.releases(found[0].mediaType,found[0].id,'RO')));
  for(const country of ['RO','GB']){
    const result=await catalog.upcoming(country,calendarDay(),1);
    console.log(JSON.stringify({country,count:result.items.length,more:result.hasMore,examples:result.items.slice(0,3).map(i=>({title:i.title,date:i.releaseDate}))}));
  }
  console.log(JSON.stringify(await catalog.releases('series',95396,'RO')));
}catch{console.error('RELEASE_CHECK_FAILED');process.exitCode=1;}finally{client.close();}
