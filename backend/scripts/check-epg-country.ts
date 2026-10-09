import '../src/env.js';
import {createEpgProvider} from '../src/services/epg/provider.js';
import {EpgService} from '../src/services/epg/service.js';
import {getDatabase,closeDatabase} from '../src/db/client.js';
const country=process.argv[2]??'CH';
if(!/^[A-Z]{2}$/.test(country))throw new Error('Invalid country');
let stage='feed';
try{
 const provider=createEpgProvider(country),data=await provider.load();
 console.log(JSON.stringify({country,channels:data.channels.length,programs:data.programs.length,current:data.programs.filter(p=>p.endAt>new Date()).length}));
 stage='sync';
 console.log(JSON.stringify(await new EpgService(getDatabase(),provider).sync()));
}catch(e){console.log(JSON.stringify({country,stage,errorName:e instanceof Error?e.name:'Unknown',code:e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'REDACTED_PROVIDER_ERROR'}));process.exitCode=1;}
finally{await closeDatabase();}
