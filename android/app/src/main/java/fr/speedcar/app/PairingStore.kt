package fr.speedcar.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class Pairing(val origin: String, val deviceId: String, val token: String)

class PairingStore(private val context: Context) {
    val prefs = context.getSharedPreferences("speed-car-link", Context.MODE_PRIVATE)
    private val alias = "speed-car-device-key-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) return store.getKey(alias, null) as SecretKey
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun importPending() {
        // Bootstrap through the app's private directory; no exported configuration receiver.
        val file = File(context.filesDir, "pairing.pending.json")
        if (!file.exists()) return
        val data = JSONObject(file.readText())
        val origin = data.getString("origin")
        val id = data.getString("deviceId")
        val token = data.getString("token")
        require(origin == "https://speed-car-relay.speed-car-relay.workers.dev")
        UUID.fromString(id)
        require(token.matches(Regex("[A-Za-z0-9_-]{43,128}")))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("origin", origin).putString("deviceId", id)
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("credential", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
        check(file.delete())
    }
    fun read(): Pairing? = try {
        val origin = prefs.getString("origin", null) ?: return null
        val id = prefs.getString("deviceId", null) ?: return null
        val iv = Base64.decode(prefs.getString("iv", null) ?: return null, Base64.NO_WRAP)
        val encrypted = Base64.decode(prefs.getString("credential", null) ?: return null, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        Pairing(origin, id, String(cipher.doFinal(encrypted), Charsets.UTF_8))
    } catch (_: Exception) { null }
}
