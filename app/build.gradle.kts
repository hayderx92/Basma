plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hayder.invoice"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hayder.invoice"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // مفتاح توقيع ثابت حتى تتحدث النسخ الجديدة فوق القديمة بدون حذف
    val ks = file("invoice.jks")
    signingConfigs {
        create("inv") {
            storeFile = file("invoice.jks")
            storePassword = "invoice123"
            keyAlias = "inv"
            keyPassword = "invoice123"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = if (ks.exists()) signingConfigs.getByName("inv")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.webkit:webkit:1.11.0")
}
