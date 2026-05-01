import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/push_service.dart';
import 'utils/platform_adapter.dart';

void main() async {
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
      primaryColor: const Color(0xFF0EA5E9),
      scaffoldBackgroundColor:
          isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      fontFamily: _fontFallback,
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF0EA5E9),
        brightness: brightness,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZonZon',
      debugShowCheckedModeBanner: false,
      theme: _baseTheme(Brightness.light),
      darkTheme: _baseTheme(Brightness.dark),
      themeMode: ThemeMode.system,
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
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: AuthService().getToken(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return Scaffold(
            backgroundColor: const Color(0xFF0F172A),
            body: Center(child: adaptiveLoader()),
          );
        }
        final token = snapshot.data;
        if (token != null && token.isNotEmpty) {
          // Init push une fois qu'on est authentifié (le token FCM doit être lié au user)
          PushService.instance.init();
          return const HomeScreen();
        }
        return const LoginScreen();
      },
    );
  }
}
