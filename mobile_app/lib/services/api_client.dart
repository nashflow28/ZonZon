import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/env.dart';
import 'auth_service.dart';

class ApiNetworkException implements Exception {
  final String message;

  const ApiNetworkException(this.message);

  @override
  String toString() => message;
}

bool isDnsLookupError(Object error) {
  if (error is SocketException) {
    return error.osError?.errorCode == 7 ||
        error.message.toLowerCase().contains('failed host lookup');
  }
  final message = error.toString().toLowerCase();
  return message.contains('failed host lookup') ||
      message.contains('no address associated with hostname');
}

String apiErrorMessage(Object error) {
  if (error is ApiNetworkException) return error.message;
  if (error is TimeoutException) {
    return 'La connexion est trop lente. Vérifiez vos commandes avant de réessayer.';
  }
  if (isDnsLookupError(error) || error is SocketException) {
    return 'Connexion internet indisponible. Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.';
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

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
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        final response = await request().timeout(_requestTimeout);
        if (response.statusCode == 401) {
          await _authService.handleUnauthorized();
        }
        return response;
      } catch (error) {
        if (!isDnsLookupError(error)) rethrow;
        if (attempt == 0) {
          await Future<void>.delayed(const Duration(milliseconds: 800));
          continue;
        }
        throw const ApiNetworkException(
          'Connexion internet indisponible. Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.',
        );
      }
    }
    throw const ApiNetworkException('Connexion internet indisponible.');
  }
}
