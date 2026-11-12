package fr.speedcar.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
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
 fun allowedFor(pkg:String)=allowed(pkg)
 /** Package of the focused window ; no content is read. */
 fun frontPackage():String? {val root=rootInActiveWindow?:return null;val pkg=root.packageName?.toString();root.recycle();return pkg}
 private fun label(node:AccessibilityNodeInfo):String=node.text?.toString()?.takeIf{it.isNotBlank()}?:node.contentDescription?.toString().orEmpty()
 /**
  * Visible texts only, as lines from top to bottom : what a person would read aloud. No node is kept,
  * nothing can be acted upon from this reading. Password fields are skipped with everything below them.
  */
 @Synchronized fun lines(args:JSONObject,expectPackage:String?=null):JSONObject {
  val root=rootInActiveWindow?:return JSONObject().put("status","screen_unavailable")
  val pkg=root.packageName?.toString().orEmpty()
  if(expectPackage!=null&&pkg!=expectPackage){root.recycle();return JSONObject().put("status","other_window_in_front").put("executed",false)}
  if(!allowed(pkg)){root.recycle();return JSONObject().put("status","screen_access_not_allowed").put("executed",false)}
  val boxes=ArrayList<TextBox>();val queue=java.util.ArrayDeque<AccessibilityNodeInfo>();queue.add(root);var scanned=0;val rect=Rect()
  while(queue.isNotEmpty()&&scanned<400){val node=queue.removeFirst();scanned++
   if(node.isVisibleToUser&&!node.isPassword){
    val text=label(node)
    if(text.isNotBlank()){node.getBoundsInScreen(rect);boxes.add(TextBox(ActionPolicy.notificationText(text),rect.top,rect.bottom,rect.left))}
    for(i in 0 until node.childCount)node.getChild(i)?.let{queue.add(it)}
   }
   node.recycle()
  }
  val cut=queue.isNotEmpty();while(queue.isNotEmpty())queue.removeFirst().recycle()
  val out=ScreenText.lines(boxes,args.optInt("max_lines",40).coerceIn(1,60))
  return JSONObject().put("status","verified").put("proof_scope","android_accessibility_visible_text").put("package",pkg).put("lines",JSONArray(out.lines)).put("truncated",out.truncated||cut).put("nodes_scanned",scanned).put("screenshot_included",false)
 }
 private fun clickable(node:AccessibilityNodeInfo):AccessibilityNodeInfo? {var current:AccessibilityNodeInfo?=node;repeat(6){val n=current?:return null;if(n.isClickable)return n;current=n.parent};return null}
 private fun buttonLike(node:AccessibilityNodeInfo)=node.className?.toString().orEmpty().let{it.endsWith("Button")||it.endsWith("ImageView")}
 /** One press on a labelled, harmless target of an allowed application. Never a field, never a risky control. */
 private fun press(node:AccessibilityNodeInfo):JSONObject {
  val target=clickable(node)?:return JSONObject().put("status","rejected").put("outcome","target_not_clickable").put("executed",false)
  val wording=listOf(label(node),label(target)).filter{it.isNotBlank()}.distinct().joinToString(" ")
  if(node.isPassword||node.isEditable||target.isPassword||target.isEditable)return JSONObject().put("status","rejected").put("outcome","text_fields_are_never_pressed").put("executed",false)
  if(wording.isBlank())return JSONObject().put("status","rejected").put("outcome","unlabelled_target_refused").put("executed",false)
  if(!ClickPolicy.allowed(wording,buttonLike(target)||buttonLike(node)))return JSONObject().put("status","rejected").put("outcome","sensitive_target_refused").put("executed",false)
  val accepted=target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  return JSONObject().put("status",if(accepted)"executed" else "rejected").put("proof_scope","accessibility_action_acceptance_only").put("accepted",accepted).put("pressed_label",ActionPolicy.notificationText(wording).take(120)).put("visual_change_verified",false).put("effect_verified",false)
 }
 private fun pressByText(root:AccessibilityNodeInfo,args:JSONObject):JSONObject {
  val wanted=args.optString("text");if(wanted.isBlank())return JSONObject().put("status","rejected").put("outcome","text_or_node_id_required").put("executed",false)
  val matches=ArrayList<Pair<Int,AccessibilityNodeInfo>>();val queue=java.util.ArrayDeque<AccessibilityNodeInfo>();queue.add(root);var scanned=0;val rect=Rect()
  while(queue.isNotEmpty()&&scanned<400){val node=queue.removeFirst();scanned++
   if(!node.isVisibleToUser||node.isPassword)continue
   if(ClickPolicy.matches(label(node),wanted)){node.getBoundsInScreen(rect);matches.add(rect.top*10000+rect.left to node)}
   for(i in 0 until node.childCount)node.getChild(i)?.let{queue.add(it)}
  }
  // A container and its child often carry the same words : one press target counts once.
  val targets=matches.sortedBy{it.first}.map{it.second}.distinctBy{clickable(it)?:it}
  if(targets.isEmpty())return JSONObject().put("status","target_not_found").put("executed",false).put("visible_matches",0)
  val index=args.optInt("occurrence",1).coerceIn(1,10)-1
  if(index>=targets.size)return JSONObject().put("status","target_not_found").put("executed",false).put("visible_matches",targets.size)
  return press(targets[index]).put("visible_matches",targets.size)
 }
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
  val root=rootInActiveWindow?:return JSONObject().put("status","screen_unavailable");val pkg=root.packageName?.toString().orEmpty();val sameWindow=root.windowId==window
  val action=args.getString("action")
  if(action=="click"){
   // A separate, owner-controlled switch : reading the screen never implies pressing on it.
   if(!getSharedPreferences("speed-car-private",0).getBoolean("ui_click_enabled",false)){root.recycle();return JSONObject().put("status","permission_required").put("permission","local_press_toggle").put("executed",false)}
   if(!allowed(pkg)){root.recycle();return JSONObject().put("status","screen_access_not_allowed").put("executed",false)}
   if(!args.has("node_id")){val result=pressByText(root,args);clear();return result}
  }
  root.recycle()
  if(!allowed(pkg)||args.optString("snapshot_id")!=snapshot||!SensitivePolicy.screenLease(pkg,capturedPackage,sameWindow,SystemClock.elapsedRealtime()-captured))return JSONObject().put("status","stale_or_unauthorized_snapshot").put("executed",false)
  if(action=="click"){val node=nodes[args.getString("node_id")];if(node==null||!node.refresh())return JSONObject().put("status","target_not_found").put("executed",false);val result=press(node);clear();return result}
  val accepted=if(action=="back")performGlobalAction(GLOBAL_ACTION_BACK)else{
   val node=if(args.has("node_id"))nodes[args.getString("node_id")]else nodes.values.filter{it.isScrollable}.singleOrNull()
   if(node==null||!node.isScrollable||!node.refresh())return JSONObject().put("status","scroll_target_required_or_stale").put("executed",false)
   when(action){"scroll_forward"->node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);"scroll_backward"->node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);else->return JSONObject().put("status","rejected").put("outcome","sensitive_click_and_text_entry_not_supported").put("executed",false)}
  }
  clear();return JSONObject().put("status",if(accepted)"executed" else "rejected").put("proof_scope","accessibility_action_acceptance_only").put("accepted",accepted).put("visual_change_verified",false)
 }
}
