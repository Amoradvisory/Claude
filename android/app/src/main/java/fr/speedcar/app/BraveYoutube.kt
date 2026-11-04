package fr.speedcar.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri

object BraveYoutube {
    const val PACKAGE = "com.brave.browser"
    const val URL = "https://m.youtube.com/"

    fun open(activity: Activity): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(URL))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(PACKAGE)
        return try {
            activity.startActivity(intent)
            true // Intent submitted, not proof that the requested page has loaded.
        } catch (_: ActivityNotFoundException) {
            false // Never fall back to YouTube or an unspecified browser.
        }
    }
}
