import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';
import '../utils/platform_adapter.dart';

/// Handler de message en arrière-plan. DOIT être top-level.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Pas de logique custom : la notif système est affichée automatiquement
  // par FCM tant que l'app n'est pas tuée. Ce handler existe pour réveiller
  // l'isolate Flutter en cas de data-only message.
  await Firebase.initializeApp();
}

/// Encapsule l'init Firebase + FCM + notif locales.
/// À appeler une seule fois après l'authentification (le token est lié au user).
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  final ApiClient _api = ApiClient();
  bool _coreInitialized = false;
  String? _syncedToken;

  /// Stream public : émis quand l'utilisateur tape sur une notif (foreground ou background).
  /// Le payload est le `data:` de la notif (ex: `{kind: 'chat', orderId: 'xxx'}`).
  final StreamController<Map<String, String>> _onTapCtrl =
      StreamController.broadcast();
  Stream<Map<String, String>> get onTap$ => _onTapCtrl.stream;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase init skipped: $e');
      return;
    }

    final messaging = FirebaseMessaging.instance;

    if (!_coreInitialized) {
      _coreInitialized = true;

      // Pre-prompt explicatif (Apple HIG / Material) : on n'appelle jamais
      // requestPermission directement sans avoir d'abord expliqué à
      // l'utilisateur pourquoi on en a besoin. Si l'utilisateur refuse le
      // pre-prompt, on n'invoque pas le dialog système (préserve la chance
      // de redemander plus tard).
      if (_prePromptContext() != null) {
        final current = await messaging.getNotificationSettings();
        final ctx = _prePromptContext();
        if (ctx == null) {
          await messaging.requestPermission(
            alert: true,
            badge: true,
            sound: true,
          );
        } else if (current.authorizationStatus ==
            AuthorizationStatus.notDetermined) {
          final accepted = await showAdaptiveConfirmDialog(
            // ignore: use_build_context_synchronously
            ctx,
            title: 'Activer les notifications ?',
            message:
                'ZonZon vous prévient quand un livreur accepte votre course, '
                'quand il arrive, et pour les messages reçus.',
            confirmLabel: 'Activer',
            cancelLabel: 'Plus tard',
          );
          if (accepted == true) {
            await messaging.requestPermission(
              alert: true,
              badge: true,
              sound: true,
            );
          }
        } else {
          await messaging.requestPermission(
            alert: true,
            badge: true,
            sound: true,
          );
        }
      } else {
        await messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      const androidChannel = AndroidNotificationChannel(
        'zonzon_default',
        'Notifications ZonZon',
        description: 'Statuts de course, messages, et alertes en temps réel.',
        importance: Importance.high,
      );
      await _local
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(androidChannel);

      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (response) {
          final data = _decodePayload(response.payload);
          if (data != null) _onTapCtrl.add(data);
        },
      );

      FirebaseMessaging.onMessage.listen((msg) {
        final notif = msg.notification;
        if (notif == null) return;
        _local.show(
          notif.hashCode,
          notif.title,
          notif.body,
          const NotificationDetails(
            android: AndroidNotificationDetails(
              'zonzon_default',
              'Notifications ZonZon',
              importance: Importance.high,
              priority: Priority.high,
            ),
            iOS: DarwinNotificationDetails(),
          ),
          payload: jsonEncode(msg.data),
        );
      });

      FirebaseMessaging.onMessageOpenedApp.listen((msg) {
        _onTapCtrl.add(_normalizeData(msg.data));
      });

      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        _onTapCtrl.add(_normalizeData(initial.data));
      }

      messaging.onTokenRefresh.listen((token) async {
        _syncedToken = token;
        await _syncToken(token);
      });
    }

    String? token;
    try {
      token = await messaging.getToken();
    } catch (_) {}
    if (token != null && token != _syncedToken) {
      await _syncToken(token);
      _syncedToken = token;
    }
  }

  Future<void> _syncToken(String token) async {
    try {
      await _api.patch('/users/me/fcm-token', body: {'token': token});
    } catch (_) {}
  }

  /// À appeler au logout : efface le token côté serveur pour stopper les pushs.
  Future<void> clearToken() async {
    String? previousToken = _syncedToken;
    try {
      previousToken ??= await FirebaseMessaging.instance.getToken();
    } catch (_) {}
    try {
      await _api.patch(
        '/users/me/fcm-token',
        body: {
          'token': null,
          if (previousToken != null && previousToken.isNotEmpty)
            'previousToken': previousToken,
        },
      );
    } catch (_) {}
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    _syncedToken = null;
  }

  Map<String, String>? _decodePayload(String? payload) {
    if (payload == null || payload.isEmpty) return null;
    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map) return _normalizeData(decoded);
    } catch (_) {}
    return null;
  }

  /// Tente de récupérer un BuildContext valide pour afficher le pre-prompt.
  /// Retourne null si l'arbre n'est pas monté (cas extrême : init très tôt).
  BuildContext? _prePromptContext() {
    try {
      final element = WidgetsBinding.instance.rootElement;
      return element;
    } catch (_) {
      return null;
    }
  }

  Map<String, String> _normalizeData(Map data) {
    final out = <String, String>{};
    data.forEach((k, v) {
      if (k is String && v != null) out[k] = v.toString();
    });
    return out;
  }
}
