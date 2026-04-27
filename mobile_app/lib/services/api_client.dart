import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/env.dart';
import 'auth_service.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final AuthService _authService = AuthService();

  Future<Map<String, String>> _headers() async {
    final token = await _authService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Uri _uri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiUrl$normalized');
  }

  Future<http.Response> get(String path) async {
    return http.get(_uri(path), headers: await _headers());
  }

  Future<http.Response> post(String path, {Object? body}) async {
    return http.post(
      _uri(path),
      headers: await _headers(),
      body: body == null ? null : jsonEncode(body),
    );
  }

  Future<http.Response> patch(String path, {Object? body}) async {
    return http.patch(
      _uri(path),
      headers: await _headers(),
      body: body == null ? null : jsonEncode(body),
    );
  }

  Future<http.Response> delete(String path) async {
    return http.delete(_uri(path), headers: await _headers());
  }
}
