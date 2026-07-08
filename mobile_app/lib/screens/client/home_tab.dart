import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../models/place.dart';
import '../../models/product.dart' as catalog;
import '../../models/shop.dart';
import '../../router/app_router.dart';
import '../../services/active_orders_store.dart';
import '../../services/api_client.dart';
import '../../services/client_services.dart';
import '../../services/estimate_service.dart';
import '../../services/geocoding_service.dart';
import '../../utils/platform_adapter.dart';
import '../../widgets/order_map_widget.dart';
import '../../widgets/order_screen_widgets.dart';
import '../location_picker_screen.dart';
import '../shop_list_screen.dart';

/// Onglet « Accueil » du shell client.
///
/// Affiche la carte + le formulaire de création d'une course directe
/// (pickup → delivery, sans passer par une boutique). Une fois la commande
/// créée, on bascule automatiquement sur l'onglet « Commandes » qui montre
/// la nouvelle commande en haut de la liste.
class HomeTab extends StatefulWidget {
  const HomeTab({super.key});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab>
    with AutomaticKeepAliveClientMixin {
  bool isLoading = false;
  bool isLocationLoading = true;

  Place? _pickup;
  Place? _delivery;

  double? _estimateKm;
  int? _estimatePrice;
  List<LatLng> _routePolyline = const [];
  bool _estimateLoading = false;

  Shop? _shopOrigin;
  catalog.Product? _shopProduct;

  final TextEditingController _descController =
      TextEditingController(text: '1 colis de vêtements');
  final MapController _mapController = MapController();

  final ApiClient _api = ApiClient();
  final GeocodingService _geo = GeocodingService();
  final EstimateService _estimateSvc = EstimateService();

  ActiveOrdersStore get _store => ClientServices.activeOrders;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _initialPickupFromGps();
    ClientServices.pendingShopSelection.addListener(_consumePendingShop);
    _consumePendingShop();
  }

  @override
  void dispose() {
    ClientServices.pendingShopSelection.removeListener(_consumePendingShop);
    _estimateSvc.dispose();
    _descController.dispose();
    super.dispose();
  }

  /// Si l'onglet Boutiques a déposé une sélection, applique-la au formulaire
  /// puis vide le notifier.
  void _consumePendingShop() {
    final pending = ClientServices.pendingShopSelection.value;
    if (pending == null) return;
    setState(() {
      _shopOrigin = pending.shop;
      _shopProduct = pending.product;
      _pickup = Place(
        displayName: '${pending.shop.name} — ${pending.shop.address}',
        shortName: pending.shop.name,
        location: pending.shop.location,
      );
      _descController.text =
          '${pending.product.name} (${pending.product.priceFcfa} FCFA) chez ${pending.shop.name}';
    });
    ClientServices.pendingShopSelection.value = null;
    _scheduleEstimate();
    _mapController.move(pending.shop.location, 15);
    if (_delivery != null) _fitBoundsToBoth();
  }

  // ---------------------------------------------------------------------------
  // Pickup initial via GPS
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Sélection des points
  // ---------------------------------------------------------------------------

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
      _mapController.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds(a, b),
          padding: const EdgeInsets.fromLTRB(60, 120, 60, 380),
        ),
      );
    } else if (a != null) {
      _mapController.move(a, 15);
    } else if (b != null) {
      _mapController.move(b, 15);
    }
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

  // ---------------------------------------------------------------------------
  // Soumission
  // ---------------------------------------------------------------------------

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
    if (_store.isAtLimit) {
      showAdaptiveSnack(
        context,
        'Limite de ${ActiveOrdersStore.maxActiveOrders} commandes simultanées atteinte. '
        'Terminez ou annulez une commande en cours.',
        isError: true,
      );
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
        if (responseData is! Map<String, dynamic>) {
          throw Exception('Réponse API invalide');
        }
        if (!mounted) return;
        _store.onOrderCreated(responseData);
        hapticSuccess();
        _resetForm();
        showAdaptiveSnack(
          context,
          'Commande créée. Recherche d\'un livreur en cours…',
        );
        // Bascule auto sur l'onglet Commandes pour voir la nouvelle commande.
        context.go(AppRoutes.clientOrders);
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

  void _resetForm() {
    setState(() {
      _shopOrigin = null;
      _shopProduct = null;
      _delivery = null;
      _descController.text = '1 colis de vêtements';
      _routePolyline = const [];
      _estimateKm = null;
      _estimatePrice = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      body: Stack(
        children: [
          OrderMapWidget(
            pickup: _pickup,
            delivery: _delivery,
            polyline: _routePolyline,
            driverPosition: null,
            mapController: _mapController,
          ),
          if (isLocationLoading)
            Container(
              color: const Color(0xFF0C1A22).withValues(alpha: 0.8),
              child: Center(child: adaptiveLoader()),
            ),
          // Header simple — pas d'icônes profil/historique (c'est dans la
          // bottom-nav et l'onglet Commandes).
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 20,
            right: 20,
            child: const _HomeHeader(),
          ),
          OrderBottomSheet(
            child: OrderFormSection(
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
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530).withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'ZonZon',
            style: TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.5,
            ),
          ),
          Text(
            'Express',
            style: TextStyle(
              color: Color(0xFF2E90FA),
              fontSize: 24,
              fontWeight: FontWeight.w300,
            ),
          ),
        ],
      ),
    );
  }
}
