import type {ContentItem,TasteSignal} from '../domain/types.js';
import {canonicalTrait,canonicalDimensionTrait} from './content-traits.js';
import {conceptEvidence} from './concepts.js';
import {titleDimensions} from './taste.js';

export function tasteConditionsApply(item:ContentItem,signal:TasteSignal,known?:Set<string>):boolean {
  if(!signal.conditions?.length)return true;
  const dimensions=known??new Set(titleDimensions(item).map(d=>`${d.dimension}:${canonicalTrait(d.key)}`));
  return signal.conditions.every(c=>{
    if(c.match==='only'){
      // Unknown origin is not evidence of exclusive production in a region.
      if(c.dimension!=='country'||!item.countries?.length)return false;
      const allowed=new Set(c.values.map(v=>canonicalDimensionTrait('country',v)));
      return item.countries.every(v=>allowed.has(canonicalDimensionTrait('country',v)));
    }
    return c.values.some(v=>dimensions.has(`${c.dimension}:${canonicalDimensionTrait(c.dimension,v)}`)||(c.dimension==='keyword'&&Boolean(conceptEvidence(item,v))));
  });
}
