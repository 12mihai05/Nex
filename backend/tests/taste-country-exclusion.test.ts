import {it,expect} from 'vitest';
import {scoreCandidate} from '../src/services/recommendation.js';
import {conditionApplies} from '../src/services/semantic-taste.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {filterQuerySchema,type TasteSignal} from '../src/domain/types.js';
it('explicit regional exclusion respects exceptions, international co-productions, missing metadata and exact lookups',()=>{
 const signal:TasteSignal={dimension:'combination',key:'Asian productions except Russia',score:-1,confidence:.9,evidenceCount:1,source:'chat_explicit',exclude:true,statement:'Exclude Asian movies but not Russian ones; keep international co-productions.',conditions:[{dimension:'country',values:['JP','KR','CN','IN','NP','SG'],match:'only'},{dimension:'format',values:['movie','series']}]};
 const context={taste:[signal],viewerIds:['u'],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
 const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
 for(const [countries,blocked] of [[['JP'],true],[['CN','KR'],true],[['RU'],false],[['JP','US'],false],[[],false]] as const){
   const item={...fixtureCatalog[0]!,countries:[...countries]};
   expect(conditionApplies(item,signal)).toBe(blocked);
   expect(scoreCandidate(item,query,context)===null).toBe(blocked);
   expect(scoreCandidate(item,{...query,intent:'TITLE_LOOKUP'},context)).not.toBeNull();
   expect(scoreCandidate(item,query,{...context,taste:[{...signal,exclude:false}]})).not.toBeNull();
 }
});
