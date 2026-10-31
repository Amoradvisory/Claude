package fr.speedcar.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import org.json.JSONObject

class MainActivity : Activity() {
    private val ink = Color.rgb(236, 245, 240)
    private val muted = Color.rgb(171, 193, 182)
    private val mint = Color.rgb(135, 230, 192)
    private lateinit var result: TextView
    private lateinit var volumeState: TextView
    private lateinit var ceilingLabel: TextView
    private lateinit var audio: AudioManager
    private var ceiling = 60
    private var lastResult = "Aucune action exécutée."
    private val settings by lazy { getSharedPreferences("speed-car", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        audio = getSystemService(AudioManager::class.java)
        ceiling = settings.getInt("ceiling", 60).coerceIn(0, 100)
        lastResult = settings.getString("last_result", lastResult) ?: lastResult

        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(20), dp(24), dp(24))
        }
        val scroll = ScrollView(this).apply { addView(page) }
        scroll.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(scroll)
        page.addView(text("SPEED CAR", 15f, mint).apply { letterSpacing = 0.18f })
        page.addView(text("Tes commandes,\nsans détour.", 34f).apply {
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(14), 0, dp(18))
        })
        page.addView(text("Version locale · commande vocale non connectée", 15f, muted))
        page.addView(text("Configure et teste ces boutons à l’arrêt.", 15f, muted).apply {
            setPadding(0, dp(8), 0, dp(22))
        })

        page.addView(button("Augmenter le volume média", true) {
            try {
                val value = MediaVolume(audio).increase(ceiling)
                val diagnostic = JSONObject().put("capability", "phone_media_volume_up")
                    .put("commandId", value.commandId).put("status", value.status)
                    .put("before", value.before).put("after", value.after)
                    .put("minimum", value.minimum).put("maximum", value.maximum)
                    .put("target", value.target).put("durationMs", value.durationMs)
                    .put("stream", "STREAM_MUSIC")
                    .put("acoustic_loudness_verified", false).toString(2)
                settings.edit().putString("last_diagnostic", diagnostic).apply()
                record(when (value.status) {
                    "verified" -> "Volume média augmenté : ${value.before} → ${value.after} sur ${value.maximum}."
                    "ceiling_reached" -> "Plafond déjà atteint : le volume reste à ${value.after} sur ${value.maximum}."
                    "fixed_volume" -> "Cette sortie audio impose un volume fixe. Aucun changement demandé."
                    "no_change_observed" -> "La demande n’a produit aucun changement de volume observé."
                    else -> "Le volume lu est ${value.after} sur ${value.maximum}. Le résultat reste incertain."
                })
                refreshVolume()
            } catch (_: Exception) {
                record("Le volume n’a pas pu être vérifié. Aucune nouvelle tentative automatique.")
            }
        })
        volumeState = text("", 16f, muted).apply { setPadding(0, dp(12), 0, dp(16)) }
        page.addView(volumeState)
        ceilingLabel = text("", 16f)
        page.addView(ceilingLabel)
        page.addView(SeekBar(this).apply {
            max = 100
            progress = ceiling
            contentDescription = "Plafond du volume média, en pourcentage"
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) {
                    ceiling = progress
                    settings.edit().putInt("ceiling", ceiling).apply()
                    refreshVolume()
                }
                override fun onStartTrackingTouch(bar: SeekBar?) {}
                override fun onStopTrackingTouch(bar: SeekBar?) {}
            })
        })
        page.addView(text("Ce plafond ne baisse pas un volume déjà plus élevé.", 14f, muted).apply {
            setPadding(0, 0, 0, dp(22))
        })
        page.addView(button("YouTube dans Brave", false) {
            try {
                // Persist first: startActivity can pause this Activity immediately.
                record("Demande d’ouverture de YouTube envoyée à Brave. Le chargement de la page reste à constater.")
                if (!BraveYoutube.open(this)) record("Brave est indisponible. Aucune autre application ouverte.")
            } catch (_: SecurityException) {
                record("Android a refusé l’ouverture de Brave.")
            }
        })
        page.addView(text("Aucune vidéo lancée automatiquement.", 14f, muted).apply {
            setPadding(0, dp(10), 0, dp(24))
        })
        page.addView(text("Dernier résultat", 19f).apply { setTypeface(typeface, Typeface.BOLD) })
        result = text(lastResult, 14f, muted).apply {
            setTextIsSelectable(true)
            setPadding(0, dp(10), 0, dp(12))
        }
        page.addView(result)
        page.addView(button("Copier le diagnostic", false) {
            val diagnostic = JSONObject().put("app", "Speed Car")
                .put("version", "0.2.0-local").put("model", Build.MODEL)
                .put("android", Build.VERSION.RELEASE).put("ceilingPercent", ceiling)
                .put("mediaVolume", audio.getStreamVolume(AudioManager.STREAM_MUSIC))
                .put("voice", "not_connected").put("lastResult", lastResult)
                .put("lastVolumeDiagnostic", settings.getString("last_diagnostic", null)).toString(2)
            getSystemService(ClipboardManager::class.java)
                .setPrimaryClip(ClipData.newPlainText("Diagnostic Speed Car", diagnostic))
        })
        refreshVolume()
    }

    override fun onResume() {
        super.onResume()
        if (::audio.isInitialized && ::volumeState.isInitialized) refreshVolume()
    }

    private fun record(value: String) {
        lastResult = value
        settings.edit().putString("last_result", value).apply()
        if (::result.isInitialized) result.text = value
    }

    private fun refreshVolume() {
        if (::volumeState.isInitialized) {
            volumeState.text = "Volume média : ${audio.getStreamVolume(AudioManager.STREAM_MUSIC)} / ${audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)}"
        }
        if (::ceilingLabel.isInitialized) ceilingLabel.text = "Plafond choisi : $ceiling %"
    }

    private fun text(value: String, size: Float, color: Int = ink) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
    }

    private fun button(label: String, primary: Boolean, action: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 18f
        minHeight = dp(66)
        setPadding(dp(16), dp(12), dp(16), dp(12))
        setTextColor(if (primary) Color.rgb(16, 23, 21) else ink)
        background = GradientDrawable().apply {
            cornerRadius = dp(18).toFloat()
            setColor(if (primary) mint else Color.rgb(35, 51, 43))
        }
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
        setOnClickListener { action() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
