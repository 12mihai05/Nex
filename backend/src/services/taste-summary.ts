import {createHash} from 'node:crypto';
import {eq,lt} from 'drizzle-orm';
import {z} from 'zod';
import {getDatabase} from '../db/client.js';
import {userTasteSummaries} from '../db/schema.js';
import {UserRepository} from '../repositories/user-repository.js';
import {AiService} from './ai.js';

export const tastePortraitInstructions='Write a grounded paragraph addressed to the viewer as you about their movie and series taste. Use 20-40 words for sparse evidence, up to 85 only for rich evidence. Plain natural English, no headings, no em dashes, no flattery or personality diagnosis. Connect the SUPPLIED preferences rather than listing tags. Every claimed preference must be directly supported; do not embellish genres with stereotypical themes, pacing, aesthetics or contrasts. Thoughtful does not imply slow-burning or quiet. Science fiction does not imply disliking spectacle or preferring ethical dilemmas. Disliking horror does not mean disliking all violence or thrills. Never add these distinctions without a supplied signal. Include major dislikes gently. Explicit stated preferences take precedence; learned patterns are tentative. Negative scores mean dislike, never like. Preserve conditions and exceptions: a country/genre combination is NOT every title from that country. Never invent favourite titles, ethnicity or identity. Do not append a disclaimer, recommendation, or statement about algorithms or scores. When evidence is sparse, keep it short instead of filling gaps.'+' Describe ordinary dislikes as preferences, not blocking rules. Only say excluded/blocked if exclude=true. For a country condition with match=only, explicitly preserve the exception that co-productions with other countries remain open; do not paraphrase it as all content from those countries.';
const day=86400000;
export class TasteSummary {
  constructor(private db=getDatabase(),private users=new UserRepository(db),private ai=new AiService()){}
  async read(userId:string){
    const [row]=await this.db.select().from(userTasteSummaries).where(eq(userTasteSummaries.userId,userId));
    return {paragraph:row?.paragraph??null,updatedAt:row?.updatedAt?.toISOString()??null,nextRefreshAt:row?new Date(+row.attemptedAt+day).toISOString():null};
  }
  async generate(userId:string,now=new Date()){
    const taste=await this.users.getTaste(userId);
    if(!taste.length)return {paragraph:null,updatedAt:null,nextRefreshAt:null};
    const ordered=[...taste].sort((a,b)=>Math.abs(b.score)*b.confidence-Math.abs(a.score)*a.confidence);
    const selected=[...ordered.filter(e=>e.score>0).slice(0,30),...ordered.filter(e=>e.score<0).slice(0,30)].map(e=>({dimension:e.dimension,key:e.key,score:Math.round(e.score*10)/10,confidence:Math.round(e.confidence*10)/10,source:e.source,meaning:e.meaning,conditions:e.conditions,exclude:e.exclude}));
    if(!selected.length)return {paragraph:'You have not set any likes or dislikes yet. Neutral preferences leave those choices open.',updatedAt:null,nextRefreshAt:null};
    const fingerprint=createHash('sha256').update(JSON.stringify(selected)).digest('hex');
    const [old]=await this.db.select().from(userTasteSummaries).where(eq(userTasteSummaries.userId,userId));
    if(old?.fingerprint===fingerprint&&old.paragraph)return this.read(userId);
    // Atomic daily lease also prevents duplicate charges across server instances.
    const lease=await this.db.insert(userTasteSummaries).values({userId,attemptedAt:now}).onConflictDoUpdate({target:userTasteSummaries.userId,set:{attemptedAt:now},setWhere:lt(userTasteSummaries.attemptedAt,new Date(+now-day))}).returning({id:userTasteSummaries.userId});
    if(!lease.length)return this.read(userId);
    try {
      const result=await this.ai.structured(z.object({paragraph:z.string().min(20).max(900)}),'taste_portrait',
        tastePortraitInstructions,selected);
      await this.db.update(userTasteSummaries).set({paragraph:result.paragraph,fingerprint,updatedAt:now}).where(eq(userTasteSummaries.userId,userId));
      return this.read(userId);
    } catch {
      await this.db.update(userTasteSummaries).set({attemptedAt:new Date(+now-day+5*60000)}).where(eq(userTasteSummaries.userId,userId));
      throw new Error('TASTE_SUMMARY_UNAVAILABLE');
    }
  }
}
