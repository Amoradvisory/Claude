package fr.speedcar.app

import android.app.ActivityOptions
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class NativeIntents(private val context:Context) {
 companion object { const val MAPS="com.google.android.apps.maps" }
 private fun unavailable(state:String)=JSONObject().put("status",state).put("executed",false).put("proof_scope","no_effect").put("retry_after_ms",if(state=="catalog_loading")1500 else 5000)
 fun list(args:JSONObject):JSONObject {
  val view=AppCatalog.request(context);if(view.state!="ready")return unavailable(view.state)
  val query=args.optString("query");val matches=if(query.isBlank())view.items else ActionPolicy.apps(query,view.items)
  return JSONObject().put("status","verified").put("proof_scope","android_launcher_packages_cached_5min").put("total_matches",matches.size).put("apps",JSONArray(matches.take(args.optInt("limit",40).coerceIn(1,80)).map{JSONObject().put("package",it.packageName).put("name",it.label)}))
 }
 private fun resolve(query:String):Pair<List<AppEntry>,String> {
  val pkg=AppAliases.packageFor(query)?:query.trim().takeIf{Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+").matches(it)}
  if(pkg!=null&&context.packageManager.getLaunchIntentForPackage(pkg)!=null)return listOf(AppEntry(pkg,pkg)) to "ready"
  if(pkg!=null&&AppAliases.packageFor(query)==null)return emptyList<AppEntry>() to "ready"
  val view=AppCatalog.request(context);return ActionPolicy.apps(query,view.items) to view.state
 }
 /** In a spoken exchange "the list is loading, ask again" costs a whole turn : wait for it inside the command when time allows. */
 private fun resolveWaiting(query:String,expiry:Long):Pair<List<AppEntry>,String> {
  var found=resolve(query);val until=minOf(System.currentTimeMillis()+2500,expiry-4500)
  while(found.second=="catalog_loading"&&System.currentTimeMillis()<until){Thread.sleep(250);found=resolve(query)}
  return found
 }
 fun openApp(query:String,expiry:Long):JSONObject {
  if(!Settings.canDrawOverlays(context))return JSONObject().put("status","permission_required").put("permission","draw_over_other_apps").put("executed",false)
  val (m,state)=resolveWaiting(query,expiry);if(state!="ready")return unavailable(state)
  if(m.size!=1)return JSONObject().put("status",if(m.isEmpty())"app_not_found" else "ambiguous_app").put("executed",false).put("candidates",JSONArray(m.take(10).map{JSONObject().put("package",it.packageName).put("name",it.label)}))
  val i=context.packageManager.getLaunchIntentForPackage(m[0].packageName)?:return JSONObject().put("status","app_not_launchable").put("executed",false)
  return launch(i,m[0].packageName,expiry)
 }
 fun handle(kind:String,args:JSONObject,expiry:Long):JSONObject { return when(kind){
  "list_apps"->list(args)
  "open_app"->openApp(args.getString("app"),expiry)
  "open_and_read"->openAndRead(args,expiry)
  "foreground_app"->foreground()
  "open_url"->{val url=try{ActionPolicy.webUrl(args.getString("url"))}catch(_:IllegalArgumentException){return JSONObject().put("status","rejected").put("outcome","invalid_web_url").put("executed",false)};val (m,state)=resolve(args.optString("browser","Brave"));if(state!="ready")return unavailable(state);if(m.size!=1)JSONObject().put("status",if(m.isEmpty())"browser_not_found" else "ambiguous_browser").put("executed",false) else launch(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(m.single().packageName),m.single().packageName,expiry).put("page_url_verified",false)}
  "open_maps"->{val intent:Intent
   val hasLat=args.has("latitude");val hasLon=args.has("longitude");require(hasLat==hasLon){"coordinate_pair_required"}
   var lat:Double?=null;var lon:Double?=null
   if(hasLat){lat=args.getDouble("latitude");lon=args.getDouble("longitude");ActionPolicy.coordinates(lat,lon)}
   if(args.optBoolean("show_current_location")){val fix=LocationActions(context).locate(JSONObject().put("max_age_seconds",30).put("allow_last_known",true),expiry);if(!fix.has("latitude"))return fix;lat=fix.getDouble("latitude");lon=fix.getDouble("longitude")}
   val query=args.optString("query");
   if(lat!=null){val q=if(query.isNotBlank())query else "$lat,$lon";intent=Intent(Intent.ACTION_VIEW,Uri.parse("geo:$lat,$lon?q=${ActionPolicy.encode(q)}"))}
   else if(query.isNotBlank())intent=Intent(Intent.ACTION_VIEW,Uri.parse("geo:0,0?q=${ActionPolicy.encode(query)}"))
   else intent=context.packageManager.getLaunchIntentForPackage(MAPS)?:return JSONObject().put("status","app_not_found").put("executed",false)
   launch(intent.setPackage(MAPS),MAPS,expiry).put("map_content_verified",false)
  }
  "navigate"->{val alias=args.optString("saved_place");val destination=if(alias.isNotBlank())context.getSharedPreferences("speed-car-private",0).getString("place_$alias","").orEmpty() else args.optString("destination");if(destination.isBlank())JSONObject().put("status",if(alias.isNotBlank())"saved_place_not_configured" else "destination_required").put("executed",false) else launch(Intent(Intent.ACTION_VIEW,Uri.parse(ActionPolicy.navigationUri(destination,args.optString("mode","driving")))).setPackage(MAPS),MAPS,expiry).put("route_calculated_verified",false).put("navigation_started_verified",false).put("requested_mode",args.optString("mode","driving"))}
  "open_settings"->{val section=args.getString("section");val actions=mapOf("wifi" to Settings.ACTION_WIFI_SETTINGS,"bluetooth" to Settings.ACTION_BLUETOOTH_SETTINGS,"location" to Settings.ACTION_LOCATION_SOURCE_SETTINGS,"display" to Settings.ACTION_DISPLAY_SETTINGS,"sound" to Settings.ACTION_SOUND_SETTINGS,"battery" to Settings.ACTION_BATTERY_SAVER_SETTINGS,"apps" to Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS,"notifications" to Settings.ACTION_APP_NOTIFICATION_SETTINGS,"accessibility" to Settings.ACTION_ACCESSIBILITY_SETTINGS,"usage_access" to Settings.ACTION_USAGE_ACCESS_SETTINGS,"notification_access" to Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS,"overlay" to Settings.ACTION_MANAGE_OVERLAY_PERMISSION,"app_details" to Settings.ACTION_APPLICATION_DETAILS_SETTINGS);val action=actions[section]?:throw IllegalArgumentException("unsupported_settings_section");val i=Intent(action);if(section in listOf("overlay","app_details"))i.data=Uri.parse("package:${context.packageName}");if(section=="notifications")i.putExtra(Settings.EXTRA_APP_PACKAGE,context.packageName);launch(i,"com.android.settings",expiry).put("settings_changed",false)}
  else->JSONObject().put("status","rejected").put("outcome","unsupported_capability")
 }
 }
 fun launch(intent:Intent,expectedPackage:String?,expiry:Long):JSONObject {
  if(!Settings.canDrawOverlays(context))return JSONObject().put("status","permission_required").put("permission","draw_over_other_apps").put("executed",false)
  if(intent.resolveActivity(context.packageManager)==null)return JSONObject().put("status","app_or_activity_not_found").put("executed",false)
  val began=System.currentTimeMillis();val latch=CountDownLatch(1);val error=AtomicReference<Exception?>();val main=Handler(Looper.getMainLooper())
  val action=Runnable {try{if(System.currentTimeMillis()>=expiry)throw IllegalStateException("expired_before_launch");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(intent,ActivityOptions.makeBasic().apply{launchDisplayId=0}.toBundle())}catch(e:Exception){error.set(e)}finally{latch.countDown()}}
  main.post(action);if(!latch.await(1200,TimeUnit.MILLISECONDS)){main.removeCallbacks(action);return JSONObject().put("status","indeterminate").put("outcome","launch_not_confirmed")}
  error.get()?.let{return JSONObject().put("status","rejected").put("error_type",it.javaClass.simpleName).put("executed",false)}
  val allowed=ForegroundProbe.usageAllowed(context)
  // A cold start on a mid-range phone takes more than a second : observe until the deadline allows.
  var resumed=false;val until=minOf(expiry-400,System.currentTimeMillis()+3500)
  while(!resumed&&expectedPackage!=null&&System.currentTimeMillis()<until){
   resumed=(allowed&&ForegroundProbe.resumedSince(context,expectedPackage,began-150))||ForegroundProbe.fromAccessibility()==expectedPackage
   if(!resumed)Thread.sleep(100)
  }
  // Already in front before the request : Android records no new event, yet the application is displayed.
  if(!resumed&&expectedPackage!=null&&allowed){val front=ForegroundProbe.fromUsage(context);resumed=front!=null&&front.packageName==expectedPackage&&!front.paused}
  val locked=context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
  val observable=allowed||ScreenAccessService.instance!=null
  val result=JSONObject().put("status",if(locked)"launched_behind_lock" else if(resumed)"verified" else "executed").put("executed",true).put("package",expectedPackage?:JSONObject.NULL).put("foreground_observed",resumed).put("proof_scope",if(resumed)"android_activity_foreground" else "intent_submitted_only")
  if(!resumed&&expectedPackage!=null)result.put("outcome","foreground_not_observed").put("likely_cause",if(!observable)"cannot_observe_usage_access_missing" else "launch_blocked_by_hyperos_background_popup_permission_or_slow_start")
  return result
 }
 private fun foreground():JSONObject {
  val focused=ForegroundProbe.fromAccessibility();val usage=if(ForegroundProbe.usageAllowed(context))ForegroundProbe.fromUsage(context) else null
  if(focused==null&&usage==null)return JSONObject().put("status",if(ForegroundProbe.usageAllowed(context))"unknown" else "permission_required").put("permission","usage_access").put("executed",false)
  val pkg=focused?:usage!!.packageName
  val name=try{context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(pkg,0)).toString()}catch(_:Exception){pkg}
  return JSONObject().put("status","verified").put("proof_scope",if(focused!=null)"android_focused_window" else "android_usage_events").put("package",pkg).put("name",name)
   .put("left_the_front",focused==null&&usage!!.paused).put("locked",context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)
 }
 /** "Open X and tell me what it shows" in one command : open, wait for the window, then read its visible lines. */
 private fun openAndRead(args:JSONObject,expiry:Long):JSONObject {
  val opened=openApp(args.getString("app"),expiry-2500)
  if(opened.optString("status") !in listOf("verified","executed"))return opened.put("screen_read",false)
  val pkg=opened.optString("package")
  fun unread(reason:String)=opened.put("screen_read",false).put("screen_status",reason)
  if(!context.getSharedPreferences("speed-car-private",0).getBoolean("screen_enabled",false))return unread("local_screen_toggle_off")
  val service=ScreenAccessService.instance?:return unread("accessibility_service_not_bound")
  if(!service.allowedFor(pkg))return unread("app_not_in_screen_allowlist")
  // The window, then its content, appear progressively ; a counter that ticks never repeats, so stability is judged on the number of lines.
  val request=JSONObject().put("max_lines",args.optInt("max_lines",40));var last:JSONObject?=null;var read:JSONObject?=null;var count=-1
  while(System.currentTimeMillis()<expiry-700){
   val now=service.lines(request,pkg);last=now
   if(now.optString("status")=="verified"){val size=now.getJSONArray("lines").length();if(size>0){read=now;if(size==count)break;count=size}}
   Thread.sleep(350)
  }
  val done=read?:return unread(last?.optString("status")?.takeIf{it!="verified"}?:"no_visible_text")
  opened.remove("outcome");opened.remove("likely_cause")
  return opened.put("status","verified").put("foreground_observed",true).put("screen_read",true).put("lines",done.getJSONArray("lines")).put("truncated",done.optBoolean("truncated"))
   .put("proof_scope","android_focused_window_and_visible_text").put("read_at_ms",System.currentTimeMillis())
 }
}
