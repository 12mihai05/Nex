import {createHash} from 'node:crypto';
import {eq,lt} from 'drizzle-orm';
import {z} from 'zod';
import {getDatabase} from '../db/client.js';
import {userTasteSummaries} from '../db/schema.js';
import {UserRepository} from '../repositories/user-repository.js';
import {AiService} from './ai.js';

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
        'Write a grounded 50-85 word paragraph addressed to the viewer as you, describing their movie and series taste. Plain natural English, no headings, no em dashes, no flattery or personality diagnosis. Connect their strongest story, mood and genre preferences rather than listing tags. Include major dislikes gently. Explicit stated preferences take precedence; learned patterns are tentative. A negative score means dislike, never like. Respect conditions: disliking a country/genre combination is NOT disliking every title from that country. Never infer unseen preferences, specific favourite titles, ethnicity or identity. This is a representative summary of strongest signals, not an exhaustive profile. Do not mention algorithms or scores.',selected);
      await this.db.update(userTasteSummaries).set({paragraph:result.paragraph,fingerprint,updatedAt:now}).where(eq(userTasteSummaries.userId,userId));
      return this.read(userId);
    } catch {
      await this.db.update(userTasteSummaries).set({attemptedAt:new Date(+now-day+5*60000)}).where(eq(userTasteSummaries.userId,userId));
      throw new Error('TASTE_SUMMARY_UNAVAILABLE');
    }
  }
}
