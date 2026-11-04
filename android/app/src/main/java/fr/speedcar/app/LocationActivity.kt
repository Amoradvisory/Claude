package fr.speedcar.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

class LocationActivity:Activity() {
 private var id="";private var began=0L;private var started=false;private var done=false
 private val signals=mutableListOf<CancellationSignal>();private val main=Handler(Looper.getMainLooper())
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);id=intent.getStringExtra("request_id")?:"";if(!LocationActions.pending.containsKey(id)){finish();return};LocationActions.pending[id]?.let{request->request.lease.onCancel{main.post{if(!done)complete(JSONObject().put("status","cancelled").put("outcome","operation_closed"))}}};val page=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(32,48,32,32)};page.addView(TextView(this).apply{text="Speed Car · Localisation ponctuelle\nRecherche d’une position Android. Aucun suivi permanent.";textSize=19f});page.addView(Button(this).apply{text="Annuler";setOnClickListener{complete(JSONObject().put("status","cancelled").put("executed",false))}});setContentView(page)}
 override fun onResume(){super.onResume();if(started||done)return;started=true;val request=LocationActions.pending[id]?:run{finish();return};if(!request.lease.valid()){complete(JSONObject().put("status","expired"));return};if(!LocationActions.permitted(this)){complete(JSONObject().put("status","permission_required").put("permission","location"));return};began=SystemClock.elapsedRealtimeNanos();val manager=getSystemService(LocationManager::class.java);val fine=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
  val providers=listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER).filter{(it!=LocationManager.GPS_PROVIDER||fine)&&manager.allProviders.contains(it)&&manager.isProviderEnabled(it)}
  if(providers.isEmpty()){complete(JSONObject().put("status","location_provider_unavailable"));return}
  for(provider in providers){try{val cancel=CancellationSignal();signals.add(cancel);request.lease.onCancel{cancel.cancel()};if(!request.lease.valid())continue;manager.getCurrentLocation(provider,cancel,mainExecutor){location->if(!done&&location!=null){val result=LocationActions.fix(location,began);if(result.has("latitude")&&ActionPolicy.acceptLocation(result.getLong("age_ms"),result.getString("position_kind")=="current",request.allowLast,request.maxAge,location.isMock))complete(result)}}}catch(_:Exception){}}
  main.postDelayed({if(!done){var best:Location?=null;if(request.allowLast)for(provider in providers){try{val l=manager.getLastKnownLocation(provider);if(l!=null&&(best==null||l.elapsedRealtimeNanos>best!!.elapsedRealtimeNanos))best=l}catch(_:Exception){}};val result=best?.let{LocationActions.fix(it,began).put("position_kind","last_known")};if(result!=null&&result.has("latitude")&&result.getLong("age_ms")<=request.maxAge*1000L)complete(result) else complete(JSONObject().put("status","location_timeout").put("outcome","no_fresh_location").put("last_known_available",best!=null))}},minOf(10500L,(request.expiry-System.currentTimeMillis()-300).coerceAtLeast(1)))
 }
 private fun complete(result:JSONObject){if(done)return;done=true;val request=LocationActions.pending[id];if(result.has("latitude")&&(request==null||!request.lease.valid())){LocationActions.finish(id,JSONObject().put("status","expired"));signals.forEach{it.cancel()};main.removeCallbacksAndMessages(null);request?.lease?.close();finish();return};val allowed=getSharedPreferences("speed-car-private",0).getBoolean("location_enabled",false)&&LocationActions.permitted(this);if(result.has("latitude")&&!allowed){LocationActions.finish(id,JSONObject().put("status","cancelled").put("outcome","privacy_revoked"));signals.forEach{it.cancel()};main.removeCallbacksAndMessages(null);finish();return};signals.forEach{it.cancel()};main.removeCallbacksAndMessages(null);LocationActions.finish(id,result);request?.lease?.close();finish()}
 override fun onDestroy(){signals.forEach{it.cancel()};main.removeCallbacksAndMessages(null);if(!done)LocationActions.finish(id,JSONObject().put("status","cancelled").put("outcome","location_activity_closed"));super.onDestroy()}
}
