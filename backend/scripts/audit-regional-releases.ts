import '../src/env.js';

// Read-only provider audit. Never log headers, credentials or provider errors.
async function main() {
  const token=process.env.TMDB_READ_ACCESS_TOKEN;
  if(!token)throw new Error('TMDB_NOT_CONFIGURED');
  async function request(path:string,params:Record<string,string>={}) {
    const url=new URL(`https://api.themoviedb.org/3${path}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('TMDB_REQUEST_FAILED');
    return response.json();
  }
  for(const query of ['How to Rob a Bank','Dune: Part Three','Avengers: Doomsday']) {
    const found=await request('/search/movie',{query,include_adult:'false'});
    const item=found.results.find((r:{release_date?:string})=>r.release_date?.startsWith('2026'));
    if(!item){console.log(JSON.stringify({query,found:false}));continue;}
    const data=await request(`/movie/${item.id}`,{append_to_response:'release_dates',language:'en-US'});
    console.log(JSON.stringify({id:item.id,title:data.title,primaryDate:data.release_date,
      regionalDates:data.release_dates?.results?.filter((r:{iso_3166_1:string})=>['RO','US','GB'].includes(r.iso_3166_1))}));
  }
}
main().catch(()=>{console.error('REGIONAL_RELEASE_AUDIT_FAILED');process.exitCode=1;});
