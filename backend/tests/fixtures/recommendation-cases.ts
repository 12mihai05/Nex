import type { ContentItem, TasteSignal } from '../../src/domain/types.js';
import { fixtureCatalog } from '../../src/fixtures/catalog.js';

// Authored BEFORE live model runs. These are fictional catalog records, not claims
// about real films. Metadata is deliberately sparse and popularity uninformative.
const records: Array<[string,string,string[],string[]]> = [
  ['Last Place','A team with no money and no victories challenges the champions through patient practice and stubborn cooperation.',['Drama'],['teamwork','competition']],
  ['Masters of the Court','The reigning champions cruise through another tournament with expensive equipment and effortless victories.',['Drama'],['competition']],
  ['Broken Bridge','Estranged siblings slowly rebuild trust while restoring their childhood home, learning to listen instead of winning arguments.',['Drama'],['family']],
  ['Inheritance War','Siblings compete for their inheritance, escalating betrayal and sabotaging each other for wealth.',['Drama'],['family','betrayal']],
  ['Quiet Repairs','Ordinary technicians pool their expertise to repair a failing water system, solving practical problems without violence.',['Drama'],['teamwork']],
  ['Last Gun','A lone avenger kills his enemies in a bloody shootout and settles the conflict by force.',['Action'],['revenge','violence']],
  ['The Borrowed Table','Lonely neighbors open a tiny cafe and become a chosen family through cooking, small kindnesses and shared meals.',['Comedy'],['cooking']],
  ['Dinner for Two','Two fashionable celebrities flirt over expensive dinners and fall in love on a glamorous holiday.',['Romance'],['romance']],
  ['Twelve Minutes','A traveler relives the same twelve minutes, piecing together clues to break a repeating cycle.',['Science Fiction'],['time loop']],
  ['Across the Stars','Space soldiers invade an alien planet with spectacular weapons in a straightforward battle.',['Science Fiction'],['space','war']],
  ['Paper Trail','Reporters patiently compare public records and interview witnesses to uncover corruption in a powerful institution.',['Thriller'],['investigation']],
  ['The Chase','An agent chases a thief through explosions and car crashes while rescuing a kidnapped diplomat.',['Thriller'],['action']],
  ['Small Town Puzzle','An elderly gardener investigates a missing painting with witty neighbors; an affectionate village mystery without violence.',['Mystery','Comedy'],['investigation']],
  ['The Cellar','A captive is tortured in graphic detail while a sadistic killer stalks a city.',['Horror','Thriller'],['gore','torture']],
  ['Second Career','A dismissed worker starts learning a new craft in middle age, accepting setbacks and building a modest new life.',['Drama'],['work']],
  ['Office Empire','A ruthless executive humiliates employees and destroys rivals to expand an already successful corporation.',['Drama'],['work']],
  ['Uncertain Mercy','A principled judge must choose between protecting a vulnerable family and applying an unjust law; every choice has a cost.',['Drama'],['justice']],
  ['Courtroom Champion','An infallible lawyer easily exposes an obviously evil defendant and wins universal praise.',['Drama'],['justice']],
  ['Night Train Letters','Two strangers briefly connect on a train, then return to separate lives carrying a bittersweet memory of their conversation.',['Romance','Drama'],['connection']],
  ['Perfect Wedding','Childhood sweethearts reunite, marry in a lavish ceremony and receive every happiness they wished for.',['Romance'],['wedding']],
  ['The Unreliable Room','A detective discovers that conflicting memories of a locked room may have been fabricated; the viewer must reconsider each account.',['Mystery'],['memory','identity']],
  ['The Clear Record','A detective follows a reliable eyewitness account to solve a simple theft, with every event shown in chronological order.',['Mystery'],['investigation']],
  ['Reef Watchers','Marine biologists quietly observe coral and document the fragile relationships between reef creatures.',['Documentary'],['ocean','nature']],
  ['Stage Lights','A pop star performs an arena concert interspersed with adoring fan interviews.',['Documentary','Music'],['concert']],
  ['Mutual Orbit','Women engineers repair an orbiting station through collaboration and practical ingenuity; friendship is central and there is no romantic subplot.',['Science Fiction'],['teamwork','friendship']],
  ['The Destined Pair','Two rival engineers abandon their project for a passionate love affair framed as their inevitable destiny.',['Science Fiction','Romance'],['romance']],
  ['Impossible Office','A surreal bureaucracy requires citizens to obtain permission to dream, following increasingly absurd regulations.',['Comedy'],['bureaucracy','absurdism']],
  ['Office Pranks','Coworkers play loud slapstick pranks involving falls, spilled drinks and embarrassing bodily mishaps.',['Comedy'],['slapstick']],
  ['Shared Road','A father and daughter reconnect on a road trip, confronting resentment and making room for forgiveness.',['Drama'],['family','journey']],
  ['The Lonely Road','A solitary driver races across the country to win a cash prize, avoiding every personal connection.',['Drama'],['journey']],
  ['Patient Hands','An apprentice learns to restore antique violins from a demanding mentor, finding satisfaction in slow craftsmanship.',['Drama'],['craft']],
  ['Instant Fortune','A novice receives magical powers and becomes famous overnight without practice or setbacks.',['Fantasy'],['fame']],
];
export const comparisonCatalog:ContentItem[]=records.map(([title,overview,genres,keywords],i)=>({...fixtureCatalog[0]!,id:900000+i+1,title,originalTitle:title,overview,genres,keywords,moods:[],cast:[],director:null,originalLanguage:'en',countries:['US'],year:2020,runtimeMinutes:95,mediaType:'movie',rating:7,voteCount:500,popularity:10,availability:[]}));
export const signal=(meaning:string,score=1,dimension='story'):TasteSignal=>({dimension,key:meaning,meaning,score,confidence:.9,evidenceCount:1,source:'chat_explicit'});
export interface ComparisonCase {id:string;signals:TasteSignal[];pairs:Array<[number,number]>;}
// Pair labels mean the first synopsis provides stronger explicit support than the
// second. They measure preference adherence, not enjoyment or general accuracy.
export const comparisonCases:ComparisonCase[]=[
  {id:'outsiders-through-effort',signals:[signal('underdog',1,'keyword')],pairs:[[1,2],[15,16]]},
  {id:'repairing-relationships',signals:[signal('people patiently rebuilding broken trust')],pairs:[[3,4],[29,30]]},
  {id:'competence-not-violence',signals:[signal('ordinary people solving practical problems together'),signal('conflicts solved through violence',-1)],pairs:[[5,6],[25,10]]},
  {id:'warm-belonging-not-romance',signals:[signal('lonely people finding belonging through everyday kindness'),signal('glamorous romantic fantasies',-1)],pairs:[[7,8],[7,20]]},
  {id:'time-puzzles-not-space-wars',signals:[signal('time loop',1,'keyword'),signal('war',-1,'keyword')],pairs:[[9,10]]},
  {id:'investigative-process',signals:[signal('patient evidence gathering that exposes institutional wrongdoing')],pairs:[[11,12],[11,18]]},
  {id:'cozy-mystery-no-gore',signals:[signal('affectionate village mysteries solved by ordinary neighbors'),signal('gore',-1,'keyword')],pairs:[[13,14],[13,12]]},
  {id:'adult-second-chances',signals:[signal('middle aged people rebuilding their lives through learning and setbacks')],pairs:[[15,16],[15,32]]},
  {id:'moral-cost',signals:[signal('principled people facing ethical choices where every option has a cost')],pairs:[[17,18],[17,6]]},
  {id:'brief-bittersweet-connection',signals:[signal('fleeting connections that remain meaningful without a conventional happy romance')],pairs:[[19,20],[19,8]]},
  {id:'unreliable-memory',signals:[signal('stories that make me question conflicting memories and what really happened')],pairs:[[21,22],[21,10]]},
  {id:'nature-not-celebrity',signals:[signal('quiet observation of ecosystems and animal relationships'),signal('celebrity worship',-1)],pairs:[[23,24],[23,8]]},
  {id:'women-with-agency',signals:[signal('women solving technical problems as friends, with goals beyond romance')],pairs:[[25,26],[25,8]]},
  {id:'absurd-systems-not-slapstick',signals:[signal('surreal satire about oppressive bureaucracy'),signal('bodily slapstick humiliation',-1)],pairs:[[27,28],[27,16]]},
  {id:'family-road-not-racing',signals:[signal('family members reconnecting during a journey')],pairs:[[29,30],[29,12]]},
  {id:'craft-over-instant-fame',signals:[signal('patient mastery of a craft through mentorship and practice')],pairs:[[31,32],[31,2]]},
  {id:'two-independent-interests',signals:[signal('time loop',1,'keyword'),signal('patient mastery of a craft through mentorship')],pairs:[[9,10],[31,32]]},
  {id:'contrasting-comfort-and-ideas',signals:[signal('warm communities built around shared meals'),signal('difficult moral choices in unjust institutions')],pairs:[[7,8],[17,18]]},
  {id:'dislike-is-not-general-negativity',signals:[signal('humiliation of vulnerable workers',-1),signal('rebuilding a working life after failure')],pairs:[[15,16],[5,16]]},
  {id:'romanian-free-text',signals:[signal('oameni obișnuiți care colaborează și rezolvă probleme prin pricepere, nu prin violență')],pairs:[[5,6],[25,12]]},
  {id:'genre-with-story',signals:[signal('Comedy',1,'genre'),signal('chosen families created through food and small kindnesses')],pairs:[[7,28],[7,8]]},
  {id:'known-simple-keyword',signals:[signal('time loop',1,'keyword')],pairs:[[9,10]]},
  {id:'explicit-negative-keyword',signals:[signal('torture',-1,'keyword')],pairs:[[13,14],[22,14]]},
  {id:'mixed-strengths',signals:[signal('practical teamwork',.9),signal('space travel',.2),signal('glorified violence',-.9)],pairs:[[25,10],[5,6]]},
];
