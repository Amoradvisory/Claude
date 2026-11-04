package fr.speedcar.app

data class CatalogView<T>(val state:String,val items:List<T> = emptyList())

/** A slow, read-only inventory never holds up the remote action queue or the UI. */
class LazyCatalog<T>(private val ttlMillis:Long,private val clock:()->Long,
 private val dispatch:((()->Unit))->Unit,private val load:()->List<T>) {
 private val lock=Any()
 private var items:List<T>?=null
 private var sampledAt=0L
 private var loading=false
 private var failedAt:Long?=null
 fun request():CatalogView<T> {
  synchronized(lock){
   val now=clock()
   items?.let{if(now-sampledAt in 0 until ttlMillis)return CatalogView("ready",it)}
   if(loading)return CatalogView("catalog_loading")
   failedAt?.let{if(now-it in 0 until 5000L)return CatalogView("catalog_unavailable")}
   loading=true
  }
  try { dispatch {
   try {val result=load().toList();synchronized(lock){items=result;sampledAt=clock();failedAt=null;loading=false}}
   catch(_:Exception){synchronized(lock){failedAt=clock();loading=false}}
  }} catch(_:Exception){synchronized(lock){failedAt=clock();loading=false}}
  return CatalogView("catalog_loading")
 }
}
