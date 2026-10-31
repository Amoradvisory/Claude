package fr.speedcar.app

import android.app.ActivityOptions
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class RemoteActions(private val context: Context, private val pairing: Pairing, private val ledger: CommandLedger) {
    fun execute(command: JSONObject): JSONObject {
        val id = command.getString("id")
        UUID.fromString(id)
        ledger.existing(id)?.let { return it }
        if (!ledger.claim(id)) return ledger.existing(id)!!
        val start = SystemClock.elapsedRealtime()
        var result = try {
            val expiry = command.getLong("expiresAt")
            when {
                command.optString("deviceId") != pairing.deviceId -> JSONObject().put("status", "rejected").put("reason", "wrong_device")
                expiry <= System.currentTimeMillis() -> JSONObject().put("status", "expired").put("executed", false)
                expiry - System.currentTimeMillis() > maxOf(10000L, NativeCatalog.ttl(command.optString("kind")) + 2000) -> JSONObject().put("status", "rejected").put("reason", "clock_skew")
                !PairingStore(context).prefs.getBoolean("mode_enabled", false) -> JSONObject().put("status", "rejected").put("reason", "mode_disabled")
                else -> when (command.getString("kind")) {
                    "status" -> state().put("status", "verified").put("proof_scope", "android_state")
                    "media_volume_up" -> increase(command.optJSONObject("args")?.optInt("steps", 1) ?: 1)
                    "media_volume_down" -> decrease(command.optJSONObject("args")?.optInt("steps", 1) ?: 1)
                    "youtube_brave" -> openBrave(expiry)
                    else -> NativeCatalog.execute(context, command.getString("kind"), command.optJSONObject("args") ?: JSONObject(), expiry)
                }
            }
        } catch (e: Exception) {
            JSONObject().put("status", "indeterminate").put("error_type", e.javaClass.simpleName)
        }
        val kind=command.optString("kind")
        val prefs=context.getSharedPreferences("speed-car-private",0)
        val revoked=when(kind){"get_location"->!prefs.getBoolean("location_enabled",false)||!LocationActions.permitted(context);"get_notifications"->!prefs.getBoolean("notifications_enabled",false);"screen_context"->!prefs.getBoolean("screen_enabled",false);else->false}
        if(revoked&&result.optString("status")=="verified") result=JSONObject().put("status","cancelled").put("outcome","privacy_revoked").put("proof_scope","authorization_only")
        result.put("command_id", id).put("model", Build.MODEL).put("duration_ms", SystemClock.elapsedRealtime() - start)
            .put("sampled_at", Instant.now().toString())
        if (!result.has("outcome")) result.put("outcome", result.optString("status", "indeterminate"))
        if (!result.has("proof_scope")) result.put("proof_scope", if (result.optString("status") == "permission_required") "authorization_only" else "native_action_receipt")
        ledger.complete(id, result, NativeCatalog.sensitive(command.optString("kind")))
        return result
    }

    fun busy(command: JSONObject): JSONObject {
        val id = command.getString("id"); UUID.fromString(id)
        ledger.existing(id)?.let { return it }
        if (!ledger.claim(id)) return ledger.existing(id)!!
        val result = JSONObject().put("status", "busy").put("executed", false).put("command_id", id)
        ledger.complete(id, result); return result
    }

    private fun increase(steps: Int): JSONObject {
        val prefs = context.getSharedPreferences("speed-car", Context.MODE_PRIVATE)
        val value = MediaVolume(context.getSystemService(AudioManager::class.java)).increase(prefs.getInt("ceiling", 60), steps)
        return JSONObject().put("status", if (value.status in listOf("verified", "ceiling_reached", "fixed_volume")) "verified" else "indeterminate")
            .put("outcome", value.status).put("before", value.before).put("after", value.after)
            .put("minimum", value.minimum).put("maximum", value.maximum).put("target", value.target)
            .put("stream", "STREAM_MUSIC").put("proof_scope", "android_media_index")
            .put("acoustic_loudness_verified", false)
    }

    private fun usageAllowed(): Boolean = context.getSystemService(AppOpsManager::class.java)
        .unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED

    private fun decrease(steps: Int): JSONObject {
        val value = MediaVolume(context.getSystemService(AudioManager::class.java)).decrease(steps)
        return JSONObject().put("status", if (value.status in listOf("verified", "minimum_reached", "fixed_volume")) "verified" else "indeterminate")
            .put("outcome", value.status).put("before", value.before).put("after", value.after)
            .put("minimum", value.minimum).put("maximum", value.maximum).put("target", value.target)
            .put("stream", "STREAM_MUSIC").put("proof_scope", "android_media_index").put("acoustic_loudness_verified", false)
    }

    private fun openBrave(expiry: Long): JSONObject {
        if (!Settings.canDrawOverlays(context)) return JSONObject().put("status", "permission_required")
            .put("permission", "draw_over_other_apps").put("executed", false)
        val began = System.currentTimeMillis()
        val completed = CountDownLatch(1)
        val cancelled = AtomicBoolean(false)
        val error = AtomicReference<Exception?>(null)
        val main = Handler(Looper.getMainLooper())
        val action = Runnable {
            try {
                if (!cancelled.get() && System.currentTimeMillis() < expiry) {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(BraveYoutube.URL))
                        .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(BraveYoutube.PACKAGE)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent, ActivityOptions.makeBasic().apply { launchDisplayId = 0 }.toBundle())
                } else error.set(IllegalStateException("Admission expired"))
            } catch (e: Exception) { error.set(e) } finally { completed.countDown() }
        }
        main.post(action)
        if (!completed.await(1200, TimeUnit.MILLISECONDS)) {
            cancelled.set(true); main.removeCallbacks(action)
            return JSONObject().put("status", "indeterminate").put("reason", "launch_not_confirmed")
        }
        error.get()?.let { return JSONObject().put("status", "rejected").put("error_type", it.javaClass.simpleName).put("executed", false) }
        val canObserve = usageAllowed()
        var resumed = false
        val until = SystemClock.elapsedRealtime() + 1200
        while (canObserve && !resumed && SystemClock.elapsedRealtime() < until) {
            val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(began - 200, System.currentTimeMillis())
            val event = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                if (event.packageName == BraveYoutube.PACKAGE && event.eventType == UsageEvents.Event.ACTIVITY_RESUMED && event.timeStamp >= began - 200) resumed = true
            }
            if (!resumed) Thread.sleep(100)
        }
        val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
        return JSONObject().put("status", if (locked) "launched_behind_lock" else if (resumed) "verified" else "executed")
            .put("executed", true).put("package", BraveYoutube.PACKAGE).put("requested_url", BraveYoutube.URL)
            .put("brave_resumed_observed", resumed).put("page_url_verified", false).put("video_started", false)
            .put("proof_scope", if (resumed) "brave_foreground_only" else "intent_submitted_only")
    }

    fun state(): JSONObject {
        val audio = context.getSystemService(AudioManager::class.java)
        val network = context.getSystemService(ConnectivityManager::class.java)
        val caps = network.getNetworkCapabilities(network.activeNetwork)
        val kind = when {
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "mobile"
            else -> "other_or_unknown"
        }
        return JSONObject().put("version", "2.0.0").put("capabilities", org.json.JSONArray(NativeCatalog.kinds.toList())).put("location_enabled", context.getSharedPreferences("speed-car-private",0).getBoolean("location_enabled",false)).put("location_permission_granted",LocationActions.permitted(context)).put("notifications_enabled",context.getSharedPreferences("speed-car-private",0).getBoolean("notifications_enabled",false)).put("screen_enabled",context.getSharedPreferences("speed-car-private",0).getBoolean("screen_enabled",false)).put("model", Build.MODEL).put("android", Build.VERSION.RELEASE)
            .put("battery_percent", context.getSystemService(BatteryManager::class.java).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            .put("media_volume", audio.getStreamVolume(AudioManager.STREAM_MUSIC)).put("media_maximum", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            .put("audio_mode", audio.mode).put("network", kind)
            .put("interactive", context.getSystemService(PowerManager::class.java).isInteractive)
            .put("locked", context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)
            .put("overlay_allowed", Settings.canDrawOverlays(context)).put("usage_access_allowed", usageAllowed())
            .put("battery_optimization_exempt", context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName))
            .put("notifications_allowed", Build.VERSION.SDK_INT < 33 || context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED)
    }
}
