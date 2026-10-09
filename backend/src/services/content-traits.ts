import type { ContentItem } from "../domain/types.js";

// TMDB groups some TV genres that are separate for movies. Match the shared
// bucket without relabelling the actual title's metadata.
export function matchesGenre(requested:string,actual:string):boolean {
  const q=canonicalTrait(requested),a=canonicalTrait(actual);
  return q===a || (a==='action & adventure'&&['action','adventure'].includes(q)) ||
    (a==='sci-fi & fantasy'&&['science fiction','fantasy'].includes(q)) ||
    (a==='war & politics'&&['war','politics'].includes(q));
}

// Conservative vocabulary normalization, not an assertion about plot or age safety.
// A genre supports only a broad hint; unknown nuanced traits remain unknown.
export function canonicalTrait(value:string):string {
  const key=value.toLowerCase().trim();
  if(key==='kpop'||key==='k pop')return 'k-pop';
  return ({"sci-fi":"science fiction",scifi:"science fiction",mysteries:"mystery",musicals:"musical",humorous:"funny",comedic:"funny",uplifting:"feel-good","mind-bending":"cerebral",gory:"gore","nature documentary":"nature",wildlife:"nature"} as Record<string,string>)[key]??key;
}
// Interpret legacy country names without rewriting the user's stored preferences.
export function canonicalDimensionTrait(dimension:string,value:string):string {
 const key=canonicalTrait(value);
 if(dimension!=='country')return key;
 return ({china:'cn',chinese:'cn',japan:'jp',japanese:'jp',korea:'kr','south korea':'kr',korean:'kr',france:'fr',french:'fr'} as Record<string,string>)[key]??key;
}
export function contentTraits(item:ContentItem):Set<string> {
  const keys=new Set([...item.moods,...item.keywords,...item.genres].map(canonicalTrait));
  if(keys.has("comedy")) keys.add("funny");
  if(keys.has("thriller")) keys.add("tense");
  if(keys.has("psychological thriller")||keys.has("time paradox")||keys.has("philosophy")) keys.add("cerebral");
  if(keys.has("feel-good")||keys.has("heartwarming")) {keys.add("light");keys.add("feel-good");}
  const supported: Record<string,string[]> = {
    cozy:["cozy","cosy"], emotional:["emotional","tearjerker"], intense:["intense"],
    weird:["weird","surrealism","surreal"], "fast-paced":["fast-paced","fast paced"],
    "slow-burn":["slow-burn","slow burn"], hopeful:["hopeful","hope","optimism"],
    bittersweet:["bittersweet"], romantic:["romantic","romance"],
    suspenseful:["suspenseful","suspense"], playful:["playful"], dark:["dark","dark comedy"],
  };
  for(const [trait,tags] of Object.entries(supported)) if(tags.some(t=>keys.has(t))) keys.add(trait);
  if(keys.has("gore")||keys.has("splatter")||keys.has("extreme violence")) keys.add("gore");
  return keys;
}
