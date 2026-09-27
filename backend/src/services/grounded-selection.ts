import type {ContentItem} from "../domain/types.js";
import {titleKey} from "./recommendation.js";

export function validateGroundedSelection(items:ContentItem[],selections:Array<{key:string;evidence:string}>):string[]{
  const allowed=new Map(items.map(i=>[titleKey(i),i]));
  const selected=new Set<string>();
  for(const selection of selections){
    const item=allowed.get(selection.key);
    if(!item||selection.evidence.trim().length<4)throw new Error("UNGROUNDED_SELECTION");
    const source=[item.overview.slice(0,600),...item.keywords.slice(0,40)].join("\n").toLowerCase();
    if(!source.includes(selection.evidence.toLowerCase().trim()))throw new Error("UNGROUNDED_SELECTION");
    selected.add(selection.key);
  }
  // The model can narrow, never invent or reorder the deterministic ranking.
  return items.filter(i=>selected.has(titleKey(i))).map(titleKey);
}
