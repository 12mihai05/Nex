import type { ContentItem } from "../domain/types.js";

// Conservative vocabulary normalization, not an assertion about plot or age safety.
// A genre supports only a broad hint; unknown nuanced traits remain unknown.
export function canonicalTrait(value:string):string {
  const key=value.toLowerCase().trim();
  return ({"sci-fi":"science fiction",scifi:"science fiction",mysteries:"mystery",musicals:"musical",humorous:"funny",comedic:"funny",uplifting:"feel-good","mind-bending":"cerebral",gory:"gore","nature documentary":"nature",wildlife:"nature"} as Record<string,string>)[key]??key;
}
export function contentTraits(item:ContentItem):Set<string> {
  const keys=new Set([...item.moods,...item.keywords,...item.genres].map(canonicalTrait));
  if(keys.has("comedy")) keys.add("funny");
  if(keys.has("thriller")) keys.add("tense");
  if(keys.has("psychological thriller")||keys.has("time paradox")||keys.has("philosophy")) keys.add("cerebral");
  if(keys.has("feel-good")||keys.has("heartwarming")) {keys.add("light");keys.add("feel-good");}
  if(keys.has("gore")||keys.has("splatter")||keys.has("extreme violence")) keys.add("gore");
  return keys;
}
