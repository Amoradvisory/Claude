package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class ActionPolicyTest {
 @Test fun webLinksRejectPrivilegesAndCredentials(){ for(u in listOf("javascript:alert(1)","file:///sdcard/x","intent://x","https://user:pass@example.org")) assertThrows(IllegalArgumentException::class.java){ActionPolicy.webUrl(u)}; assertEquals("https://example.org/a",ActionPolicy.webUrl("https://example.org/a")) }
 @Test fun mapsEncodeDestinationWithoutInjectingMode(){val u=ActionPolicy.navigationUri("gare de Lille &mode=x","walking");assertTrue(u.contains("mode=w"));assertTrue(u.contains("%26mode%3Dx"));assertFalse(u.contains("&mode=x"))}
 @Test fun transitUsesOfficialDirectionsUrl(){assertTrue(ActionPolicy.navigationUri("Lille","transit").contains("travelmode=transit"))}
 @Test fun coordinatesMustBeFiniteAndInRange(){assertThrows(IllegalArgumentException::class.java){ActionPolicy.coordinates(Double.NaN,1.0)};assertThrows(IllegalArgumentException::class.java){ActionPolicy.coordinates(91.0,1.0)}}
 @Test fun absoluteVolumeRespectsLocalCeiling(){assertEquals(85,ActionPolicy.volumeTarget(50,0,170,60));assertEquals(102,ActionPolicy.volumeTarget(100,0,170,60));assertThrows(IllegalArgumentException::class.java){ActionPolicy.volumeTarget(-1,0,170,60)}}
 @Test fun appResolutionPrefersExactAndRefusesAmbiguity(){val a=listOf(AppEntry("a.one","Carte"),AppEntry("b.two","Cartes"));assertEquals("a.one",ActionPolicy.apps("carte",a).single().packageName);assertEquals(2,ActionPolicy.apps("cart",a).size)}
 @Test fun privateNotificationSecretsAreRemoved(){assertEquals("[contenu sensible masqué]",ActionPolicy.notificationText("Votre code OTP est 123456"));assertEquals("Bonjour",ActionPolicy.notificationText("Bonjour"))}
 @Test fun dangerousDialStringsAreRejected(){assertThrows(IllegalArgumentException::class.java){ActionPolicy.phoneNumber("*21*123#")};assertEquals("+33123456789",ActionPolicy.phoneNumber("+33 1 23 45 67 89"))}
}
