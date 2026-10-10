// Drizzle messages can contain SQL parameters. Only allow known public codes.
export function syncErrorCode(error: unknown): string {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    const value = current as {code?:unknown;message?:unknown;cause?:unknown};
    const known = ['SQLITE_BUSY','SQLITE_CONSTRAINT','SQLITE_TOOBIG','SQLITE_FULL','SQLITE_IOERR','SQLITE_INTERRUPT','TRANSACTION_TIMEOUT','TRANSACTION_CLOSED','STREAM_EXPIRED','SERVER_ERROR','HRANA_PROTO_ERROR','FETCH_FAILED'];
    if (typeof value.code === 'string' && known.includes(value.code)) return value.code;
    if (typeof value.message === 'string' && /^EPG_[A-Z_]+$/.test(value.message)) return value.message;
    current = value.cause;
  }
  return 'SYNC_FAILED';
}

export class EpgSyncError extends Error {
  constructor(readonly code: string, readonly stage: string) { super(code); this.name = 'EpgSyncError'; }
}
