import {waitUntil} from '@vercel/functions';
import {EpgDemand} from './demand.js';
import {EpgService} from './service.js';
import {createEpgProvider} from './provider.js';
import {getDatabase} from '../../db/client.js';
import {getConfig} from '../../config.js';

export async function prepareCountry(country:string){
  if(!['iptv-org','iptv_org'].includes(getConfig().EPG_SOURCE_TYPE))return;
  const demand=new EpgDemand();
  if(!await demand.claim(country))return;
  // Existing Vercel runtime, not a new queue or third-party provider. A killed
  // task is retryable after its lease; daily GitHub sync is the recovery path.
  waitUntil(new EpgService(getDatabase(),createEpgProvider(country)).sync()
    .then(()=>undefined).catch(()=>{/* Sanitized failure is persisted by sync. */}));
}
