import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {resetConfigForTests} from '../src/config.js';
import {ChatService} from '../src/services/chat.js';
import type {default as appType} from '../src/app.js';

let app:typeof appType,token:string;
const response={sessionId:'synthetic',blocks:[{type:'text' as const,content:'Verified answer'}]};
beforeAll(async()=>{
 vi.stubEnv('TURSO_DATABASE_URL',':memory:');vi.stubEnv('TURSO_AUTH_TOKEN','');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('TMDB_READ_ACCESS_TOKEN','');vi.stubEnv('NODE_ENV','test');vi.stubEnv('BETTER_AUTH_URL','http://localhost:8787');vi.stubEnv('NEX_INVITE_CODE','test-local-invite');resetConfigForTests();
 await migrate(getDatabase(),{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
 app=(await import('../src/app.js')).default;
 const signed=await app.request('http://localhost:8787/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:8787','x-nex-invite':'test-local-invite'},body:JSON.stringify({email:'transport@example.test',password:'SyntheticTestOnly!Password7',name:'Transport'})});
 expect(signed.status).toBe(200);token=signed.headers.get('set-auth-token')!;expect(token).toBeTruthy();
});
afterAll(async()=>{vi.restoreAllMocks();await closeDatabase();vi.unstubAllEnvs();resetConfigForTests();});
const send=(requestId:string,accept='text/event-stream',message='Hi')=>app.request('http://localhost:8787/api/chat',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept},body:JSON.stringify({requestId,message})});
it('streams progress and one final result, and replays a UUID without rerunning the assistant',async()=>{
 const run=vi.spyOn(ChatService.prototype,'respond').mockImplementation(async(_u,_m,_s,progress)=>{progress?.({phase:'read_profile'});return response;});
 const id=randomUUID(),first=await send(id);expect(first.headers.get('content-type')).toContain('text/event-stream');
 const stream=await first.text();expect(stream).toContain('event: progress');expect(stream).toContain('read_profile');expect(stream).toContain('event: result');expect(stream).toContain('Verified answer');
 const repeated=await send(id);expect(await repeated.json()).toEqual({data:response});expect(run).toHaveBeenCalledTimes(1);
 expect((await send(id,'application/json','different')).status).toBe(409);run.mockRestore();
});
it('sanitizes streamed failures and never reruns an uncertain request',async()=>{
 const run=vi.spyOn(ChatService.prototype,'respond').mockRejectedValue(new Error('provider-secret-not-for-client'));
 const id=randomUUID(),first=await send(id),body=await first.text();expect(body).toContain('event: error');expect(body).not.toContain('provider-secret');
 expect((await send(id)).status).toBe(409);expect(run).toHaveBeenCalledTimes(1);run.mockRestore();
});
it('supports the existing JSON client and refuses unauthenticated chat',async()=>{
 const run=vi.spyOn(ChatService.prototype,'respond').mockResolvedValue(response);
 expect(await (await send(randomUUID(),'application/json')).json()).toEqual({data:response});
 expect((await app.request('http://localhost:8787/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Hi'})})).status).toBe(401);run.mockRestore();
});
