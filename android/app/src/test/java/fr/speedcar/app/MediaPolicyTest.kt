package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class MediaPolicyTest {
 @Test fun choosesOnlyPlayingSessionWhenUnambiguous(){assertEquals(1,MediaPolicy.choose(listOf(SessionSummary("a",false),SessionSummary("b",true)),null))}
 @Test fun refusesTwoPlayingSessions(){assertNull(MediaPolicy.choose(listOf(SessionSummary("a",true),SessionSummary("b",true)),null))}
 @Test fun explicitPackageDoesNotChooseAnotherApp(){assertNull(MediaPolicy.choose(listOf(SessionSummary("a",true)),"b"))}
 @Test fun exactSinglePausedSessionCanBeResumed(){assertEquals(0,MediaPolicy.choose(listOf(SessionSummary("a",false)),"a"))}
}
