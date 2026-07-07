import 'dart:convert';

import 'api_client.dart';
import 'auth_service.dart';

/// Service dédié aux actions livreur qui ne relèvent pas directement de
/// l'authentification : bascule de disponibilité, rafraîchissement du
/// profil courant, etc.
class DriverService {
  static final DriverService _instance = DriverService._internal();
  factory DriverService() => _instance;
  DriverService._internal();

  final ApiClient _api = ApiClient();
  final AuthService _authService = AuthService();

  /// Bascule la disponibilité du livreur connecté auprès du backend
  /// (`PATCH /users/me/availability`), puis met à jour l'utilisateur stocké
  /// localement (`flutter_secure_storage`) pour rester cohérent après un
  /// redémarrage de l'app.
  ///
  /// Le backend refuse (403) si le livreur n'est pas `APPROVED` — l'appelant
  /// doit donc s'assurer que `driverApprovalStatus == "APPROVED"` avant
  /// d'appeler cette méthode (l'UI désactive le switch sinon).
  ///
  /// Retourne la valeur `isAvailable` effective côté serveur.
  /// Lève une [Exception] avec un message clair en cas d'échec.
  Future<bool> setAvailability(bool available) async {
    final res = await _api.patch(
      '/users/me/availability',
      body: {'available': available},
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final isAvailable = data['isAvailable'] as bool? ?? available;
      await _syncStoredAvailability(isAvailable);
      return isAvailable;
    }

    if (res.statusCode == 403) {
      throw Exception(
        'Votre compte n\'est pas encore validé par un administrateur.',
      );
    }

    throw Exception(_extractError(res));
  }

  /// Met à jour uniquement `isAvailable` sur l'utilisateur persisté, sans
  /// toucher aux autres champs.
  Future<void> _syncStoredAvailability(bool isAvailable) async {
    final user = await _authService.getCurrentUser();
    if (user == null) return;
    final updated = user.copyWith(isAvailable: isAvailable);
    await _authService.saveUser(updated);
  }

  /// Bascule la visibilité du livreur connecté auprès du backend
  /// (`PATCH /users/me/visibility`), puis met à jour l'utilisateur stocké
  /// localement pour rester cohérent après un redémarrage de l'app.
  ///
  /// Un livreur privé (`isPublic == false`) ne reçoit plus les courses du
  /// broadcast général — il ne travaille que sur assignation manuelle d'un
  /// commerçant.
  ///
  /// Retourne la valeur `isPublic` effective côté serveur.
  /// Lève une [Exception] avec un message clair en cas d'échec.
  Future<bool> setVisibility(bool isPublic) async {
    final res = await _api.patch(
      '/users/me/visibility',
      body: {'isPublic': isPublic},
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final effective = data['isPublic'] as bool? ?? isPublic;
      await _syncStoredVisibility(effective);
      return effective;
    }

    throw Exception(_extractError(res));
  }

  /// Met à jour uniquement `isPublic` sur l'utilisateur persisté, sans
  /// toucher aux autres champs.
  Future<void> _syncStoredVisibility(bool isPublic) async {
    final user = await _authService.getCurrentUser();
    if (user == null) return;
    final updated = user.copyWith(isPublic: isPublic);
    await _authService.saveUser(updated);
  }

  String _extractError(dynamic res) {
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
