import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/push_service.dart';

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

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZonZon',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF0EA5E9),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
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
          return const Scaffold(
            backgroundColor: Color(0xFF0F172A),
            body: Center(
              child: CircularProgressIndicator(color: Color(0xFF0EA5E9)),
            ),
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
