import {localDayWindow,localClockTime} from './tv-window.js';
import {z} from 'zod';

export const tvContextSchema=z.object({country:z.string(),timezone:z.string(),programs:z.array(z.object({id:z.string(),title:z.string(),startAt:z.string()})).max(12)});
export function tvFollowup(message:string){
  const plain=words(message);
  if (/^(?:and |si )?(?:what s next|what is next|what comes next|what will be next|what follows|then what|next|ce urmeaza)(?: on tv)?$/.test(plain))return '';
  const match=plain.match(/^(?:(?:and|si) )?(?:(?:what (?:is|s|comes|will be) |what will be on |ce (?:este|e|urmeaza) )?)(?:after|dupa) (.+)$/);
  if(!match)return null;
  const title=match[1]!.replace(/ (?:what (?:will be|is|s|comes)(?: on)?(?: next)?|ce (?:urmeaza|va fi))$/,'').trim();
  return /^(that|this|it|asta|aceea)$/.test(title)?'':title;
}
export function tvReferenceMatches(title:string,reference:string){return words(title)===words(reference);}

const words=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function requestedTvScope(message:string,channels:Array<{id:string;name:string}>,timezone:string,now=new Date()){
  const plain=words(message);
  const matches=channels.filter(c=>{
    const key=words(c.name).replace(/\s+(?:hd|sd|fhd|uhd)$/,'');
    return key.length>=3&&new RegExp(`(?:^| )${key.replaceAll(' ',' *')}(?: |$)`).test(plain);
  });
  const time=message.match(/\b(?:at|around|la(?: ora)?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const isTv=matches.length>0||/\b(tv|television|channel|broadcast|canal|televizor)\b/i.test(message)||
    Boolean(time&&/\b(?:on|pe)\s+[\w]/i.test(message)&&/\b(today|tomorrow|tonight|azi|maine)\b/.test(plain));
  if(!isTv)return null;
  if(!time&&/\b(at|around|between|after|before|la ora|intre)\b/i.test(message))return {error:'Please give the TV time numerically, such as 8pm or 20:00, so I can check the exact broadcast.'};
  if(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|yesterday)\b/i.test(message)&&!message.match(/\b\d{4}-\d{2}-\d{2}\b/))return {error:'Please give the TV date as YYYY-MM-DD, today or tomorrow. I haven’t substituted today’s schedule.'};
  if(!matches.length&&/\b(?:on|pe)\s+(?!tv\b|television\b)[\w]/i.test(message))return {error:'I couldn’t identify that channel in this country’s EPG. Please use its name from the TV guide; I won’t substitute other channels.'};
  const names=new Set(matches.map(c=>words(c.name).replace(/\s+(?:hd|sd|fhd|uhd)$/,'')));
  if(names.size>1)return {error:'More than one channel name matches. Please specify the channel as shown in the TV guide.'};
  let date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(/\b(tomorrow|maine)\b/.test(plain))date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const explicit=message.match(/\b\d{4}-\d{2}-\d{2}\b/);if(explicit)date=explicit[0];
  let day;try{day=localDayWindow(date,timezone);}catch{return {error:'Please provide a valid TV date, such as today, tomorrow or YYYY-MM-DD.'};}
  let start=day.start,end=day.end,label=date;
  if(time){
    let hour=Number(time[1]);const minute=Number(time[2]??0),suffix=time[3]?.toLowerCase();
    if(minute>59||hour>23||(suffix&&(hour<1||hour>12)))return {error:'Please use a valid time, such as 8pm or 20:00.'};
    if(!suffix&&!time[2]&&hour>=1&&hour<=12)return {error:`Do you mean ${hour}am or ${hour}pm? I haven’t chosen a time.`};
    if(suffix)hour=hour%12+(suffix==='pm'?12:0);
    start=localClockTime(date,hour,minute,timezone);end=new Date(+start+1);
    label=`${date} at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} (${timezone})`;
  }else if(/\b(now|live|acum)\b/.test(plain)){start=now;end=new Date(+now+1);label='now';}
  else if(/\b(tonight|diseara)\b/.test(plain)){start=localClockTime(date,18,0,timezone);label=`tonight (${date})`;}
  return {channelIds:matches.map(c=>c.id),channelName:matches[0]?.name,start,end,label};
}
