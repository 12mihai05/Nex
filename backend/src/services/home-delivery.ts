import type {RankedContent} from '../domain/types.js';

export function homeWindow(batch:number,first=6){
  const start=batch===0?0:first+(batch-1)*6;
  return {start,end:start+(batch===0?first:6)};
}
export function compactHomeRows<T extends {items:RankedContent[]}>(rows:T[]){
  return rows.map(row=>({...row,items:row.items.map(({item,reason})=>({reason,item:{
    id:item.id,mediaType:item.mediaType,title:item.title,originalTitle:item.originalTitle,
    overview:item.overview,posterUrl:item.posterUrl,backdropUrl:item.backdropUrl,
    year:item.year,runtimeMinutes:item.runtimeMinutes,seasonCount:item.seasonCount,rating:item.rating,
    genres:item.genres,moods:item.moods,availability:item.availability,
    releaseDate:item.releaseDate,metadataOnly:true,
  }}))}));
}
