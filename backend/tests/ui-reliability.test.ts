import {expect,it} from 'vitest';
import {syncCountrySelection} from '../src/services/epg/demand.js';
import {compactHomeRows} from '../src/services/home-delivery.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
it('empty GitHub workflow input does not silently skip active countries',()=>{
  for(const input of [undefined,'','   ', ','])expect(syncCountrySelection(['RO','GB'],input)).toEqual(['RO','GB']);
  expect(syncCountrySelection(['RO','GB'],' ro, ')).toEqual(['RO']);
  expect(syncCountrySelection(['RO'],'IT')).toEqual([]);
});
it('compact cards retain season counts',()=>{
 const rows=compactHomeRows([{items:[{item:{...fixtureCatalog[0]!,mediaType:'series' as const,seasonCount:4},score:1,evidence:[],reason:'test'}]}]);
 expect(rows[0]!.items[0]!.item.seasonCount).toBe(4);
});
