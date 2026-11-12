const booleanOrNull=(value:unknown)=>typeof value==='boolean'?value:null;

export function screenAccess(result:Record<string,unknown>) {
  const local=booleanOrNull(result.screen_enabled);
  const enabled=booleanOrNull(result.accessibility_enabled);
  const bound=booleanOrNull(result.accessibility_bound);
  return {local_toggle_enabled:local,android_service_enabled:enabled,service_bound:bound,
    state:local===false?'local_screen_toggle_disabled':local===null?'local_configuration_unknown':enabled===false?'android_accessibility_service_disabled':bound===false?'android_accessibility_service_unbound':bound===true?'service_ready':'service_state_unknown'};
}

/** Derived only from a native receipt; it neither grants a permission nor executes another channel. */
export function projectPhoneResult(kind:string,result:Record<string,unknown>,screenView?:{maxLines:number}):Record<string,unknown> {
  let out={...result};
  if(kind==='status')out={...out,screen_access:screenAccess(out)};
  if((kind==='screen_context'||kind==='ui_action')&&out.permission==='accessibility_service') {
    const disabled=out.accessibility_enabled===false;
    const unbound=out.accessibility_enabled===true&&out.accessibility_bound===false;
    out={...out,diagnosis:disabled?'android_accessibility_service_disabled':unbound?'android_accessibility_service_unbound':'accessibility_service_unavailable',
      required_user_action:disabled?'enable_speedcar_accessibility_in_android_settings':unbound?'inspect_authorized_but_unbound_accessibility_service':'inspect_speedcar_accessibility_in_android_settings',
      say:disabled?'Le service Android « Speed Car · contexte d’écran » est désactivé ; son activation volontaire est nécessaire.':unbound?'Le service est autorisé dans Android mais n’est pas connecté. Vérifier son état dans les réglages Android, à l’arrêt.':'Le service d’écran est indisponible. Vérifier son autorisation et son état dans les réglages Android ; l’interrupteur interne seul ne les prouve pas.'};
  }
  if(kind==='screen_context'&&Array.isArray(out.nodes)) {
    const nodes=out.nodes.map(node=>node&&typeof node==='object'&&node.password_field===true?{...node,text:undefined,description:undefined}:node);
    out={...out,nodes};
    if(screenView&&out.status==='verified') {
      const lines:string[]=[];
      for(const node of nodes) {
        if(!node||node.password_field===true||node.visible_to_user===false)continue;
        const label=typeof node.text==='string'&&node.text.trim()?node.text:typeof node.description==='string'?node.description:'';
        const text=label.replace(/\s+/g,' ').trim().slice(0,200);
        if(text&&lines[lines.length-1]!==text)lines.push(text);
      }
      delete out.nodes;delete out.snapshot_id;delete out.expires_in_ms;
      out={...out,lines:lines.slice(0,screenView.maxLines),truncated:out.truncated===true||lines.length>screenView.maxLines||nodes.length>=80,
        line_order:'native_semantic_tree',representation:'legacy_nodes_to_lines',nodes_scanned:nodes.length};
    }
  }
  const fallbackStatuses=['phone_offline','unsupported_capability','app_not_found','catalog_loading','resolution_unavailable'];
  return {...out,safe_to_consider_other_channel:out.executed===false&&fallbackStatuses.includes(String(out.status))&&!out.permission};
}
