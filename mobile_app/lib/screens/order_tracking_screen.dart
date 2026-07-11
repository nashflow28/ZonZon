import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../controllers/order_socket_controller.dart';
import '../models/place.dart';
import '../services/active_orders_store.dart';
import '../services/api_client.dart';
import '../services/client_services.dart';
import '../services/estimate_service.dart';
import '../services/eta_service.dart';
import '../services/signalement_service.dart';
import '../services/whatsapp_service.dart';
import '../utils/geo_utils.dart';
import '../utils/order_status_utils.dart';
import '../utils/platform_adapter.dart';
import '../widgets/order_map_widget.dart';
import '../widgets/order_screen_widgets.dart';
import '../widgets/status_timeline.dart';
import 'chat_screen.dart';
import 'rating_screen.dart';

/// Écran de suivi d'une commande spécifique.
///
/// Affiché en push (hors shell bottom-nav). Reçoit un [orderId], lit l'état
/// initial depuis le store puis écoute en continu :
/// - les positions GPS du livreur (filtrées sur l'orderId),
/// - les changements de statut,
/// - les nouveaux messages chat (badge non-lu),
/// - l'ETA backend (polling 30 s + refresh à chaque driver:position).
///
/// Aucune logique de création de commande ici — c'est l'écran d'accueil qui
/// s'en charge.
class OrderTrackingScreen extends StatefulWidget {
  final String orderId;

  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  final ApiClient _api = ApiClient();
  final EstimateService _estimateSvc = EstimateService();
  final EtaService _etaSvc = EtaService();
  final SignalementService _signalementSvc = SignalementService();
  late final OrderSocketController _socketCtrl;
  late final ActiveOrdersStore _store;

  StreamSubscription<DriverPosition>? _driverPosSub;
  StreamSubscription<OrderAcceptedEvent>? _orderAcceptedSub;
  StreamSubscription<OrderStatusUpdate>? _statusSub;
  StreamSubscription<OrderPaymentUpdate>? _paymentSub;
  StreamSubscription<NewChatMessageEvent>? _chatMsgSub;

  Place? _pickup;
  Place? _delivery;
  List<LatLng> _routePolyline = const [];

  Map<String, dynamic>? _assignedLivreur;
  String? _activeOrderStatus;
  String? _paymentStatus;

  LatLng? _driverPosition;
  DateTime? _driverPositionAt;

  int _unreadChatCount = 0;

  EtaResult? _eta;
  Timer? _etaTimer;

  bool _ratingPrompted = false;

  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    _socketCtrl = ClientServices.socket;
    _store = ClientServices.activeOrders;
    _socketCtrl.watchOrder(widget.orderId);
    _bootstrapFromStore();
    _attachStreams();
    _refreshDetails();
    _startEtaPolling();
  }

  void _bootstrapFromStore() {
    final item = _store.findById(widget.orderId);
    if (item == null) return;
    _activeOrderStatus = item.status;
    _assignedLivreur = item.livreur;
    _paymentStatus = item.paymentStatus;
    _setPickupDeliveryFromRaw(item.raw);
  }

  void _setPickupDeliveryFromRaw(Map<String, dynamic> raw) {
    double? toDouble(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    final pLat = toDouble(raw['pickupLat']);
    final pLng = toDouble(raw['pickupLng']);
    final dLat = toDouble(raw['deliveryLat']);
    final dLng = toDouble(raw['deliveryLng']);
    final pAddr = raw['pickupAddress']?.toString() ?? '';
    final dAddr = raw['deliveryAddress']?.toString() ?? '';

    if (pLat != null && pLng != null) {
      _pickup = Place(
        displayName: pAddr,
        shortName: pAddr.split(',').first,
        location: LatLng(pLat, pLng),
      );
    }
    if (dLat != null && dLng != null) {
      _delivery = Place(
        displayName: dAddr,
        shortName: dAddr.split(',').first,
        location: LatLng(dLat, dLng),
      );
    }
    if (_pickup != null && _delivery != null) {
      _scheduleEstimate(_pickup!.location, _delivery!.location);
      _fitBoundsToBoth();
    }
  }

  Future<void> _scheduleEstimate(LatLng a, LatLng b) async {
    try {
      final res = await _estimateSvc.estimate(
        lat1: a.latitude,
        lng1: a.longitude,
        lat2: b.latitude,
        lng2: b.longitude,
      );
      if (!mounted || res == null) return;
      setState(() => _routePolyline = res.polyline);
    } catch (_) {
      // pas grave, la carte fonctionne sans polyline
    }
  }

  void _fitBoundsToBoth() {
    final a = _pickup?.location;
    final b = _delivery?.location;
    if (a == null && b == null) return;
    // Différé d'une frame : évite d'utiliser le MapController avant que le
    // widget FlutterMap ne soit réellement monté (ex. initState() qui
    // reçoit des coordonnées déjà en cache dans le store — la carte n'a pas
    // encore fait son premier build à ce moment-là).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (a != null && b != null) {
        _mapController.fitCamera(
          CameraFit.bounds(
            bounds: LatLngBounds(a, b),
            padding: const EdgeInsets.fromLTRB(60, 120, 60, 380),
          ),
        );
      } else if (a != null) {
        _mapController.move(a, 15);
      }
    });
  }

  void _attachStreams() {
    _driverPosSub = _socketCtrl.driverPosition$
        .where((e) => e.orderId == widget.orderId)
        .listen((evt) {
          if (!mounted) return;
          setState(() {
            _driverPosition = evt.location;
            _driverPositionAt = evt.receivedAt;
          });
          _refreshEta();
        });

    _orderAcceptedSub = _socketCtrl.orderAccepted$
        .where((e) => e.orderId == widget.orderId)
        .listen((_) async {
          if (!mounted) return;
          await _refreshDetails();
          _startEtaPolling();
        });

    _statusSub = _socketCtrl.statusUpdates$
        .where((e) => e.orderId == widget.orderId)
        .listen((evt) {
          if (!mounted) return;
          setState(() {
            _activeOrderStatus = evt.status;
            if (evt.status == 'COMPLETED' ||
                evt.status == 'CANCELLED' ||
                evt.status == 'FAILED') {
              _driverPosition = null;
              _driverPositionAt = null;
            }
          });
          if (evt.status == 'ACCEPTED' ||
              evt.status == 'EN_ROUTE_PICKUP' ||
              evt.status == 'AT_PICKUP' ||
              evt.status == 'IN_PROGRESS' ||
              evt.status == 'NEAR_CLIENT') {
            _refreshEta();
          } else if (evt.status == 'COMPLETED' ||
              evt.status == 'CANCELLED' ||
              evt.status == 'FAILED') {
            _stopEtaPolling();
          }
          if (evt.status == 'COMPLETED') {
            hapticSuccess();
            _promptRating();
          }
        });

    // P1 : reflète en direct un changement de paiement fait par le livreur,
    // le commerçant ou un admin (sans devoir recharger l'écran).
    _paymentSub = _socketCtrl.paymentUpdates$
        .where((e) => e.orderId == widget.orderId)
        .listen((evt) {
          if (!mounted) return;
          setState(() => _paymentStatus = evt.paymentStatus);
        });

    _chatMsgSub = _socketCtrl.newChatMessage$
        .where((e) => e.orderId == widget.orderId)
        .listen((_) {
          if (!mounted) return;
          setState(() => _unreadChatCount++);
        });
  }

  /// Recharge les détails à jour de la commande depuis `GET /orders/mine`.
  /// Utilisé au boot et après un orderAccepted (pour récupérer le livreur).
  Future<void> _refreshDetails() async {
    try {
      final res = await _api.get('/orders/mine');
      if (!mounted) return;
      if (res.statusCode != 200 && res.statusCode != 201) return;
      final list = jsonDecode(res.body);
      if (list is! List) return;
      final mine = list.firstWhere(
        (o) => o is Map && o['id']?.toString() == widget.orderId,
        orElse: () => null,
      );
      if (mine is! Map) return;
      setState(() {
        _activeOrderStatus = mine['status']?.toString() ?? _activeOrderStatus;
        _paymentStatus = mine['paymentStatus']?.toString() ?? _paymentStatus;
        if (mine['livreur'] is Map) {
          _assignedLivreur = Map<String, dynamic>.from(mine['livreur']);
        }
      });
      _setPickupDeliveryFromRaw(Map<String, dynamic>.from(mine));
      // HTTP refresh is the fallback when the terminal socket event was missed.
      if (_activeOrderStatus == 'COMPLETED') {
        _stopEtaPolling();
        _promptRating();
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // ETA polling
  // ---------------------------------------------------------------------------

  void _startEtaPolling() {
    _etaTimer?.cancel();
    _etaTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _refreshEta(),
    );
    _refreshEta();
  }

  void _stopEtaPolling() {
    _etaTimer?.cancel();
    _etaTimer = null;
    if (mounted && _eta != null) {
      setState(() => _eta = null);
    }
  }

  Future<void> _refreshEta() async {
    final status = _activeOrderStatus;
    const etaStatuses = <String>{
      'ACCEPTED',
      'EN_ROUTE_PICKUP',
      'AT_PICKUP',
      'IN_PROGRESS',
      'NEAR_CLIENT',
    };
    if (!etaStatuses.contains(status)) return;
    final result = await _etaSvc.fetchEta(widget.orderId);
    if (!mounted) return;
    setState(() => _eta = result);
  }

  double? _distanceDriverToPickup() {
    final p = _driverPosition;
    final pickup = _pickup?.location;
    if (p == null || pickup == null) return null;
    return haversineKm(p, pickup);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _promptRating() async {
    if (_ratingPrompted) return;
    if (_assignedLivreur == null) return;
    _ratingPrompted = true;
    final livreur = _assignedLivreur;
    final livreurName = livreur != null
        ? '${livreur['firstName'] ?? ''} ${livreur['lastName'] ?? ''}'.trim()
        : '';
    await Future.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    await pushAdaptive<void>(
      context,
      RatingScreen(
        orderId: widget.orderId,
        otherPartyName: livreurName,
        otherPartyRole: 'LIVREUR',
      ),
    );
  }

  void _openChat() {
    setState(() => _unreadChatCount = 0);
    final livreur = _assignedLivreur;
    final livreurName = livreur != null
        ? '${livreur['firstName'] ?? ''} ${livreur['lastName'] ?? ''}'.trim()
        : 'Livreur';
    pushAdaptive<void>(
      context,
      ChatScreen(
        orderId: widget.orderId,
        otherPartyName: livreurName.isEmpty ? 'Livreur' : livreurName,
        otherPartyPhone: livreur?['phone']?.toString(),
        otherPartyRole: 'LIVREUR',
        orderStatus: _activeOrderStatus ?? 'ACCEPTED',
      ),
    );
  }

  Future<void> _openWhatsappToLivreur() async {
    final livreur = _assignedLivreur;
    if (livreur == null) return;
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
    final shortId = widget.orderId.length < 6
        ? widget.orderId
        : widget.orderId.substring(0, 6);
    final message =
        'Bonjour, je suis le client de la course #$shortId. Pouvez-vous me confirmer votre arrivée ?';
    await WhatsappService.openChat(phone: phone, message: message);
  }

  /// Le client peut déclarer un paiement en espèces tant que celui-ci n'est
  /// pas réglé (CDC §4 : règlement en espèces au livreur en fin de course).
  bool get _canMarkPaid {
    final payment = _paymentStatus;
    if (payment == null || PaymentStatusUtils.isSettled(payment)) return false;
    return _activeOrderStatus == 'COMPLETED';
  }

  Future<void> _markPaidCash() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Paiement en espèces',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Confirmez-vous avoir remis le paiement en espèces au livreur ?',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Annuler',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0FB271),
            ),
            child: const Text(
              'Oui, payé',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      final res = await _api.patch(
        '/orders/${widget.orderId}/payment-status',
        body: {'paymentStatus': 'PAID'},
      );
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        setState(() => _paymentStatus = 'PAID');
        showAdaptiveSnack(context, 'Paiement enregistré, merci !');
      } else {
        showAdaptiveSnack(
          context,
          'Impossible d’enregistrer le paiement.',
          isError: true,
        );
      }
    } catch (_) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          'Impossible d’enregistrer le paiement.',
          isError: true,
        );
      }
    }
  }

  Future<void> _confirmCancelOrder() async {
    final status = _activeOrderStatus;
    if (status != 'PENDING' && status != 'ACCEPTED') return;

    final reasonController = TextEditingController();
    final message = status == 'PENDING'
        ? 'Aucun livreur n\'a encore accepté votre course.'
        : 'Le livreur s\'est déjà mis en route. Êtes-vous sûr ?';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Annuler la commande ?',
          style: TextStyle(color: Colors.white),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(message, style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              maxLines: 2,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Raison (facultatif)',
                labelStyle: const TextStyle(color: Colors.white70),
                hintText: 'Pourquoi annulez-vous ?',
                hintStyle: const TextStyle(color: Colors.white38),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: Colors.white.withValues(alpha: 0.15),
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: Colors.white.withValues(alpha: 0.15),
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF2E90FA)),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Garder la commande'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF0453D),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Annuler la commande'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      reasonController.dispose();
      return;
    }

    final rawReason = reasonController.text.trim();
    reasonController.dispose();

    try {
      final body = <String, dynamic>{'status': 'CANCELLED'};
      if (rawReason.isNotEmpty) {
        body['cancellationReason'] = rawReason;
      }
      final res = await _api.patch(
        '/orders/${widget.orderId}/status',
        body: body,
      );
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        _store.onOrderCancelled(widget.orderId);
        hapticSuccess();
        showAdaptiveSnack(context, 'Commande annulée');
        if (mounted) context.pop();
      } else {
        hapticError();
        showAdaptiveSnack(
          context,
          _extractApiError(res.statusCode, res.body),
          isError: true,
        );
      }
    } catch (e) {
      if (!mounted) return;
      hapticError();
      showAdaptiveSnack(context, 'Erreur : $e', isError: true);
    }
  }

  /// Ouvre un dialog de signalement pour cette course
  /// (`targetType: 'DELIVERY'`, `targetId: orderId`).
  Future<void> _reportProblem() async {
    final reasonController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Signaler un problème',
          style: TextStyle(color: Colors.white),
        ),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: reasonController,
            maxLines: 3,
            maxLength: 500,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Décrivez le problème',
              labelStyle: const TextStyle(color: Colors.white70),
              hintText: 'Ex : le livreur est injoignable…',
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.05),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.15),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.15),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF2E90FA)),
              ),
            ),
            validator: (value) {
              final v = (value ?? '').trim();
              if (v.length < 3) {
                return 'Le motif doit contenir au moins 3 caractères.';
              }
              if (v.length > 500) {
                return 'Le motif ne doit pas dépasser 500 caractères.';
              }
              return null;
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF0453D),
            ),
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(ctx, true);
            },
            child: const Text('Envoyer'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      reasonController.dispose();
      return;
    }

    final reason = reasonController.text.trim();
    reasonController.dispose();

    try {
      await _signalementSvc.report(
        targetType: 'DELIVERY',
        targetId: widget.orderId,
        reason: reason,
      );
      if (!mounted) return;
      showAdaptiveSnack(context, 'Signalement envoyé, merci.');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    }
  }

  String _extractApiError(int statusCode, String body) {
    try {
      final data = jsonDecode(body);
      if (data is Map && data['message'] != null) {
        final msg = data['message'];
        if (msg is List) return msg.join(', ');
        return msg.toString();
      }
    } catch (_) {}
    return 'Erreur $statusCode';
  }

  // ---------------------------------------------------------------------------
  // Cycle de vie
  // ---------------------------------------------------------------------------

  @override
  void dispose() {
    _driverPosSub?.cancel();
    _orderAcceptedSub?.cancel();
    _statusSub?.cancel();
    _paymentSub?.cancel();
    _chatMsgSub?.cancel();
    _etaTimer?.cancel();
    _estimateSvc.dispose();
    // NB : on ne dispose PAS le socket — il appartient à `ClientServices`
    // et reste vivant pour l'écran d'accueil et les autres trackings.
    // On retire juste cet orderId du set des watched si la commande
    // n'est plus active.
    final still = _store.findById(widget.orderId);
    if (still == null) {
      _socketCtrl.unwatchOrder(widget.orderId);
    }
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      body: Stack(
        children: [
          OrderMapWidget(
            pickup: _pickup,
            delivery: _delivery,
            polyline: _routePolyline,
            driverPosition: _driverPosition,
            mapController: _mapController,
          ),
          // Header simple : bouton retour + titre commande.
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            right: 12,
            child: _TrackingHeader(
              shortId: widget.orderId.length < 6
                  ? widget.orderId
                  : widget.orderId.substring(0, 6),
              status: _activeOrderStatus,
              onBack: () => context.pop(),
              onReport: _reportProblem,
            ),
          ),
          OrderBottomSheet(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_activeOrderStatus != null) ...[
                  StatusTimeline(status: _activeOrderStatus),
                  const SizedBox(height: 18),
                ],
                OrderAcceptedSection(
                  assignedLivreur: _assignedLivreur,
                  activeOrderStatus: _activeOrderStatus,
                  paymentStatus: _paymentStatus,
                  driverPosition: _driverPosition,
                  driverPositionAt: _driverPositionAt,
                  distanceKm: _distanceDriverToPickup(),
                  unreadChatCount: _unreadChatCount,
                  eta: _eta,
                  onOpenChat: _openChat,
                  onOpenWhatsapp: _openWhatsappToLivreur,
                  onCancelOrder: _confirmCancelOrder,
                  onMarkPaid: _canMarkPaid ? _markPaidCash : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackingHeader extends StatelessWidget {
  final String shortId;
  final String? status;
  final VoidCallback onBack;
  final VoidCallback onReport;

  const _TrackingHeader({
    required this.shortId,
    required this.status,
    required this.onBack,
    required this.onReport,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF122530).withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Material(
            color: Colors.white.withValues(alpha: 0.06),
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(Icons.arrow_back, color: Colors.white70, size: 20),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Course #$shortId',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  OrderStatusUtils.longLabel(status),
                  style: const TextStyle(
                    color: Color(0xFF2E90FA),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Material(
            color: Colors.white.withValues(alpha: 0.06),
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onReport,
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.flag_outlined,
                  color: Colors.white70,
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
