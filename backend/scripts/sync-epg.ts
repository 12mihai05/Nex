import "dotenv/config";
import { EpgService } from "../src/services/epg/service.js";
import { closeDatabase } from "../src/db/client.js";
import { getConfig } from "../src/config.js";
import { createEpgProvider } from "../src/services/epg/provider.js";
import { getDatabase } from "../src/db/client.js";
import { EpgSyncError, syncErrorCode } from '../src/services/epg/sync-error.js';
import {EpgDemand} from '../src/services/epg/demand.js';
import {lt} from 'drizzle-orm';
import {userEvents} from '../src/db/schema.js';

try {
  // Retention runs in existing scheduled maintenance, not the Home request.
  try {
    await getDatabase().delete(userEvents).where(lt(userEvents.createdAt,new Date(Date.now()-90*86_400_000)));
  } catch {
    console.error('USER_EVENT_RETENTION_FAILED');
    process.exitCode = 1; // Still attempt TV sync; report failed maintenance to CI.
  }
  const demand=new EpgDemand();
  console.log(JSON.stringify({cleanupCountries:await demand.cleanup()}));
  const requested=process.env.EPG_SYNC_COUNTRIES?.split(',').map(c=>c.trim().toUpperCase());
  const countries=getConfig().EPG_SOURCE_TYPE==='fixture'?['RO']:(await demand.countries()).filter(c=>!requested?.length||requested.includes(c));
  console.log(JSON.stringify({syncCountries:countries}));
  for (const country of countries) {
    try {
      const result = await new EpgService(getDatabase(), createEpgProvider(country)).sync();
      console.log(JSON.stringify({ country, ...result }));
    } catch (error) {
      console.log(JSON.stringify({ country, status: "failed", code: error instanceof EpgSyncError ? error.code : syncErrorCode(error), stage: error instanceof EpgSyncError ? error.stage : 'startup', ...(error instanceof EpgSyncError ? {snapshotBytes:error.snapshotBytes,programCount:error.programCount}: {}) }));
      process.exitCode = 1;
    }
    if (getConfig().EPG_SOURCE_TYPE === "fixture") break;
  }
} finally { await closeDatabase(); }
