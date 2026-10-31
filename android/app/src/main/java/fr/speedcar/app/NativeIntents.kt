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
 fun apps():List<AppEntry> = context.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
  .map{AppEntry(it.activityInfo.packageName,it.loadLabel(context.packageManager).toString())}.distinctBy{it.packageName}.sortedBy{it.label.lowercase()}
 fun resolve(query:String):List<AppEntry> = ActionPolicy.apps(query,apps())
 fun list(args:JSONObject):JSONObject { val query=args.optString("query");val matches=if(query.isBlank())apps() else resolve(query);return JSONObject().put("status","verified").put("proof_scope","android_launcher_packages").put("total_matches",matches.size).put("apps",JSONArray(matches.take(args.optInt("limit",40).coerceIn(1,80)).map{JSONObject().put("package",it.packageName).put("name",it.label)})) }
 fun openApp(query:String,expiry:Long):JSONObject {val m=resolve(query);if(m.size!=1)return JSONObject().put("status",if(m.isEmpty())"app_not_found" else "ambiguous_app").put("executed",false).put("candidates",JSONArray(m.take(10).map{JSONObject().put("package",it.packageName).put("name",it.label)}));val i=context.packageManager.getLaunchIntentForPackage(m[0].packageName)?:return JSONObject().put("status","app_not_launchable").put("executed",false);return launch(i,m[0].packageName,expiry)}
 fun handle(kind:String,args:JSONObject,expiry:Long):JSONObject { return when(kind){
  "list_apps"->list(args)
  "open_app"->openApp(args.getString("app"),expiry)
  "open_url"->{val url=try{ActionPolicy.webUrl(args.getString("url"))}catch(_:IllegalArgumentException){return JSONObject().put("status","rejected").put("outcome","invalid_web_url").put("executed",false)};val m=resolve(args.optString("browser","Brave"));if(m.size!=1)JSONObject().put("status",if(m.isEmpty())"browser_not_found" else "ambiguous_browser").put("executed",false) else launch(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(m.single().packageName),m.single().packageName,expiry).put("page_url_verified",false)}
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
  val allowed=context.getSystemService(AppOpsManager::class.java).unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,Process.myUid(),context.packageName)==AppOpsManager.MODE_ALLOWED
  var resumed=false;val until=minOf(expiry,System.currentTimeMillis()+1100)
  while(allowed&&!resumed&&expectedPackage!=null&&System.currentTimeMillis()<until){val events=context.getSystemService(UsageStatsManager::class.java).queryEvents(began-150,System.currentTimeMillis());val event=UsageEvents.Event();while(events.hasNextEvent()){events.getNextEvent(event);if(event.packageName==expectedPackage&&event.eventType==UsageEvents.Event.ACTIVITY_RESUMED&&event.timeStamp>=began-150)resumed=true};if(!resumed)Thread.sleep(80)}
  val locked=context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
  return JSONObject().put("status",if(locked)"launched_behind_lock" else if(resumed)"verified" else "executed").put("executed",true).put("package",expectedPackage?:JSONObject.NULL).put("foreground_observed",resumed).put("proof_scope",if(resumed)"android_activity_foreground" else "intent_submitted_only")
 }
}
