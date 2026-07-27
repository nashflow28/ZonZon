import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Requis pour que google-services.json soit exploité (notifications FCM).
    id("com.google.gms.google-services")
}

// Secrets de signature : jamais versionnés (cf. .gitignore et
// android/key.properties.example).
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "com.zonzon.app"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // Identifiant définitif de l'application — il ne pourra plus changer une
        // fois publié sur le Play Store. Cohérent avec le userAgentPackageName
        // déjà utilisé pour les tuiles OpenStreetMap.
        applicationId = "com.zonzon.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        multiDexEnabled = true
    }

    signingConfigs {
        // Configuration de release lue depuis `android/key.properties`, fichier
        // non versionné qui référence le keystore et ses mots de passe.
        // Voir android/key.properties.example.
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Signature de release dès que `key.properties` est présent.
            // Sinon on retombe sur la clé de debug, pour que `flutter build apk`
            // et la CI continuent de fonctionner sans le keystore — mais un tel
            // APK n'est PAS distribuable : le Play Store le refuse, et il ne
            // pourra jamais être mis à jour par un APK signé en release.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                logger.warn(
                    "ATTENTION : android/key.properties absent — l'APK release est signé " +
                        "avec la clé de DEBUG et n'est pas distribuable."
                )
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
