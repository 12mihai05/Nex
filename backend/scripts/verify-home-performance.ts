import '../src/env.js';
import {sql} from 'drizzle-orm';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {createTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {discoverHome,discoveryShelves} from '../src/services/discovery.js';
import {PersonalizationService} from '../src/services/personalization.js';
import {scoreCandidate,titleKey} from '../src/services/recommendation.js';
import {filterQuerySchema} from '../src/domain/types.js';

// Opt-in read-only account audit. No credentials, messages or profile values are
// printed; no impressions, ratings, history or Taste mutations are performed.
try {
  const email=process.env.NEX_VERIFY_EMAIL;
  if(!email)throw new Error('VERIFY_EMAIL_REQUIRED');
  const db=getDatabase();
  const [user]=await db.all<{id:string}>(sql`select id from user where email=${email}`);
  if(!user)throw new Error('VERIFY_ACCOUNT_MISSING');
  const users=new UserRepository(db),state=await users.getRecommendationState(user.id),catalog=createTmdbRepository();
  // Exercise quota-exhausted semantics without charging or changing daily usage.
  const personalizer=new PersonalizationService(users.recommendationStore(),catalog,async()=>false);
  const prepare=personalizer.prepare.bind(personalizer);
  personalizer.prepare=async(...args)=>{const start=performance.now();const result=await prepare(...args);console.log(JSON.stringify({semanticMs:Math.round(performance.now()-start),mode:result.mode,reason:result.reason,covered:result.covered,cacheHits:result.cacheHits}));return result;};
  const plan=discoveryShelves(state).map(s=>s.id);
  const batchLimit=process.argv.includes('--first-batch')?1:6;
  for(let pass=0;pass<2;pass++){
    const seen:string[]=[];
    for(let batch=0;batch<batchLimit;batch++){
      const start=performance.now();
      const rows=await discoverHome(catalog,state,user.id,{},batch,plan,seen,personalizer);
      const context={...state,viewerIds:[user.id],temporaryMoods:[]};
      for(const row of rows)for(const {item} of row.items){
        const key=titleKey(item);
        if(seen.includes(key))throw new Error('DUPLICATE');
        if(!scoreCandidate(item,filterQuerySchema.parse({intent:'DISCOVERY',excludeWatched:row.id!=='rewatch'}),context))throw new Error('HARD_FILTER_LEAK');
        seen.push(key);
      }
      console.log(JSON.stringify({pass,batch,ms:Math.round(performance.now()-start),rows:rows.map(r=>({id:r.id,count:r.items.length})),unique:seen.length}));
    }
  }
}catch{console.log(JSON.stringify({verificationFailed:true,detailsWithheld:true}));process.exitCode=1;}
finally{await closeDatabase();}
