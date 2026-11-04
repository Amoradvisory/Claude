package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class ReviewSafetyTest {
 @Test fun secretInBodyIsSuppressedUsingItsTitleContext(){val fields=ActionPolicy.notificationFields("Code de vérification","AB12-CD34");assertFalse(fields.first.contains("vérification"));assertFalse(fields.second.contains("AB12"))}
 @Test fun expiredLocationCancelsCurrentAndLateResourcesExactlyOnce(){var now=10L;var stops=0;val op=OperationLease(20){now};op.onCancel{stops++};now=21;assertFalse(op.valid());op.close();op.close();op.onCancel{stops++};assertEquals(2,stops)}
 @Test fun audioInterruptedDuringInitializationNeverStarts(){val gate=PlaybackGate();var starts=0;gate.interrupt{};assertFalse(gate.start(true){starts++});assertEquals(0,starts)}
 @Test fun audioInterruptedAfterStartStopsAndCannotRestart(){val gate=PlaybackGate();var sounds=0;assertTrue(gate.start(true){sounds++});gate.interrupt{sounds--};assertEquals(0,sounds);assertFalse(gate.start(true){sounds++})}
 @Test fun nonActivityNotificationCannotRunItsSideEffect(){var sends=0;assertFalse(SensitivePolicy.openNotification(false){sends++});assertEquals(0,sends);assertTrue(SensitivePolicy.openNotification(true){sends++});assertEquals(1,sends)}
}
