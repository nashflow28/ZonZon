import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import 'controllers/order_socket_controller.dart';
import 'models/place.dart';
import 'models/product.dart' as catalog;
import 'models/shop.dart';
import 'screens/chat_screen.dart';
import 'screens/location_picker_screen.dart';
import 'screens/login_screen.dart';
import 'screens/rating_screen.dart';
import 'screens/shop_list_screen.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/estimate_service.dart';
import 'services/geocoding_service.dart';
import 'services/whatsapp_service.dart';
import 'utils/geo_utils.dart';
import 'utils/platform_adapter.dart';
import 'widgets/order_map_widget.dart';
import 'widgets/order_screen_widgets.dart';

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key});

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  bool isLoading = false;
  bool isOrderAccepted = false;
  bool isLocationLoading = true;

  String? _activeOrderId;
  String? _activeOrderStatus;
  Map<String, dynamic>? _assignedLivreur;
  int _unreadChatCount = 0;

  /// Position live du livreur (re-broadcastée toutes les ~30s par le backend).
  LatLng? _driverPosition;
  DateTime? _driverPositionAt;

  Place? _pickup;
  Place? _delivery;

  /// Estimation OSRM en cache (recalculée au change de pickup/delivery).
  double? _estimateKm;
  int? _estimatePrice;
  List<LatLng> _routePolyline = const [];
  bool _estimateLoading = false;

  /// Si la course vient d'un commerce sélectionné, on garde la trace.
  Shop? _shopOrigin;
  catalog.Product? _shopProduct;

  /// Évite de présenter plusieurs fois l'écran de notation pour une course.
  final Set<String> _ratedOrders = <String>{};

  final TextEditingController _descController =
      TextEditingController(text: '1 colis de vêtements');
  final MapController _mapController = MapController();

  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();
  final GeocodingService _geo = GeocodingService();
  final EstimateService _estimateSvc = EstimateService();
  final OrderSocketController _socketCtrl = OrderSocketController();

  StreamSubscription<DriverPosition>? _driverPosSub;
  StreamSubscription<OrderAcceptedEvent>? _orderAcceptedSub;
  StreamSubscription<OrderStatusUpdate>? _statusSub;
  StreamSubscription<NewChatMessageEvent>? _chatMsgSub;

  @override
  void initState() {
    super.initState();
    _initialPickupFromGps();
    _bootstrapSocket();
  }

  Future<void> _bootstrapSocket() async {
    await _socketCtrl.init();

    _driverPosSub = _socketCtrl.driverPosition$.listen((evt) {
      if (!mounted) return;
      setState(() {
        _driverPosition = evt.location;
        _driverPositionAt = evt.receivedAt;
      });
    });

    _orderAcceptedSub = _socketCtrl.orderAccepted$.listen((_) async {
      if (!mounted) return;
      // Recharge la commande pour récupérer le livreur assigné.
      try {
        final res = await _api.get('/orders');
        if (res.statusCode != 200 && res.statusCode != 201) return;
        final list = jsonDecode(res.body);
        if (list is! List) return;
        final mine = list.firstWhere(
          (o) => o is Map && o['id']?.toString() == _activeOrderId,
          orElse: () => null,
        );
        if (mine is Map && mine['livreur'] != null && mounted) {
          setState(() {
            _assignedLivreur = Map<String, dynamic>.from(mine['livreur']);
            _activeOrderStatus = mine['status']?.toString() ?? 'ACCEPTED';
          });
        }
      } catch (_) {}
    });

    _statusSub = _socketCtrl.statusUpdates$.listen((evt) {
      if (!mounted) return;
      setState(() {
        _activeOrderStatus = evt.status;
        if (evt.status == 'COMPLETED' || evt.status == 'CANCELLED') {
          _driverPosition = null;
          _driverPositionAt = null;
        }
      });
      if (evt.status == 'COMPLETED') {
        hapticSuccess();
        _promptRatingForCompletedOrder();
      }
    });

    // Badge non-lu : incrémenter quand un message du livreur arrive
    _chatMsgSub = _socketCtrl.newChatMessage$.listen((evt) {
      if (!mounted) return;
      setState(() => _unreadChatCount++);
    });
  }

  /// Pousse l'écran de notation une fois la course terminée. Idempotent par
  /// orderId pour éviter les doubles affichages si plusieurs events arrivent.
  Future<void> _promptRatingForCompletedOrder() async {
    final orderId = _activeOrderId;
    if (orderId == null || _ratedOrders.contains(orderId)) return;
    _ratedOrders.add(orderId);
    final livreur = _assignedLivreur;
    final livreurName = livreur != null
        ? '${livreur['firstName'] ?? ''} ${livreur['lastName'] ?? ''}'.trim()
        : '';
    // Petit délai pour laisser la SnackBar de fin de course s'afficher.
    await Future.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    await pushAdaptive<void>(
      context,
      RatingScreen(
        orderId: orderId,
        otherPartyName: livreurName,
        otherPartyRole: 'LIVREUR',
      ),
    );
  }

  /// Distance approximative livreur → client (Haversine, km).
  double? _distanceDriverToPickup() {
    final p = _driverPosition;
    final pickup = _pickup?.location;
    if (p == null || pickup == null) return null;
    return haversineKm(p, pickup);
  }

  @override
  void dispose() {
    _driverPosSub?.cancel();
    _orderAcceptedSub?.cancel();
    _statusSub?.cancel();
    _chatMsgSub?.cancel();
    _estimateSvc.dispose();
    _socketCtrl.dispose();
    _descController.dispose();
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
    final result = await pushAdaptive<Map<String, dynamic>>(
      context,
      const ShopListScreen(),
    );
    if (result == null || !mounted) return;
    final shop = result['shop'] as Shop?;
    final product = result['product'] as catalog.Product?;
    if (shop == null || product == null) return;
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
    final result = await pushAdaptive<Place>(
      context,
      LocationPickerScreen(
        title: 'Point de départ',
        hint: 'Rechercher un lieu de départ',
        initial: _pickup?.location,
      ),
    );
    if (result != null && mounted) {
      setState(() => _pickup = result);
      _mapController.move(result.location, 15);
      _scheduleEstimate();
    }
  }

  Future<void> _pickDelivery() async {
    final result = await pushAdaptive<Place>(
      context,
      LocationPickerScreen(
        title: 'Point d’arrivée',
        hint: 'Rechercher un lieu de livraison',
        initial: _delivery?.location ?? _pickup?.location,
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
    hapticSelection();
    setState(() {
      final tmp = _pickup;
      _pickup = _delivery;
      _delivery = tmp;
    });
    _fitBoundsToBoth();
    _scheduleEstimate();
  }

  /// Délègue l'estimation à [EstimateService] (debounce 500 ms inclus).
  void _scheduleEstimate() {
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null || delivery == null) {
      _estimateSvc.cancel();
      setState(() {
        _estimateKm = null;
        _estimatePrice = null;
        _routePolyline = const [];
        _estimateLoading = false;
      });
      return;
    }
    _estimateSvc.scheduleEstimate(
      lat1: pickup.location.latitude,
      lng1: pickup.location.longitude,
      lat2: delivery.location.latitude,
      lng2: delivery.location.longitude,
      onLoading: (loading) {
        if (!mounted) return;
        setState(() => _estimateLoading = loading);
      },
      onResult: (result) {
        if (!mounted || result == null) return;
        setState(() {
          _estimateKm = result.km;
          _estimatePrice = result.priceFcfa;
          _routePolyline = result.polyline;
        });
      },
    );
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
    final ok = await showAdaptiveConfirmDialog(
      context,
      title: 'Se déconnecter ?',
      message: 'Vous reviendrez à l’écran de connexion.',
      confirmLabel: 'Déconnexion',
      cancelLabel: 'Annuler',
      isDestructive: true,
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
    // Remettre le compteur à zéro dès l'ouverture du chat
    setState(() => _unreadChatCount = 0);
    final livreur = _assignedLivreur;
    final livreurName = livreur != null
        ? '${livreur['firstName'] ?? ''} ${livreur['lastName'] ?? ''}'.trim()
        : 'Livreur';
    pushAdaptive<void>(
      context,
      ChatScreen(
        orderId: orderId,
        otherPartyName: livreurName.isEmpty ? 'Livreur' : livreurName,
        otherPartyPhone: livreur?['phone']?.toString(),
        otherPartyRole: 'LIVREUR',
        orderStatus: _activeOrderStatus ?? 'ACCEPTED',
      ),
    );
  }

  /// Ouvre WhatsApp côté client pour contacter le livreur assigné. Visible
  /// uniquement quand un livreur est assigné et que la course est ACCEPTED
  /// ou IN_PROGRESS.
  Future<void> _openWhatsappToLivreur() async {
    final livreur = _assignedLivreur;
    final orderId = _activeOrderId;
    if (livreur == null || orderId == null) return;
    final phone = livreur['phone']?.toString();
    if (phone == null || phone.trim().isEmpty) {
      if (!mounted) return;
      showAdaptiveSnack(
        context,
        'Numéro du livreur indisponible.',
        isError: true,
      );
      return;
    }
    final shortId = orderId.length < 6 ? orderId : orderId.substring(0, 6);
    final message =
        'Bonjour, je suis le client de la course #$shortId. Pouvez-vous me confirmer votre arrivée ?';
    await WhatsappService.openChat(phone: phone, message: message);
  }

  Future<void> _submitOrder() async {
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null) {
      showAdaptiveSnack(context, 'Sélectionnez un point de départ');
      return;
    }
    if (delivery == null) {
      showAdaptiveSnack(context, 'Sélectionnez un point d’arrivée');
      return;
    }

    setState(() => isLoading = true);

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
          final newOrderId = responseData['id']?.toString();
          setState(() {
            isOrderAccepted = true;
            _activeOrderId = newOrderId;
            _activeOrderStatus = responseData['status']?.toString() ?? 'PENDING';
          });
          _socketCtrl.activeOrderId = newOrderId;
          hapticSuccess();
          showAdaptiveSnack(
            context,
            'Succès ! Prix : ${responseData['priceFcfa']} FCFA. Livreur en route !',
          );
        }
      } else {
        throw Exception('Erreur API Commandes');
      }
    } catch (e) {
      if (mounted) {
        hapticError();
        showAdaptiveSnack(context, 'Erreur : $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          OrderMapWidget(
            pickup: _pickup,
            delivery: _delivery,
            polyline: _routePolyline,
            driverPosition: _driverPosition,
            mapController: _mapController,
          ),
          if (isLocationLoading)
            Container(
              color: const Color(0xFF0F172A).withValues(alpha: 0.8),
              child: Center(child: adaptiveLoader()),
            ),
          OrderHeader(onLogout: _confirmLogout),
          OrderBottomSheet(
            child: isOrderAccepted
                ? OrderAcceptedSection(
                    assignedLivreur: _assignedLivreur,
                    activeOrderStatus: _activeOrderStatus,
                    driverPosition: _driverPosition,
                    driverPositionAt: _driverPositionAt,
                    distanceKm: _distanceDriverToPickup(),
                    unreadChatCount: _unreadChatCount,
                    onOpenChat: _openChat,
                    onOpenWhatsapp: _openWhatsappToLivreur,
                  )
                : OrderFormSection(
                    pickup: _pickup,
                    delivery: _delivery,
                    descController: _descController,
                    hasShopOrigin: _shopOrigin != null,
                    shopProductName: _shopProduct?.name,
                    estimateLoading: _estimateLoading,
                    estimateKm: _estimateKm,
                    estimatePrice: _estimatePrice,
                    submitLoading: isLoading,
                    onOpenShops: _openShops,
                    onCancelShop: _cancelShopOrigin,
                    onPickPickup: _pickPickup,
                    onPickDelivery: _pickDelivery,
                    onSwap: _swap,
                    onSubmit: _submitOrder,
                  ),
          ),
        ],
      ),
    );
  }

  void _cancelShopOrigin() {
    setState(() {
      _shopOrigin = null;
      _shopProduct = null;
      _pickup = null;
      _descController.text = '1 colis';
      _routePolyline = const [];
      _estimateKm = null;
      _estimatePrice = null;
    });
  }
}
