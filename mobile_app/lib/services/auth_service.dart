import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/env.dart';
import '../models/user.dart';
import 'push_service.dart';

class AuthService {
  static const _tokenKey = 'access_token';
  static const _userKey = 'current_user';

  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

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
  }) async {
    final body = <String, dynamic>{
      'firstName': firstName,
      'lastName': lastName,
      'phone': phone,
      'password': password,
      'role': role,
    };
    if (vehicleType != null) body['vehicleType'] = vehicleType;

    final res = await http.post(
      Uri.parse('$apiUrl$apiPrefix/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = AuthResult.fromJson(data);
      await _persist(result);
      return result;
    }
    throw Exception(_extractError(res));
  }

  Future<void> logout() async {
    // Efface le token FCM côté serveur AVANT de perdre le JWT
    await PushService.instance.clearToken();
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
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
    await _storage.write(key: _userKey, value: jsonEncode(result.user.toJson()));
  }

  /// Met à jour uniquement l'utilisateur stocké (le token reste inchangé).
  /// Utile après un rafraîchissement partiel (ex. bascule de disponibilité,
  /// `GET /users/me`) sans repasser par un login complet.
  Future<void> saveUser(User user) async {
    await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
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
