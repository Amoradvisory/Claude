package fr.speedcar.app

import android.Manifest
import android.app.ActivityOptions
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class LocationActions(private val context:Context) {
 companion object {
  data class Request(val maxAge:Int,val allowLast:Boolean,val expiry:Long,val latch:CountDownLatch=CountDownLatch(1),val result:AtomicReference<JSONObject?> = AtomicReference(null),var cancel:(()->Unit)?=null)
  val pending=ConcurrentHashMap<String,Request>()
  fun finish(id:String,result:JSONObject){pending[id]?.let{it.result.compareAndSet(null,result);it.latch.countDown();if(result.optString("status")=="cancelled")it.cancel?.invoke()}}
  fun cancelAll(){pending.keys.forEach{finish(it,JSONObject().put("status","cancelled").put("outcome","privacy_revoked"))}}
  fun permitted(c:Context)=c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED||c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
  fun fix(location:Location,requestStarted:Long):JSONObject {
   if(location.isMock)return JSONObject().put("status","mock_location_detected").put("proof_scope","android_location_provider").put("mock",true)
   ActionPolicy.coordinates(location.latitude,location.longitude)
   val age=((SystemClock.elapsedRealtimeNanos()-location.elapsedRealtimeNanos)/1_000_000L).coerceAtLeast(0)
   return JSONObject().put("status","verified").put("proof_scope","android_location").put("latitude",location.latitude).put("longitude",location.longitude)
    .put("accuracy_meters",if(location.hasAccuracy())location.accuracy else JSONObject.NULL).put("location_timestamp",Instant.ofEpochMilli(location.time).toString())
    .put("age_ms",age).put("provider",location.provider?:"unknown").put("position_kind",if(location.elapsedRealtimeNanos>=requestStarted)"current" else "last_known")
    .put("mock",location.isMock)
  }
 }
 fun locate(args:JSONObject,expiry:Long):JSONObject {
  if(!context.getSharedPreferences("speed-car-private",0).getBoolean("location_enabled",false)||!permitted(context))return JSONObject().put("status","permission_required").put("permission","location_and_local_toggle").put("executed",false)
  if(!context.getSystemService(LocationManager::class.java).isLocationEnabled)return JSONObject().put("status","location_disabled").put("executed",false)
  if(context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)return JSONObject().put("status","interaction_required").put("outcome","unlock_for_one_shot_location").put("executed",false)
  if(!Settings.canDrawOverlays(context))return JSONObject().put("status","permission_required").put("permission","draw_over_other_apps").put("executed",false)
  val id=UUID.randomUUID().toString();val request=Request(args.optInt("max_age_seconds",30).coerceIn(0,300),args.optBoolean("allow_last_known",true),minOf(expiry,System.currentTimeMillis()+13500));pending[id]=request
  val main=Handler(Looper.getMainLooper())
  main.post {try{if(System.currentTimeMillis()>=request.expiry)finish(id,JSONObject().put("status","expired")) else context.startActivity(Intent(context,LocationActivity::class.java).putExtra("request_id",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),ActivityOptions.makeBasic().apply{launchDisplayId=0}.toBundle())}catch(_:Exception){finish(id,JSONObject().put("status","interaction_required").put("outcome","location_activity_not_started"))}}
  try{val wait=(request.expiry-System.currentTimeMillis()).coerceAtLeast(1);request.latch.await(wait,TimeUnit.MILLISECONDS);return request.result.get()?:JSONObject().put("status","location_timeout").put("outcome","no_fix_observed").put("executed",false)}finally{pending.remove(id)}
 }
}
