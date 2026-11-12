package fr.speedcar.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.view.accessibility.AccessibilityManager

/** Android's enabled list and the live service are distinct from our local consent toggle. */
object ScreenAccessDiagnostics {
 fun enabled(context:Context):Boolean {
  val expected=ComponentName(context,ScreenAccessService::class.java)
  return context.getSystemService(AccessibilityManager::class.java)
   .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
   .any { it.resolveInfo?.serviceInfo?.let { service->ComponentName(service.packageName,service.name)==expected }==true }
 }
}
