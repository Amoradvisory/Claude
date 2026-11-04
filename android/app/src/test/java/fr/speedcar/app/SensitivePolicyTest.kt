package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class SensitivePolicyTest {
 @Test fun sharingNeedsExplicitRecipientAndConfirmation(){assertFalse(SensitivePolicy.shareAllowed("",true));assertFalse(SensitivePolicy.shareAllowed("Alice",false));assertTrue(SensitivePolicy.shareAllowed("Alice",true))}
 @Test fun oldOrDifferentScreenSnapshotCannotAct(){assertFalse(SensitivePolicy.screenLease("a","b",true,1));assertFalse(SensitivePolicy.screenLease("a","a",false,1));assertFalse(SensitivePolicy.screenLease("a","a",true,10001));assertTrue(SensitivePolicy.screenLease("a","a",true,1000))}
 @Test fun permissionAndOwnControlScreensStayProtected(){assertTrue(SensitivePolicy.protectedPackage("com.android.permissioncontroller"));assertTrue(SensitivePolicy.protectedPackage("fr.speedcar.app"));assertFalse(SensitivePolicy.protectedPackage("com.spotify.music"))}
 @Test fun bareOneTimeCodeIsMasked(){assertEquals("[code masqué]",ActionPolicy.notificationText("123456"))}
}
