package fr.speedcar.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkPolicyTest {
    @Test fun `backoff doubles then stays at fifteen seconds`() {
        assertEquals(listOf(1000L, 2000L, 4000L, 8000L, 15_000L, 15_000L, 15_000L), (0..6).map { LinkPolicy.backoffMs(it) })
    }
    @Test fun `negative or huge failure counts stay bounded`() {
        assertEquals(1000L, LinkPolicy.backoffMs(-3))
        assertEquals(15_000L, LinkPolicy.backoffMs(63))
    }
    @Test fun `unanswered heartbeat is overdue after the timeout`() {
        assertFalse(LinkPolicy.pongOverdue(pingAt = 100_000, pongAt = 75_000, now = 109_000, relayAnswers = true))
        assertTrue(LinkPolicy.pongOverdue(pingAt = 100_000, pongAt = 75_000, now = 110_001, relayAnswers = true))
    }
    @Test fun `answered heartbeat is never overdue`() {
        assertFalse(LinkPolicy.pongOverdue(pingAt = 100_000, pongAt = 100_050, now = 500_000, relayAnswers = true))
    }
    @Test fun `older relay without heartbeat answers is never judged`() {
        assertFalse(LinkPolicy.pongOverdue(pingAt = 100_000, pongAt = 0, now = 500_000, relayAnswers = false))
    }
    @Test fun `a refused pairing is named and only retried slowly`() {
        assertTrue(LinkPolicy.refusal(401)!!.contains("Appairage refusé")); assertTrue(LinkPolicy.credentialsRefused(401)); assertTrue(LinkPolicy.credentialsRefused(403))
        assertFalse(LinkPolicy.credentialsRefused(503)); assertFalse(LinkPolicy.credentialsRefused(null))
        assertEquals(null, LinkPolicy.refusal(null)); assertEquals(null, LinkPolicy.refusal(101))
    }
    @Test fun `a hanging handshake is abandoned before the heartbeat would judge it`() {
        assertTrue(LinkPolicy.HANDSHAKE_TIMEOUT_MS < LinkPolicy.HEARTBEAT_MS)
        assertTrue(LinkPolicy.WAKE_PONG_TIMEOUT_MS < LinkPolicy.PONG_TIMEOUT_MS)
    }
    @Test fun `default network change forces a reconnection`() {
        assertTrue(LinkPolicy.mustReconnect(boundNetwork = 101L, newDefault = 202L))
        assertFalse(LinkPolicy.mustReconnect(boundNetwork = 101L, newDefault = 101L))
        assertFalse(LinkPolicy.mustReconnect(boundNetwork = null, newDefault = 202L))
    }
}
