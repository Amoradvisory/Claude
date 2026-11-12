package fr.speedcar.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process

/** Which application is really in front of the owner, from Android's own records. */
object ForegroundProbe {
    private const val LOOKBACK_MS = 6 * 3_600_000L

    fun usageAllowed(context: Context): Boolean = context.getSystemService(AppOpsManager::class.java)
        .unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED

    private fun samples(context: Context, from: Long): List<UsageSample> {
        val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(from, System.currentTimeMillis() + 1000)
        val event = UsageEvents.Event(); val out = ArrayList<UsageSample>()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == ForegroundPolicy.RESUMED || event.eventType == ForegroundPolicy.PAUSED || event.eventType == ForegroundPolicy.STOPPED)
                out.add(UsageSample(event.packageName.orEmpty(), event.eventType, event.timeStamp))
        }
        return out
    }

    /** True once Android recorded the package coming to the front after [since]. Needs usage access. */
    fun resumedSince(context: Context, packageName: String, since: Long): Boolean =
        ForegroundPolicy.resumedSince(samples(context, since), packageName, since)

    /** Latest application brought to the front according to usage records; null when unknown. */
    fun fromUsage(context: Context): FrontApp? = ForegroundPolicy.front(samples(context, System.currentTimeMillis() - LOOKBACK_MS))

    /** Package of the window that currently has focus, when the owner enabled the screen-context service. */
    fun fromAccessibility(): String? = try { ScreenAccessService.instance?.frontPackage() } catch (_: Exception) { null }
}
