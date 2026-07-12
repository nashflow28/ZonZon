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

class MerchantClientSearchResult {
  final String id;
  final String firstName;
  final String lastName;
  final String phone;

  const MerchantClientSearchResult({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory MerchantClientSearchResult.fromJson(Map<String, dynamic> json) {
    return MerchantClientSearchResult(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
    );
  }
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
  static const List<String> paymentStatuses = <String>[
    'UNPAID',
    'PAY_ON_DELIVERY',
    'RECEIVED_BY_MERCHANT',
    'RECEIVED_BY_LIVREUR',
    'CASH_ON_DELIVERY',
    'PAID',
    'REFUNDED',
  ];

  Future<String> createRun(String livreurId) async {
    final res = await _api.post('/orders/runs', body: {'livreurId': livreurId});
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw MerchantOrderException('Impossible de créer la tournée.');
    }
    final decoded = jsonDecode(res.body);
    final id = decoded is Map ? decoded['id']?.toString() : null;
    if (id == null || id.isEmpty) {
      throw const MerchantOrderException('Réponse tournée invalide.');
    }
    return id;
  }

  static List<String> allowedMerchantPaymentStatuses({
    required String orderStatus,
    String? currentPaymentStatus,
  }) {
    if (orderStatus != 'COMPLETED') return const [];
    final current = currentPaymentStatus ?? 'UNPAID';
    final allowed = <String>[];
    if (current == 'PAID' ||
        current == 'CASH_ON_DELIVERY' ||
        current == 'RECEIVED_BY_LIVREUR') {
      allowed.add('RECEIVED_BY_MERCHANT');
    }
    if (current != 'REFUNDED' && current != 'UNPAID') {
      allowed.add('REFUNDED');
    }
    return allowed;
  }

  /// Crée une livraison pour un client.
  ///
  /// Il faut fournir [clientId] OU [clientPhone] (le backend répond 400
  /// sinon). Si [clientPhone] correspond à un compte client existant, le
  /// backend le rattache automatiquement ; sinon la livraison est créée
  /// avec juste le téléphone/nom (client sans compte).
  ///
  /// Si [preferredLivreurId] est fourni, la course est réservée à ce
  /// livreur (broadcast ciblé côté backend) ; sinon, comportement normal
  /// (broadcast à tous les livreurs disponibles).
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
    int? priceFcfa,
    String? priceReason,
    String? preferredLivreurId,
    String? runId,
    String? pickupZoneId,
    String? destinationZoneId,
  }) async {
    if ((clientId == null || clientId.isEmpty) &&
        (clientPhone == null || clientPhone.isEmpty)) {
      throw const MerchantOrderException(
        'Renseignez le téléphone du client pour créer la livraison.',
      );
    }

    try {
      final res = await _api.post(
        '/orders/merchant',
        body: {
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
          if (priceFcfa != null) 'priceFcfa': priceFcfa,
          if (priceReason != null && priceReason.isNotEmpty)
            'priceReason': priceReason,
          if (preferredLivreurId != null && preferredLivreurId.isNotEmpty)
            'preferredLivreurId': preferredLivreurId,
          if (runId != null && runId.isNotEmpty) 'runId': runId,
          if (pickupZoneId != null && pickupZoneId.isNotEmpty)
            'pickupZoneId': pickupZoneId,
          if (destinationZoneId != null && destinationZoneId.isNotEmpty)
            'destinationZoneId': destinationZoneId,
        },
      );

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

  Future<OrderHistoryItem> updatePaymentStatus({
    required String orderId,
    required String paymentStatus,
  }) async {
    try {
      final res = await _api.patch(
        '/orders/$orderId/payment-status',
        body: {'paymentStatus': paymentStatus},
      );
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantOrderException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! Map<String, dynamic>) {
        throw const MerchantOrderException('Réponse inattendue du serveur.');
      }
      return OrderHistoryItem.fromJson(decoded);
    } on MerchantOrderException {
      rethrow;
    } catch (e) {
      throw MerchantOrderException('Erreur réseau : $e');
    }
  }

  Future<OrderHistoryItem> updatePrice({
    required String orderId,
    required int priceFcfa,
    String? reason,
  }) async {
    try {
      final res = await _api.patch(
        '/orders/$orderId/price',
        body: {
          'priceFcfa': priceFcfa,
          if (reason != null && reason.isNotEmpty) 'reason': reason,
        },
      );
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantOrderException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! Map<String, dynamic>) {
        throw const MerchantOrderException('Réponse inattendue du serveur.');
      }
      return OrderHistoryItem.fromJson(decoded);
    } on MerchantOrderException {
      rethrow;
    } catch (e) {
      throw MerchantOrderException('Erreur réseau : $e');
    }
  }

  Future<List<MerchantClientSearchResult>> searchClients(
    String query, {
    int limit = 8,
  }) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) return const [];
    try {
      final encodedQuery = Uri.encodeQueryComponent(trimmed);
      final res = await _api.get(
        '/orders/merchant-clients/search?query=$encodedQuery&limit=$limit',
      );
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantOrderException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map(
            (item) => MerchantClientSearchResult.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .where((item) => item.id.isNotEmpty)
          .toList();
    } on MerchantOrderException {
      rethrow;
    } catch (e) {
      throw MerchantOrderException('Erreur réseau : $e');
    }
  }
}
