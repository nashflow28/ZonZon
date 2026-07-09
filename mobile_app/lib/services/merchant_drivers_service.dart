import 'dart:convert';

import 'api_client.dart';

/// Exception dédiée pour une erreur métier lisible côté UI (gestion des
/// livreurs affiliés / choix du livreur à la création d'une livraison).
class MerchantDriversException implements Exception {
  final String message;
  const MerchantDriversException(this.message);

  @override
  String toString() => message;
}

/// Véhicule d'un livreur (sous-objet renvoyé par le backend, peut être
/// `null` si le livreur n'a pas encore renseigné son véhicule).
class DriverVehicle {
  final String? type;
  final String? licensePlate;
  final String? description;

  const DriverVehicle({this.type, this.licensePlate, this.description});

  factory DriverVehicle.fromJson(Map<String, dynamic> json) => DriverVehicle(
        type: json['type'] as String?,
        licensePlate: json['licensePlate'] as String?,
        description: json['description'] as String?,
      );

  /// Libellé court à afficher dans l'UI (ex. "MOTO", "VOITURE").
  String get label => type ?? 'Véhicule';
}

/// Un livreur affilié à un commerçant (`GET /merchants/me/drivers`).
///
/// Le backend renvoie directement des objets `User` (avec la relation
/// `vehicle` chargée), donc les mêmes champs qu'un compte utilisateur.
class AffiliatedDriver {
  final String id;
  final String firstName;
  final String lastName;
  final String? phone;
  final DriverVehicle? vehicle;
  final String status;

  const AffiliatedDriver({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.phone,
    this.vehicle,
    this.status = 'ACTIVE',
  });

  String get fullName => '$firstName $lastName'.trim();

  factory AffiliatedDriver.fromJson(Map<String, dynamic> json) {
    final vehicleJson = json['vehicle'];
    return AffiliatedDriver(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      phone: json['phone'] as String?,
      vehicle: vehicleJson is Map
          ? DriverVehicle.fromJson(Map<String, dynamic>.from(vehicleJson))
          : null,
      status: json['status']?.toString() ?? 'ACTIVE',
    );
  }
}

/// Un livreur disponible pour un choix manuel à la création d'une livraison
/// (`GET /orders/available-drivers`).
class AvailableDriver {
  final String id;
  final String firstName;
  final String lastName;
  final DriverVehicle? vehicle;
  final double? distanceKm;
  final bool isAffiliated;

  const AvailableDriver({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.vehicle,
    this.distanceKm,
    this.isAffiliated = false,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory AvailableDriver.fromJson(Map<String, dynamic> json) {
    final vehicleJson = json['vehicle'];
    final rawDistance = json['distanceKm'];
    return AvailableDriver(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      vehicle: vehicleJson is Map
          ? DriverVehicle.fromJson(Map<String, dynamic>.from(vehicleJson))
          : null,
      distanceKm: rawDistance == null
          ? null
          : (rawDistance as num).toDouble(),
      isAffiliated: json['isAffiliated'] == true,
    );
  }
}

class DriverAffiliationMerchant {
  final String id;
  final String firstName;
  final String lastName;
  final String? phone;

  const DriverAffiliationMerchant({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.phone,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory DriverAffiliationMerchant.fromJson(Map<String, dynamic> json) {
    return DriverAffiliationMerchant(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      phone: json['phone']?.toString(),
    );
  }
}

class DriverAffiliationInvite {
  final String merchantId;
  final String status;
  final DateTime? createdAt;
  final DateTime? acceptedAt;
  final DateTime? removedAt;
  final DriverAffiliationMerchant? merchant;

  const DriverAffiliationInvite({
    required this.merchantId,
    required this.status,
    this.createdAt,
    this.acceptedAt,
    this.removedAt,
    this.merchant,
  });

  bool get isPending => status == 'PENDING';

  factory DriverAffiliationInvite.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic value) =>
        value == null ? null : DateTime.tryParse(value.toString());

    return DriverAffiliationInvite(
      merchantId: json['merchantId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      createdAt: parseDate(json['createdAt']),
      acceptedAt: parseDate(json['acceptedAt']),
      removedAt: parseDate(json['removedAt']),
      merchant: json['merchant'] is Map
          ? DriverAffiliationMerchant.fromJson(
              Map<String, dynamic>.from(json['merchant'] as Map),
            )
          : null,
    );
  }
}

/// Service dédié à la gestion des livreurs côté COMMERCANT (Priorité 3) :
/// - livreurs affiliés ("mes livreurs") : `GET/POST/DELETE
///   /merchants/me/drivers` ;
/// - livreurs disponibles pour un choix manuel à la création d'une
///   livraison : `GET /orders/available-drivers`.
class MerchantDriversService {
  final ApiClient _api = ApiClient();

  /// Liste les livreurs affiliés au commerçant connecté.
  Future<List<AffiliatedDriver>> getAffiliatedDrivers() async {
    try {
      final res = await _api.get('/merchants/me/drivers');
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantDriversException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) {
        throw const MerchantDriversException('Réponse inattendue du serveur.');
      }
      return decoded
          .whereType<Map>()
          .map((m) => AffiliatedDriver.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  /// Affilie un livreur par son identifiant.
  Future<AffiliatedDriver> addDriverById(String driverId) =>
      _addDriver({'driverId': driverId});

  /// Affilie un livreur en le recherchant par numéro de téléphone.
  Future<AffiliatedDriver> addDriverByPhone(String phone) =>
      _addDriver({'driverPhone': phone});

  Future<AffiliatedDriver> _addDriver(Map<String, dynamic> body) async {
    try {
      final res = await _api.post('/merchants/me/drivers', body: body);
      if (res.statusCode == 201 || res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is! Map<String, dynamic>) {
          throw const MerchantDriversException('Réponse serveur invalide.');
        }
        return AffiliatedDriver.fromJson(decoded);
      }
      throw MerchantDriversException(_extractErrorMessage(
        res.body,
        fallback: "Impossible d'affilier ce livreur.",
      ));
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  /// Liste les invitations/affiliations du livreur connecté
  /// (`GET /drivers/me/affiliations`).
  Future<List<DriverAffiliationInvite>> getDriverAffiliations() async {
    try {
      final res = await _api.get('/drivers/me/affiliations');
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantDriversException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) {
        throw const MerchantDriversException('Réponse inattendue du serveur.');
      }
      return decoded
          .whereType<Map>()
          .map((m) => DriverAffiliationInvite.fromJson(
                Map<String, dynamic>.from(m),
              ))
          .toList();
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  Future<DriverAffiliationInvite> respondToAffiliation({
    required String merchantId,
    required String action,
  }) async {
    try {
      final res = await _api.patch(
        '/drivers/me/affiliations/$merchantId',
        body: {'action': action},
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final decoded = jsonDecode(res.body);
        if (decoded is! Map<String, dynamic>) {
          throw const MerchantDriversException('Réponse serveur invalide.');
        }
        return DriverAffiliationInvite(
          merchantId: merchantId,
          status: decoded['status']?.toString() ?? action.toUpperCase(),
          acceptedAt: decoded['acceptedAt'] == null
              ? null
              : DateTime.tryParse(decoded['acceptedAt'].toString()),
          createdAt: null,
          removedAt: decoded['removedAt'] == null
              ? null
              : DateTime.tryParse(decoded['removedAt'].toString()),
          merchant: null,
        );
      }
      throw MerchantDriversException(_extractErrorMessage(
        res.body,
        fallback: "Impossible de répondre à l'invitation.",
      ));
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  /// Retire l'affiliation d'un livreur.
  Future<void> removeDriver(String driverId) async {
    try {
      final res = await _api.delete('/merchants/me/drivers/$driverId');
      if (res.statusCode != 200 && res.statusCode != 204) {
        throw MerchantDriversException(_extractErrorMessage(
          res.body,
          fallback: 'Impossible de retirer ce livreur.',
        ));
      }
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  /// Liste les livreurs disponibles pour un choix manuel, triés par le
  /// backend (affiliés d'abord, puis distance croissante depuis
  /// [lat]/[lng] si fournis).
  Future<List<AvailableDriver>> getAvailableDrivers({
    double? lat,
    double? lng,
  }) async {
    try {
      final params = <String, String>{
        if (lat != null) 'lat': lat.toString(),
        if (lng != null) 'lng': lng.toString(),
      };
      final query = params.isEmpty
          ? ''
          : '?${params.entries.map((e) => '${e.key}=${e.value}').join('&')}';
      final res = await _api.get('/orders/available-drivers$query');
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw MerchantDriversException('Erreur ${res.statusCode}');
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) {
        throw const MerchantDriversException('Réponse inattendue du serveur.');
      }
      return decoded
          .whereType<Map>()
          .map((m) => AvailableDriver.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } on MerchantDriversException {
      rethrow;
    } catch (e) {
      throw MerchantDriversException('Erreur réseau : $e');
    }
  }

  String _extractErrorMessage(String body, {required String fallback}) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        return m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {
      // garde le message par défaut
    }
    return fallback;
  }
}
