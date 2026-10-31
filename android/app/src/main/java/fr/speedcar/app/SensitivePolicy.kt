package fr.speedcar.app
object SensitivePolicy {
 fun shareAllowed(recipient:String,confirmed:Boolean)=confirmed&&recipient.isNotBlank()&&recipient.length<=180
 fun screenLease(current:String,expected:String,sameWindow:Boolean,ageMs:Long)=current==expected&&sameWindow&&ageMs in 0..10000
 fun protectedPackage(pkg:String)=pkg=="fr.speedcar.app"||listOf("permissioncontroller","packageinstaller","systemui","settings","wallet","authenticator","password","bitwarden","lastpass","onepassword").any{pkg.lowercase().contains(it)}
}
