import {describe,it,expect} from 'vitest';
import {syncErrorCode,retrySnapshot} from '../src/services/epg/sync-error.js';
describe('safe sync diagnostics',()=>{
  it('retries transient whole-snapshot errors with bounds, but never retries invalid data',async()=>{
    let attempts=0;const delays:number[]=[];
    expect(await retrySnapshot(async()=>{if(++attempts<3)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});return 42;},async ms=>{delays.push(ms);})).toBe(42);
    expect(delays).toEqual([1000,2000]);attempts=0;
    await expect(retrySnapshot(async()=>{attempts++;throw {code:'SQLITE_CONSTRAINT_UNIQUE'};},async()=>{})).rejects.toBeDefined();expect(attempts).toBe(1);
    attempts=0;await expect(retrySnapshot(async()=>{attempts++;throw {code:'ECONNRESET'};},async()=>{})).rejects.toBeDefined();expect(attempts).toBe(3);
  });
  it('unwraps known codes without disclosing SQL or private parameters',()=>{
    expect(syncErrorCode(new Error('SQL secret parameters',{cause:{code:'SQLITE_BUSY',message:'secret'}}))).toBe('SQLITE_BUSY');
    expect(syncErrorCode({code:'secret',message:'secret'})).toBe('SYNC_FAILED');
    expect(syncErrorCode(new Error('EPG_STALE_FEED'))).toBe('EPG_STALE_FEED');
    expect(syncErrorCode(new Error('private SQL',{cause:{code:'SQLITE_CONSTRAINT_UNIQUE',message:'private parameters'}}))).toBe('SQLITE_CONSTRAINT_UNIQUE');
    const cycle:{cause?:unknown}={};cycle.cause=cycle;expect(syncErrorCode(cycle)).toBe('SYNC_FAILED');
  });
});
