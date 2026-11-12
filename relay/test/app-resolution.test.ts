import { describe, expect, it } from 'vitest';
import { appNameKey, prepareAppTarget, selectAppTarget } from '../src/app-resolution';

const prayer = { package: 'com.amoradvisory.salatlille', name: 'Salât Lille' };
const inventory = (apps: {package:string;name:string}[], total = apps.length) => ({status:'verified', apps, total_matches:total});

describe('Application name resolution', () => {
  it('accepts accents, Unicode separators, repeated spaces and compact names', () => {
    for (const name of ['Salat-Lille', 'SALÂT — LILLE', 'salatlille', '  Salat\u00a0  Lille  ']) {
      expect(selectAppTarget(name, inventory([prayer]))).toBe(prayer.package);
    }
    expect(appNameKey('École—du\u00a0Nord')).toBe('ecole du nord');
  });
  it('prefers exact labels and leaves normalized collisions for native refusal', () => {
    const apps = [{package:'one.app',name:'A-B'}, {package:'two.app',name:'A B'}];
    expect(selectAppTarget('A-B',inventory(apps))).toBe('one.app');
    expect(selectAppTarget('A_B',inventory(apps))).toBe('A_B');
  });
  it('never selects an incomplete, malformed or unverified inventory', () => {
    expect(selectAppTarget('Salat-Lille',inventory([prayer],81))).toBe('Salat-Lille');
    expect(selectAppTarget('Salat-Lille',{status:'verified',apps:[prayer]})).toBe('Salat-Lille');
    expect(selectAppTarget('Salat-Lille',{status:'phone_offline'})).toBe('Salat-Lille');
    expect(selectAppTarget('Salat-Lille',inventory([{package:'bad target',name:'Salât Lille'}]))).toBe('Salat-Lille');
  });
  it('preserves unknown names instead of guessing a nearby application', () => {
    expect(selectAppTarget('Salad Lille',inventory([prayer]))).toBe('Salad Lille');
  });
  it('verifies an explicit package exactly before asking an old phone to open it', async () => {
    const queries:string[]=[];
    const actual = await prepareAppTarget(prayer.package, async query => {queries.push(query);return inventory([prayer]);});
    expect(actual).toBe(prayer.package);
    expect(queries).toEqual([prayer.package]);
  });
  it('recognizes a spoken dotted alias before treating it as an explicit package', async()=>{
    expect(await prepareAppTarget('Salat.Lille',async()=>inventory([prayer]))).toBe(prayer.package);
  });
  it('prepares the native inventory once after a cold read with no effect', async () => {
    const queries:string[]=[]; const waits:number[]=[];
    const result=await prepareAppTarget('Salat-Lille',async query=>{
      queries.push(query);
      return queries.length===1?{status:'catalog_loading',executed:false,retry_after_ms:1500}:inventory([prayer]);
    },async ms=>{waits.push(ms);});
    expect(result).toBe(prayer.package);
    expect(queries).toEqual([prayer.package,prayer.package]);
    expect(waits).toEqual([1500]);
  });
  it('does not loop on a catalog that stays unavailable', async () => {
    let reads=0;
    await expect(prepareAppTarget('Salat-Lille',async()=>{reads++;return{status:'catalog_loading',executed:false,retry_after_ms:60000};},async ms=>{expect(ms).toBe(1500);})).rejects.toMatchObject({status:'resolution_unavailable'});
    expect(reads).toBe(2);
  });
  it('resolves an unseeded name through a bounded native prefix search', async () => {
    const queries:string[]=[];
    const target=await prepareAppTarget('École-du-Nord',async query=>{queries.push(query);return inventory([{package:'org.example.ecole',name:'École du Nord'}]);});
    expect(target).toBe('org.example.ecole');
    expect(queries).toEqual(['e']);
  });
  it('refuses without an opening effect after an uncertain catalog lookup', async () => {
    await expect(prepareAppTarget('Some-App',async()=>{throw Error('Transport interrupted');})).rejects.toMatchObject({status:'resolution_unavailable'});
  });
  it('includes separator variants hidden by a longer native prefix before deciding uniqueness',async()=>{
    const apps=[{package:'one.app',name:'ABC Tool'},{package:'two.app',name:'A B C Tool'}];
    await expect(prepareAppTarget('ABCTool',async query=>inventory(apps.filter(app=>app.name.toLowerCase().includes(query))))).rejects.toMatchObject({status:'ambiguous_app'});
  });
  it('does not mistake native exact-label priority for a complete broad search',async()=>{
    const queryLabels=[{package:'one.app',name:'A'}];
    await expect(prepareAppTarget('ABCTool',async()=>inventory(queryLabels))).rejects.toMatchObject({status:'resolution_unavailable'});
  });
  it('does not let a short native exact match hide the requested punctuated label',async()=>{
    await expect(prepareAppTarget('A-',async()=>inventory([{package:'one.app',name:'A'}]))).rejects.toMatchObject({status:'resolution_unavailable'});
  });
});
