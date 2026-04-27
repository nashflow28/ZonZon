import 'dart:convert';
import '../models/saved_address.dart';
import 'api_client.dart';

class SavedAddressesService {
  final ApiClient _api = ApiClient();

  Future<List<SavedAddress>> list() async {
    try {
      final res = await _api.get('/addresses/saved');
      if (res.statusCode != 200 && res.statusCode != 201) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(SavedAddress.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<SavedAddress?> create({
    required String label,
    required String address,
    required double lat,
    required double lng,
    String? icon,
  }) async {
    try {
      final res = await _api.post('/addresses/saved', body: {
        'label': label,
        'address': address,
        'lat': lat,
        'lng': lng,
        if (icon != null) 'icon': icon,
      });
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return SavedAddress.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> delete(String id) async {
    try {
      final res = await _api.delete('/addresses/saved/$id');
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    }
  }
}
