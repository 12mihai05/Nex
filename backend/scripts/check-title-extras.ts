import "../src/env.js";
import {createTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {closeDatabase} from "../src/db/client.js";
const catalog=createTmdbRepository();
try{
  if(!catalog.extras||!catalog.season)throw Error("Live TMDB required");
  const movie=await catalog.extras("movie",27205);
  const series=await catalog.extras("series",1396);
  const season=await catalog.season(1396,1);
  const start=Date.now();await catalog.season(1396,1);
  console.log(JSON.stringify({movieTrailers:movie.videos.length,seriesTrailers:series.videos.length,seasons:series.seasons.length,seasonTrailers:season.videos.length,episodes:season.episodes.length,cachedSeasonMs:Date.now()-start,validLinks:[...movie.videos,...series.videos,...season.videos].every(v=>v.url.startsWith("https://www.youtube.com/watch?v="))}));
  if(!movie.videos.length||!series.seasons.length||!season.episodes.length)process.exitCode=1;
}catch{console.log("Live title extras check failed; sensitive details suppressed.");process.exitCode=1;}
finally{await closeDatabase();}
