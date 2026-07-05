import 'dart:convert';

import '../models/order_history_item.dart';
import 'api_client.dart';

/// Exception dédiée pour une erreur métier lisible côté UI
/// (ex : ni `clientId` ni `clientPhone` fourni → 400 côté backend).
class MerchantOrderException implements Exception {
  final String message;
  const MerchantOrderException(this.message);

  @override
  String toString() => message;
}

/// Service dédié aux livraisons créées par un COMMERCANT pour un client.
///
/// Contrat backend :
/// - `POST /orders/merchant` : crée une livraison pour un client (identifié
///   par `clientId` OU `clientPhone`). Réservé au rôle COMMERCANT.
/// - `GET /orders/mine` : pour un COMMERCANT, renvoie la liste de ses
///   livraisons créées (même payload que l'historique client/livreur).
class MerchantOrdersService {
  final ApiClient _api = ApiClient();

  /// Crée une livraison pour un client.
  ///
  /// Il faut fournir [clientId] OU [clientPhone] (le backend répond 400
  /// sinon). Si [clientPhone] correspond à un compte client existant, le
  /// backend le rattache automatiquement ; sinon la livraison est créée
  /// avec juste le téléphone/nom (client sans compte).
  ///
  /// Retourne l'objet livraison créé sous forme de [Map] brute (mêmes
  /// champs qu'une commande, + `merchant`, `clientPhone`, `clientName`).
  /// Lève une [MerchantOrderException] en cas d'erreur avec un message
  /// lisible pour l'utilisateur.
  Future<Map<String, dynamic>> createMerchantOrder({
    required String pickupAddress,
    double? pickupLat,
    double? pickupLng,
    required String deliveryAddress,
    double? deliveryLat,
    double? deliveryLng,
    required String description,
    String? clientId,
    String? clientPhone,
    String? clientName,
  }) async {
    if ((clientId == null || clientId.isEmpty) &&
        (clientPhone == null || clientPhone.isEmpty)) {
      throw const MerchantOrderException(
        'Renseignez le téléphone du client pour créer la livraison.',
      );
    }

    try {
      final res = await _api.post('/orders/merchant', body: {
        'pickupAddress': pickupAddress,
        if (pickupLat != null) 'pickupLat': pickupLat,
        if (pickupLng != null) 'pickupLng': pickupLng,
        'deliveryAddress': deliveryAddress,
        if (deliveryLat != null) 'deliveryLat': deliveryLat,
        if (deliveryLng != null) 'deliveryLng': deliveryLng,
        'description': description,
        if (clientId != null && clientId.isNotEmpty) 'clientId': clientId,
        if (clientPhone != null && clientPhone.isNotEmpty)
          'clientPhone': clientPhone,
        if (clientName != null && clientName.isNotEmpty)
          'clientName': clientName,
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is! Map<String, dynamic>) {
          throw const MerchantOrderException('Réponse serveur invalide.');
        }
        return decoded;
      }

      if (res.statusCode == 400) {
        String message =
            'Impossible de créer la livraison : vérifiez le téléphone du client.';
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map && decoded['message'] != null) {
            final m = decoded['message'];
            message = m is List ? m.join(', ') : m.toString();
          }
        } catch (_) {
          // garde le message par défaut
        }
        throw MerchantOrderException(message);
      }

      throw MerchantOrderException('Erreur serveur (${res.statusCode}).');
    } on MerchantOrderException {
      rethrow;
    } catch (e) {
      throw MerchantOrderException('Erreur réseau : $e');
    }
  }

  /// Liste les livraisons créées par le commerçant connecté
  /// (`GET /orders/mine`).
  ///
  /// Lève une [MerchantOrderException] en cas d'erreur, à charge de l'écran
  /// appelant d'afficher un état "Réessayer".
  Future<List<OrderHistoryItem>> getMyMerchantOrders() async {
    try {
      final res = await _api.get('/orders/mine');
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantOrderException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) {
        throw const MerchantOrderException('Réponse inattendue du serveur.');
      }
      return decoded
          .whereType<Map>()
          .map((m) => OrderHistoryItem.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } on MerchantOrderException {
      rethrow;
    } catch (e) {
      throw MerchantOrderException('Erreur réseau : $e');
    }
  }
}
