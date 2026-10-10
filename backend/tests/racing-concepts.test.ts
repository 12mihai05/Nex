import {it,expect} from 'vitest';
import {conceptEvidence,conceptTerms} from '../src/services/concepts.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
it('finds verified car-racing synonyms without including every sport or vehicle story',()=>{
  expect(conceptTerms('car racing')).toContain('street race');
  for(const keyword of ['street race','formula one','auto racing'])
    expect(conceptEvidence({...fixtureCatalog[0]!,keywords:[keyword],overview:''},'car race')).toBe('tag');
  for(const keyword of ['motorcycle racing','horse racing','sport','car chase'])
    expect(conceptEvidence({...fixtureCatalog[0]!,keywords:[keyword],overview:''},'car race')).toBeNull();
});
it('cached concept evidence follows changed metadata, including in-place tag changes',()=>{
  const item={...fixtureCatalog[0]!,keywords:['car race'],genres:[],moods:[],overview:''};
  expect(conceptEvidence(item,'car racing')).toBe('tag');
  item.keywords[0]='horse racing';expect(conceptEvidence(item,'car racing')).toBeNull();
  item.overview='A street racing champion returns.';expect(conceptEvidence(item,'car racing')).toBe('premise');
});
