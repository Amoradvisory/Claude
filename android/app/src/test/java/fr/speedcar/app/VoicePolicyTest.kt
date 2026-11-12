package fr.speedcar.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoicePolicyTest {
    // Media during the voice conversation
    @Test fun `media commands stay possible during an internet voice session`() {
        assertFalse(AudioPolicy.telephonyCall(0)); assertFalse(AudioPolicy.telephonyCall(3)); assertTrue(AudioPolicy.voiceSession(3))
    }
    @Test fun `media commands are refused while a telephone call rings or runs`() {
        assertTrue(AudioPolicy.telephonyCall(1)); assertTrue(AudioPolicy.telephonyCall(2)); assertTrue(AudioPolicy.telephonyCall(4))
    }

    // Reading the screen aloud
    @Test fun `a prayer table is read row by row from top to bottom`() {
        val boxes = listOf(
            TextBox("14:52", 300, 340, 600), TextBox("Asr", 300, 340, 40),
            TextBox("Prochaine prière dans", 100, 140, 40), TextBox("01:23:45", 150, 220, 40),
            TextBox("Maghrib", 360, 400, 40), TextBox("17:08", 362, 398, 600),
        )
        assertEquals(listOf("Prochaine prière dans", "01:23:45", "Asr · 14:52", "Maghrib · 17:08"), ScreenText.lines(boxes).lines)
    }
    @Test fun `a container repeating its children is read once`() {
        val boxes = listOf(TextBox("Asr, 14:52", 300, 340, 20), TextBox("Asr", 302, 338, 40), TextBox("14:52", 302, 338, 600))
        assertEquals(listOf("Asr, 14:52"), ScreenText.lines(boxes).lines)
    }
    @Test fun `blank texts vanish and long screens are cut with a flag`() {
        val boxes = (0 until 50).map { TextBox(" ligne  $it ", it * 50, it * 50 + 40, 0) } + TextBox("   ", 9000, 9040, 0)
        val read = ScreenText.lines(boxes, maxLines = 10)
        assertEquals(10, read.lines.size); assertTrue(read.truncated); assertEquals("ligne 0", read.lines.first())
        assertFalse(ScreenText.lines(boxes.take(3)).truncated)
    }
    @Test fun `an empty screen gives no line`() { assertTrue(ScreenText.lines(emptyList()).lines.isEmpty()) }

    // Which application is in front
    @Test fun `the latest resumed application is the one in front`() {
        val front = ForegroundPolicy.front(listOf(UsageSample("com.openai.chatgpt", 1, 10), UsageSample("com.openai.chatgpt", 2, 20), UsageSample("com.amoradvisory.salatlille", 1, 21)))
        assertEquals("com.amoradvisory.salatlille", front!!.packageName); assertFalse(front.paused)
    }
    @Test fun `an application that left the front without a successor is reported as paused`() {
        val front = ForegroundPolicy.front(listOf(UsageSample("com.brave.browser", 1, 10), UsageSample("com.brave.browser", 2, 30)))
        assertTrue(front!!.paused)
    }
    @Test fun `a notification is not an application in front`() {
        assertNull(ForegroundPolicy.front(listOf(UsageSample("com.amoradvisory.salatlille", 12, 10))))
        assertFalse(ForegroundPolicy.resumedSince(listOf(UsageSample("com.amoradvisory.salatlille", 12, 10)), "com.amoradvisory.salatlille", 0))
    }
    @Test fun `only a resume after the request proves the launch`() {
        val samples = listOf(UsageSample("com.brave.browser", 1, 100))
        assertFalse(ForegroundPolicy.resumedSince(samples, "com.brave.browser", 500))
        assertTrue(ForegroundPolicy.resumedSince(samples + UsageSample("com.brave.browser", 1, 600), "com.brave.browser", 500))
    }

    // Spoken application names
    @Test fun `spoken names resolve whatever the accents and case`() {
        assertEquals("com.amoradvisory.salatlille", AppAliases.packageFor("Salât Lille"))
        assertEquals("com.amoradvisory.salatlille", AppAliases.packageFor("  salat   lille "))
        assertEquals("com.amoradvisory.salatlille", AppAliases.packageFor("l’application de prière"))
        assertEquals("com.openai.chatgpt", AppAliases.packageFor("ChatGPT"))
        assertNull(AppAliases.packageFor("une application inconnue"))
    }

    // Notifications read without leaving the conversation
    @Test fun `the permanent notification of a named application is read whatever its age`() {
        assertTrue(NotificationPolicy.included(postedAt = 10, since = 1000, ongoing = true, packageFilter = true))
        assertFalse(NotificationPolicy.included(postedAt = 10, since = 1000, ongoing = true, packageFilter = false))
        assertFalse(NotificationPolicy.included(postedAt = 10, since = 1000, ongoing = false, packageFilter = true))
        assertTrue(NotificationPolicy.included(postedAt = 2000, since = 1000, ongoing = false, packageFilter = false))
    }
    @Test fun `a countdown is reported only when the notification really shows one`() {
        assertEquals(90L, NotificationPolicy.countdownSeconds(true, true, target = 100_000, now = 10_000))
        assertNull(NotificationPolicy.countdownSeconds(true, false, 100_000, 10_000))
        assertNull(NotificationPolicy.countdownSeconds(false, true, 100_000, 10_000))
        assertNull(NotificationPolicy.countdownSeconds(true, true, 5_000, 10_000))
    }

    // Pressing on the screen
    @Test fun `controls that pay send delete sign in or grant are never pressed`() {
        for (label in listOf("Payer", "Acheter maintenant", "Envoyer", "Supprimer", "Se connecter", "Autoriser", "Tout accepter", "Confirmer le paiement", "S’abonner", "Installer"))
            assertFalse(label, ClickPolicy.allowed(label, buttonLike = false))
        assertFalse(ClickPolicy.allowed("Envoyer le message à toute la liste de contacts", buttonLike = true))
    }
    @Test fun `an unlabelled target is never pressed`() { assertFalse(ClickPolicy.allowed("", true)); assertFalse(ClickPolicy.allowed("   ", false)) }
    @Test fun `ordinary content and playback controls can be pressed`() {
        assertTrue(ClickPolicy.allowed("Lofi hip hop radio – beats to relax/study to", false))
        assertTrue(ClickPolicy.allowed("Lire", true)); assertTrue(ClickPolicy.allowed("Pause", true))
        assertTrue(ClickPolicy.allowed("Sourate Al-Kahf récitation complète par Mishary Alafasy", false))
    }
    @Test fun `a long title containing a risky word is content, not a control`() {
        assertTrue(ClickPolicy.allowed("Adele - Send My Love (To Your New Lover) official video", buttonLike = false))
        assertFalse(ClickPolicy.allowed("Send", buttonLike = false))
    }
    @Test fun `the wanted text is matched without accents or case`() {
        assertTrue(ClickPolicy.matches("Sourate Al-Kahf – Récitation", "recitation")); assertFalse(ClickPolicy.matches("Maghrib", "Asr")); assertFalse(ClickPolicy.matches("Asr", " "))
    }
}
