// Structured output can satisfy a character bound while ending mid-sentence.
// Never show a chopped title list or pretend that its missing ending is known.
export function completeIntro(value:string,hasCandidates:boolean):string {
  const text=value.trim();
  if(text.length>0&&text.length<=500&&/[.!?…]["”']?$/.test(text))return text;
  const boundary=[...text.slice(0,500).matchAll(/[.!?](?=\s|$)/g)].at(-1)?.index;
  if(boundary!==undefined&&boundary>=30)return text.slice(0,boundary+1);
  return hasCandidates?"Here are the catalog candidates I found for this request.":"I couldn't confirm a match in this shortlist. Try loosening one constraint.";
}

export function addSuitabilityCaution(intro:string,message:string,hasCandidates:boolean):string {
  if(!hasCandidates||!/\b(gore|gory|torture|graphic violence|family.safe|child.safe|depressing ending)\b/i.test(message))return intro;
  if(/\bguarantee\b/i.test(intro))return intro;
  return `${intro} Catalog descriptions and tags cannot guarantee content suitability; check a dedicated content guide before watching.`;
}
