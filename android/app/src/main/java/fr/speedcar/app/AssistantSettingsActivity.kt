package fr.speedcar.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class AssistantSettingsActivity:Activity() {
 private val prefs by lazy{getSharedPreferences("speed-car-private",0)}
 private lateinit var status:TextView
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
  val page=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(28,32,28,28)};setContentView(ScrollView(this).apply{addView(page)})
  fun text(s:String){page.addView(TextView(this).apply{text=s;textSize=17f;setPadding(0,16,0,8)})}
  fun button(s:String,run:()->Unit){page.addView(Button(this).apply{text=s;isAllCaps=false;setOnClickListener{run()}})}
  fun toggle(label:String,key:String,changed:((Boolean)->Unit)?=null){page.addView(CheckBox(this).apply{text=label;isChecked=prefs.getBoolean(key,false);setOnCheckedChangeListener{_,value->prefs.edit().putBoolean(key,value).apply();changed?.invoke(value);refresh()}})}
  text("Speed Car 2.0 · Mes autorisations")
  text("Chaque capacité est distincte et révocable. Aucun GPS continu, aucun microphone et aucune capture d’écran ne sont activés.")
  status=TextView(this).apply{textSize=15f};page.addView(status)
  toggle("Autoriser les demandes de position ponctuelle","location_enabled"){enabled->if(!enabled)LocationActions.cancelAll() else if(!LocationActions.permitted(this))requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),201)}
  button("Autoriser l’ouverture des applications (superposition)"){startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:$packageName")))}
  button("Autorisation Android de localisation"){requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),201)}
  text("La localisation utilise une activité visible et s’arrête après une acquisition ou un délai court. Écran verrouillé : une interaction peut être nécessaire.")
  button("Autoriser la lampe torche"){requestPermissions(arrayOf(Manifest.permission.CAMERA),202)}
  button("Autoriser la lecture de l’état Bluetooth"){requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT),203)}
  button("Accès Android aux sessions médias et notifications"){startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))}
  text("L’accès Android ci-dessus sert au contrôle des sessions médias. Le contenu des notifications ne sera partagé que si vous activez aussi l’option suivante.")
  toggle("Autoriser la lecture ponctuelle de mes notifications","notifications_enabled")
  toggle("Autoriser le contexte d’écran à ma demande","screen_enabled")
  button("Activer le service d’accessibilité Speed Car"){startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))}
  button("Choisir les applications pour le contexte d’écran"){
   val view=AppCatalog.request(this)
   if(view.state!="ready"){Toast.makeText(this,"Préparation de la liste… réessayez dans quelques secondes.",Toast.LENGTH_SHORT).show();return@button}
   val apps=view.items.filter{!SensitivePolicy.protectedPackage(it.packageName)};val allowed=prefs.getStringSet("screen_apps",emptySet()).orEmpty().toMutableSet();val checked=apps.map{allowed.contains(it.packageName)}.toBooleanArray()
   AlertDialog.Builder(this).setTitle("Applications autorisées").setMultiChoiceItems(apps.map{it.label}.toTypedArray(),checked){_,index,value->if(value)allowed.add(apps[index].packageName)else allowed.remove(apps[index].packageName)}.setPositiveButton("Enregistrer"){_,_->prefs.edit().putStringSet("screen_apps",allowed).apply()}.setNegativeButton("Annuler",null).show()
  }
  text("Contexte sémantique uniquement. Défilement et Retour sont disponibles sur un instantané récent. Les clics, saisies et validations sensibles ne sont pas automatisés.")
  text("Mes destinations personnelles — conservées sur ce téléphone")
  val home=EditText(this).apply{hint="Adresse ou coordonnées de Maison";setText(prefs.getString("place_home",""));setSingleLine(true)};page.addView(home)
  val work=EditText(this).apply{hint="Adresse ou coordonnées de Travail";setText(prefs.getString("place_work",""));setSingleLine(true)};page.addView(work)
  button("Enregistrer Maison et Travail"){prefs.edit().putString("place_home",home.text.toString().trim().take(240)).putString("place_work",work.text.toString().trim().take(240)).apply();AlertDialog.Builder(this).setMessage("Destinations enregistrées sur ce téléphone.").setPositiveButton("OK",null).show()}
  button("Désactiver tous les accès sensibles"){
   prefs.edit().putBoolean("location_enabled",false).putBoolean("notifications_enabled",false).putBoolean("screen_enabled",false).apply();LocationActions.pending.keys.forEach{LocationActions.finish(it,org.json.JSONObject().put("status","cancelled").put("outcome","privacy_revoked"))};recreate()
  }
  button("Ouvrir les autorisations de Speed Car"){startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}
  refresh()
 }
 override fun onResume(){super.onResume();AppCatalog.request(this);if(::status.isInitialized)refresh()}
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);refresh()}
 private fun refresh(){if(!::status.isInitialized)return;val notifications=getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(ComponentName(this,PhoneNotificationService::class.java));val camera=checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;status.text="GPS Android : ${LocationActions.permitted(this)} · Torche : $camera\nSessions médias : $notifications · Accessibilité : ${ScreenAccessService.instance!=null}\nOuverture d’applications : ${Settings.canDrawOverlays(this)}"}
}
