import {randomUUID} from 'node:crypto';
import type {UserRepository} from '../repositories/user-repository.js';
import type {AiService} from './ai.js';
import type {TasteSignal,ChatBlock} from '../domain/types.js';
import {tasteEditSchema} from './chat-capability-plans.js';
export type TasteEditPlan={id:string;expiresAt:number;snapshot:string;targets:Array<{dimension:string;key:string}>;replacements:TasteSignal[];summary:string};
export class ChatTasteEdit {
 constructor(private users:UserRepository,private ai:AiService){}
 async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]>{
  const snapshot=await this.users.tasteSnapshot(userId);
  const [taste,context,history]=await Promise.all([this.users.getTaste(userId),this.users.getSessionContext(userId,sessionId),this.users.recentConversationMessages(userId,sessionId)]);
  if(await this.users.tasteSnapshot(userId)!==snapshot)throw new Error('TASTE_EDIT_STALE');
  delete context.chatPlan;delete context.tasteEditPlan;await this.users.setSessionContext(userId,sessionId,context);
  if(!taste.length)return [{type:'text',content:'There are no saved Taste preferences to remove or correct. Your title ratings and library are separate.'}];
  if(taste.length>500)return [{type:'text',content:'Your Taste is too large to safely review all at once in chat. Please find and edit that preference in Profile > Your Taste. Nothing changed.'}];
  const rows=taste.map((s,i)=>({id:String(i),dimension:s.dimension,key:s.key,meaning:s.meaning,score:s.score,conditions:s.conditions,excluded:s.exclude}));
  const plan=await this.ai.structured(tasteEditSchema,'taste_edit','Interpret only a requested correction/removal of existing saved Taste. Select exact target IDs from rows. For a correction, replacement is the explicit corrected preference stated by the user, with its conditions/exceptions, not an inferred opposite. For deletion replacement=null. Never select all merely because the user is unhappy; require a clear reset request. A preview supports at most 30 targets: if the request needs more, clarify that they must use Profile > Your Taste or narrow the request; never silently select only part of a requested reset. Questions/hypotheticals/ambiguous targets return clarification, no targets. Preserve unrelated rows. This only edits derived Taste, not underlying movie ratings/history; do not promise otherwise.',{message,history,rows});
  if(plan.clarification||!plan.targets.length)return [{type:'text',content:plan.clarification??'Which saved preference would you like to change? Nothing changed.'}];
  if(plan.targets.some(i=>!rows.some(r=>r.id===i)))throw new Error('INVALID_TASTE_TARGET');
  const selected=[...new Set(plan.targets)].map(i=>taste[Number(i)]!);let replacements:TasteSignal[]=[];
  if(plan.replacement){
   const extracted=await this.ai.extractTaste(plan.replacement,[],plan.replacement,true);
   if(extracted.clarification)return [{type:'text',content:extracted.clarification+' Nothing changed.'}];
   replacements=extracted.signals.filter(s=>s.confidence>=.75).map(s=>({...s,source:'chat_explicit'}));
   if(!replacements.length)return [{type:'text',content:'I couldn’t interpret the corrected preference safely. Please restate it. Nothing changed.'}];
   // Replacing a different existing row would delete evidence not in the preview.
   if(replacements.some(r=>taste.some(t=>t.dimension===r.dimension&&t.key===r.key&&!selected.includes(t))))return [{type:'text',content:'That correction overlaps another saved preference. Please edit those entries in Your Taste so the unrelated evidence stays intact.'}];
  }
  const describe=(s:TasteSignal)=>`${s.exclude?'Exclude':s.score<0?'Dislike':'Like'}: ${s.meaning??s.key}${s.conditions?.length?` (${s.conditions.map(c=>`${c.dimension}: ${c.values.join(', ')}${c.match==='only'?' only; mixed co-productions allowed':''}`).join('; ')})`:''}`;
  const summary=`Remove:\n${selected.map(describe).join('\n')}${replacements.length?`\n\nReplace with:\n${replacements.map(describe).join('\n')}`:''}\n\nYour ratings, Seen history and watchlist stay unchanged. New recommendations will use the updated Taste; refresh Home when ready.`;
  const stored:TasteEditPlan={id:randomUUID(),expiresAt:Date.now()+15*60000,snapshot,targets:selected.map(s=>({dimension:s.dimension,key:s.key})),replacements,summary};
  await this.users.setSessionContext(userId,sessionId,{...context,chatPlan:undefined,tasteEditPlan:stored});
  return [{type:'text',content:summary+'\n\nConfirm this change?'},{type:'quick_actions',actions:[`Confirm changes ${stored.id}`,`Cancel changes ${stored.id}`]}];
 }
}
