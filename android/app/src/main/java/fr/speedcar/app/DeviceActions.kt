package fr.speedcar.app

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.VibrationEffect
import android.os.VibratorManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class DeviceActions(private val context:Context) {
 fun handle(kind:String,args:JSONObject,expiry:Long):JSONObject=when(kind){
  "battery_details"->battery()
  "connectivity"->connectivity()
  "flashlight"->torch(args.getBoolean("enabled"),expiry)
  "find_device"->find(args,expiry)
  else->JSONObject().put("status","rejected").put("outcome","unsupported_device_action")
 }
 private fun battery():JSONObject {val b=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED));if(b==null)return JSONObject().put("status","unavailable");val level=b.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);val scale=b.getIntExtra(BatteryManager.EXTRA_SCALE,100);val plugged=b.getIntExtra(BatteryManager.EXTRA_PLUGGED,0);val sources=mutableListOf<String>();if(plugged and BatteryManager.BATTERY_PLUGGED_AC!=0)sources.add("ac");if(plugged and BatteryManager.BATTERY_PLUGGED_USB!=0)sources.add("usb");if(plugged and BatteryManager.BATTERY_PLUGGED_WIRELESS!=0)sources.add("wireless");val temperature=if(b.hasExtra(BatteryManager.EXTRA_TEMPERATURE))b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0)/10.0 else null
  return JSONObject().put("status","verified").put("proof_scope","android_battery_broadcast").put("battery_percent",if(level>=0&&scale>0)level*100/scale else JSONObject.NULL).put("charge_state",b.getIntExtra(BatteryManager.EXTRA_STATUS,-1)).put("power_sources",JSONArray(sources)).put("temperature_celsius",temperature?:JSONObject.NULL).put("voltage_millivolts",if(b.hasExtra(BatteryManager.EXTRA_VOLTAGE))b.getIntExtra(BatteryManager.EXTRA_VOLTAGE,0) else JSONObject.NULL)
 }
 private fun connectivity():JSONObject {val manager=context.getSystemService(ConnectivityManager::class.java);val caps=manager.getNetworkCapabilities(manager.activeNetwork);val bt=context.getSystemService(BluetoothManager::class.java);val canBt=context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED
  return JSONObject().put("status","verified").put("proof_scope","android_connectivity_state").put("network_available",caps!=null).put("internet_validated",caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)==true).put("wifi_transport",caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)==true).put("mobile_transport",caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)==true).put("vpn_transport",caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN)==true).put("wifi_enabled",context.applicationContext.getSystemService(WifiManager::class.java).isWifiEnabled).put("bluetooth_enabled",if(canBt)bt?.adapter?.isEnabled?:false else JSONObject.NULL).put("bluetooth_permission_granted",canBt)
 }
 private fun torch(enabled:Boolean,expiry:Long):JSONObject {
  if(context.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)return JSONObject().put("status","permission_required").put("permission","camera_for_torch").put("executed",false)
  val manager=context.getSystemService(CameraManager::class.java)
  val id=manager.cameraIdList.firstOrNull{val c=manager.getCameraCharacteristics(it);c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE)==true&&c.get(CameraCharacteristics.LENS_FACING)==CameraCharacteristics.LENS_FACING_BACK}?:return JSONObject().put("status","torch_unavailable").put("executed",false)
  val observed=AtomicBoolean(false);val latch=CountDownLatch(1);val callback=object:CameraManager.TorchCallback(){override fun onTorchModeChanged(cameraId:String,value:Boolean){if(cameraId==id&&value==enabled){observed.set(true);latch.countDown()}}}
  try{manager.registerTorchCallback(context.mainExecutor,callback);if(System.currentTimeMillis()>=expiry)return JSONObject().put("status","expired").put("executed",false);manager.setTorchMode(id,enabled);latch.await(minOf(1200L,(expiry-System.currentTimeMillis()).coerceAtLeast(1)),TimeUnit.MILLISECONDS);return JSONObject().put("status",if(observed.get())"verified" else "executed").put("enabled_requested",enabled).put("observed_enabled",if(observed.get())enabled else JSONObject.NULL).put("proof_scope",if(observed.get())"android_torch_callback" else "torch_request_sent") }finally{manager.unregisterTorchCallback(callback)}
 }
 private fun find(args:JSONObject,expiry:Long):JSONObject {
  val mode=args.optString("mode","vibrate");require(mode in listOf("vibrate","sound","both"));val millis=args.optInt("seconds",2).coerceIn(1,5)*1000L
  if(System.currentTimeMillis()+millis>expiry)return JSONObject().put("status","expired").put("executed",false)
  val audio=context.getSystemService(AudioManager::class.java);if(mode!="vibrate"&&audio.mode!=AudioManager.MODE_NORMAL)return JSONObject().put("status","call_in_progress").put("executed",false)
  val vibrator=context.getSystemService(VibratorManager::class.java).defaultVibrator;val vibrate=mode!="sound"&&vibrator.hasVibrator();val tone=if(mode!="vibrate")RingtoneManager.getRingtone(context,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)) else null
  var playing=false;var started=false;val finished=CountDownLatch(1)
  val guard=if(mode!="vibrate")AudioCallGuard(audio){if(vibrate)vibrator.cancel();tone?.stop();finished.countDown()}else null
  val start={if(vibrate)vibrator.vibrate(VibrationEffect.createOneShot(millis,VibrationEffect.DEFAULT_AMPLITUDE));tone?.audioAttributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build();tone?.play();playing=tone?.isPlaying==true;started=true}
  try{if(guard==null)start()else guard.start(start);if(started)finished.await(millis,TimeUnit.MILLISECONDS)}finally{guard?.close();if(vibrate)vibrator.cancel();tone?.stop()}
  if(!started)return JSONObject().put("status","call_in_progress").put("executed",false)
  return JSONObject().put("status",if(vibrate||tone!=null)"executed" else "signal_unavailable").put("proof_scope","android_signal_request").put("outcome",if(guard?.interrupted==true)"stopped_for_call" else "bounded_signal_requested").put("vibration_requested",vibrate).put("sound_playback_observed",playing).put("physical_signal_verified",false).put("stopped",true)
 }
}
