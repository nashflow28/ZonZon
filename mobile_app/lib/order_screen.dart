import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:ui';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'config/env.dart';
import 'models/place.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/geocoding_service.dart';
import 'screens/chat_screen.dart';
import 'screens/location_picker_screen.dart';
import 'screens/shop_list_screen.dart';
import 'screens/login_screen.dart';
import 'models/shop.dart';
import 'models/product.dart' as catalog;

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key});

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  static const _defaultLome = LatLng(6.1319, 1.2228);

  bool isLoading = false;
  bool isOrderAccepted = false;
  bool isLocationLoading = true;

  String? _activeOrderId;
  String? _activeOrderStatus;
  Map<String, dynamic>? _assignedLivreur;
  IO.Socket? _socket;

  /// Position live du livreur (re-broadcastée toutes les ~30s par le backend)
  LatLng? _driverPosition;
  DateTime? _driverPositionAt;

  Place? _pickup;
  Place? _delivery;

  /// Estimation OSRM en cache (recalculée au change de pickup/delivery).
  double? _estimateKm;
  int? _estimatePrice;
  List<LatLng> _routePolyline = const [];
  bool _estimateLoading = false;
  Timer? _estimateDebounce;

  /// Si la course vient d'un commerce sélectionné, on garde la trace
  Shop? _shopOrigin;
  catalog.Product? _shopProduct;

  final TextEditingController _descController =
      TextEditingController(text: '1 colis de vêtements');

  final MapController _mapController = MapController();

  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();
  final GeocodingService _geo = GeocodingService();

  @override
  void initState() {
    super.initState();
    _initialPickupFromGps();
    _initSocket();
  }

  Future<void> _initSocket() async {
    final token = await _auth.getToken();
    _socket = IO.io(apiUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });
    _socket!.connect();

    _socket!.on('orderAccepted', (data) async {
      if (!mounted) return;
      if (data is! Map) return;
      if (data['orderId']?.toString() != _activeOrderId) return;
      try {
        final res = await _api.get('/orders');
        if (res.statusCode == 200 || res.statusCode == 201) {
          final list = jsonDecode(res.body);
          if (list is List) {
            final mine = list.firstWhere(
              (o) => o is Map && o['id']?.toString() == _activeOrderId,
              orElse: () => null,
            );
            if (mine is Map && mine['livreur'] != null) {
              setState(() {
                _assignedLivreur = Map<String, dynamic>.from(mine['livreur']);
                _activeOrderStatus = mine['status']?.toString() ?? 'ACCEPTED';
              });
            }
          }
        }
      } catch (_) {}
    });

    _socket!.on('orderStatusUpdated', (data) {
      if (!mounted) return;
      if (data is! Map) return;
      if (data['orderId']?.toString() != _activeOrderId) return;
      final newStatus = data['status']?.toString() ?? _activeOrderStatus;
      setState(() {
        _activeOrderStatus = newStatus;
        // Quand la course se termine, on retire le marker live
        if (newStatus == 'COMPLETED' || newStatus == 'CANCELLED') {
          _driverPosition = null;
          _driverPositionAt = null;
        }
      });
    });

    _socket!.on('driver:position', (data) {
      if (!mounted) return;
      if (data is! Map) return;
      if (data['orderId']?.toString() != _activeOrderId) return;
      final lat = (data['lat'] as num?)?.toDouble();
      final lng = (data['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return;
      setState(() {
        _driverPosition = LatLng(lat, lng);
        _driverPositionAt = DateTime.now();
      });
    });
  }

  /// Distance approximative livreur → client (Haversine, km).
  double? _distanceDriverToPickup() {
    final p = _driverPosition;
    final pickup = _pickup?.location;
    if (p == null || pickup == null) return null;
    return _haversineKm(p, pickup);
  }

  static double _haversineKm(LatLng a, LatLng b) {
    const r = 6371.0;
    double toRad(double d) => d * (math.pi / 180);
    final dLat = toRad(b.latitude - a.latitude);
    final dLng = toRad(b.longitude - a.longitude);
    final lat1 = toRad(a.latitude);
    final lat2 = toRad(b.latitude);
    final h = math.pow(math.sin(dLat / 2), 2) +
        math.cos(lat1) * math.cos(lat2) * math.pow(math.sin(dLng / 2), 2);
    return 2 * r * math.asin(math.sqrt(h));
  }

  @override
  void dispose() {
    _estimateDebounce?.cancel();
    _descController.dispose();
    _socket?.dispose();
    super.dispose();
  }

  Future<void> _initialPickupFromGps() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) setState(() => isLocationLoading = false);
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) setState(() => isLocationLoading = false);
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      final latLng = LatLng(position.latitude, position.longitude);
      // Affiche la carte tout de suite, le reverse geocode arrive après
      if (mounted) {
        setState(() {
          _pickup = Place(
            displayName: 'Ma position',
            shortName: 'Ma position',
            location: latLng,
          );
          isLocationLoading = false;
        });
        _mapController.move(latLng, 14);
      }
      final resolved = await _geo.reverse(latLng);
      if (resolved != null && mounted) {
        setState(() => _pickup = resolved);
      }
    } catch (_) {
      if (mounted) setState(() => isLocationLoading = false);
    }
  }

  Future<void> _openShops() async {
    final result =
        await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const ShopListScreen()),
    );
    if (result == null || !mounted) return;
    final shop = result['shop'] as Shop?;
    final product = result['product'] as catalog.Product?;
    if (shop == null || product == null) return;
    // Pré-remplit le pickup avec la boutique et la description avec le produit
    setState(() {
      _shopOrigin = shop;
      _shopProduct = product;
      _pickup = Place(
        displayName: '${shop.name} — ${shop.address}',
        shortName: shop.name,
        location: shop.location,
      );
      _descController.text =
          '${product.name} (${product.priceFcfa} FCFA) chez ${shop.name}';
    });
    _scheduleEstimate();
    _mapController.move(shop.location, 15);
    if (_delivery != null) _fitBoundsToBoth();
  }

  Future<void> _pickPickup() async {
    final result = await Navigator.of(context).push<Place>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          title: 'Point de départ',
          hint: 'Rechercher un lieu de départ',
          initial: _pickup?.location,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() => _pickup = result);
      _mapController.move(result.location, 15);
      _scheduleEstimate();
    }
  }

  Future<void> _pickDelivery() async {
    final result = await Navigator.of(context).push<Place>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          title: 'Point d\'arrivée',
          hint: 'Rechercher un lieu de livraison',
          initial: _delivery?.location ?? _pickup?.location,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() => _delivery = result);
      _fitBoundsToBoth();
      _scheduleEstimate();
    }
  }

  void _swap() {
    if (_pickup == null && _delivery == null) return;
    setState(() {
      final tmp = _pickup;
      _pickup = _delivery;
      _delivery = tmp;
    });
    _fitBoundsToBoth();
    _scheduleEstimate();
  }

  /// Debounce + appelle /orders/estimate. Met à jour _estimateKm/Price/_routePolyline.
  void _scheduleEstimate() {
    _estimateDebounce?.cancel();
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null || delivery == null) {
      setState(() {
        _estimateKm = null;
        _estimatePrice = null;
        _routePolyline = const [];
      });
      return;
    }
    setState(() => _estimateLoading = true);
    _estimateDebounce = Timer(const Duration(milliseconds: 500), () async {
      try {
        final res = await _api.post('/orders/estimate', body: {
          'pickupLat': pickup.location.latitude,
          'pickupLng': pickup.location.longitude,
          'deliveryLat': delivery.location.latitude,
          'deliveryLng': delivery.location.longitude,
        });
        if (!mounted) return;
        if (res.statusCode != 200 && res.statusCode != 201) {
          setState(() => _estimateLoading = false);
          return;
        }
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final km = (data['distanceKm'] as num?)?.toDouble();
        final price = (data['priceFcfa'] as num?)?.toInt();
        final polyRaw = data['polyline'] as List?;
        final poly = <LatLng>[];
        if (polyRaw != null) {
          for (final p in polyRaw) {
            if (p is List && p.length == 2 && p[0] is num && p[1] is num) {
              poly.add(LatLng((p[0] as num).toDouble(), (p[1] as num).toDouble()));
            }
          }
        }
        setState(() {
          _estimateKm = km;
          _estimatePrice = price;
          _routePolyline = poly;
          _estimateLoading = false;
        });
      } catch (_) {
        if (!mounted) return;
        setState(() => _estimateLoading = false);
      }
    });
  }

  void _fitBoundsToBoth() {
    final a = _pickup?.location;
    final b = _delivery?.location;
    if (a != null && b != null) {
      final bounds = LatLngBounds(a, b);
      _mapController.fitCamera(
        CameraFit.bounds(
          bounds: bounds,
          padding: const EdgeInsets.fromLTRB(60, 120, 60, 380),
        ),
      );
    } else if (a != null) {
      _mapController.move(a, 15);
    } else if (b != null) {
      _mapController.move(b, 15);
    }
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Se déconnecter ?',
            style: TextStyle(color: Colors.white)),
        content: const Text(
          'Vous reviendrez à l\'écran de connexion.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Déconnexion'),
          ),
        ],
      ),
    );
    if (ok == true) await _logout();
  }

  Future<void> _logout() async {
    await _auth.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _openChat() {
    final orderId = _activeOrderId;
    if (orderId == null) return;
    final livreur = _assignedLivreur;
    final livreurName = livreur != null
        ? '${livreur['firstName'] ?? ''} ${livreur['lastName'] ?? ''}'.trim()
        : 'Livreur';
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          orderId: orderId,
          otherPartyName: livreurName.isEmpty ? 'Livreur' : livreurName,
          otherPartyPhone: livreur?['phone']?.toString(),
          otherPartyRole: 'LIVREUR',
          orderStatus: _activeOrderStatus ?? 'ACCEPTED',
        ),
      ),
    );
  }

  Future<void> _submitOrder() async {
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sélectionnez un point de départ')),
      );
      return;
    }
    if (delivery == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sélectionnez un point d\'arrivée')),
      );
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      final orderRes = await _api.post('/orders', body: {
        'pickupAddress': pickup.displayName,
        'pickupLat': pickup.location.latitude,
        'pickupLng': pickup.location.longitude,
        'deliveryAddress': delivery.displayName,
        'deliveryLat': delivery.location.latitude,
        'deliveryLng': delivery.location.longitude,
        'description': _descController.text,
      });

      if (orderRes.statusCode == 201 || orderRes.statusCode == 200) {
        final responseData = jsonDecode(orderRes.body);
        if (mounted) {
          setState(() {
            isOrderAccepted = true;
            _activeOrderId = responseData['id']?.toString();
            _activeOrderStatus = responseData['status']?.toString() ?? 'PENDING';
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'Succès ! Prix : ${responseData['priceFcfa']} FCFA. Livreur en route !'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
      } else {
        throw Exception('Erreur API Commandes');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final mapCenter = _pickup?.location ?? _delivery?.location ?? _defaultLome;
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          // Carte (double couche dark : base sans labels + labels nets par-dessus)
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: mapCenter,
              initialZoom: 13.5,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
                userAgentPackageName: 'com.zonzon.app',
                subdomains: const ['a', 'b', 'c', 'd'],
                retinaMode: RetinaMode.isHighDensity(context),
              ),
              TileLayer(
                urlTemplate:
                    'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
                userAgentPackageName: 'com.zonzon.app',
                subdomains: const ['a', 'b', 'c', 'd'],
                retinaMode: RetinaMode.isHighDensity(context),
              ),
                if (_routePolyline.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _routePolyline,
                        color: const Color(0xFF0EA5E9),
                        strokeWidth: 4,
                        borderColor: const Color(0xFF0EA5E9).withValues(alpha: 0.35),
                        borderStrokeWidth: 8,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (_pickup != null)
                      Marker(
                        point: _pickup!.location,
                        width: 60,
                        height: 60,
                        child: _buildGlowingMarker(
                            Icons.my_location, const Color(0xFF0EA5E9)),
                      ),
                    if (_delivery != null)
                      Marker(
                        point: _delivery!.location,
                        width: 50,
                        height: 50,
                        child: _buildGlowingMarker(
                            Icons.location_on, const Color(0xFF10B981)),
                      ),
                    if (_driverPosition != null)
                      Marker(
                        point: _driverPosition!,
                        width: 56,
                        height: 56,
                        child: _DriverPulseMarker(),
                      ),
                  ],
                ),
            ],
          ),

          if (isLocationLoading)
            Container(
              color: const Color(0xFF0F172A).withValues(alpha: 0.8),
              child: const Center(
                  child: CircularProgressIndicator(color: Color(0xFF0EA5E9))),
            ),

          // Header
          Positioned(
            top: 50,
            left: 20,
            right: 20,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(vertical: 12, horizontal: 20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B).withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(20),
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const SizedBox(width: 40),
                      const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('ZonZon',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.5)),
                          Text('Express',
                              style: TextStyle(
                                  color: Color(0xFF0EA5E9),
                                  fontSize: 24,
                                  fontWeight: FontWeight.w300)),
                        ],
                      ),
                      Material(
                        color: Colors.white.withValues(alpha: 0.06),
                        shape: const CircleBorder(),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: _confirmLogout,
                          child: const SizedBox(
                            width: 40,
                            height: 40,
                            child: Icon(Icons.logout,
                                color: Colors.white70, size: 18),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          Align(
            alignment: Alignment.bottomCenter,
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(40)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        const Color(0xFF1E293B).withValues(alpha: 0.85),
                        const Color(0xFF0F172A).withValues(alpha: 0.95),
                      ],
                    ),
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(40)),
                    border: Border(
                      top: BorderSide(
                          color: Colors.white.withValues(alpha: 0.15),
                          width: 1.5),
                    ),
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: Container(
                            width: 50,
                            height: 6,
                            margin: const EdgeInsets.only(bottom: 18),
                            decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                        if (!isOrderAccepted) ..._buildOrderForm(),
                        if (isOrderAccepted) ..._buildAcceptedView(),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildOrderForm() {
    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Prêt à livrer ?',
                    style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: Colors.white)),
                SizedBox(height: 4),
                Text('Choisissez les points de la course.',
                    style: TextStyle(fontSize: 14, color: Colors.white60)),
              ],
            ),
          ),
          Material(
            color: const Color(0xFF10B981).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(14),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: _openShops,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.storefront, color: Color(0xFF10B981)),
                    const SizedBox(height: 4),
                    Text(
                      'Commerces',
                      style: TextStyle(
                        color: const Color(0xFF10B981),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      if (_shopOrigin != null) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF10B981).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: const Color(0xFF10B981).withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              const Icon(Icons.shopping_bag, color: Color(0xFF10B981), size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Commande : ${_shopProduct?.name ?? ''}',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 16, color: Colors.white60),
                tooltip: 'Annuler',
                onPressed: () {
                  setState(() {
                    _shopOrigin = null;
                    _shopProduct = null;
                    _pickup = null;
                    _descController.text = '1 colis';
                    _routePolyline = const [];
                    _estimateKm = null;
                    _estimatePrice = null;
                  });
                },
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 18),
      _AddressCard(
        icon: Icons.my_location,
        color: const Color(0xFF0EA5E9),
        label: 'Départ',
        place: _pickup,
        emptyHint: 'Choisir le point de départ',
        onTap: _pickPickup,
      ),
      _SwapButton(onTap: _swap),
      _AddressCard(
        icon: Icons.location_on,
        color: const Color(0xFF10B981),
        label: 'Arrivée',
        place: _delivery,
        emptyHint: 'Choisir le point d\'arrivée',
        onTap: _pickDelivery,
      ),
      const SizedBox(height: 14),
      _buildEstimatePreview(),
      const SizedBox(height: 14),
      _buildInputField(
        icon: Icons.inventory_2_outlined,
        hint: 'Que transportez-vous ?',
        controller: _descController,
      ),
      const SizedBox(height: 18),
      Container(
        height: 60,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
              colors: [Color(0xFF0EA5E9), Color(0xFF3B82F6)]),
          boxShadow: [
            BoxShadow(
                color: const Color(0xFF0EA5E9).withValues(alpha: 0.5),
                blurRadius: 25,
                offset: const Offset(0, 8)),
          ],
        ),
        child: ElevatedButton(
          onPressed: isLoading ? null : _submitOrder,
          style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
          child: isLoading
              ? const CircularProgressIndicator(color: Colors.white)
              : const Text('Commander maintenant',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 0.5)),
        ),
      ),
    ];
  }

  List<Widget> _buildAcceptedView() {
    return [
      TweenAnimationBuilder(
        duration: const Duration(milliseconds: 800),
        tween: Tween<double>(begin: 0, end: 1),
        builder: (context, double value, child) {
          return Transform.scale(
            scale: value,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF10B981).withValues(alpha: 0.1),
                boxShadow: [
                  BoxShadow(
                      color: const Color(0xFF10B981).withValues(alpha: 0.2),
                      blurRadius: 30)
                ],
              ),
              child: const Icon(Icons.check_circle,
                  color: Color(0xFF10B981), size: 60),
            ),
          );
        },
      ),
      const SizedBox(height: 16),
      const Text('Coursier en route !',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.white)),
      const SizedBox(height: 8),
      _buildLiveTrackingBanner(),
      const SizedBox(height: 16),
      AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        child: _assignedLivreur == null
            ? Container(
                key: const ValueKey('waiting'),
                height: 60,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  color: Colors.white.withValues(alpha: 0.04),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: const Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Color(0xFF0EA5E9)),
                      ),
                      SizedBox(width: 12),
                      Text('Recherche d\'un livreur…',
                          style:
                              TextStyle(color: Colors.white70, fontSize: 15)),
                    ],
                  ),
                ),
              )
            : Container(
                key: const ValueKey('chat'),
                height: 60,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(
                      colors: [Color(0xFF0EA5E9), Color(0xFF3B82F6)]),
                  boxShadow: [
                    BoxShadow(
                        color: const Color(0xFF0EA5E9).withValues(alpha: 0.4),
                        blurRadius: 25,
                        offset: const Offset(0, 8))
                  ],
                ),
                child: ElevatedButton.icon(
                  onPressed: _openChat,
                  icon: const Icon(Icons.chat_bubble_rounded,
                      color: Colors.white, size: 22),
                  label: Text(
                    'Discuter avec ${_assignedLivreur!['firstName'] ?? 'le livreur'}',
                    style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white),
                  ),
                  style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20))),
                ),
              ),
      ),
    ];
  }

  Widget _buildEstimatePreview() {
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null || delivery == null) {
      return const SizedBox.shrink();
    }
    final loading = _estimateLoading && _estimatePrice == null;
    final km = _estimateKm;
    final price = _estimatePrice;
    return AnimatedSize(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              const Color(0xFF0EA5E9).withValues(alpha: 0.18),
              const Color(0xFF10B981).withValues(alpha: 0.10),
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFF0EA5E9).withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFF0EA5E9).withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.alt_route,
                  color: Color(0xFF0EA5E9), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (loading)
                    Row(
                      children: const [
                        SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Color(0xFF0EA5E9)),
                        ),
                        SizedBox(width: 8),
                        Text('Calcul du trajet…',
                            style: TextStyle(
                                color: Colors.white, fontSize: 13)),
                      ],
                    )
                  else if (km != null && price != null) ...[
                    Text(
                      '${km.toStringAsFixed(1)} km',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Prix estimé',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (price != null && !loading)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${_formatThousands(price)} FCFA',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Text(
                    'à payer en livraison',
                    style: TextStyle(color: Colors.white60, fontSize: 11),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  static String _formatThousands(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return buf.toString();
  }

  Widget _buildLiveTrackingBanner() {
    final dist = _distanceDriverToPickup();
    final hasPosition = _driverPosition != null;
    final lastSeen = _driverPositionAt;
    String subtitle;
    if (!hasPosition) {
      subtitle = 'En attente de la position du livreur…';
    } else if (dist != null) {
      // ETA grossier : 30 km/h en moto, donc minutes ≈ km × 2
      final minutes = (dist * 2).round().clamp(1, 99);
      subtitle = '${dist.toStringAsFixed(1)} km · ~$minutes min';
    } else {
      subtitle = 'Livreur localisé';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0EA5E9).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF0EA5E9).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              if (hasPosition)
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.25),
                    shape: BoxShape.circle,
                  ),
                ),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: hasPosition
                      ? const Color(0xFF10B981)
                      : const Color(0xFF94A3B8),
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasPosition ? 'Livreur en chemin' : 'Localisation…',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          if (lastSeen != null)
            Text(
              _formatLastSeen(lastSeen),
              style: const TextStyle(color: Colors.white38, fontSize: 11),
            ),
        ],
      ),
    );
  }

  String _formatLastSeen(DateTime when) {
    final s = DateTime.now().difference(when).inSeconds;
    if (s < 10) return 'à l\'instant';
    if (s < 60) return '${s}s';
    final m = (s / 60).floor();
    return '${m} min';
  }

  Widget _buildGlowingMarker(IconData icon, Color color) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
              color: color.withValues(alpha: 0.6),
              blurRadius: 15,
              spreadRadius: 2)
        ],
      ),
      child: Icon(icon, color: color, size: 45),
    );
  }

  Widget _buildInputField({
    required IconData icon,
    required String hint,
    Color iconColor = const Color(0xFF0EA5E9),
    required TextEditingController controller,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white, fontSize: 16),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
          prefixIcon: Icon(icon, color: iconColor),
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        ),
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final Place? place;
  final String emptyHint;
  final VoidCallback onTap;

  const _AddressCard({
    required this.icon,
    required this.color,
    required this.label,
    required this.place,
    required this.emptyHint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.04),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: place == null
                  ? color.withValues(alpha: 0.35)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      place?.shortName ?? emptyHint,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: place == null ? Colors.white54 : Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (place != null && place!.displayName != place!.shortName) ...[
                      const SizedBox(height: 1),
                      Text(
                        place!.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white38,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white.withValues(alpha: 0.4)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DriverPulseMarker extends StatefulWidget {
  @override
  State<_DriverPulseMarker> createState() => _DriverPulseMarkerState();
}

class _DriverPulseMarkerState extends State<_DriverPulseMarker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        return Stack(
          alignment: Alignment.center,
          children: [
            // pulse ring
            Container(
              width: 56 * (0.5 + t * 0.5),
              height: 56 * (0.5 + t * 0.5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF10B981)
                    .withValues(alpha: (1 - t) * 0.45),
              ),
            ),
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF10B981),
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF10B981).withValues(alpha: 0.6),
                    blurRadius: 12,
                  ),
                ],
              ),
              child: const Icon(Icons.two_wheeler,
                  size: 16, color: Colors.white),
            ),
          ],
        );
      },
    );
  }
}

class _SwapButton extends StatelessWidget {
  final VoidCallback onTap;

  const _SwapButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 1,
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Material(
              color: const Color(0xFF1E293B),
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: const SizedBox(
                  width: 34,
                  height: 34,
                  child: Icon(Icons.swap_vert,
                      color: Color(0xFF0EA5E9), size: 18),
                ),
              ),
            ),
          ),
          Expanded(
            child: Container(
              height: 1,
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
        ],
      ),
    );
  }
}
