export interface TvRankable {id:string;startAt:Date;endAt:Date;favorite:boolean;channel:{name:string}}
export function tvBucket(item:TvRankable,now:Date):number {
  if(item.startAt<=now)return 0;
  const minutes=(+item.startAt-+now)/60_000;
  return minutes<30?1:minutes<60?2:3;
}
export function rankTv<T extends TvRankable>(items:T[],now:Date):T[]{
  return [...items].sort((a,b)=>tvBucket(a,now)-tvBucket(b,now)||Number(b.favorite)-Number(a.favorite)||+a.startAt-+b.startAt||a.channel.name.localeCompare(b.channel.name)||a.id.localeCompare(b.id));
}
export function tvPreview<T extends TvRankable>(items:T[],limit=6):T[]{
  const others=items.filter(i=>!i.favorite).slice(0,Math.ceil(limit/3));
  const selected=new Set(others.map(i=>i.id));
  for(const item of items)if(selected.size<limit)selected.add(item.id);
  return items.filter(i=>selected.has(i.id));
}
