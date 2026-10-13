import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {eq,sql} from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {EpgDemand} from '../src/services/epg/demand.js';

let client:ReturnType<typeof createClient>,db:ReturnType<typeof drizzle<typeof schema>>,demand:EpgDemand;
const now=new Date(),day=86400000;
beforeEach(async()=>{
  client=createClient({url:':memory:'});db=drizzle(client,{schema});demand=new EpgDemand(db);
  const dir=fileURLToPath(new URL('../drizzle/',import.meta.url));
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(dir+'/'+name,'utf8')).replaceAll('--> statement-breakpoint',''));
});
afterEach(()=>client.close());
async function account(id:string,country:string){
  await db.insert(schema.user).values({id,name:'Test',email:id+'@example.invalid'});
  await db.insert(schema.profiles).values({userId:id,country});
}
it('only selects countries with accounts, not every enabled country',async()=>{
  await account('ro','RO');expect(await demand.countries()).toEqual(['RO']);
  await account('it','IT');expect(new Set(await demand.countries())).toEqual(new Set(['RO','IT']));
});
it('last departure starts grace, returning resets it, and account deletion counts',async()=>{
  await account('a','IT');await account('b','IT');
  await db.delete(schema.user).where(eq(schema.user.id,'a'));
  expect((await db.select().from(schema.epgCountryDemand))[0]?.inactiveSince).toBeNull();
  await db.update(schema.profiles).set({country:'RO'}).where(eq(schema.profiles.userId,'b'));
  const row=(await db.select().from(schema.epgCountryDemand).where(eq(schema.epgCountryDemand.country,'IT')))[0]!;
  expect(row.inactiveSince).not.toBeNull();
  expect(await demand.countries(new Date(+now+13*day))).toContain('IT');
  expect(await demand.countries(new Date(+now+15*day))).not.toContain('IT');
  await db.update(schema.profiles).set({country:'IT'}).where(eq(schema.profiles.userId,'b'));
  expect((await db.select().from(schema.epgCountryDemand).where(eq(schema.epgCountryDemand.country,'IT')))[0]?.inactiveSince).toBeNull();
});
it('coalesces first-load requests and never allows unused-country imports',async()=>{
  await account('a','RO');
  expect(await demand.claim('IT',now)).toBe(false);
  expect(await demand.claim('RO',now)).toBe(true);
  expect(await demand.claim('RO',now)).toBe(false);
  expect((await demand.status('RO',now)).state).toBe('preparing');
  expect((await demand.status('RO',new Date(+now+16*60000))).state).toBe('unavailable');
  expect(await demand.claim('RO',new Date(+now+16*60000))).toBe(true);
});
it('purges dormant schedules but retains favourite identities and never active data',async()=>{
  await account('a','IT');
  await db.insert(schema.channels).values([{id:'c',sourceId:'iptv-org:IT',externalId:'c',displayName:'C',country:'IT'},{id:'d',sourceId:'iptv-org:IT',externalId:'d',displayName:'D',country:'IT'}]);
  await db.insert(schema.channelFavorites).values({userId:'a',channelId:'c'});
  await db.insert(schema.epgPrograms).values({id:'p',sourceId:'iptv-org:IT',sourceProgramId:'p',channelId:'c',title:'Show',startAt:now,endAt:new Date(+now+day)});
  expect(await demand.cleanup(new Date(+now+30*day))).toEqual([]);
  await db.update(schema.profiles).set({country:'RO'}).where(eq(schema.profiles.userId,'a'));
  expect(await demand.cleanup(new Date(+now+13*day))).toEqual([]);
  expect(await demand.cleanup(new Date(+now+15*day))).toEqual(['IT']);
  expect(await db.select().from(schema.epgPrograms)).toHaveLength(0);
  expect(await db.select().from(schema.channelFavorites)).toHaveLength(1);
  expect(await db.select().from(schema.channels)).toMatchObject([{id:'c',active:false}]);
});
it('does not refetch pre-existing countries that were never selected',async()=>{
  await db.insert(schema.epgCountryDemand).values({country:'IT',inactiveSince:now,everSelected:false});
  expect(await demand.countries()).toEqual([]);
});
it('does not delete a country during a live sync',async()=>{
  await account('a','RO');await db.delete(schema.user).where(eq(schema.user.id,'a'));
  await db.run(sql`update epg_country_demand set inactive_since=${+now-16*day}`);
  await db.insert(schema.epgSyncRuns).values({id:'run',sourceId:'iptv-org:RO',status:'running',startedAt:now});
  expect(await demand.cleanup(now)).toEqual([]);
});
