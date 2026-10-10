import type {ChatBlock} from './types.js';

export const chatVoice = 'Write like a thoughtful person having a conversation, not a search report. Answer the actual question first. Use everyday words, contractions, and short paragraphs. No em dashes, sales language, exaggerated enthusiasm, or phrases such as grounded matches, catalog-based candidates, and curated selections. Be specific about what is known and what changed. Do not claim any action unless the application confirms it.';

// Only assistant prose is changed, never card titles, URLs, IDs or user messages.
export const cleanChatCopy=(text:string)=>text.replace(/\s*\u2014\s*/g,', ');
export function cleanChatBlocks(blocks:ChatBlock[]):ChatBlock[] {
  return blocks.map(b=>{
    if(!('content'in b))return b;
    const content=cleanChatCopy(b.content);
    if(b.type!=='knowledge')return {...b,content};
    const offset=(at:number)=>cleanChatCopy(b.content.slice(0,at)).length;
    return {...b,content,citations:b.citations.map(c=>({...c,start:offset(c.start),end:offset(c.end)}))};
  });
}
