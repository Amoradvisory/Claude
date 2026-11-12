package fr.speedcar.app

import android.app.Notification
import android.service.notification.NotificationListenerService
import org.json.JSONArray
import org.json.JSONObject

class PhoneNotificationService:NotificationListenerService() {
 companion object { @Volatile var instance:PhoneNotificationService?=null }
 override fun onListenerConnected(){instance=this}
 override fun onListenerDisconnected(){if(instance===this)instance=null}
 override fun onDestroy(){if(instance===this)instance=null;super.onDestroy()}
 fun read(args:JSONObject):JSONObject {
  val since=System.currentTimeMillis()-args.optLong("since_seconds",3600).coerceIn(1,86400)*1000
  val target=args.optString("package_name");val limit=args.optInt("limit",10).coerceIn(1,20)
  val rows=activeNotifications.filter{NotificationPolicy.included(it.postTime,since,it.isOngoing,target.isNotBlank())&&(target.isBlank()||it.packageName==target)&&it.packageName!=packageName}.sortedByDescending{it.postTime}.take(limit)
  val now=System.currentTimeMillis()
  return JSONObject().put("status","verified").put("proof_scope","android_active_notifications").put("notifications",JSONArray(rows.map{n->
   val extras=n.notification.extras
   // The expanded wording is what the owner reads in the shade ; the short one is only its first line.
   val body=extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.takeIf{it.isNotBlank()}?:extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
   val fields=ActionPolicy.notificationFields(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty(),body)
   val countdown=NotificationPolicy.countdownSeconds(extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER),extras.getBoolean(Notification.EXTRA_CHRONOMETER_COUNT_DOWN),n.notification.`when`,now)
   JSONObject().put("countdown_remaining_s",countdown?:JSONObject.NULL).put("sub_text",ActionPolicy.notificationText(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty())).put("key",n.key).put("package",n.packageName).put("posted_at_ms",n.postTime)
    .put("title",fields.first)
    .put("text",fields.second)
    .put("can_open",n.notification.contentIntent!=null).put("ongoing",n.isOngoing)
  })).put("persistent_content_storage",false)
 }
 fun act(args:JSONObject):JSONObject {
  val key=args.getString("notification_key");val n=activeNotifications.find{it.key==key}?:return JSONObject().put("status","notification_not_found").put("executed",false)
  if(n.packageName==packageName)return JSONObject().put("status","rejected").put("outcome","own_control_notification_protected").put("executed",false)
  return when(args.getString("action")){
   "dismiss"->{if(n.isOngoing)return JSONObject().put("status","rejected").put("outcome","ongoing_notification").put("executed",false);cancelNotification(key);Thread.sleep(150);val absent=activeNotifications.none{it.key==key};JSONObject().put("status",if(absent)"verified" else "executed").put("proof_scope",if(absent)"notification_absence_observed" else "notification_cancel_requested").put("message_sent",false)}
   "open"->{val intent=n.notification.contentIntent?:return JSONObject().put("status","action_unavailable").put("executed",false);if(!SensitivePolicy.openNotification(intent.isActivity){intent.send()})return JSONObject().put("status","rejected").put("outcome","non_activity_notification_intent_blocked").put("executed",false);JSONObject().put("status","executed").put("proof_scope","notification_content_intent_sent").put("message_sent",false)}
   else->JSONObject().put("status","rejected").put("outcome","unsupported_notification_action").put("executed",false)
  }
 }
}
