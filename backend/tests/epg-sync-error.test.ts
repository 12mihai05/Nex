import {describe,it,expect} from 'vitest';
import {syncErrorCode} from '../src/services/epg/sync-error.js';
describe('safe sync diagnostics',()=>{
  it('unwraps known codes without disclosing SQL or private parameters',()=>{
    expect(syncErrorCode(new Error('SQL secret parameters',{cause:{code:'SQLITE_BUSY',message:'secret'}}))).toBe('SQLITE_BUSY');
    expect(syncErrorCode({code:'secret',message:'secret'})).toBe('SYNC_FAILED');
    expect(syncErrorCode(new Error('EPG_STALE_FEED'))).toBe('EPG_STALE_FEED');
    const cycle:{cause?:unknown}={};cycle.cause=cycle;expect(syncErrorCode(cycle)).toBe('SYNC_FAILED');
  });
});
