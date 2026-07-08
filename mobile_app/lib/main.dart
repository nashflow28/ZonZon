import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'config/env.dart';
import 'router/app_router.dart';
import 'services/push_service.dart';

Future<void> main() async {
  if (sentryDsn.isNotEmpty) {
    await SentryFlutter.init(
      (options) {
        options.dsn = sentryDsn;
        options.environment = const String.fromEnvironment(
          'FLUTTER_ENV',
          defaultValue: 'production',
        );
        options.tracesSampleRate = 0.1;
        options.attachScreenshot = true;
        options.attachViewHierarchy = true;
      },
      appRunner: () => _runApp(),
    );
  } else {
    _runApp();
  }
}

void _runApp() {
  WidgetsFlutterBinding.ensureInitialized();
  // Background handler doit être enregistré avant runApp
  try {
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  } catch (_) {
    // Firebase pas encore configuré (google-services.json absent) → on ignore
  }
  runApp(const ZonZonApp());
}

class ZonZonApp extends StatelessWidget {
  const ZonZonApp({super.key});

  // Fallback Inter ; sur iOS le système utilisera SF Pro pour le texte non
  // stylé, sur Android Roboto. On garde Inter comme fallback explicite pour
  // les écrans qui le déclarent (cohérence visuelle de la marque).
  static const _fontFallback = 'Inter';

  ThemeData _baseTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    return ThemeData(
      brightness: brightness,
      primaryColor: const Color(0xFF2E90FA),
      scaffoldBackgroundColor:
          isDark ? const Color(0xFF0C1A22) : const Color(0xFFF8FAFC),
      fontFamily: _fontFallback,
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF2E90FA),
        brightness: brightness,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ZonZon',
      debugShowCheckedModeBanner: false,
      theme: _baseTheme(Brightness.light),
      darkTheme: _baseTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
      builder: (context, child) {
        // Clamp Dynamic Type pour éviter de casser les layouts compacts
        // tout en respectant l'accessibilité (WCAG / iOS Larger Text).
        final mq = MediaQuery.of(context);
        final clamped = mq.textScaler.clamp(
          minScaleFactor: 0.85,
          maxScaleFactor: 1.4,
        );
        return MediaQuery(
          data: mq.copyWith(textScaler: clamped),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
