package fr.speedcar.app

import java.text.Normalizer
import java.util.Locale

/** Application labels only. The privacy and click policies keep their own unchanged keys. */
object AppNamePolicy {
 fun exact(value:String)=Normalizer.normalize(value,Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"")
  .lowercase(Locale.ROOT).replace(Regex("[\\s\\p{Z}]+")," ").trim()
 fun words(value:String)=exact(value).replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
 fun compact(value:String)=words(value).replace(" ","")
 fun resolve(query:String,all:List<AppEntry>):List<AppEntry> {
  val original=query.trim()
  val packages=all.filter{it.packageName==original};if(packages.isNotEmpty())return packages
  for(key in listOf<(String)->String>(::exact,::words,::compact)) {
   val wanted=key(original);if(wanted.isEmpty())return emptyList()
   val matches=all.filter{key(it.label)==wanted};if(matches.isNotEmpty())return matches
  }
  val wanted=words(original);if(wanted.isEmpty())return emptyList()
  return all.filter{words(it.label).contains(wanted)||it.packageName.lowercase(Locale.ROOT).contains(exact(original))}
 }
}
