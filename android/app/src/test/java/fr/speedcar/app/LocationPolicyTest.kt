package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class LocationPolicyTest {
 @Test fun cachedFixIsRejectedWhenCallerRequiresCurrent(){assertFalse(ActionPolicy.acceptLocation(5000,false,false,30,false))}
 @Test fun recentCachedFixIsClearlyAllowedOnlyOnOptIn(){assertTrue(ActionPolicy.acceptLocation(5000,false,true,30,false));assertFalse(ActionPolicy.acceptLocation(31000,false,true,30,false))}
 @Test fun mockFixNeverCountsAsRealLocation(){assertFalse(ActionPolicy.acceptLocation(0,true,true,30,true))}
 @Test fun freshFixCanSatisfyZeroCacheAge(){assertTrue(ActionPolicy.acceptLocation(100,true,false,0,false))}
}
