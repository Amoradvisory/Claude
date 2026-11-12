/** Only launcher labels are normalized. Package IDs and exact label matches remain authoritative. */
export interface NativeApp { package:string; name:string }
type Inventory = Record<string,unknown>;
type Discover = (query:string)=>Promise<Inventory>;
export class AppResolutionError extends Error {
  constructor(public readonly status:'app_not_found'|'ambiguous_app'|'resolution_unavailable'|'phone_offline'|'unsupported_capability'|'permission_required',public readonly diagnosis:string,private readonly permission?:string) {super(diagnosis);}
  result():Record<string,unknown> {return {status:this.status,outcome:this.status,diagnosis:this.diagnosis,executed:false,
    proof_scope:['app_not_found','ambiguous_app'].includes(this.status)?'native_launcher_catalog':'relay_resolution_no_effect',
    ...(this.permission?{permission:this.permission}:{}),
    say:this.status==='phone_offline'?'Le téléphone n’est pas relié à Speed Car. Ouvre Speed Car sur le téléphone. Aucune application ouverte.':this.status==='permission_required'?'L’accès à l’inventaire exige une autorisation. Aucune application ouverte.':this.status==='ambiguous_app'?'Plusieurs applications correspondent. Aucune application ouverte.':this.status==='app_not_found'?'Cette application ne figure pas dans l’inventaire lançable. Aucune application ouverte.':'L’inventaire des applications est indisponible. Aucune application ouverte.'};}
}
const packageId=/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const rawKey=(value:string)=>value.normalize('NFD').replace(/\p{M}+/gu,'').toLowerCase().replace(/\s+/gu,' ').trim();
export const appNameKey=(value:string)=>rawKey(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=(value:string)=>appNameKey(value).replace(/ /g,'');
const aliases=new Map([
  ['salatlille','com.amoradvisory.salatlille'], ['salat','com.amoradvisory.salatlille'],
  ['priere','com.amoradvisory.salatlille'], ['applicationdepriere','com.amoradvisory.salatlille'], ['lapplicationdepriere','com.amoradvisory.salatlille'],
  ['chatgpt','com.openai.chatgpt'], ['maps','com.google.android.apps.maps'], ['googlemaps','com.google.android.apps.maps'],
  ['brave','com.brave.browser'], ['chrome','com.android.chrome'], ['youtube','com.google.android.youtube'],
  ['spotify','com.spotify.music'], ['whatsapp','com.whatsapp'],
]);

export function selectAppTarget(query:string, inventory:Inventory):string {
  const original=query.trim();
  if(inventory.status!=='verified'||!Array.isArray(inventory.apps)||!Number.isInteger(inventory.total_matches)
    || inventory.total_matches!==inventory.apps.length || inventory.apps.length>80)return original;
  const apps=inventory.apps.filter((app):app is NativeApp=>!!app&&typeof app.package==='string'&&packageId.test(app.package)&&typeof app.name==='string');
  if(apps.length!==inventory.apps.length)return original;
  for(const key of [rawKey,appNameKey,compact]) {
    const wanted=key(original);if(!wanted)return original;
    const matches=apps.filter(app=>key(app.name)===wanted||app.package===original);
    if(matches.length===1)return matches[0].package;
    if(matches.length>1)return original;
  }
  return original;
}

export async function prepareAppTarget(query:string, discover:Discover,
  pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<string> {
  const original=query.trim();
  const known=aliases.get(compact(original))??(packageId.test(original)?original:undefined);
  const firstWord=appNameKey(original).split(' ')[0];
  // Any normalized-label collision contains this code point. A longer prefix can hide separators.
  const search=known??Array.from(firstWord).slice(0,1).join('');
  if(!search)return original;
  try {
    let inventory=await discover(search);
    if(inventory.status==='catalog_loading'&&inventory.executed===false) {
      const retry=typeof inventory.retry_after_ms==='number'&&Number.isFinite(inventory.retry_after_ms)?inventory.retry_after_ms:1500;
      await pause(Math.min(1500,Math.max(0,retry)));
      inventory=await discover(search);
    }
    if(inventory.executed===false&&['phone_offline','unsupported_capability','permission_required'].includes(String(inventory.status))) {
      const diagnosis=typeof inventory.diagnosis==='string'&&/^[a-z_]{2,100}$/.test(inventory.diagnosis)?inventory.diagnosis:'launcher_catalog_unavailable';
      throw new AppResolutionError(inventory.status as 'phone_offline'|'unsupported_capability'|'permission_required',diagnosis,
        typeof inventory.permission==='string'&&/^[a-z_]{2,100}$/.test(inventory.permission)?inventory.permission:undefined);
    }
    if(inventory.status!=='verified'||!Array.isArray(inventory.apps)||!Number.isInteger(inventory.total_matches))throw new AppResolutionError('resolution_unavailable','launcher_catalog_unavailable');
    const apps=inventory.apps.filter((app):app is NativeApp=>!!app&&typeof app.package==='string'&&packageId.test(app.package)&&typeof app.name==='string');
    if(apps.length!==inventory.apps.length||apps.length>80)throw new AppResolutionError('resolution_unavailable','launcher_catalog_invalid');
    // Old phones can match package prefixes. Verify the exact package before sending it.
    if(known&&apps.some(app=>app.package===known))return known;
    if(inventory.total_matches!==apps.length)throw new AppResolutionError('resolution_unavailable','launcher_catalog_incomplete');
    if(known)throw new AppResolutionError('app_not_found','launcher_package_absent');
    // Native list_apps prefers exact labels. A short exact label can hide every broader match.
    if(rawKey(original)!==rawKey(search)&&apps.length>0&&apps.every(app=>compact(app.name)===compact(search)))throw new AppResolutionError('resolution_unavailable','launcher_catalog_exact_priority');
    for(const key of [rawKey,appNameKey,compact]) {
      const wanted=key(original);const matches=apps.filter(app=>key(app.name)===wanted);
      if(matches.length===1)return matches[0].package;
      if(matches.length>1)throw new AppResolutionError('ambiguous_app','launcher_name_ambiguous');
    }
    const partial=apps.filter(app=>appNameKey(app.name).includes(appNameKey(original)));
    if(partial.length===1)return partial[0].package;
    if(partial.length>1)throw new AppResolutionError('ambiguous_app','launcher_name_ambiguous');
    throw new AppResolutionError('app_not_found','launcher_name_absent');
  } catch(error) { if(error instanceof AppResolutionError)throw error;throw new AppResolutionError('resolution_unavailable','launcher_catalog_unavailable'); }
}
