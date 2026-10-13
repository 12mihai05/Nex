import {expect,it,vi} from 'vitest';
vi.mock('../src/services/epg/download.js',()=>({decodeXmlTv:(bytes:Uint8Array)=>Buffer.from(bytes).toString(),downloadPublic:vi.fn()}));
import {downloadPublic} from '../src/services/epg/download.js';
import {IptvOrgProvider} from '../src/services/epg/directory.js';
import {parseXmlTv,parseXmlTvTimestamp} from '../src/services/epg/xmltv.js';

it('imports every valid channel schedule beyond the old 120 cap',async()=>{
  const xml='<tv>'+Array.from({length:180},(_,i)=>`<channel id="c${i}"><display-name>Channel ${i}</display-name></channel><programme channel="c${i}" start="20300101100000 +0000" stop="20300101110000 +0000"><title>Programme ${i}</title></programme>`).join('')+'</tv>';
  vi.mocked(downloadPublic).mockImplementation(async url=>Buffer.from(url.endsWith('.json')?'[]':url.endsWith('.gz')?xml:'<a href="epg_ripper_RO1.xml.gz">RO</a>'));
  const data=await new IptvOrgProvider('RO').load();
  expect(data.channels).toHaveLength(180);expect(data.programs).toHaveLength(180);
});
it('preserves repeated metadata and full production dates and rejects invalid dates',()=>{
  const data=parseXmlTv('<tv><channel><display-name>Missing ID</display-name></channel><programme channel="c" start="20300101100000" stop="20300101110000"><title>Show</title><desc lang="ro">Descriere</desc><desc lang="en">Description</desc><category>Drama</category><category>Movie</category><date>20160102</date></programme></tv>');
  expect(data.channels).toHaveLength(0);
  expect(data.programs[0]).toMatchObject({description:'Descriere',category:'Drama / Movie',year:2016});
  expect(parseXmlTvTimestamp('20300101100000').toISOString()).toBe('2030-01-01T10:00:00.000Z');
  for(const s of ['20300230100000 +0000','20300101250000 +0000','20300101100000 +0060'])expect(()=>parseXmlTvTimestamp(s)).toThrow();
});
