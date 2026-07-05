import 'package:json_annotation/json_annotation.dart';

part 'order_history_item.g.dart';

/// Représente une course retournée par `GET /orders/mine`.
///
/// Cette factory accepte les payloads partiels (certains champs comme
/// `livreur` ou `client` peuvent être nuls selon le rôle de l'utilisateur
/// connecté).
@JsonSerializable(createFactory: false)
class OrderHistoryItem {
  final String id;
  final String status;
  final String pickupAddress;
  final String deliveryAddress;
  final String? description;
  final double? distanceKm;
  final int? priceFcfa;
  final DateTime? createdAt;
  final String? cancellationReason;
  final String? cancelledBy;

  /// Présent quand l'utilisateur courant est CLIENT.
  final Map<String, dynamic>? livreur;

  /// Présent quand l'utilisateur courant est LIVREUR, ou quand l'utilisateur
  /// courant est COMMERCANT et que le client a un compte ZonZon.
  final Map<String, dynamic>? client;

  /// Présent quand l'utilisateur courant est COMMERCANT (livraison créée par
  /// lui pour un client). Ces deux champs sont renseignés que le client ait
  /// un compte ou non (cf. `POST /orders/merchant`).
  final String? clientPhone;
  final String? clientName;

  /// Payload brut conservé pour l'affichage debug / bottom sheet.
  /// Non inclus dans toJson car c'est un champ dérivé.
  @JsonKey(includeToJson: false)
  final Map<String, dynamic> raw;

  OrderHistoryItem({
    required this.id,
    required this.status,
    required this.pickupAddress,
    required this.deliveryAddress,
    required this.description,
    required this.distanceKm,
    required this.priceFcfa,
    required this.createdAt,
    required this.cancellationReason,
    required this.cancelledBy,
    required this.livreur,
    required this.client,
    this.clientPhone,
    this.clientName,
    required this.raw,
  });

  /// Hand-written because of the `raw: json` passthrough and the flexible
  /// num→int/double conversion helpers that json_serializable cannot express
  /// without verbose custom converters.
  factory OrderHistoryItem.fromJson(Map<String, dynamic> json) {
    double? toDouble(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    int? toInt(dynamic v) {
      if (v == null) return null;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString());
    }

    DateTime? toDate(dynamic v) {
      if (v == null) return null;
      if (v is DateTime) return v;
      return DateTime.tryParse(v.toString());
    }

    return OrderHistoryItem(
      id: json['id']?.toString() ?? '',
      status: (json['status'] ?? 'PENDING').toString(),
      pickupAddress: json['pickupAddress']?.toString() ?? '',
      deliveryAddress: json['deliveryAddress']?.toString() ?? '',
      description: json['description']?.toString(),
      distanceKm: toDouble(json['distanceKm']),
      priceFcfa: toInt(json['priceFcfa']),
      createdAt: toDate(json['createdAt']),
      cancellationReason: json['cancellationReason']?.toString(),
      cancelledBy: json['cancelledBy']?.toString(),
      livreur: json['livreur'] is Map
          ? Map<String, dynamic>.from(json['livreur'] as Map)
          : null,
      client: json['client'] is Map
          ? Map<String, dynamic>.from(json['client'] as Map)
          : null,
      clientPhone: json['clientPhone']?.toString(),
      clientName: json['clientName']?.toString(),
      raw: json,
    );
  }

  Map<String, dynamic> toJson() => _$OrderHistoryItemToJson(this);

  @JsonKey(includeToJson: false)
  bool get isActive =>
      status == 'PENDING' || status == 'ACCEPTED' || status == 'IN_PROGRESS';

  @JsonKey(includeToJson: false)
  bool get isFinished => status == 'COMPLETED' || status == 'CANCELLED';
}
