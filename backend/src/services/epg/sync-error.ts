// Drizzle messages can contain SQL parameters. Only allow known public codes.
export function syncErrorCode(error: unknown): string {
  const seen = new Set<unknown>();
  let current = error;
  let fallback='SYNC_FAILED';
  for (let depth = 0; depth < 6 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    const value = current as {code?:unknown;message?:unknown;cause?:unknown};
    const known = ['SQLITE_BUSY','SQLITE_CONSTRAINT','SQLITE_TOOBIG','SQLITE_FULL','SQLITE_IOERR','SQLITE_INTERRUPT','TRANSACTION_TIMEOUT','TRANSACTION_CLOSED','STREAM_EXPIRED','SERVER_ERROR','HRANA_PROTO_ERROR','FETCH_FAILED','ECONNRESET','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'];
    if (typeof value.code === 'string' && known.includes(value.code)) return value.code;
    if (typeof value.code === 'string' && /^SQLITE_(CONSTRAINT|IOERR)_[A-Z_]{1,32}$/.test(value.code)) return value.code;
    if (typeof value.message === 'string') {
      const markers:[RegExp,string][]=[[/unique constraint failed/i,'SQLITE_CONSTRAINT_UNIQUE'],[/foreign key constraint failed/i,'SQLITE_CONSTRAINT_FOREIGNKEY'],[/too many sql variables/i,'SQLITE_VARIABLE_LIMIT'],[/request.*too large|payload too large|status(?: code)?:? 413/i,'PAYLOAD_TOO_LARGE'],[/transaction.*timeout|transaction.*timed out/i,'TRANSACTION_TIMEOUT'],[/database is locked/i,'SQLITE_BUSY'],[/stream.*expired/i,'STREAM_EXPIRED']];
      for(const [pattern,code] of markers)if(pattern.test(value.message))return code;
      if(/fetch failed/i.test(value.message))fallback='FETCH_FAILED';
    }
    if (typeof value.message === 'string' && /^EPG_[A-Z_]+$/.test(value.message)) return value.message;
    current = value.cause;
  }
  return fallback;
}

export async function retrySnapshot<T>(write:()=>Promise<T>,wait:(ms:number)=>Promise<void> = ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T>{
  const transient=new Set(['SQLITE_BUSY','FETCH_FAILED','ECONNRESET','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
  for(let attempt=0;;attempt++){
    try{return await write();}catch(error){
      if(attempt>=2||!transient.has(syncErrorCode(error)))throw error;
      // The same atomic upserts and timestamp are idempotent even if a network
      // disconnect loses the commit acknowledgement. Never retry part of a feed.
      await wait(1000*(attempt+1));
    }
  }
}

export class EpgSyncError extends Error {
  constructor(readonly code: string, readonly stage: string, readonly snapshotBytes=0, readonly programCount=0) { super(code); this.name = 'EpgSyncError'; }
}
