package fr.speedcar.app

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class ScreenAccessService:AccessibilityService() {
 companion object {@Volatile var instance:ScreenAccessService?=null}
 private val nodes=linkedMapOf<String,AccessibilityNodeInfo>();private var snapshot="";private var captured=0L;private var capturedPackage="";private var window=-1
 private val main=Handler(Looper.getMainLooper())
 override fun onServiceConnected(){instance=this}
 override fun onAccessibilityEvent(event:AccessibilityEvent?){}
 override fun onInterrupt(){clear()}
 override fun onDestroy(){if(instance===this)instance=null;clear();super.onDestroy()}
 @Synchronized private fun clear(){nodes.values.forEach{it.recycle()};nodes.clear();snapshot="";main.removeCallbacksAndMessages(null)}
 private fun allowed(pkg:String):Boolean {val p=getSharedPreferences("speed-car-private",0);return p.getBoolean("screen_enabled",false)&&!SensitivePolicy.protectedPackage(pkg)&&p.getStringSet("screen_apps",emptySet()).orEmpty().contains(pkg)}
 @Synchronized fun context(args:JSONObject):JSONObject {
  val root=rootInActiveWindow?:return JSONObject().put("status","screen_unavailable")
  val pkg=root.packageName?.toString().orEmpty();if(!allowed(pkg)){root.recycle();return JSONObject().put("status","screen_access_not_allowed").put("executed",false)}
  clear();snapshot=UUID.randomUUID().toString();captured=SystemClock.elapsedRealtime();capturedPackage=pkg;window=root.windowId
  val limit=args.optInt("max_nodes",40).coerceIn(1,80);val text=args.optBoolean("include_text",false);val queue=java.util.ArrayDeque<AccessibilityNodeInfo>();queue.add(root);val result=JSONArray()
  while(queue.isNotEmpty()&&nodes.size<limit){val node=queue.removeFirst();if(!node.isVisibleToUser){node.recycle();continue};val id="n${nodes.size+1}";nodes[id]=node;val row=JSONObject().put("node_id",id).put("role",node.className?.toString()).put("clickable",node.isClickable).put("scrollable",node.isScrollable).put("password_field",node.isPassword)
   if(text&&!node.isPassword){row.put("text",ActionPolicy.notificationText(node.text?.toString().orEmpty())).put("description",ActionPolicy.notificationText(node.contentDescription?.toString().orEmpty()))}
   result.put(row)
   if(!node.isPassword)for(i in 0 until minOf(node.childCount,limit)){if(queue.size+nodes.size>=limit*2)break;node.getChild(i)?.let{queue.add(it)}}
  }
  while(queue.isNotEmpty())queue.removeFirst().recycle()
  val capturedId=snapshot;main.postDelayed({synchronized(this){if(snapshot==capturedId)clear()}},10000)
  return JSONObject().put("status","verified").put("proof_scope","android_accessibility_semantic_tree").put("snapshot_id",snapshot).put("package",pkg).put("nodes",result).put("screenshot_included",false).put("expires_in_ms",10000)
 }
 @Synchronized fun act(args:JSONObject):JSONObject {
  val root=rootInActiveWindow?:return JSONObject().put("status","screen_unavailable");val pkg=root.packageName?.toString().orEmpty();val sameWindow=root.windowId==window;root.recycle()
  if(!allowed(pkg)||args.optString("snapshot_id")!=snapshot||!SensitivePolicy.screenLease(pkg,capturedPackage,sameWindow,SystemClock.elapsedRealtime()-captured))return JSONObject().put("status","stale_or_unauthorized_snapshot").put("executed",false)
  val action=args.getString("action");val accepted=if(action=="back")performGlobalAction(GLOBAL_ACTION_BACK)else{
   val node=if(args.has("node_id"))nodes[args.getString("node_id")]else nodes.values.filter{it.isScrollable}.singleOrNull()
   if(node==null||!node.isScrollable||!node.refresh())return JSONObject().put("status","scroll_target_required_or_stale").put("executed",false)
   when(action){"scroll_forward"->node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);"scroll_backward"->node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);else->return JSONObject().put("status","rejected").put("outcome","sensitive_click_and_text_entry_not_supported").put("executed",false)}
  }
  clear();return JSONObject().put("status",if(accepted)"executed" else "rejected").put("proof_scope","accessibility_action_acceptance_only").put("accepted",accepted).put("visual_change_verified",false)
 }
}
