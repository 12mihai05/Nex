import {it,expect,vi} from 'vitest';
import {z} from 'zod';
import {runAssistant,type AssistantStep,type AssistantTool} from '../src/services/assistant-loop.js';
const call=(name:string,args:unknown,id='c')=>({type:'function_call' as const,name,arguments:JSON.stringify(args),call_id:id,id:'fc_'+id});
const answer={text:'Done',cards:[],suggestions:[]};
const result=(output:ReturnType<typeof call>[])=>({output,answer:null,inputTokens:10,outputTokens:5});
const done=()=>({output:[],answer,inputTokens:5,outputTokens:2});
const tool=(execute:AssistantTool['execute']=vi.fn(async()=>({items:[]}))):AssistantTool=>({name:'read',description:'Read data',schema:z.object({query:z.string()}),execute});
it('replays tool results and reasoning items and returns accurate usage counters',async()=>{
 const t=tool(),step=vi.fn<AssistantStep>().mockResolvedValueOnce({...result([call('read',{query:'watchlist'})]),output:[{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'},call('read',{query:'watchlist'})]}).mockResolvedValueOnce(done());
 const out=await runAssistant(step,[],[t]);
 expect(t.execute).toHaveBeenCalledWith({query:'watchlist'});expect(out.metrics).toMatchObject({calls:1,inputTokens:15,outputTokens:7});
 expect(step.mock.calls[1]![0]).toEqual(expect.arrayContaining([expect.objectContaining({type:'reasoning',encrypted_content:'opaque'}),expect.objectContaining({type:'function_call_output',call_id:'c'})]));
});
it('validates arguments before executing and gives the model a recoverable error without exception details',async()=>{
 const t=tool(),step=vi.fn<AssistantStep>().mockResolvedValueOnce(result([call('read',{query:8})])).mockResolvedValueOnce(done());
 await runAssistant(step,[],[t]);expect(t.execute).not.toHaveBeenCalled();expect(JSON.stringify(step.mock.calls[1]![0])).toContain('TOOL_UNAVAILABLE');
});
it('does not expose provider secrets in an exception',async()=>{
 const t=tool(vi.fn(async()=>{throw new Error('https://private?key=secret-value');}));
 const step=vi.fn<AssistantStep>().mockResolvedValueOnce(result([call('read',{query:''})])).mockResolvedValueOnce(done());
 const out=await runAssistant(step,[],[t]);expect(JSON.stringify([out,step.mock.calls])).not.toContain('secret-value');
});
it('bounds repeated calls, executes one identical read only once within a turn',async()=>{
 const t=tool(),step=vi.fn<AssistantStep>().mockResolvedValue(result([call('read',{query:''})]));
 const out=await runAssistant(step,[],[t],undefined,{rounds:2,calls:2,deadlineMs:10000});
 expect(step).toHaveBeenCalledTimes(3);expect(t.execute).toHaveBeenCalledTimes(1);expect(out.metrics.calls).toBe(2);expect(step.mock.calls[2]![2]).toBe(true);
});
it('cannot invent tools or execute a second different mutation in the same turn',async()=>{
 const execute=vi.fn(async()=>({receipt:'preview'}));const t={...tool(execute),mutates:true};
 const step=vi.fn<AssistantStep>().mockResolvedValueOnce(result([call('read',{query:'first'},'1'),call('read',{query:'second'},'2'),call('confirm',{query:''},'3')])).mockResolvedValueOnce(done());
 await runAssistant(step,[],[t]);expect(execute).toHaveBeenCalledTimes(1);expect(JSON.stringify(step.mock.calls[1]![0])).toContain('ONE_CHANGE_PER_TURN');expect(JSON.stringify(step.mock.calls[1]![0])).toContain('UNKNOWN_TOOL');
});
it('does not reuse tool data between separate turns',async()=>{
 const t=tool();for(let n=0;n<2;n++){const step=vi.fn<AssistantStep>().mockResolvedValueOnce(result([call('read',{query:''})])).mockResolvedValueOnce(done());await runAssistant(step,[],[t]);}expect(t.execute).toHaveBeenCalledTimes(2);
});
it('repairs invalid final IDs once without executing tools again',async()=>{
 const t=tool(),step=vi.fn<AssistantStep>().mockResolvedValueOnce(result([call('read',{query:'choices'})])).mockResolvedValueOnce({...done(),answer:{...answer,cards:['old-id']}}).mockResolvedValueOnce({...done(),answer:{...answer,cards:['valid-id']}});
 const out=await runAssistant(step,[],[t],undefined,undefined,a=>a.cards.includes('old-id')?'Choose valid-id only':null);
 expect(out.answer.cards).toEqual(['valid-id']);expect(step.mock.calls[2]?.[2]).toBe(true);expect(t.execute).toHaveBeenCalledTimes(1);
 expect(out.metrics).toMatchObject({inputTokens:20,outputTokens:9});
});
it('does not loop on a failed repair or execute repair-time tool calls',async()=>{
 const t=tool(),step=vi.fn<AssistantStep>().mockResolvedValueOnce({...done(),answer:{...answer,cards:['bad']}}).mockResolvedValueOnce(result([call('read',{query:'not allowed'})]));
 const out=await runAssistant(step,[],[t],undefined,undefined,()=> 'Invalid ID');
 expect(step).toHaveBeenCalledTimes(2);expect(t.execute).not.toHaveBeenCalled();expect(out.answer.cards).toEqual(['bad']);
});
it('will not start a tool when the model used up the turn deadline',async()=>{
 let now=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now),t=tool();
 try{
  const step=vi.fn<AssistantStep>().mockImplementation(async()=>{now=11000;return result([call('read',{query:''})]);});
  const out=await runAssistant(step,[],[t],undefined,{rounds:2,calls:3,deadlineMs:10000});
  expect(t.execute).not.toHaveBeenCalled();expect(out.metrics.traces[0]?.status).toBe('error');expect(out.answer.text).toContain('couldn’t finish');
 }finally{clock.mockRestore();}
});
