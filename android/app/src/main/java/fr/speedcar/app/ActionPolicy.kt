package fr.speedcar.app

import java.net.URI
import java.net.URLEncoder
import java.text.Normalizer
import java.util.Locale
import kotlin.math.floor

data class AppEntry(val packageName:String,val label:String)
object ActionPolicy {
 fun encode(s:String)=URLEncoder.encode(s,"UTF-8")
 fun webUrl(raw:String):String { val u=URI(raw);require(u.scheme?.lowercase() in listOf("https","http")&&u.host!=null&&u.rawUserInfo==null&&raw.length<=2048){"web_url_required"};return u.toASCIIString() }
 fun acceptLocation(ageMs:Long,current:Boolean,allowLast:Boolean,maxAgeSeconds:Int,mock:Boolean)=!mock&&ageMs>=0&&(if(current)ageMs<=20000 else allowLast&&ageMs<=maxAgeSeconds*1000L)
 fun coordinates(lat:Double,lon:Double){require(lat.isFinite()&&lon.isFinite()&&lat in -90.0..90.0&&lon in -180.0..180.0){"invalid_coordinates"}}
 fun navigationUri(destination:String,mode:String):String { require(destination.isNotBlank()&&destination.length<=240);return when(mode){"driving"->"google.navigation:q=${encode(destination)}&mode=d";"walking"->"google.navigation:q=${encode(destination)}&mode=w";"transit"->"https://www.google.com/maps/dir/?api=1&destination=${encode(destination)}&travelmode=transit";else->throw IllegalArgumentException("unsupported_travel_mode")} }
 fun volumeTarget(percent:Int,min:Int,max:Int,cap:Int):Int {require(percent in 0..100&&cap in 0..100&&max>=min);return floor(max*minOf(percent,cap)/100.0).toInt().coerceIn(min,max)}
 private fun normalize(s:String)=Normalizer.normalize(s,Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"").lowercase(Locale.ROOT).trim()
 fun apps(query:String,all:List<AppEntry>):List<AppEntry>{val q=normalize(query);val exact=all.filter{normalize(it.label)==q||it.packageName==query};return if(exact.isNotEmpty())exact else all.filter{normalize(it.label).contains(q)||it.packageName.lowercase().contains(q)}}
 fun notificationFields(title:String,body:String):Pair<String,String> {
  val whole=notificationText(title+"\n"+body)
  return if(whole=="[contenu sensible masqué]")whole to whole else notificationText(title) to notificationText(body)
 }
 fun notificationText(s:String):String {if(Regex("(?i)\\b(otp|code|verification|vérification|password|mot de passe|authentification|security|sécurité)\\b").containsMatchIn(s))return "[contenu sensible masqué]";return s.take(400).replace(Regex("\\b[0-9]{4,8}\\b"),"[code masqué]")}
 fun phoneNumber(raw:String):String {require(raw.length<=40&&Regex("^[+0-9][0-9 ().-]{2,38}$").matches(raw)){"explicit_phone_number_required"};return raw.replace(Regex("[ ().-]"),"")}
}
