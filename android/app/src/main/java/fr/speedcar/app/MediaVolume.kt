package fr.speedcar.app

import android.media.AudioManager
import android.os.SystemClock
import java.util.UUID

data class VolumeResult(
    val commandId: String,
    val before: Int,
    val after: Int,
    val minimum: Int,
    val maximum: Int,
    val target: Int,
    val status: String,
    val durationMs: Long,
)

class MediaVolume(private val audio: AudioManager) {
    fun decrease(steps: Int = 1): VolumeResult {
        require(steps in 1..3)
        val start = SystemClock.elapsedRealtime()
        val stream = AudioManager.STREAM_MUSIC
        val before = audio.getStreamVolume(stream)
        val minimum = audio.getStreamMinVolume(stream)
        val maximum = audio.getStreamMaxVolume(stream)
        val target = (before - steps).coerceAtLeast(minimum)
        val fixed = audio.isVolumeFixed
        if (!fixed && target < before) audio.setStreamVolume(stream, target, 0)
        val after = audio.getStreamVolume(stream)
        val status = when {
            fixed -> "fixed_volume"
            target == before && after == before -> "minimum_reached"
            after == target && after < before -> "verified"
            else -> "indeterminate"
        }
        return VolumeResult(UUID.randomUUID().toString(), before, after, minimum, maximum,
            target, status, SystemClock.elapsedRealtime() - start)
    }
    fun increase(ceilingPercent: Int, steps: Int = 1): VolumeResult {
        val start = SystemClock.elapsedRealtime()
        val stream = AudioManager.STREAM_MUSIC
        val before = audio.getStreamVolume(stream)
        val minimum = audio.getStreamMinVolume(stream)
        val maximum = audio.getStreamMaxVolume(stream)
        val target = VolumePolicy.target(before, minimum, maximum, steps, ceilingPercent)
        val fixed = audio.isVolumeFixed
        if (!fixed && target > before) audio.setStreamVolume(stream, target, 0)
        // Report the actual index read; do not infer acoustic loudness or Bluetooth routing.
        val after = audio.getStreamVolume(stream)
        val status = when {
            fixed -> "fixed_volume"
            target == before && after == before -> "ceiling_reached"
            after == target && after > before -> "verified"
            after == before -> "no_change_observed"
            else -> "indeterminate"
        }
        return VolumeResult(UUID.randomUUID().toString(), before, after, minimum, maximum,
            target, status, SystemClock.elapsedRealtime() - start)
    }
}
