import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final String id;
  final String firstName;
  final String lastName;
  final String phone;
  final String role;
  final String? profilePhotoUrl;

  /// Photo de la pièce d'identité du livreur, nécessaire à la validation
  /// admin du compte (`POST /users/me/id-card-photo`).
  final String? idCardPhotoUrl;

  /// Statut de validation du compte livreur par un admin.
  /// `"PENDING"` | `"APPROVED"` | `"REJECTED"` | `null` (non-livreurs, ou
  /// anciennes réponses backend qui ne renvoyaient pas encore ce champ).
  final String? driverApprovalStatus;

  /// Disponibilité déclarée par le livreur pour recevoir des courses.
  /// Absent des anciennes réponses backend → défaut à `false`.
  @JsonKey(defaultValue: false)
  final bool isAvailable;

  /// Motif de refus renseigné par l'admin si `driverApprovalStatus == REJECTED`.
  final String? driverRejectionReason;

  User({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.role,
    this.profilePhotoUrl,
    this.idCardPhotoUrl,
    this.driverApprovalStatus,
    this.isAvailable = false,
    this.driverRejectionReason,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);

  Map<String, dynamic> toJson() => _$UserToJson(this);

  /// `true` si le compte livreur a été validé par un admin. Les non-livreurs
  /// (rôle CLIENT/COMMERCANT) n'ont pas de workflow de validation : on ne
  /// bloque donc que si `driverApprovalStatus` est explicitement renseigné
  /// et différent de `APPROVED`.
  bool get isDriverApproved =>
      driverApprovalStatus == null || driverApprovalStatus == 'APPROVED';

  bool get isDriverPending => driverApprovalStatus == 'PENDING';

  bool get isDriverRejected => driverApprovalStatus == 'REJECTED';

  User copyWith({
    String? driverApprovalStatus,
    bool? isAvailable,
    String? driverRejectionReason,
  }) {
    return User(
      id: id,
      firstName: firstName,
      lastName: lastName,
      phone: phone,
      role: role,
      profilePhotoUrl: profilePhotoUrl,
      idCardPhotoUrl: idCardPhotoUrl,
      driverApprovalStatus: driverApprovalStatus ?? this.driverApprovalStatus,
      isAvailable: isAvailable ?? this.isAvailable,
      driverRejectionReason:
          driverRejectionReason ?? this.driverRejectionReason,
    );
  }
}

@JsonSerializable(explicitToJson: true)
class AuthResult {
  @JsonKey(name: 'access_token')
  final String accessToken;
  final User user;

  AuthResult({required this.accessToken, required this.user});

  factory AuthResult.fromJson(Map<String, dynamic> json) =>
      _$AuthResultFromJson(json);

  Map<String, dynamic> toJson() => _$AuthResultToJson(this);
}
