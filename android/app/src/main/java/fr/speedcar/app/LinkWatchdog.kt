package fr.speedcar.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Light safety net when HyperOS kills the process: every 15 minutes, restart the link if the owner left it enabled.
 * Android only allows this background start when Speed Car is exempt from battery optimization; otherwise the owner
 * gets one notification instead of a silent failure.
 */
class LinkWatchdog : JobService() {
    companion object {
        private const val JOB_ID = 7301
        private const val NOTIFICATION_ID = 74
        fun schedule(context: Context) {
            val scheduler = context.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(JOB_ID) != null) return
            scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, LinkWatchdog::class.java))
                .setPeriodic(15 * 60_000L).setPersisted(true).build())
        }
        fun cancel(context: Context) {
            context.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
            context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        }
    }

    override fun onStartJob(params: JobParameters): Boolean {
        val store = PairingStore(this)
        if (store.prefs.getBoolean("mode_enabled", false) && store.read() != null && !LinkService.running) {
            try {
                LinkService.start(this)
                store.prefs.edit().putString("link_state", "Relancé automatiquement").apply()
            } catch (_: Exception) {
                store.prefs.edit().putString("link_state", "Arrêté par Android · ouvrir Speed Car").apply()
                notifyStopped()
            }
        }
        return false
    }

    override fun onStopJob(params: JobParameters): Boolean = false

    private fun notifyStopped() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("speed-car-alert", "Speed Car arrêté", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        manager.notify(NOTIFICATION_ID, Notification.Builder(this, "speed-car-alert").setSmallIcon(R.drawable.ic_speed_car)
            .setContentTitle("Speed Car est arrêté").setContentText("Android l'a fermé. Touchez pour le relancer.")
            .setContentIntent(open).setAutoCancel(true).build())
    }
}
