import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'config/env.dart';
import 'router/app_router.dart';
import 'services/auth_service.dart';
import 'services/notification_navigation_service.dart';
import 'services/push_service.dart';

Future<void> main() async {
  if (sentryDsn.isNotEmpty) {
    await SentryFlutter.init((options) {
      options.dsn = sentryDsn;
      options.environment = const String.fromEnvironment(
        'FLUTTER_ENV',
        defaultValue: 'production',
      );
      options.tracesSampleRate = 0.1;
      options.attachScreenshot = true;
    }, appRunner: () => _runApp());
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

class ZonZonApp extends StatefulWidget {
  const ZonZonApp({super.key});

  @override
  State<ZonZonApp> createState() => _ZonZonAppState();
}

class _ZonZonAppState extends State<ZonZonApp> {
  final AuthService _auth = AuthService();

  @override
  void initState() {
    super.initState();
    _auth.sessionListenable.addListener(_syncPushState);
    PushService.instance.onTap$.listen(
      NotificationNavigationService.openFromPayload,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncPushState());
  }

  @override
  void dispose() {
    _auth.sessionListenable.removeListener(_syncPushState);
    super.dispose();
  }

  Future<void> _syncPushState() async {
    final token = await _auth.getToken();
    if (token != null && token.isNotEmpty) {
      await PushService.instance.init();
    }
  }

  // Fallback Inter ; sur iOS le système utilisera SF Pro pour le texte non
  // stylé, sur Android Roboto. On garde Inter comme fallback explicite pour
  // les écrans qui le déclarent (cohérence visuelle de la marque).
  static const _fontFallback = 'Inter';

  ThemeData _baseTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final baseScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF2E90FA),
      brightness: brightness,
    );
    return ThemeData(
      brightness: brightness,
      primaryColor: const Color(0xFF2E90FA),
      scaffoldBackgroundColor: isDark
          ? const Color(0xFF0C1A22)
          : const Color(0xFFF8FAFC),
      fontFamily: _fontFallback,
      useMaterial3: true,
      colorScheme: baseScheme,
      appBarTheme: AppBarTheme(
        backgroundColor: isDark
            ? const Color(0xFF122530)
            : const Color(0xFFF8FAFC),
        foregroundColor: isDark ? Colors.white : const Color(0xFF0C1A22),
        centerTitle: false,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: isDark ? const Color(0xFF122530) : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      dividerTheme: DividerThemeData(
        color: isDark ? Colors.white12 : const Color(0x140C1A22),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF122530) : Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFF2E90FA)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? const Color(0xFF122530) : Colors.white,
        indicatorColor: const Color(0xFF2E90FA).withValues(alpha: 0.18),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          return TextStyle(
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          );
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark
            ? const Color(0xFF122530)
            : const Color(0xFF0C1A22),
        contentTextStyle: TextStyle(
          color: isDark ? Colors.white : Colors.white,
        ),
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
