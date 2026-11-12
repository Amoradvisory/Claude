package fr.speedcar.app

import java.text.Normalizer
import java.util.Locale

/** Rules added for hands-free use (2.1.0). Free of Android types so they can be unit tested. */

object AudioPolicy {
    // android.media.AudioManager.MODE_* values.
    private const val MODE_RINGTONE = 1
    private const val MODE_IN_CALL = 2
    private const val MODE_IN_COMMUNICATION = 3
    private const val MODE_CALL_SCREENING = 4

    /** A telephone call is ringing or in progress: media transport commands stay refused. */
    fun telephonyCall(mode: Int): Boolean = mode == MODE_RINGTONE || mode == MODE_IN_CALL || mode == MODE_CALL_SCREENING

    /**
     * An internet voice session (the ChatGPT voice conversation itself runs in this mode).
     * Pause, play and skip must work from it, otherwise "mets pause" can never be said by voice.
     */
    fun voiceSession(mode: Int): Boolean = mode == MODE_IN_COMMUNICATION
}

data class TextBox(val text: String, val top: Int, val bottom: Int, val left: Int)
data class ScreenLines(val lines: List<String>, val truncated: Boolean)

/** Turns scattered on-screen texts into lines read top to bottom, left to right. */
object ScreenText {
    fun lines(boxes: List<TextBox>, maxLines: Int = 40, maxChars: Int = 200): ScreenLines {
        val clean = boxes.map { it.copy(text = it.text.replace(Regex("\\s+"), " ").trim()) }.filter { it.text.isNotEmpty() }
            .sortedWith(compareBy({ (it.top + it.bottom) / 2 }, { it.left }))
        val rows = mutableListOf<MutableList<TextBox>>()
        for (box in clean) {
            val row = rows.lastOrNull()
            val anchor = row?.first()
            val center = (box.top + box.bottom) / 2
            val sameRow = anchor != null && (center in anchor.top..anchor.bottom || (anchor.top + anchor.bottom) / 2 in box.top..box.bottom)
            if (sameRow) row!!.add(box) else rows.add(mutableListOf(box))
        }
        val out = mutableListOf<String>()
        for (row in rows) {
            val texts = row.sortedBy { it.left }.map { it.text }.distinct()
            // A container often repeats the words of its children: keep the fullest wording only.
            val kept = texts.filter { t -> texts.none { other -> other.length > t.length && other.contains(t) } }
            val line = kept.joinToString(" · ").take(maxChars)
            if (line.isNotEmpty() && out.lastOrNull() != line) out.add(line)
        }
        return ScreenLines(out.take(maxLines), out.size > maxLines)
    }
}

data class UsageSample(val packageName: String, val type: Int, val at: Long)
data class FrontApp(val packageName: String, val since: Long, val paused: Boolean)

object ForegroundPolicy {
    // android.app.usage.UsageEvents.Event values.
    const val RESUMED = 1
    const val PAUSED = 2
    const val STOPPED = 23

    /** The application of the latest "activity resumed" event; paused when it left the front afterwards. */
    fun front(samples: List<UsageSample>): FrontApp? {
        var current: FrontApp? = null
        for (sample in samples.sortedBy { it.at }) {
            if (sample.type == RESUMED) current = FrontApp(sample.packageName, sample.at, false)
            else if ((sample.type == PAUSED || sample.type == STOPPED) && current?.packageName == sample.packageName) current = current.copy(paused = true)
        }
        return current
    }
    fun resumedSince(samples: List<UsageSample>, packageName: String, since: Long): Boolean =
        samples.any { it.packageName == packageName && it.type == RESUMED && it.at >= since }
}

object AppAliases {
    private val known = mapOf(
        "spotify" to "com.spotify.music", "google maps" to "com.google.android.apps.maps", "maps" to "com.google.android.apps.maps",
        "whatsapp" to "com.whatsapp", "brave" to "com.brave.browser", "chrome" to "com.android.chrome",
        "youtube" to "com.google.android.youtube", "chatgpt" to "com.openai.chatgpt", "chat gpt" to "com.openai.chatgpt",
        "salat lille" to "com.amoradvisory.salatlille", "salat" to "com.amoradvisory.salatlille",
        "priere" to "com.amoradvisory.salatlille", "application de priere" to "com.amoradvisory.salatlille", "l'application de priere" to "com.amoradvisory.salatlille",
    )
    fun key(spoken: String): String = Normalizer.normalize(spoken, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        .replace('’', '\'').lowercase(Locale.ROOT).replace(Regex("\\s+"), " ").trim()
    /** Spoken names resolved without waiting for the application inventory. */
    fun packageFor(spoken: String): String? = known.entries.firstOrNull { AppNamePolicy.compact(it.key) == AppNamePolicy.compact(spoken) }?.value
}

object NotificationPolicy {
    /** A package filter asks for "what this application shows now": its permanent notification counts whatever its age. */
    fun included(postedAt: Long, since: Long, ongoing: Boolean, packageFilter: Boolean): Boolean = postedAt >= since || (ongoing && packageFilter)

    /** Seconds left on a notification chronometer counting down, as the notification shade displays it. */
    fun countdownSeconds(showsChronometer: Boolean, countsDown: Boolean, target: Long, now: Long): Long? =
        if (showsChronometer && countsDown && target > now) (target - now) / 1000 else null
}

object ClickPolicy {
    private val risky = Regex("\\b(pay|payer|paiement|payment|acheter|achat|buy|purchase|commander|checkout|envoyer|send|supprimer|delete|effacer|autoriser|allow|accepter|accept|confirmer|confirm|valider|installer|install|desinstaller|uninstall|connecter|connexion|sign in|log in|login|inscrire|sign up|virement|transfer|transferer|password|mot de passe|appeler|call|publier|partager|share|abonner|subscribe|souscrire)\\b")

    /**
     * Only labelled targets, and never a control that pays, sends, deletes, signs in or grants.
     * Long labels are content titles (a song called "Call me…"), not controls: the word list only
     * applies to buttons and to short labels.
     */
    fun allowed(label: String, buttonLike: Boolean): Boolean {
        val key = AppAliases.key(label)
        if (key.isEmpty()) return false
        val control = buttonLike || key.split(' ').size <= 4
        return !(control && risky.containsMatchIn(key))
    }
    fun matches(label: String, wanted: String): Boolean = wanted.isNotBlank() && AppAliases.key(label).contains(AppAliases.key(wanted))
}
