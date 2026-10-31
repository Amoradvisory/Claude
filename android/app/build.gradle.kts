plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.speedcar.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "fr.speedcar.app"
        minSdk = 31
        targetSdk = 35
        versionCode = 1
        versionName = "0.2.0-local"
        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        getByName("debug") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}

dependencies { testImplementation("junit:junit:4.13.2") }
