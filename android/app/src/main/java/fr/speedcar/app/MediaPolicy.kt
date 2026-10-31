package fr.speedcar.app

data class SessionSummary(val packageName:String,val playing:Boolean)
object MediaPolicy {
 fun choose(sessions:List<SessionSummary>,packageName:String?):Int? {
  val indexes=sessions.indices.filter{packageName==null||sessions[it].packageName==packageName}
  if(indexes.size==1)return indexes.single()
  val playing=indexes.filter{sessions[it].playing};return if(playing.size==1)playing.single() else null
 }
}
