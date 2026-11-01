package fr.speedcar.app

import android.content.Context
import android.content.Intent
import android.os.SystemClock

/** In-memory only; one low-priority, transient worker per refresh, no periodic work. */
object AppCatalog {
 @Volatile private var catalog:LazyCatalog<AppEntry>?=null
 fun request(context:Context):CatalogView<AppEntry> {
  val current=catalog?:synchronized(this){catalog?:create(context.applicationContext).also{catalog=it}}
  return current.request()
 }
 private fun create(context:Context)=LazyCatalog<AppEntry>(300000L,{SystemClock.elapsedRealtime()},
  {job->Thread({android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);job()},"speedcar-app-catalog").apply{isDaemon=true;start()}},
  {
   val pm=context.packageManager
   pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
    .distinctBy{it.activityInfo.packageName}.take(512).map{
     val pkg=it.activityInfo.packageName
     AppEntry(pkg,try{it.loadLabel(pm).toString()}catch(_:Exception){pkg})
    }.sortedBy{it.label.lowercase()}
  })
}
