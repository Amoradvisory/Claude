package fr.speedcar.app
import org.junit.Assert.*
import org.junit.Test
class LazyCatalogTest {
 @Test fun coldRequestReturnsWithoutExecutingSlowLoaderAndDoesNotScheduleDuplicates(){val jobs=mutableListOf<()->Unit>();var loads=0;val c=LazyCatalog<String>(300000,{100L},{jobs.add(it)},{loads++;listOf("Maps")});assertEquals("catalog_loading",c.request().state);assertEquals(0,loads);c.request();assertEquals(1,jobs.size);jobs.removeAt(0)();assertEquals(listOf("Maps"),c.request().items);assertEquals(1,loads)}
 @Test fun cachedReadsDoNotReloadUntilExpired(){val jobs=mutableListOf<()->Unit>();var now=10L;val c=LazyCatalog<String>(100,{now},{jobs.add(it)},{listOf("app")});c.request();jobs.removeAt(0)();now=50;assertEquals("ready",c.request().state);assertTrue(jobs.isEmpty());now=111;assertEquals("catalog_loading",c.request().state);assertEquals(1,jobs.size)}
 @Test fun aFailedLoadHasABoundedRetryCooldown(){val jobs=mutableListOf<()->Unit>();var now=1L;val c=LazyCatalog<String>(1000,{now},{jobs.add(it)},{throw IllegalStateException("test")});c.request();jobs.removeAt(0)();assertEquals("catalog_unavailable",c.request().state);assertTrue(jobs.isEmpty());now=6000;assertEquals("catalog_loading",c.request().state)}
}
