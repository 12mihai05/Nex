import {it,expect,vi} from 'vitest';
import {AiService} from '../src/services/ai.js';
const base={summary:'Horror dislike',clarification:null,examples:[],signals:[{dimension:'genre',key:'horror',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',statement:'I dislike horror',meaning:'horror',exclude:false,conditions:[]}]};
function service(parsed:unknown){
 const ai=new AiService('');const parse=vi.fn(async()=>({output_parsed:parsed}));
 Object.defineProperty(ai,'client',{value:{responses:{parse}}});return {ai,parse};
}
it('rejects old preference evidence when the latest turn is read-only',async()=>{
 const {ai}=service({...base,currentTurnIntent:'read_only',authorizationQuote:''});
 expect(await ai.extractTaste('History: I dislike horror. Latest: What did you save?',[],'I dislike horror',true,'What did you save?')).toMatchObject({readOnly:true,signals:[],examples:[]});
});
it('rejects a change authorization quote taken from history rather than the latest message',async()=>{
 const {ai}=service({...base,currentTurnIntent:'lasting_preference',authorizationQuote:'I dislike horror'});
 expect((await ai.extractTaste('History',[],'I dislike horror',true,'What did you save?')).readOnly).toBe(true);
});
it('permits a real latest-turn clarification while preserving original preference evidence',async()=>{
 const {ai,parse}=service({...base,currentTurnIntent:'answer_to_pending_clarification',authorizationQuote:'Only graphic horror'});
 const result=await ai.extractTaste('History',[],'I dislike horror\nOnly graphic horror',true,'Only graphic horror');
 expect(result.readOnly).toBeUndefined();expect(result.signals).toHaveLength(1);
 expect(JSON.stringify(parse.mock.calls)).toContain('authorizationMessage');
});
it('assistant Responses replay uses wire output, not SDK parsed helper properties',async()=>{
 const ai=new AiService('');const output=[{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'},{type:'function_call',name:'read_profile',arguments:'{}',call_id:'c'}];
 const create=vi.fn(async()=>({output,output_text:'',usage:{input_tokens:1,output_tokens:2}}));
 Object.defineProperty(ai,'client',{value:{responses:{create,parse:()=>{throw new Error('Must not use parsed wire output');}}}});
 const result=await ai.assistantStep([],[],false,1000);expect(result.output).toEqual(output);expect(result.answer).toBeNull();expect(JSON.stringify(result)).not.toContain('parsed_arguments');
});
it('bounds built-in web search and retains verified inline citations',async()=>{
 const ai=new AiService('');const create=vi.fn(async()=>({output:[{type:'message',content:[{type:'output_text',text:'A sourced answer.',annotations:[{type:'url_citation',url:'https://example.com/source',title:'Source',start_index:2,end_index:9}]}]}]}));
 Object.defineProperty(ai,'client',{value:{responses:{create}}});
 const result=await ai.answerKnowledge('Was this renewed?',{},true);
 expect(create).toHaveBeenCalledWith(expect.objectContaining({max_tool_calls:3,store:false}),expect.objectContaining({maxRetries:0}));
 expect(result).toMatchObject({type:'knowledge',citations:[{url:'https://example.com/source'}]});
});
it('gives TV selection the real local clock and verified window evidence',async()=>{
 const {ai,parse}=service({intro:'No options',ids:[]});
 await ai.selectTv('Next three hours','Good picks',[],[],'Europe/Bucharest');
 expect(JSON.stringify(parse.mock.calls)).toContain('nowLocal');
 expect(JSON.stringify(parse.mock.calls)).toContain('Europe/Bucharest');
 expect(JSON.stringify(parse.mock.calls)).toContain('already been checked by the server');
});
