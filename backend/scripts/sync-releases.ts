import '../src/env.js';
import {closeDatabase} from '../src/db/client.js';
import {createTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {ReleaseTracking} from '../src/services/release-tracking.js';
import {FcmReleaseSender} from '../src/services/release-push.js';
try {
  const sender=FcmReleaseSender.fromEnvironment();
  const result=await new ReleaseTracking(createTmdbRepository()).sync(sender);
  console.log(JSON.stringify(result));
  if(result.failed||result.atCapacity)process.exitCode=1;
}catch{console.error('RELEASE_SYNC_FAILED: check provider configuration and encrypted credentials.');process.exitCode=1;}
finally{await closeDatabase();}
