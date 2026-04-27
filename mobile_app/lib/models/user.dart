class User {
  final String id;
  final String firstName;
  final String lastName;
  final String phone;
  final String role;
  final String? profilePhotoUrl;

  User({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.role,
    this.profilePhotoUrl,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      firstName: json['firstName'] ?? '',
      lastName: json['lastName'] ?? '',
      phone: json['phone'] ?? '',
      role: json['role'] ?? '',
      profilePhotoUrl: json['profilePhotoUrl'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'firstName': firstName,
        'lastName': lastName,
        'phone': phone,
        'role': role,
        'profilePhotoUrl': profilePhotoUrl,
      };
}

class AuthResult {
  final String accessToken;
  final User user;

  AuthResult({required this.accessToken, required this.user});

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    return AuthResult(
      accessToken: json['access_token'] ?? '',
      user: User.fromJson(json['user'] ?? {}),
    );
  }
}
