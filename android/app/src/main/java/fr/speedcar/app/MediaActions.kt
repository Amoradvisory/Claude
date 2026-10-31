package fr.speedcar.app

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

class MediaActions(private val context:Context) {
 fun handle(kind:String,args:JSONObject,expiry:Long):JSONObject {
  val audio=context.getSystemService(AudioManager::class.java)
  if(kind=="set_media_volume"){
   val before=audio.getStreamVolume(AudioManager.STREAM_MUSIC);val min=audio.getStreamMinVolume(AudioManager.STREAM_MUSIC);val max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
   val percent=args.getInt("percent");val cap=context.getSharedPreferences("speed-car",0).getInt("ceiling",60);val target=ActionPolicy.volumeTarget(percent,min,max,cap)
   if(!audio.isVolumeFixed&&target!=before)audio.setStreamVolume(AudioManager.STREAM_MUSIC,target,0)
   val after=audio.getStreamVolume(AudioManager.STREAM_MUSIC)
   return JSONObject().put("status",if(audio.isVolumeFixed||after==target)"verified" else "indeterminate").put("outcome",if(audio.isVolumeFixed)"fixed_volume" else if(percent>cap)"local_ceiling_applied" else if(after==target)"verified" else "no_change_observed")
    .put("before",before).put("after",after).put("target",target).put("minimum",min).put("maximum",max).put("requested_percent",percent).put("ceiling_percent",cap).put("stream","STREAM_MUSIC").put("proof_scope","android_media_index").put("acoustic_loudness_verified",false)
  }
  val component=ComponentName(context,PhoneNotificationService::class.java)
  if(!context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component))return JSONObject().put("status","permission_required").put("permission","notification_listener_for_media_sessions").put("executed",false)
  val sessions=context.getSystemService(MediaSessionManager::class.java).getActiveSessions(component)
  val wanted=args.optString("package_name").ifBlank{null}
  val filtered=sessions.filter{wanted==null||it.packageName==wanted}
  if(kind=="media_status")return JSONObject().put("status","verified").put("proof_scope","android_media_sessions").put("sessions",JSONArray(filtered.map{snapshot(it)}))
  val selected=MediaPolicy.choose(sessions.map{SessionSummary(it.packageName,it.playbackState?.state==PlaybackState.STATE_PLAYING)},wanted)
  if(selected==null)return JSONObject().put("status",if(filtered.isEmpty())"no_active_media_session" else "ambiguous_media_session").put("executed",false).put("packages",JSONArray(filtered.map{it.packageName}.distinct()))
  if(audio.mode!=AudioManager.MODE_NORMAL)return JSONObject().put("status","call_in_progress").put("executed",false)
  val session=sessions[selected];val before=snapshot(session);val oldTrack=track(session);val desired=when(kind){"media_play"->PlaybackState.STATE_PLAYING;"media_pause"->PlaybackState.STATE_PAUSED;else->null}
  if(desired!=null&&session.playbackState?.state==desired)return JSONObject().put("status","verified").put("outcome","already_in_requested_state").put("proof_scope","android_media_session_state").put("session",before)
  if(System.currentTimeMillis()>=expiry)return JSONObject().put("status","expired").put("executed",false)
  when(kind){"media_play"->session.transportControls.play();"media_pause"->session.transportControls.pause();"media_next"->session.transportControls.skipToNext();"media_previous"->session.transportControls.skipToPrevious();else->throw IllegalArgumentException("unsupported_media_action")}
  val until=minOf(expiry,System.currentTimeMillis()+1500);var observed=false
  while(System.currentTimeMillis()<until&&!observed){Thread.sleep(80);observed=if(desired!=null)session.playbackState?.state==desired else oldTrack!=null&&track(session)!=null&&track(session)!=oldTrack}
  return JSONObject().put("status",if(observed)"verified" else "executed").put("outcome",if(observed)"requested_change_observed" else "command_sent_state_not_verified").put("proof_scope",if(observed)"android_media_session_change" else "media_transport_command_sent").put("before",before).put("after",snapshot(session))
 }
 private fun track(c:MediaController):String? {val m=c.metadata?:return null;return m.getString(MediaMetadata.METADATA_KEY_MEDIA_ID)?:m.getString(MediaMetadata.METADATA_KEY_TITLE)?.let{it+"|"+m.getString(MediaMetadata.METADATA_KEY_ARTIST)}}
 private fun snapshot(c:MediaController):JSONObject {val state=c.playbackState;val m=c.metadata;return JSONObject().put("package",c.packageName).put("state",state?.state?:JSONObject.NULL).put("playing",state?.state==PlaybackState.STATE_PLAYING).put("title",m?.getString(MediaMetadata.METADATA_KEY_TITLE)?:JSONObject.NULL).put("artist",m?.getString(MediaMetadata.METADATA_KEY_ARTIST)?:JSONObject.NULL).put("position_ms",state?.position?:JSONObject.NULL).put("actions",state?.actions?:0)}
}
