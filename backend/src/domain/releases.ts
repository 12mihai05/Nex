import { z } from 'zod';

// Release dates are calendar dates, not midnight instants to shift by timezone.
export function releaseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function calendarDay(now = new Date(), timezone = 'Europe/Bucharest'): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export type Release = {key:string; kind:'cinema'|'digital'|'season'; date:string|null; season:number|null; country:string|null;source?:'cinema_listing';sourceUrl?:string;alertEligible?:boolean};
export type ReleaseInfo = {title:string; releases:Release[];cinema?:import('./cinema.js').CinemaInfo};
const movieDates = z.object({results:z.array(z.object({iso_3166_1:z.string(),release_dates:z.array(z.object({type:z.number(),release_date:z.string()}))})).default([])});
export function movieReleases(raw:unknown,country:string):Release[] {
  const parsed=movieDates.parse(raw);
  const rows=parsed.results.find(r=>r.iso_3166_1===country)?.release_dates??[];
  return (['cinema','digital'] as const).flatMap(kind=>{
    const dates=rows.filter(r=>kind==='cinema'?[2,3].includes(r.type):r.type===4).map(r=>releaseDate(r.release_date)).filter((d):d is string=>!!d).sort();
    return dates[0]?[{key:`${kind}:${country}`,kind,date:dates[0],season:null,country}]:[];
  });
}
export function seriesReleases(raw:unknown):Release[] {
  const parsed=z.object({seasons:z.array(z.object({season_number:z.number().int().nonnegative(),air_date:z.string().nullable().optional()})).default([])}).parse(raw);
  return parsed.seasons.filter(s=>s.season_number>0).map(s=>({key:`season:${s.season_number}`,kind:'season',date:releaseDate(s.air_date),season:s.season_number,country:null}));
}
