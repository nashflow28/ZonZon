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

// Les quatre clés attendues dans key.properties. Une clé absente ou vide
// produisait auparavant un plantage Gradle obscur (cast `null as String`) très
// loin de sa cause réelle : on préfère un diagnostic nommé.
val clesDeSignatureRequises = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")

fun proprieteDeSignature(cle: String): String = (keystoreProperties.getProperty(cle) ?: "").trim()

// Diagnostic calculé à la configuration, mais JAMAIS levé ici : lever une
// exception au niveau du script s'exécuterait à la phase de configuration et
// casserait TOUTES les tâches — `flutter run`, `flutter build apk --debug`,
// `flutter test`, la synchronisation Gradle de l'IDE — alors qu'aucun de ces
// usages n'a besoin du keystore. Le problème est seulement mémorisé ; c'est la
// tâche `verifierSignatureRelease` (plus bas) qui le transforme en échec, à
// l'exécution et uniquement pour les tâches de release.
val problemeDeSignatureRelease: String? = when {
    !keystorePropertiesFile.exists() ->
        "le fichier android/key.properties est absent (${keystorePropertiesFile.absolutePath})"

    clesDeSignatureRequises.any { proprieteDeSignature(it).isEmpty() } ->
        "clé(s) absente(s) ou vide(s) dans android/key.properties : " +
            clesDeSignatureRequises.filter { proprieteDeSignature(it).isEmpty() }.joinToString(", ")

    !file(proprieteDeSignature("storeFile")).exists() ->
        "le keystore désigné par `storeFile` est introuvable sur le disque : " +
            file(proprieteDeSignature("storeFile")).absolutePath

    else -> null
}

// Message d'échec construit une fois pour toutes à la configuration, pour que
// la tâche de vérification ne capture qu'une chaîne (compatible cache de
// configuration Gradle).
val erreurDeSignatureRelease: String? = problemeDeSignatureRelease?.let { probleme ->
    """
    |Build RELEASE interrompu : la configuration de signature est indisponible ou incomplète.
    |
    |Cause : $probleme.
    |
    |Aucun repli sur la clé de debug n'est fait, volontairement : un APK/AAB signé
    |en debug est refusé par le Play Store et ne pourra jamais être mis à jour par
    |un binaire signé en release. Le repli silencieux ne se voyait qu'à l'upload,
    |voire seulement après avoir distribué un binaire inutilisable.
    |
    |Pour corriger :
    |  1. Copier mobile_app/android/key.properties.example
    |     vers mobile_app/android/key.properties (fichier jamais versionné).
    |  2. Renseigner les quatre clés : ${clesDeSignatureRequises.joinToString(", ")}.
    |     `storeFile` doit être un chemin — absolu de préférence — vers un .jks existant.
    |  3. Si le keystore n'existe pas encore :
    |     keytool -genkey -v -keystore <chemin>/zonzon-release.jks \
    |       -keyalg RSA -keysize 2048 -validity 10000 -alias zonzon
    |
    |En CI : décoder le keystore depuis un secret puis écrire android/key.properties
    |avant `flutter build apk --release` (cf. .github/workflows/flutter-ci.yml).
    |
    |Pour un build local sans keystore, utiliser --debug ou --profile : ces variantes
    |sont signées par la clé de debug et ne sont pas concernées par ce contrôle.
    """.trimMargin()
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
        // Voir android/key.properties.example. Elle n'est créée que si le
        // fichier est réellement exploitable ; sinon le build release échoue
        // franchement via `verifierSignatureRelease`.
        if (problemeDeSignatureRelease == null) {
            create("release") {
                keyAlias = proprieteDeSignature("keyAlias")
                keyPassword = proprieteDeSignature("keyPassword")
                storeFile = file(proprieteDeSignature("storeFile"))
                storePassword = proprieteDeSignature("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Pas de repli sur la clé de debug : la variante reste délibérément
            // sans signature, et la tâche de vérification interrompt le build
            // avant qu'un artefact non distribuable ne soit produit.
            signingConfig = if (problemeDeSignatureRelease == null) {
                signingConfigs.getByName("release")
            } else {
                null
            }
        }
    }
}

// Garde-fou : échoue bruyamment si un artefact de release est demandé sans
// configuration de signature valide. Le contrôle vit dans un `doLast`, donc à
// la phase d'EXÉCUTION — c'est ce qui permet à debug/profile, aux tests et à
// l'IDE de continuer à fonctionner sans key.properties.
val verifierSignatureRelease = tasks.register("verifierSignatureRelease") {
    group = "verification"
    description = "Échoue si la signature de release est absente ou incomplète."
    val message = erreurDeSignatureRelease
    doLast {
        if (message != null) {
            throw GradleException(message)
        }
    }
}

// Accroché uniquement aux tâches liées à un artefact de release :
//  - `preReleaseBuild`, ancre exécutée tout au début de la variante, pour
//    échouer en quelques secondes plutôt qu'après plusieurs minutes de
//    compilation Dart/Kotlin ;
//  - `assembleRelease` / `bundleRelease` / `packageRelease` /
//    `validateSigningRelease`, filets de sécurité si l'une d'elles est invoquée
//    directement.
// Les variantes avec saveur (`preProdReleaseBuild`, `assembleProdRelease`…)
// sont couvertes par les mêmes motifs. `matching {}` est une collection
// vivante : elle capte aussi les tâches créées plus tard par le plugin Android.
val motifPreBuildRelease = Regex("^pre.*ReleaseBuild$")
tasks.matching { tache ->
    motifPreBuildRelease.matches(tache.name) ||
        (
            tache.name.endsWith("Release") &&
                listOf("assemble", "bundle", "package", "validateSigning")
                    .any { tache.name.startsWith(it) }
            )
}.configureEach {
    dependsOn(verifierSignatureRelease)
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
