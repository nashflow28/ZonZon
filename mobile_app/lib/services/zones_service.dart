import 'dart:convert';

import 'api_client.dart';

class ZoneInfo {
  final String id;
  final String name;

  const ZoneInfo({required this.id, required this.name});

  factory ZoneInfo.fromJson(Map<String, dynamic> json) {
    return ZoneInfo(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
    );
  }
}

class ZonesService {
  final ApiClient _api = ApiClient();

  Future<List<ZoneInfo>> listZones() async {
    final res = await _api.get('/zones');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Erreur ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((item) => ZoneInfo.fromJson(Map<String, dynamic>.from(item)))
        .where((zone) => zone.id.isNotEmpty && zone.name.isNotEmpty)
        .toList();
  }
}
