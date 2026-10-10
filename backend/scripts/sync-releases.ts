import '../src/env.js';
import {closeDatabase} from '../src/db/client.js';
import {createTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {ReleaseTracking} from '../src/services/release-tracking.js';
try {
  const result=await new ReleaseTracking(createTmdbRepository()).sync();
  console.log(JSON.stringify(result));
  if(result.failed||result.atCapacity)process.exitCode=1;
}catch{console.error('RELEASE_SYNC_FAILED: check provider configuration and encrypted credentials.');process.exitCode=1;}
finally{await closeDatabase();}
