import type {TasteSignal} from '../domain/types.js';
import {conceptTerms} from './concepts.js';

export function isExplicitExclusion(signal:TasteSignal):boolean {
  if(signal.exclude===false)return false;
  if(signal.exclude!==true)return isExplicitKeywordExclusion(signal);
  if(signal.dimension==='story')return false; // No reliable exact semantic block.
  return signal.score<0&&['chat_explicit','explicit_edit','onboarding_text','onboarding_explicit'].includes(signal.source)&&
    Boolean(signal.statement&&/\b(exclude|avoid|block|never recommend|stop recommending|don['’]?t recommend|do not recommend)\b/i.test(signal.statement));
}

// Only an explicit command, not the magnitude of a dislike, is an exclusion.
// Retain the existing editable Taste record rather than a parallel blocklist.
export function isExplicitKeywordExclusion(signal:TasteSignal):boolean {
  if(!['keyword','theme'].includes(signal.dimension)||signal.score>=0||
    !['chat_explicit','explicit_edit','onboarding_text','onboarding_explicit'].includes(signal.source)||!signal.statement)return false;
  const text=signal.statement.toLowerCase().replaceAll('’',"'");
  return conceptTerms(signal.key).some(term=>{
    const target=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const suffix=`\\s+(?:all\\s+)?${target}\\b`;
    if(new RegExp(`\\b(?:not|don't|do not)\\s+(?:also\\s+)?(?:exclude|avoid)${suffix}`).test(text))return false;
    return new RegExp(`\\b(?:exclude|avoid|never recommend|stop recommending|don't recommend|do not recommend)${suffix}`).test(text);
  });
}
