import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import '../config/env.dart';
import 'auth_service.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final AuthService _authService = AuthService();
  static const Duration _requestTimeout = Duration(seconds: 15);

  Future<Map<String, String>> _headers() async {
    final token = await _authService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Uri _uri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiUrl$apiPrefix$normalized');
  }

  Future<http.Response> get(String path) async {
    return _send(() async => http.get(_uri(path), headers: await _headers()));
  }

  Future<http.Response> post(String path, {Object? body}) async {
    return _send(
      () async => http.post(
        _uri(path),
        headers: await _headers(),
        body: body == null ? null : jsonEncode(body),
      ),
    );
  }

  Future<http.Response> patch(String path, {Object? body}) async {
    return _send(
      () async => http.patch(
        _uri(path),
        headers: await _headers(),
        body: body == null ? null : jsonEncode(body),
      ),
    );
  }

  Future<http.Response> put(String path, {Object? body}) async {
    return _send(
      () async => http.put(
        _uri(path),
        headers: await _headers(),
        body: body == null ? null : jsonEncode(body),
      ),
    );
  }

  Future<http.Response> delete(String path) async {
    return _send(
      () async => http.delete(_uri(path), headers: await _headers()),
    );
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    final response = await request().timeout(_requestTimeout);
    if (response.statusCode == 401) {
      await _authService.handleUnauthorized();
    }
    return response;
  }
}
