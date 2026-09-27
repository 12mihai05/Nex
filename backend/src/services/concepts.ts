import type {ContentItem} from "../domain/types.js";

// Small, inspectable vocabulary bridge. It connects wording to source text;
// it never assigns psychological traits, age suitability, or unseen plot facts.
const groups:Record<string,string[]>={
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
export function canonicalConcept(value:string):string {
  const n=normalize(value);
  return Object.entries(groups).find(([,values])=>values.some(v=>normalize(v)===n))?.[0]??n;
}
export function conceptTerms(value:string):string[]{const key=canonicalConcept(value);return [...new Set([key,...(groups[key]??[])])];}
function includesPhrase(text:string,phrase:string):boolean {
  const escaped=normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,"i").test(normalize(text));
}
export function conceptEvidence(item:ContentItem,concept:string):"tag"|"premise"|null {
  const terms=conceptTerms(concept);
  if([...item.keywords,...item.moods,...item.genres].some(k=>terms.some(t=>normalize(k)===normalize(t))))return "tag";
  // Single short ambiguous words (e.g. AI) never match inside arbitrary words.
  if(terms.some(t=>t.length>2&&includesPhrase(item.overview,t)))return "premise";
  return null;
}
export function mentionedConcepts(message:string):string[]{return Object.keys(groups).filter(k=>conceptTerms(k).some(t=>t.length>2&&includesPhrase(message,t)));}
