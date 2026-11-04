package fr.speedcar.app

import kotlin.math.min

/** Timing rules of the relay link, free of Android types so they can be unit tested. */
object LinkPolicy {
    /** Application heartbeat; the relay answers it without waking and uses it to detect half-open sockets. */
    const val HEARTBEAT_MS = 25_000L
    const val PONG_TIMEOUT_MS = 10_000L
    /** While driving a reconnection must never wait a minute: 1, 2, 4, 8 then 15 s. */
    const val MAX_BACKOFF_MS = 15_000L
    /** Without any network, wait for Android's callback; this is only a safety net. */
    const val NO_NETWORK_RETRY_MS = 60_000L
    const val MAX_FAILURES = 4

    fun backoffMs(failures: Int): Long = min(MAX_BACKOFF_MS, 1000L shl failures.coerceIn(0, MAX_FAILURES))

    /** A sent heartbeat stays unanswered too long. Relays that never answered (older versions) are not judged. */
    fun pongOverdue(pingAt: Long, pongAt: Long, now: Long, relayAnswers: Boolean): Boolean =
        relayAnswers && pingAt > pongAt && now - pingAt > PONG_TIMEOUT_MS

    /** A socket opened on one network is dead once Android moves the default route to another one. */
    fun mustReconnect(boundNetwork: Long?, newDefault: Long): Boolean = boundNetwork != null && boundNetwork != newDefault
}
