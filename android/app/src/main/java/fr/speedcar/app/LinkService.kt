package fr.speedcar.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.random.Random

class LinkService : Service() {
    companion object {
        const val STOP = "fr.speedcar.app.STOP_LINK"
        @Volatile var connected = false
            private set
        fun start(context: Context) { context.startForegroundService(Intent(context, LinkService::class.java)) }
        fun stop(context: Context) {
            PairingStore(context).prefs.edit().putBoolean("mode_enabled", false).apply()
            context.stopService(Intent(context, LinkService::class.java))
        }
    }
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private val client = OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS).pingInterval(30, TimeUnit.SECONDS).retryOnConnectionFailure(false).build()
    private lateinit var store: PairingStore
    private lateinit var ledger: CommandLedger
    private var pairing: Pairing? = null
    @Volatile private var socket: WebSocket? = null
    private var stopped = false
    private var connecting = false
    private var failures = 0
    private var lastAttempt = 0L
    private val reconnect = Runnable { connect() }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { handler.post { if (!connected && !connecting) schedule(1000) } }
    }

    override fun onCreate() {
        super.onCreate()
        store = PairingStore(this); ledger = CommandLedger(this); pairing = store.read()
        connected = false
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("speed-car-link", "Connexion Speed Car", NotificationManager.IMPORTANCE_LOW))
        startForeground(73, notification("Connexion en cours"))
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(networkCallback)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { store.prefs.edit().putBoolean("mode_enabled", false).apply(); stopSelf(); return START_NOT_STICKY }
        if (!store.prefs.getBoolean("mode_enabled", false) || pairing == null) { stopSelf(); return START_NOT_STICKY }
        if (!connected && !connecting) schedule(0)
        return START_STICKY
    }
    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getService(this, 1, Intent(this, LinkService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, "speed-car-link").setSmallIcon(fr.speedcar.app.R.drawable.ic_speed_car)
            .setContentTitle("Speed Car").setContentText(text).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Arrêter", stop).build()).build()
    }
    private fun state(value: String) {
        store.prefs.edit().putString("link_state", value).apply()
        getSystemService(NotificationManager::class.java).notify(73, notification(value))
    }
    private fun schedule(delay: Long) {
        if (stopped) return
        handler.removeCallbacks(reconnect)
        handler.postDelayed(reconnect, maxOf(delay, 1000 - (SystemClock.elapsedRealtime() - lastAttempt)))
    }
    private fun connect() {
        if (stopped || connecting || connected || !store.prefs.getBoolean("mode_enabled", false)) return
        val p = pairing ?: return
        connecting = true; lastAttempt = SystemClock.elapsedRealtime(); state("Connexion en cours")
        val request = Request.Builder().url(p.origin.replaceFirst("https://", "wss://") + "/device")
            .header("Authorization", "Bearer ${p.token}").header("X-Speedcar-Device", p.deviceId).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(JSONObject().put("type", "hello").put("deviceId", p.deviceId).put("model", Build.MODEL).toString())
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.length > 16384 || webSocket !== socket) return
                try {
                    val data = JSONObject(text)
                    when (data.optString("type")) {
                        "ready" -> {
                            if (data.optString("deviceId") != p.deviceId) { webSocket.close(1008, "Wrong device"); return }
                            connected = true
                            handler.post { connecting = false; connected = true; failures = 0; state("Connecté au relais") }
                            for ((id, result) in ledger.outbox()) sendResult(webSocket, id, result)
                        }
                        "ack" -> ledger.acknowledge(data.getString("id"))
                        "command" -> {
                            if (!connected) return
                            val actions = RemoteActions(this@LinkService, p, ledger)
                            if (!busy.compareAndSet(false, true)) { sendResult(webSocket, data.getString("id"), actions.busy(data)); return }
                            executor.execute {
                                try { sendResult(webSocket, data.getString("id"), actions.execute(data)) }
                                catch (_: Exception) { /* No effect is repeated after an uncertain result. */ }
                                finally { busy.set(false) }
                            }
                        }
                    }
                } catch (_: Exception) { /* Invalid frames never execute arbitrary commands. */ }
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null) }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { failed(webSocket) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { failed(webSocket) }
        })
    }
    private fun sendResult(ws: WebSocket, id: String, result: JSONObject) {
        ws.send(JSONObject().put("type", "result").put("id", id).put("result", result).toString())
    }
    private fun failed(ws: WebSocket) {
        handler.post {
            if (ws !== socket || stopped) return@post
            socket = null; connecting = false; connected = false; failures = min(failures + 1, 7)
            state("En attente de connexion")
            val delay = min(60_000L, 1000L shl failures)
            schedule(delay + Random.nextLong(delay / 4 + 1))
        }
    }
    override fun onDestroy() {
        LocationActions.cancelAll()
        stopped = true; connected = false; handler.removeCallbacksAndMessages(null)
        socket?.close(1000, "Mode stopped"); socket = null
        try { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) } catch (_: Exception) {}
        executor.execute { ledger.close() }
        executor.shutdown()
        client.dispatcher.executorService.shutdown()
        store.prefs.edit().putString("link_state", "Arrêté").apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
}
