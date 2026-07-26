import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/env.dart';
import '../models/user.dart';
import 'client_services.dart';
import 'push_service.dart';

class AuthService {
  static const _tokenKey = 'access_token';
  static const _userKey = 'current_user';

  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final ValueNotifier<int> _sessionVersion = ValueNotifier<int>(0);

  Listenable get sessionListenable => _sessionVersion;

  Future<AuthResult> login(String phone, String password) async {
    final res = await http.post(
      Uri.parse('$apiUrl$apiPrefix/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': phone, 'password': password}),
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = AuthResult.fromJson(data);
      await _persist(result);
      return result;
    }
    throw Exception(_extractError(res));
  }

  Future<AuthResult> register({
    required String firstName,
    required String lastName,
    required String phone,
    required String password,
    required String role,
    String? vehicleType,
    bool persistSession = true,
    String? verificationToken,
  }) async {
    final body = <String, dynamic>{
      'firstName': firstName,
      'lastName': lastName,
      'phone': phone,
      'password': password,
      'role': role,
    };
    if (vehicleType != null) body['vehicleType'] = vehicleType;
    if (verificationToken != null) {
      body['verificationToken'] = verificationToken;
    }

    final res = await http.post(
      Uri.parse('$apiUrl$apiPrefix/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = AuthResult.fromJson(data);
      if (persistSession) {
        await _persist(result);
      }
      return result;
    }
    throw Exception(_extractError(res));
  }

  Future<bool> isWhatsappOtpEnabled() async {
    final res = await http.get(
      Uri.parse('$apiUrl$apiPrefix/auth/otp/whatsapp/status'),
    );
    // Compatibilité de déploiement progressif : une APK récente continue de
    // fonctionner avec un backend antérieur qui ne connaît pas encore l'OTP.
    if (res.statusCode == 404) return false;
    if (res.statusCode != 200) throw Exception(_extractError(res));
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['enabled'] == true;
  }

  Future<int> requestWhatsappOtp(String phone) async {
    final res = await http.post(
      Uri.parse('$apiUrl$apiPrefix/auth/otp/whatsapp/request'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': phone}),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(_extractError(res));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['expiresInSeconds'] as num?)?.toInt() ?? 300;
  }

  Future<String> verifyWhatsappOtp(String phone, String code) async {
    final res = await http.post(
      Uri.parse('$apiUrl$apiPrefix/auth/otp/whatsapp/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': phone, 'code': code}),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(_extractError(res));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['verificationToken'] as String;
  }

  Future<void> persistSession(AuthResult result) => _persist(result);

  Future<void> logout() async {
    // Efface le token FCM côté serveur AVANT de perdre le JWT
    await PushService.instance.clearToken();
    // Libère les services statiques de session (socket, commandes actives) :
    // sans ça, un autre compte reconnecté dans le même processus héritait de
    // l'état du précédent (fuite inter-session).
    await ClientServices.reset();
    await _clearLocalSession();
  }

  /// Session invalidée par le serveur (401 / token expiré). On ne peut plus
  /// rien nettoyer côté serveur (le JWT est mort) : on invalide le token FCM
  /// LOCALEMENT (les pushs adressés à l'ancien token n'atteignent plus cet
  /// appareil) et on libère les services de session comme au logout.
  Future<void> handleUnauthorized() async {
    await PushService.instance.invalidateLocalToken();
    await ClientServices.reset();
    await _clearLocalSession();
  }

  Future<String?> getToken() async {
    return _storage.read(key: _tokenKey);
  }

  Future<User?> getCurrentUser() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null) return null;
    try {
      return User.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> _persist(AuthResult result) async {
    await _storage.write(key: _tokenKey, value: result.accessToken);
    await _storage.write(
      key: _userKey,
      value: jsonEncode(result.user.toJson()),
    );
    _sessionVersion.value++;
  }

  /// Met à jour uniquement l'utilisateur stocké (le token reste inchangé).
  /// Utile après un rafraîchissement partiel (ex. bascule de disponibilité,
  /// `GET /users/me`) sans repasser par un login complet.
  Future<void> saveUser(User user) async {
    await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
    _sessionVersion.value++;
  }

  Future<void> _clearLocalSession() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
    _sessionVersion.value++;
  }

  String _extractError(http.Response res) {
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data['message'] != null) {
        final msg = data['message'];
        if (msg is List) return msg.join(', ');
        return msg.toString();
      }
    } catch (_) {}
    return 'Erreur ${res.statusCode}';
  }
}
