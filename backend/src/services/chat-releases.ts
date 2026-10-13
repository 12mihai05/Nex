import type {UserRepository} from '../repositories/user-repository.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {AiService} from './ai.js';
import type {ChatBlock} from '../domain/types.js';
import {releasePlanSchema,historyForTask} from './chat-capability-plans.js';
import {calendarDay,releaseDate} from '../domain/releases.js';
import {normalizeSearch} from './search-ranking.js';
import {countryTimezones} from './country-context.js';

export class ChatReleases {
 constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService){}
 async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]>{
  const [context,recent,{profile}]=await Promise.all([this.users.getSessionContext(userId,sessionId),this.users.recentConversationMessages(userId,sessionId),this.users.getSettings(userId)]);
  const history=historyForTask(recent,message);
  let today=calendarDay(new Date(),profile.timezone);
  const plan=await this.ai.structured(releasePlanSchema,'release_request','Interpret release questions. upcoming is a list of future cinema films, title is a named film or series release/renewal/season question. Resolve title and country from recent context; otherwise use profile country. Never interpret next season as a new series premiere. continuation=true only for more/next page of the same upcoming list; retain its dates/country. news=true for announcements, renewal, cancellation, delay or requests for the latest news. Dates are local YYYY-MM-DD. No date does not mean cancelled. Clarify ambiguous references rather than inventing a title.',{message,history,focus:context.focus,previous:context.releaseBrowse,country:profile.country,today});
  if(plan.clarification)return [{type:'text',content:plan.clarification}];
  if(!(plan.country in countryTimezones))return [{type:'text',content:'Which supported country should I check for cinema dates?'}];
  today=calendarDay(new Date(),countryTimezones[plan.country]??profile.timezone);
  if(plan.mode==='upcoming'){
   const previous=context.releaseBrowse as {country:string;from:string;to:string|null;page:number;seen:number[];hasMore:boolean}|undefined;
   const same=plan.continuation&&previous&&previous.country===plan.country;
   const pending=same&&Array.isArray(context.releasePending)?context.releasePending as import('../domain/types.js').ContentItem[]:[];
   if(same&&!previous.hasMore&&!pending.length)return [{type:'text',content:'You’ve reached the end of the available releases for those dates. You can choose another month or country.'}];
   const from=same?previous.from:plan.from??today,to=same?previous.to:plan.to;
   if(!releaseDate(from)||(to&&!releaseDate(to))||(to&&to<from))return [{type:'text',content:'Please specify a valid date range for the upcoming releases.'}];
   if(!this.catalog.upcoming)return [{type:'text',content:'Upcoming release information is unavailable in demo mode.'}];
   const seen=new Set(same?previous.seen:[]),items=[];let page=same?previous.page:0,hasMore=same?previous.hasMore:true;
   // Scan a small bounded batch, preserving the cursor even for sparse pages.
   for(let n=0;!pending.length&&hasMore&&n<3;n++){
    page++;
    // The shared catalog API uses an exclusive lower bound. Include the user's
    // first requested day without changing Home's established upcoming rule.
    const lowerBound=new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const result=await this.catalog.upcoming(plan.country,lowerBound,page);hasMore=result.hasMore;
    for(const item of result.items)if(item.releaseDate&&item.releaseDate>today&&item.releaseDate>=from&&(!to||item.releaseDate<=to)&&!seen.has(item.id)){items.push(item);seen.add(item.id);}
    // TMDB sorts primary dates, not necessarily this country's release dates.
    // A page outside the range cannot prove later pages have no valid titles.
    if(items.length||!hasMore)break;
   }
   // Store unused items as a cursor buffer rather than losing half a provider page.
   const combined=[...pending,...items],shown=combined.slice(0,12),rest=combined.slice(12);
   await this.users.setSessionContext(userId,sessionId,{...context,releaseBrowse:{country:plan.country,from,to,page,seen:[...seen],hasMore},releasePending:rest});
   const countryName=new Intl.DisplayNames(['en'],{type:'region'}).of(plan.country)??plan.country;
   const intro=shown.length?`Upcoming cinema releases listed for ${countryName}. Dates can change.`:hasMore?'No matching dated releases in this batch. There are more catalog pages to check; ask for more to continue.':'No further dated cinema releases were supplied for that range. This does not rule out films that have not received a local date.';
   return [{type:'text',content:intro},...(shown.length?[{type:'movie_carousel' as const,items:shown}]:[]),...((hasMore||rest.length)?[{type:'quick_actions' as const,actions:['More upcoming releases']}]:[])];
  }
  const matches=(await this.catalog.search({query:plan.title,region:plan.country,summaryOnly:true})).filter(i=>i.mediaType===plan.mediaType&&(!plan.year||i.year===plan.year)&&[i.title,i.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(plan.title)));
  if(matches.length!==1)return [{type:'text',content:'Which title do you mean? Please include the year and whether it is a film or series.'},...(matches.length?[{type:'quick_actions' as const,actions:matches.slice(0,5).map(i=>`Release information for ${i.title} (${i.year}, ${i.mediaType})`)}]:[])];
  const item=matches[0]!;
  const [release,detail]=await Promise.all([this.catalog.releases?.(item.mediaType,item.id,plan.country),this.catalog.knowledge?.(item.mediaType,item.id)]);
  await this.users.setSessionContext(userId,sessionId,{...context,focus:{type:item.mediaType,id:String(item.id),tmdbId:item.id,title:item.title,source:'tmdb'}});
  return [await this.ai.answerKnowledge(message,{title:item.title,country:plan.country,today,release,detail,
    interpretation:'Cinema/digital dates are country-specific. Series season dates are original premiere dates, not proof of local streaming availability. Missing date is unknown, never cancellation. A next episode is not necessarily a new season. Mark TMDB dates as listed dates; official announcements take precedence when dated and cited.'},plan.news||!release?.releases.some(r=>r.date&&r.date>=today))];
 }
}
