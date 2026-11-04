package fr.speedcar.app
import android.media.AudioManager
import java.util.concurrent.Executor

class AudioCallGuard(private val audio:AudioManager,private val stop:()->Unit):AutoCloseable {
 private val gate=PlaybackGate()
 private val listener=AudioManager.OnModeChangedListener{mode->if(mode!=AudioManager.MODE_NORMAL)gate.interrupt(stop)}
 init{audio.addOnModeChangedListener(Executor{it.run()},listener);refresh()}
 private fun refresh(){if(audio.mode!=AudioManager.MODE_NORMAL)gate.interrupt(stop)}
 fun start(action:()->Unit):Boolean {refresh();return gate.start(audio.mode==AudioManager.MODE_NORMAL,action)}
 val interrupted:Boolean get()=gate.interrupted
 override fun close(){audio.removeOnModeChangedListener(listener)}
}
