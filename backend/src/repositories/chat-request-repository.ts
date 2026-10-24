import {createHash} from 'node:crypto';
import {and,eq,lt} from 'drizzle-orm';
import {getDatabase,type NexDatabase} from '../db/client.js';
import {chatRequests} from '../db/schema.js';
import type {ChatBlock} from '../domain/types.js';
export type ChatResponse={sessionId:string;blocks:ChatBlock[]};
/** Idempotent delivery, NOT an answer cache: only the same request UUID replays. */
export class ChatRequestRepository {
 constructor(private db:NexDatabase=getDatabase()){}
 async claim(userId:string,requestId:string,message:string,sessionId?:string,now=new Date()):Promise<{status:'claimed'}|{status:'completed';response:ChatResponse}|{status:'busy'|'interrupted'|'conflict'}>{
  const hash=createHash('sha256').update(JSON.stringify([message,sessionId??null])).digest('hex');
  try{return await this.db.transaction(async tx=>{
   // No automatic replay of a turn whose process died after a possible write.
   await tx.update(chatRequests).set({status:'interrupted',updatedAt:now}).where(and(eq(chatRequests.userId,userId),eq(chatRequests.status,'running'),lt(chatRequests.updatedAt,new Date(+now-10*60_000))));
   const prior=(await tx.select().from(chatRequests).where(and(eq(chatRequests.userId,userId),eq(chatRequests.requestId,requestId))).limit(1))[0];
   if(prior){if(prior.payloadHash!==hash)return {status:'conflict' as const};if(prior.status==='completed'&&prior.responseJson)return {status:'completed' as const,response:JSON.parse(prior.responseJson) as ChatResponse};return {status:prior.status==='running'?'busy' as const:'interrupted' as const};}
   const active=(await tx.select({id:chatRequests.requestId}).from(chatRequests).where(and(eq(chatRequests.userId,userId),eq(chatRequests.status,'running'))).limit(1))[0];
   if(active)return {status:'busy' as const};
   await tx.insert(chatRequests).values({userId,requestId,payloadHash:hash,status:'running',createdAt:now,updatedAt:now});return {status:'claimed' as const};
  });}catch(error){
   // A concurrent transaction must not become an unguarded second turn.
   // Local single-connection clients and remote SQLite writers report different
   // contention codes. Return a retryable HTTP conflict; do not replay work.
   let cause:unknown=error;
   for(let depth=0;depth<4&&cause&&typeof cause==='object';depth++){
    const failure=cause as {code?:string;cause?:unknown};
    if(['TRANSACTION_ACTIVE','SQLITE_BUSY','SQLITE_BUSY_SNAPSHOT','SQLITE_LOCKED','SQLITE_CONSTRAINT_UNIQUE','SQLITE_CONSTRAINT_PRIMARYKEY'].includes(failure.code??''))return {status:'busy'};
    cause=failure.cause;
   }
   throw error;
  }
 }
 async complete(userId:string,requestId:string,response:ChatResponse){await this.db.update(chatRequests).set({status:'completed',responseJson:JSON.stringify(response),updatedAt:new Date()}).where(and(eq(chatRequests.userId,userId),eq(chatRequests.requestId,requestId),eq(chatRequests.status,'running')));}
 async interrupt(userId:string,requestId:string){await this.db.update(chatRequests).set({status:'interrupted',updatedAt:new Date()}).where(and(eq(chatRequests.userId,userId),eq(chatRequests.requestId,requestId),eq(chatRequests.status,'running')));}
}
