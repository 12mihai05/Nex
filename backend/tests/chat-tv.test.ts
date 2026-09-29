import {expect,it} from 'vitest';
import {requestedTvScope} from '../src/services/chat-tv.js';
import {chatCapabilityReply} from '../src/services/chat-help.js';
import {isPersistentPreference} from '../src/services/intent.js';
const channels=[{id:'pro',name:'Pro TV'},{id:'prohd',name:'Pro TV HD'},{id:'int',name:'Pro TV International'},{id:'antena',name:'Antena 1'}];
const now=new Date('2026-09-29T09:00:00Z');
it('resolves ProTV at 8pm to only that channel and the exact Romania instant',()=>{
 const s=requestedTvScope('what is today at 8pm on protv',channels,'Europe/Bucharest',now)!;
 expect(s).toMatchObject({channelIds:['pro','prohd'],start:new Date('2026-09-29T17:00:00Z'),end:new Date('2026-09-29T17:00:00.001Z')});
});
it('resolves spaced names, Romanian wording, tomorrow and winter timezone',()=>{
 expect(requestedTvScope('Ce este maine la 20:00 pe Pro TV?',channels,'Europe/Bucharest',now)).toMatchObject({channelIds:['pro','prohd'],start:new Date('2026-09-30T17:00:00Z')});
 expect(requestedTvScope('What is on Antena 1 on 2026-12-01 at 8pm?',channels,'Europe/Bucharest',now)).toMatchObject({channelIds:['antena'],start:new Date('2026-12-01T18:00:00Z')});
});
it('does not silently guess an unknown channel, ambiguous clock or invalid date',()=>{
 for(const message of ['What is today at 8pm on MissingTV?','What is on ProTV at 8?','What is on ProTV at 25:00?','What is on ProTV on 2026-02-31?','What is on ProTV at eight tonight?','What is on ProTV on Friday at 8pm?']) expect(requestedTvScope(message,channels,'Europe/Bucharest',now)).toHaveProperty('error');
 expect(requestedTvScope('Recommend something on Netflix',channels,'Europe/Bucharest',now)).toBeNull();
 expect(requestedTvScope('I want a live-action movie',channels,'Europe/Bucharest',now)).toBeNull();
});
it('capability questions are factual and cannot become taste mutations',()=>{
 expect(chatCapabilityReply('if i tell you in here what i like and what not will you be able to change my taste?')).toContain('Yes.');
 expect(chatCapabilityReply('Can you recommend something for my taste?')).toBeNull();
 expect(isPersistentPreference('If I like horror, could I tell you?')).toBe(false);
 expect(isPersistentPreference('I like underdog stories but dislike gore')).toBe(true);
 expect(isPersistentPreference('I like a thriller tonight')).toBe(false);
});
