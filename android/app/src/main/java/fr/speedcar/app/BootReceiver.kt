package fr.speedcar.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in listOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
        val store = PairingStore(context)
        if (store.prefs.getBoolean("mode_enabled", false) && store.read() != null) {
            try { LinkService.start(context) }
            catch (_: Exception) { store.prefs.edit().putString("link_state", "Ouvrir Speed Car pour reprendre").apply() }
        }
    }
}
