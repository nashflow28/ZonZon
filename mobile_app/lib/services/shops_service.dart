import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/env.dart';
import '../models/product.dart';
import '../models/shop.dart';
import 'api_client.dart';
import 'auth_service.dart';

class ShopsService {
  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();

  Future<List<ShopCategory>> categories() async {
    try {
      final res = await _api.get('/shops/categories');
      if (res.statusCode != 200 && res.statusCode != 201) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(ShopCategory.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<Shop>> listPublic({
    String? category,
    double? lat,
    double? lng,
    double? radiusKm,
  }) async {
    final params = <String, String>{};
    if (category != null && category.isNotEmpty) params['category'] = category;
    if (lat != null) params['lat'] = lat.toString();
    if (lng != null) params['lng'] = lng.toString();
    if (radiusKm != null) params['radius'] = radiusKm.toString();
    final qs = params.isEmpty
        ? ''
        : '?${params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&')}';
    try {
      final res = await _api.get('/shops$qs');
      if (res.statusCode != 200 && res.statusCode != 201) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map<String, dynamic>>().map(Shop.fromJson).toList();
    } catch (_) {
      return [];
    }
  }

  Future<Shop?> getPublic(String id) async {
    try {
      final res = await _api.get('/shops/$id');
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return Shop.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  // ── Favoris ────────────────────────────────────────────────────────────

  /// Liste les boutiques favorites de l'utilisateur connecté.
  /// Throw en cas d'erreur réseau ou statut non 2xx (laisse l'écran appelant
  /// gérer l'erreur, notamment pour afficher un état "Réessayer").
  Future<List<Shop>> getFavorites() async {
    final res = await _api.get('/shops/favorites');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Erreur ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! List) {
      throw Exception('Réponse inattendue du serveur.');
    }
    return data.whereType<Map<String, dynamic>>().map(Shop.fromJson).toList();
  }

  /// Charge uniquement les IDs des shops favoris (utile pour les listes).
  /// Retourne un Set vide en cas d'erreur (silencieux).
  Future<Set<String>> getFavoriteIds() async {
    try {
      final favs = await getFavorites();
      return favs.map((s) => s.id).toSet();
    } catch (_) {
      return <String>{};
    }
  }

  /// Ajoute une boutique aux favoris.
  /// Throw en cas d'erreur réseau ou statut non 2xx, sauf 409 (déjà favori →
  /// on swallow car l'état souhaité est obtenu).
  Future<void> addFavorite(String shopId) async {
    final res = await _api.post('/shops/$shopId/favorite');
    if (res.statusCode == 409) return; // déjà favori, idempotent
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Erreur ${res.statusCode}');
    }
  }

  /// Retire une boutique des favoris.
  /// Throw en cas d'erreur réseau ou statut non 2xx, sauf 404 (déjà absent →
  /// on swallow car l'état souhaité est obtenu).
  Future<void> removeFavorite(String shopId) async {
    final res = await _api.delete('/shops/$shopId/favorite');
    if (res.statusCode == 404) return; // déjà retiré
    if (res.statusCode != 200 &&
        res.statusCode != 201 &&
        res.statusCode != 204) {
      throw Exception('Erreur ${res.statusCode}');
    }
  }

  // ── Merchant ───────────────────────────────────────────────────────────

  Future<Shop?> getMyShop() async {
    try {
      final res = await _api.get('/shops/me');
      if (res.statusCode == 404) return null;
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      if (res.body.isEmpty || res.body == 'null') return null;
      return Shop.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<Shop?> createMyShop({
    required String name,
    required String category,
    required String address,
    required double lat,
    required double lng,
    String? description,
    String? phone,
    String? hours,
  }) async {
    try {
      final res = await _api.post(
        '/shops/me',
        body: {
          'name': name,
          'category': category,
          'address': address,
          'lat': lat,
          'lng': lng,
          if (description != null && description.isNotEmpty)
            'description': description,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          if (hours != null && hours.isNotEmpty) 'hours': hours,
        },
      );
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return Shop.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<Shop?> updateMyShop(Map<String, dynamic> changes) async {
    try {
      final res = await _api.patch('/shops/me', body: changes);
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return Shop.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<Shop?> uploadShopLogo(String filePath) async {
    return _uploadImage('/shops/me/logo', filePath);
  }

  Future<List<Product>> myProducts() async {
    try {
      final res = await _api.get('/shops/me/products');
      if (res.statusCode != 200 && res.statusCode != 201) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(Product.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<Product?> createProduct({
    required String name,
    required int priceFcfa,
    String? description,
    bool available = true,
  }) async {
    try {
      final res = await _api.post(
        '/shops/me/products',
        body: {
          'name': name,
          'priceFcfa': priceFcfa,
          if (description != null && description.isNotEmpty)
            'description': description,
          'available': available,
        },
      );
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return Product.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<Product?> updateProduct(
    String id,
    Map<String, dynamic> changes,
  ) async {
    try {
      final res = await _api.patch('/shops/me/products/$id', body: changes);
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      return Product.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> deleteProduct(String id) async {
    try {
      final res = await _api.delete('/shops/me/products/$id');
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  Future<Product?> uploadProductPhoto(String productId, String filePath) async {
    final res = await _uploadImageRaw(
      '/shops/me/products/$productId/photo',
      filePath,
    );
    if (res == null) return null;
    return Product.fromJson(res);
  }

  Future<Shop?> _uploadImage(String path, String filePath) async {
    final res = await _uploadImageRaw(path, filePath);
    if (res == null) return null;
    return Shop.fromJson(res);
  }

  /// Détecte le type MIME depuis l'extension du fichier.
  /// Retourne toujours un MediaType image valide.
  MediaType _contentTypeFromPath(String filePath) {
    final ext = filePath.toLowerCase().split('.').last;
    switch (ext) {
      case 'png':
        return MediaType('image', 'png');
      case 'webp':
        return MediaType('image', 'webp');
      case 'gif':
        return MediaType('image', 'gif');
      case 'jpg':
      case 'jpeg':
      default:
        return MediaType('image', 'jpeg');
    }
  }

  Future<Map<String, dynamic>?> _uploadImageRaw(
    String path,
    String filePath,
  ) async {
    final token = await _auth.getToken();
    final uri = Uri.parse('$apiUrl$apiPrefix$path');
    final req = http.MultipartRequest('POST', uri);
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.files.add(
      await http.MultipartFile.fromPath(
        'file',
        filePath,
        contentType: _contentTypeFromPath(filePath),
      ),
    );
    try {
      final streamed = await req.send();
      final body = await streamed.stream.bytesToString();
      if (streamed.statusCode < 200 || streamed.statusCode >= 300) return null;
      return jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
