// Vérification hors SDK : compile les sources Android contre le framework publié par Robolectric (API 35)
// et exécute les tests JVM. Ne produit aucun APK.
plugins { kotlin("jvm") version "2.1.20" }
val app = "${rootDir}/../../android/app/src"
kotlin { jvmToolchain(21) }
sourceSets {
    main { kotlin.setSrcDirs(listOf("$app/main/java", "stubs")) }
    test { kotlin.setSrcDirs(listOf("$app/test/java")) }
}
dependencies {
    compileOnly("org.robolectric:android-all:15-robolectric-12650502")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    testCompileOnly("org.robolectric:android-all:15-robolectric-12650502")
}
tasks.test { useJUnit(); testLogging { events("failed"); showStandardStreams = false } }
// Le SDK officiel expose des types « plateforme » ; le jar Robolectric garde les annotations internes.
kotlin { compilerOptions { freeCompilerArgs.addAll("-Xnullability-annotations=@android.annotation:ignore", "-Xnullability-annotations=@androidx.annotation:ignore", "-Xjsr305=ignore") } }
