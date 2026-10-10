import type {ContentItem} from "../domain/types.js";

// Small, inspectable vocabulary bridge. It connects wording to source text;
// it never assigns psychological traits, age suitability, or unseen plot facts.
const groups:Record<string,string[]>={
  anime:['anime','animes'],
  'k-pop':['k-pop','kpop','k pop'],
  'car race':['car race','car racing','street race','auto racing','street racing','formula one','formula 1','nascar','racing driver','race car driver'],
  underdog:["underdog","underdogs","against all odds","unlikely champion","unlikely hero"],
  redemption:["redemption","second chance","second chances","atonement"],
  revenge:["revenge","vengeance","retribution"],
  "found family":["found family","chosen family"],
  "coming of age":["coming of age","growing up","adolescence"],
  survival:["survival","survive","stranded","survivor"],
  conspiracy:["conspiracy","cover up","cover-up","political corruption"],
  heist:["heist","robbery","bank robbery"],
  sport:["sport","sports","boxing","football","basketball","baseball","wrestling"],
  journalism:["journalism","journalist","investigative journalism","reporter"],
  science:["science","scientist","scientists","scientific"],
  "fish out of water":["fish out of water","culture clash","culture shock"],
  "human connection":["human connection","connection","companionship"],
  memory:["memory","memories","amnesia","memory loss","unreliable memory"],
  identity:["identity","personhood","self discovery","self-discovery","identity crisis"],
  "time loop":["time loop","time loops","reliving the same day"],
  "time travel":["time travel","time travelling","time traveling"],
  "artificial intelligence":["artificial intelligence","sentient robot","android","ai"],
  "moral dilemma":["moral dilemma","ethical dilemma","ethical dilemmas","moral ambiguity","morally ambiguous"],
  teamwork:["teamwork","team work","working together","team effort"],
  "problem solving":["problem solving","solving problems","problem-solving","ingenuity","solving a difficult problem","solve difficult problems"],
  "social satire":["social satire","satire","social criticism"],
  "class conflict":["class conflict","class struggle","social class","class differences","social inequality"],
  workplace:["workplace","office","corporate","workplace absurdity"],
  nature:["nature","wildlife","natural world","nature documentary"],
  ocean:["ocean","oceans","marine life","coral reef","underwater"],
  conservation:["conservation","environmentalism","environment","endangered species"],
  friendship:["friendship","friends","friendships"],
  reunion:["reunion","reunite","reunited","reconnecting"],
  regret:["regret","missed opportunity","missed opportunities","missed chances"],
  cooking:["cooking","chef","cuisine","restaurant","food"],
  loneliness:["loneliness","lonely","isolation","alienation"],
  existentialism:["existentialism","existential","meaning of life","existence"],
  surrealism:["surrealism","surreal","surreal worlds"],
  superhero:["superhero","superheroes","super hero"],
  gore:["gore","gory","splatter","extreme violence","graphic violence","blood splatter","dismemberment"],
  torture:["torture","torturing"],
  concert:["concert","concerts","concert film","concert films"],
  celebrity:["celebrity","celebrities","celebrity biography","celebrity biographies"],
  "true crime":["true crime"],
  "haunted house":["haunted house","haunted places","haunting"],
  musical:["musical","musicals"],
  war:["war","warfare","battlefield"],
};
const normalize=(s:string)=>s.toLowerCase().trim().replace(/[_-]/g," ").replace(/\s+/g," ");
const aliases=new Map(Object.entries(groups).flatMap(([key,values])=>values.map(value=>[normalize(value),key] as const)));
export function canonicalConcept(value:string):string {
  const n=normalize(value);
  return aliases.get(n)??n;
}
export function conceptTerms(value:string):string[]{const key=canonicalConcept(value);return [...new Set([key,...(groups[key]??[])])];}
// Context for short legacy tags, not additional preferences or inferred facts.
// Qualified user-authored meanings take precedence over these dictionary senses.
export function conceptMeaning(value:string):string {
  const key=canonicalConcept(value);
  const definitions:Record<string,string>={
    underdog:'An underestimated person or disadvantaged group struggles to overcome obstacles with fewer resources, lower status or less power than those around them.',
    redemption:'People acknowledging past wrongdoing and trying to make amends or earn a second chance.',
    'found family':'People who are not related forming a caring chosen family and a sense of belonging.',
    identity:'Characters exploring who they are, their sense of self or personal identity.',
    memory:'Characters remembering, forgetting or confronting memories of past experiences.',
    'time loop':'Characters repeatedly experiencing the same interval of time and trying to understand or change the repetition.',
    'moral dilemma':'Characters facing difficult ethical choices between competing values, with no simple right answer.',
    teamwork:'People cooperating, combining their abilities and working together toward a shared goal.',
    'problem solving':'Characters using reasoning, resourcefulness or practical ingenuity to solve difficult problems.',
    'social satire':'Stories using irony or absurdity to criticize social institutions and customs.',
    'class conflict':'Conflict arising from unequal wealth, opportunity or social status.',
    'human connection':'People developing meaningful relationships and finding companionship.',
    'coming of age':'Young people growing toward adulthood and navigating changes in responsibility and identity.',
  };
  return definitions[key]?`${key}: ${definitions[key]}`:`Stories involving ${key}.`;
}
const phrasePatterns=new Map<string,RegExp>();
function phrasePattern(phrase:string):RegExp {
  const key=normalize(phrase);
  let pattern=phrasePatterns.get(key);
  if(!pattern){
    const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    pattern=new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,"i");
    if(phrasePatterns.size>=512)phrasePatterns.delete(phrasePatterns.keys().next().value!);
    phrasePatterns.set(key,pattern);
  }
  return pattern;
}
function includesPhrase(text:string,phrase:string):boolean {return phrasePattern(phrase).test(normalize(text));}
type ConceptFacts={overview:string;tagSignature:string;normalizedOverview:string;tags:Set<string>;results:Map<string,'tag'|'premise'|null>};
const itemFacts=new WeakMap<ContentItem,ConceptFacts>();
export function conceptEvidence(item:ContentItem,concept:string):"tag"|"premise"|null {
  // Weak ownership prevents retaining catalog objects; the signature also makes
  // this safe if a caller edits a title's tags in place. No user/profile caching.
  const tags=[...item.keywords,...item.moods,...item.genres],tagSignature=JSON.stringify(tags);
  let facts=itemFacts.get(item);
  if(!facts||facts.overview!==item.overview||facts.tagSignature!==tagSignature){
    facts={overview:item.overview,tagSignature,normalizedOverview:normalize(item.overview),tags:new Set(tags.map(normalize)),results:new Map()};itemFacts.set(item,facts);
  }
  const key=canonicalConcept(concept);
  if(facts.results.has(key))return facts.results.get(key)!;
  const terms=conceptTerms(concept);
  let result:'tag'|'premise'|null=null;
  if(terms.some(t=>facts.tags.has(normalize(t))))result='tag';
  // Single short ambiguous words (e.g. AI) never match inside arbitrary words.
  else if(terms.some(t=>t.length>2&&phrasePattern(t).test(facts.normalizedOverview)))result='premise';
  if(facts.results.size>=128)facts.results.delete(facts.results.keys().next().value!);
  facts.results.set(key,result);return result;
}
export function mentionedConcepts(message:string):string[]{return Object.keys(groups).filter(k=>conceptTerms(k).some(t=>t.length>2&&includesPhrase(message,t)));}
