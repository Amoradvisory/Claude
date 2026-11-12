package fr.speedcar.app

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class PersonalActions(private val context:Context) {
 fun handle(kind:String,args:JSONObject,expiry:Long):JSONObject {
  val intents=NativeIntents(context)
  when(kind){
   "dial"->{val number=ActionPolicy.phoneNumber(args.getString("number"));return intents.launch(Intent(Intent.ACTION_DIAL,Uri.fromParts("tel",number,null)),null,expiry).put("call_placed",false)}
   "prepare_sms"->{val number=ActionPolicy.phoneNumber(args.getString("recipient"));val text=args.getString("text");require(text.length<=1500);return intents.launch(Intent(Intent.ACTION_SENDTO,Uri.fromParts("smsto",number,null)).putExtra("sms_body",text),null,expiry).put("message_sent",false).put("proof_scope","sms_composer_requested")}
   "set_alarm"->{val hour=args.getInt("hour");val minute=args.getInt("minute");require(hour in 0..23&&minute in 0..59);return intents.launch(Intent(AlarmClock.ACTION_SET_ALARM).putExtra(AlarmClock.EXTRA_HOUR,hour).putExtra(AlarmClock.EXTRA_MINUTES,minute).putExtra(AlarmClock.EXTRA_MESSAGE,args.optString("label","Speed Car").take(80)).putExtra(AlarmClock.EXTRA_SKIP_UI,false),null,expiry).put("alarm_saved_verified",false)}
   "share"->{if(!SensitivePolicy.shareAllowed(args.optString("recipient"),args.optBoolean("confirmed")))return JSONObject().put("status","confirmation_required").put("outcome","recipient_and_explicit_confirmation_required").put("executed",false);return shareSheet(args.getString("text").take(2000),args.getString("recipient"),expiry)}
   "share_location"->{if(!SensitivePolicy.shareAllowed(args.optString("recipient"),args.optBoolean("confirmed")))return JSONObject().put("status","confirmation_required").put("outcome","recipient_and_explicit_confirmation_required").put("executed",false)
    require(args.has("latitude")==args.has("longitude")){"coordinate_pair_required"}
    val fix=if(args.has("latitude"))JSONObject().put("latitude",args.getDouble("latitude")).put("longitude",args.getDouble("longitude")) else LocationActions(context).locate(JSONObject().put("max_age_seconds",30).put("allow_last_known",true),expiry)
    if(!fix.has("latitude"))return fix
    val lat=fix.getDouble("latitude");val lon=fix.getDouble("longitude");ActionPolicy.coordinates(lat,lon);val url="https://www.google.com/maps/search/?api=1&query=${ActionPolicy.encode("$lat,$lon")}";
    return if(args.optString("channel","chooser")=="sms"){val n=ActionPolicy.phoneNumber(args.getString("recipient"));intents.launch(Intent(Intent.ACTION_SENDTO,Uri.fromParts("smsto",n,null)).putExtra("sms_body",url),null,expiry).put("message_sent",false).put("proof_scope","location_sms_composer_requested")}else shareSheet(url,args.getString("recipient"),expiry)
   }
   "speak"->return speak(args.getString("text"),expiry)
   else->return JSONObject().put("status","rejected").put("outcome","unsupported_personal_action")
  }
 }
 private fun shareSheet(text:String,recipient:String,expiry:Long):JSONObject {
  val send=Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text)
  return NativeIntents(context).launch(Intent.createChooser(send,"Partager avec ${recipient.take(80)}"),null,expiry).put("proof_scope","android_share_sheet_requested").put("message_sent",false).put("recipient_verified",false).put("user_must_choose_recipient",true)
 }
 private fun speak(text:String,expiry:Long):JSONObject {
  require(text.isNotBlank()&&text.length<=300)
  val audioMode=context.getSystemService(AudioManager::class.java).mode
  // During the voice conversation the assistant already speaks : a second voice over it is refused, and said so.
  if(audioMode!=AudioManager.MODE_NORMAL)return JSONObject().put("status","call_in_progress").put("outcome",if(AudioPolicy.voiceSession(audioMode))"voice_session_active_answer_aloud_yourself" else "call_in_progress").put("executed",false)
  val main=Handler(Looper.getMainLooper());val engine=AtomicReference<TextToSpeech?>();val done=CountDownLatch(1);val began=AtomicBoolean(false);val completed=AtomicBoolean(false);val error=AtomicReference<String?>();val cancelled=AtomicBoolean(false);val utterance=UUID.randomUUID().toString()
  val guard=AudioCallGuard(context.getSystemService(AudioManager::class.java)){cancelled.set(true);engine.get()?.stop();done.countDown()}
  main.post {if(cancelled.get()||System.currentTimeMillis()>=expiry){done.countDown();return@post};val tts=TextToSpeech(context){state->
   val t=engine.get();if(state!=TextToSpeech.SUCCESS||t==null){error.set("tts_initialization_failed");done.countDown()}else if(cancelled.get()||System.currentTimeMillis()>=expiry){done.countDown()}else{
    val lang=t.setLanguage(Locale.FRENCH);if(lang==TextToSpeech.LANG_NOT_SUPPORTED||lang==TextToSpeech.LANG_MISSING_DATA){error.set("tts_language_unavailable");done.countDown()}else{
     t.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){if(id==utterance)began.set(true)};override fun onDone(id:String?){if(id==utterance){completed.set(true);done.countDown()}};override fun onError(id:String?){if(id==utterance){error.set("tts_error");done.countDown()}}})
     if(!guard.start{if(t.speak(text,TextToSpeech.QUEUE_ADD,Bundle(),utterance)==TextToSpeech.ERROR){error.set("tts_rejected");done.countDown()}}){error.set("stopped_for_call");done.countDown()}
    }
   }
  };engine.set(tts)}
  try{done.await((minOf(expiry,System.currentTimeMillis()+9500)-System.currentTimeMillis()).coerceAtLeast(1),TimeUnit.MILLISECONDS)}finally{cancelled.set(true);guard.close();main.post{engine.get()?.let{it.stop();it.shutdown()}}}
  return JSONObject().put("status",if(completed.get())"verified" else if(began.get())"executed" else "unavailable").put("outcome",error.get()?:if(guard.interrupted)"stopped_for_call" else if(completed.get())"tts_utterance_completed" else "tts_not_completed_before_deadline").put("proof_scope","android_tts_callback").put("playback_started_observed",began.get()).put("utterance_completed_observed",completed.get()).put("acoustic_output_verified",false)
 }
}
