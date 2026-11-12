package fr.speedcar.app

import android.content.Context
import org.json.JSONObject

object NativeCatalog {
 val kinds=setOf("get_location","open_maps","navigate","open_app","open_and_read","foreground_app","list_apps","open_url","open_settings","media_play","media_pause","media_next","media_previous","media_status","set_media_volume","flashlight","find_device","battery_details","connectivity","share_location","get_notifications","notification_action","screen_context","ui_action","speak","set_alarm","prepare_sms","dial","share")
 private val publicResults=setOf("open_settings","set_media_volume","flashlight","find_device","battery_details","connectivity")
 fun sensitive(kind:String)=kind in kinds&&kind !in publicResults
 fun ttl(kind:String):Long=when(kind){"get_location","open_maps","share_location"->18000;"find_device"->9000;"speak","open_and_read"->12000;"open_app","open_url","navigate"->8000;else->5000}
 fun execute(context:Context,kind:String,args:JSONObject,expiry:Long):JSONObject {
  return when(kind){
   "get_location"->LocationActions(context).locate(args,expiry)
   "open_maps","navigate","open_app","open_and_read","foreground_app","list_apps","open_url","open_settings"->NativeIntents(context).handle(kind,args,expiry)
   "media_play","media_pause","media_next","media_previous","media_status","set_media_volume"->MediaActions(context).handle(kind,args,expiry)
   "battery_details","connectivity","flashlight","find_device"->DeviceActions(context).handle(kind,args,expiry)
   "get_notifications","notification_action"->{if(!context.getSharedPreferences("speed-car-private",0).getBoolean("notifications_enabled",false))return JSONObject().put("status","permission_required").put("permission","local_notifications_toggle").put("executed",false);val listener=PhoneNotificationService.instance?:return JSONObject().put("status","permission_required").put("permission","notification_listener").put("executed",false);if(kind=="get_notifications")listener.read(args)else listener.act(args)}
   "screen_context","ui_action"->{val service=ScreenAccessService.instance?:return JSONObject().put("status","permission_required").put("permission","accessibility_service").put("screen_enabled",context.getSharedPreferences("speed-car-private",0).getBoolean("screen_enabled",false)).put("accessibility_enabled",ScreenAccessDiagnostics.enabled(context)).put("accessibility_bound",false).put("executed",false);if(kind=="ui_action")service.act(args)else if(args.optString("format")=="lines")service.lines(args)else service.context(args)}
   "share_location","speak","set_alarm","prepare_sms","dial","share"->PersonalActions(context).handle(kind,args,expiry)
   else->JSONObject().put("status","rejected").put("outcome","unsupported_capability").put("executed",false)
  }
 }
 fun redact(result:JSONObject):JSONObject {
  val out=JSONObject();for(key in listOf("command_id","status","outcome","proof_scope","duration_ms","sampled_at","model"))if(result.has(key))out.put(key,result.get(key));return out.put("private_result_redacted",true)
 }
}
