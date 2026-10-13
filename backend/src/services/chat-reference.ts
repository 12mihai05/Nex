import type {AiService} from './ai.js';
import {referencePlanSchema} from './chat-capability-plans.js';
import {resolveEntity,type Entity} from '../domain/entities.js';
export async function chatReference(ai:AiService,message:string,candidates:Entity[],history:unknown){
 const unique=[...new Map(candidates.map(e=>[`${e.type}:${e.id}`,e])).values()];
 const exact=resolveEntity(message,unique);if(exact)return {entity:exact,choices:[] as string[]};
 if(ai.mode==='live'&&unique.length){
  const plan=await ai.structured(referencePlanSchema,'entity_reference','Resolve the entity the user refers to using the current request and recent conversation. index is zero-based into candidates. Never select a movie when this actor is requested or a broadcast when this channel is requested. A channel associated with a broadcast can be supplied separately. If the referent is ambiguous, index=null and ask a brief specific question. New named subjects not in candidates must return index=null.',{message,history,candidates:unique});
  if(plan.index!==null&&unique[plan.index]&&!plan.clarification)return {entity:unique[plan.index]!,choices:[] as string[]};
 }
 return {entity:null,choices:unique.slice(0,5).map(e=>e.title)};
}
