pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    // Traite `android/app/google-services.json` pour générer les ressources
    // Firebase (google_app_id, google_api_key…). Sans ce plugin, le fichier est
    // ignoré au build : Firebase.initializeApp() échoue avec « Failed to load
    // FirebaseOptions from resource » et FCM ne fonctionne pas — ce qui était
    // le cas de tous les APK produits jusqu'ici, y compris ceux de la CI.
    id("com.google.gms.google-services") version "4.4.2" apply false
}

include(":app")
