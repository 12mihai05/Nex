import {randomUUID} from 'node:crypto';
import type {ChatBlock,ContentItem} from '../domain/types.js';
import type {UserRepository} from '../repositories/user-repository.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {AiService} from './ai.js';
import type {EpgService} from './epg/service.js';
import {looksLikeAction,type ChatActionPlan,type TitleChange} from './chat-action-types.js';
import {countryTimezones} from './country-context.js';

export const normalizedTitle=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const text=(content:string):ChatBlock[]=>[{type:'text',content}];
const changed=(c:TitleChange)=>c.watchlist!=='keep'||c.seen!=='keep'||c.rating!=='keep';
export function changeDescription(c:TitleChange){return [c.watchlist==='add'?'add to Want to see':c.watchlist==='remove'?'remove from Want to see':null,
  c.seen==='seen'?'mark Seen':c.seen==='unseen'?'remove Seen mark':null,c.rating==='keep'?null:c.rating==='clear'?'clear rating':`rate ${c.rating.replace('_',' ')}`].filter(Boolean).join('; ');}
export class ChatActions {
  constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService,private epg:EpgService){}

  async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]|null>{
    const confirmation=message.match(/^(confirm|cancel) changes(?: ([a-f0-9-]{36}))?$/i);
    if(confirmation){
      try{return await this.users.commitChatPlan(userId,sessionId,confirmation[2],confirmation[1]!.toLowerCase()==='cancel');}
      catch{return text('I couldn’t confirm that this request completed. The proposal may have expired, the TV listing changed, or the connection failed. Check your library or reminders before sending a new request. Retrying the same confirmation will not duplicate the batch.');}
    }
    if(!looksLikeAction(message))return null;
    const context=await this.users.getSessionContext(userId,sessionId);
    // Never leave an old action armed after a new action request.
    if(context.chatPlan){delete context.chatPlan;await this.users.setSessionContext(userId,sessionId,context);}
    const {profile}=await this.users.getSettings(userId);
    const displayed=await this.users.recentDisplayedItems(userId,sessionId);
    let intent;
    try{intent=await this.ai.parseActions(message,{country:profile.country,timezone:profile.timezone,
      today:new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
      displayed:displayed.map(r=>({position:r.position,type:r.contentType,...JSON.parse(r.metadataJson??'{}')}))});}
    catch{return text('I couldn’t safely read that action request. Nothing was changed. Please try again; the library and TV reminder buttons still work.');}
    if(intent.kind==='none')return null;
    if(intent.unresolved.length||intent.requestedCount>50||intent.entries.length>50)
      return text(`Nothing changed. ${intent.requestedCount>50?'Please split the request into groups of at most 50 titles.':intent.unresolved.join('\n')}`);
    const plan:ChatActionPlan={id:randomUUID(),expiresAt:Date.now()+15*60_000,country:profile.country,timezone:profile.timezone,entries:[],summary:''};
    if(intent.kind==='library'){
      if(!intent.entries.length||intent.entries.length!==intent.requestedCount||intent.reminder)return text('Nothing changed: I couldn’t account for every requested title. Please use one title per line, with its year where possible.');
      // Independently check an explicitly declared line inventory, not just the model's count.
      const inventory=message.match(/one title per line\s*:\s*\n([\s\S]+)/i);
      if(inventory){
        const lines=inventory[1]!.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        const remaining=[...intent.entries];
        for(const line of lines){
          const index=remaining.findIndex(e=>normalizedTitle(line).includes(normalizedTitle(e.title))&&Boolean(e.title));
          if(index<0)return text('Nothing changed: at least one line was missing from the interpreted list. Please resend the list in smaller groups.');
          remaining.splice(index,1);
        }
        if(remaining.length)return text('Nothing changed: the interpreted title count does not match your list. Please resend it in smaller groups.');
      }
      const failures:string[]=[];
      // Resolve all entries before creating any proposal; bounded concurrency, never slice the input.
      for(let start=0;start<intent.entries.length;start+=4){
        const results=await Promise.all(intent.entries.slice(start,start+4).map(async change=>{
          if(!changed(change))return {error:`${change.sourceText}: no explicit change understood`};
          let item:ContentItem|null=null;
          if(change.position!==null){
            const ref=displayed.find(r=>r.position===change.position);
            if(ref&&(ref.contentType==='movie'||ref.contentType==='series'))item=await this.catalog.getTitle(ref.contentType,Number(ref.externalId),profile.country);
          }else if(change.tmdbId!==null){
            if(!new RegExp(`\\btmdb\\s*(?:id)?\\s*[:#]?\\s*${change.tmdbId}\\b`,'i').test(change.sourceText)||!normalizedTitle(message).includes(normalizedTitle(change.sourceText)))return {error:`${change.sourceText}: TMDB ID was not explicitly provided in your message`};
            if(change.mediaType==='any')return {error:`${change.sourceText}: specify movie or series with the TMDB ID`};
            item=await this.catalog.getTitle(change.mediaType,change.tmdbId,profile.country);
            if(item&&((change.year!==null&&item.year!==change.year)||![item.title,item.originalTitle??''].some(t=>normalizedTitle(t)===normalizedTitle(change.title))))return {error:`${change.sourceText}: the TMDB ID does not match that title/year`};
          }else{
            if(!change.title||!normalizedTitle(message).includes(normalizedTitle(change.title)))return {error:`${change.sourceText}: title not grounded in your message`};
            const found=await this.catalog.search({query:change.title,region:profile.country,summaryOnly:true});
            const matches=[...new Map(found.filter(i=>(normalizedTitle(i.title)===normalizedTitle(change.title)||normalizedTitle(i.originalTitle??'')===normalizedTitle(change.title))&&
              (change.year===null||i.year===change.year)&&(change.mediaType==='any'||i.mediaType===change.mediaType)).map(i=>[`${i.mediaType}:${i.id}`,i])).values()];
            if(matches.length!==1)return {error:`${change.sourceText}: ${matches.length?'ambiguous — '+matches.map(i=>`${i.title} (${i.year??'unknown year'}, ${i.mediaType}, TMDB ID ${i.id})`).join(' / ')+'. Resend with the correct movie/series and TMDB ID, or use its title-detail buttons.':'no exact catalog match; include the title, year and movie/series'}`};
            item=await this.catalog.getTitle(matches[0]!.mediaType,matches[0]!.id,profile.country);
          }
          return item?{item,change}:{error:`${change.sourceText}: catalog details unavailable`};
        }).map(p=>p.catch(()=>({error:'A catalog lookup failed. Please retry the full list.'}))));
        for(const r of results){if('error'in r)failures.push(r.error!);else plan.entries.push(r);}
      }
      const unique=new Set(plan.entries.map(e=>`${e.item.mediaType}:${e.item.id}`));
      if(unique.size!==plan.entries.length)failures.push('A title occurs more than once. Combine its requested changes on one line so conflicting instructions are not guessed.');
      if(failures.length)return text(`Nothing changed. Please resolve these entries and resend the full list:\n${failures.join('\n')}`);
      plan.summary=plan.entries.map((e,i)=>`${i+1}. ${e.item.title} (${e.item.year??'year unknown'}, ${e.item.mediaType}): ${changeDescription(e.change)}`).join('\n');
    }else{
      const r=intent.reminder;
      if(!r||intent.entries.length)return text('Nothing changed. Please request one TV reminder separately, including channel, day and advance minutes.');
      const country=r.country??profile.country,timezone=r.country?countryTimezones[country]:profile.timezone;
      if(!timezone)return text('No reminder saved: that country’s TV timezone is not configured.');
      plan.country=country;plan.timezone=timezone;
      let programs;
      try{programs=await this.epg.reminderCandidates(country,r.date,timezone);}catch{return text('No reminder saved: I could not load the requested TV day.');}
      const ref=r.position===null?undefined:displayed.find(p=>p.position===r.position&&p.contentType==='liveEvent');
      const matches=programs.filter(p=>ref?p.id===ref.externalId:
        Boolean(r.title&&r.channel)&&normalizedTitle(p.title)===normalizedTitle(r.title)&&normalizedTitle(p.channelName)===normalizedTitle(r.channel));
      const localTime=(p:typeof matches[number])=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(p.startAt);
      const exact=r.localTime?matches.filter(p=>localTime(p)===r.localTime):[];
      const timed=exact.length?exact:matches.filter(p=>{
        if(!r.localTime)return true;
        const actual=localTime(p);
        const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
        return Math.abs(minutes(actual)-minutes(r.localTime))<=60;
      });
      if(timed.length!==1)return text(`No reminder saved. ${timed.length?'More than one matching broadcast exists; specify the exact channel and start time.':'I could not verify that title/channel/day in the EPG. Check the TV guide or provide the exact listing title.'}`);
      const p=timed[0]!;
      if(+p.startAt-r.offsetMinutes*60000<=Date.now())return text('No reminder saved: that advance reminder time has already passed.');
      plan.reminder={id:p.id,title:p.title,channelName:p.channelName,startAt:p.startAt.toISOString(),offsetMinutes:r.offsetMinutes};
      plan.summary=`${p.title} on ${p.channelName} (${country})\nEPG start: ${new Intl.DateTimeFormat('en-GB',{timeZone:timezone,dateStyle:'full',timeStyle:'short'}).format(p.startAt)} (${timezone})\nRemind ${r.offsetMinutes} minutes before. The EPG start time, not your approximate time, will be used.`;
    }
    await this.users.setSessionContext(userId,sessionId,{...context,chatPlan:plan});
    return [...text(`Review before saving — ${plan.reminder?'1 reminder':`${plan.entries.length} titles`}. Nothing changed yet.\n\n${plan.summary}\n\nCheck that every requested title and change is listed. Unlisted flags stay unchanged.`),
      ...(!plan.reminder?[{type:'library_changes' as const,status:'preview' as const,items:plan.entries.map(({item,change})=>({id:item.id,mediaType:item.mediaType,title:item.title,year:item.year,posterUrl:item.posterUrl,changes:changeDescription(change).split('; ')}))}]:[]),
      {type:'quick_actions',actions:[`Confirm changes ${plan.id}`,`Cancel changes ${plan.id}`]}];
  }
}
