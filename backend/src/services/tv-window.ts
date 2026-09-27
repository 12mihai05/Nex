function localParts(date:Date,timezone:string) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const value=(name:string)=>Number(parts.find(p=>p.type===name)!.value);
  return {year:value("year"),month:value("month"),day:value("day"),hour:value("hour"),minute:value("minute"),second:value("second")};
}
function midnightOffset(year:number,month:number,day:number,hour:number,timezone:string) {
  const wall=Date.UTC(year,month-1,day,hour); let guess=wall;
  for(let i=0;i<3;i++) {const p=localParts(new Date(guess),timezone);guess+=wall-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
  return new Date(guess);
}
export function tvWindow(window:"live"|"tonight"|"tomorrow"|null,timezone:string,now=new Date()):{start:Date;end:Date} {
  if(window==="live") return {start:now,end:new Date(+now+1)};
  if(window===null) return {start:now,end:new Date(+now+14*3_600_000)};
  const p=localParts(now,timezone);
  if(window==="tomorrow") return {start:midnightOffset(p.year,p.month,p.day+1,0,timezone),end:midnightOffset(p.year,p.month,p.day+2,0,timezone)};
  return {start:new Date(Math.max(+now,+midnightOffset(p.year,p.month,p.day,18,timezone))),end:midnightOffset(p.year,p.month,p.day+1,0,timezone)};
}
