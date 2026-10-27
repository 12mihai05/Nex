import {assertSourceUrl,enrichCinemaCity,parseCinemaSnapshot,type CinemaChain,type CinemaEntry} from '../domain/cinema.js';

export async function fetchCinemaText(url:string,accept='application/json'):Promise<string>{
  const response=await fetch(url,{headers:{Accept:accept,'User-Agent':'NexCinemaInfo/1.0'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`CINEMA_HTTP_${response.status}`);
  if(accept==='application/json'&&!response.headers.get('content-type')?.includes('json'))throw new Error('CINEMA_NOT_JSON');
  const max=2_000_000;
  if(Number(response.headers.get('content-length')??0)>max)throw new Error('CINEMA_RESPONSE_TOO_LARGE');
  const reader=response.body?.getReader();if(!reader)throw new Error('CINEMA_EMPTY_BODY');
  const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('CINEMA_RESPONSE_TOO_LARGE');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(parts).toString('utf8');
}

export async function fetchCinemaSnapshot(chain:CinemaChain){
  const urls=chain==='cinema_city'
    ?['https://www.cinemacity.ro/ro/data-api-service/v1/feed/10107/byName/now-playing?lang=ro_RO','https://www.cinemacity.ro/ro/data-api-service/v1/feed/10107/byName/coming-soon?lang=ro_RO']
    :['https://app.cineplexx.ro/api/v2/movies?location=all','https://app.cineplexx.ro/api/v2/movies/coming-soon?location=all'];
  // Two list requests per host; a partial chain snapshot is never published.
  const [current,upcoming]=await Promise.all(urls.map(async url=>JSON.parse(await fetchCinemaText(url)) as unknown));
  return parseCinemaSnapshot(chain,current,upcoming);
}
export async function cinemaCityIdentity(entry:CinemaEntry){
  return enrichCinemaCity(entry,await fetchCinemaText(assertSourceUrl(entry.url,'cinema_city'),'text/html'));
}
