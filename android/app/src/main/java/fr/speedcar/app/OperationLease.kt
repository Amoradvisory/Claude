package fr.speedcar.app

/** Owns all resources of a bounded operation, including resources registered late. */
class OperationLease(private val deadline:Long,private val clock:()->Long=System::currentTimeMillis) {
 private var closed=false
 private val cancellations=mutableListOf<()->Unit>()
 @Synchronized fun valid()=!closed&&clock()<deadline
 fun onCancel(action:()->Unit){val runNow=synchronized(this){if(closed||clock()>=deadline)true else{cancellations.add(action);false}};if(runNow)action()}
 fun close(){val callbacks=synchronized(this){if(closed)return;closed=true;cancellations.toList().also{cancellations.clear()}};callbacks.forEach{try{it()}catch(_:Exception){}}}
}
class PlaybackGate {
 @Volatile var interrupted=false;private set
 @Synchronized fun start(normalAudioMode:Boolean,action:()->Unit):Boolean {if(interrupted||!normalAudioMode)return false;action();return true}
 @Synchronized fun interrupt(stop:()->Unit){if(!interrupted){interrupted=true;stop()}}
}
