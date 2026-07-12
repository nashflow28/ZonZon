import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../controllers/order_socket_controller.dart';
import '../../models/place.dart';
import '../../models/order_history_item.dart';
import '../../models/user.dart';
import '../../services/auth_service.dart';
import '../../services/conversation_service.dart';
import '../../services/estimate_service.dart';
import '../../services/eta_service.dart';
import '../../services/merchant_orders_service.dart';
import '../../utils/order_status_utils.dart';
import '../../utils/platform_adapter.dart';
import '../../widgets/order_map_widget.dart';
import '../../widgets/order_screen_widgets.dart';
import '../chat_screen.dart';

class MerchantOrdersScreen extends StatefulWidget {
  final String? initialOrderId;

  const MerchantOrdersScreen({super.key, this.initialOrderId});

  @override
  State<MerchantOrdersScreen> createState() => _MerchantOrdersScreenState();
}

class _MerchantOrdersScreenState extends State<MerchantOrdersScreen> {
  final MerchantOrdersService _service = MerchantOrdersService();
  final AuthService _auth = AuthService();
  final OrderSocketController _socketCtrl = OrderSocketController();

  bool _loading = true;
  bool _hasError = false;
  String? _errorMessage;
  List<OrderHistoryItem> _orders = const [];
  User? _currentUser;
  bool _initialOrderHandled = false;

  @override
  void initState() {
    super.initState();
    _socketCtrl.init();
    _socketCtrl.orderAccepted$.listen((evt) {
      if (!mounted || !_orders.any((item) => item.id == evt.orderId)) return;
      _load();
    });
    _socketCtrl.statusUpdates$.listen((evt) {
      final idx = _orders.indexWhere((item) => item.id == evt.orderId);
      if (!mounted || idx < 0) return;
      final current = _orders[idx];
      final updated = OrderHistoryItem.fromJson({
        ...current.raw,
        'status': evt.status,
      });
      setState(() {
        _orders = _orders
            .map((item) => item.id == updated.id ? updated : item)
            .toList();
      });
    });
    // P1 : reflète en direct un changement de statut de paiement fait par
    // une autre partie (client, livreur, admin) sur une de SES livraisons.
    _socketCtrl.paymentUpdates$.listen((evt) {
      final idx = _orders.indexWhere((item) => item.id == evt.orderId);
      if (!mounted || idx < 0) return;
      final current = _orders[idx];
      final updated = OrderHistoryItem.fromJson({
        ...current.raw,
        'paymentStatus': evt.paymentStatus,
      });
      setState(() {
        _orders = _orders
            .map((item) => item.id == updated.id ? updated : item)
            .toList();
      });
    });
    _load();
  }

  static const _months = <String>[
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];

  @override
  void dispose() {
    _socketCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final orders = await _service.getMyMerchantOrders();
      final user = await _auth.getCurrentUser();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _currentUser = user;
        _loading = false;
        _hasError = false;
        _errorMessage = null;
      });
      _socketCtrl.clearWatchedOrders();
      for (final order in orders) {
        _socketCtrl.watchOrder(order.id);
      }
      _openInitialOrderIfNeeded();
    } on MerchantOrderException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = e.toString();
      });
    }
  }

  void _openInitialOrderIfNeeded() {
    final orderId = widget.initialOrderId;
    if (_initialOrderHandled || orderId == null || orderId.isEmpty) return;
    OrderHistoryItem? item;
    for (final candidate in _orders) {
      if (candidate.id == orderId) {
        item = candidate;
        break;
      }
    }
    if (item == null) return;
    _initialOrderHandled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openDetails(item!);
    });
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '—';
    final local = date.toLocal();
    final day = local.day;
    final month = _months[local.month - 1];
    final year = local.year;
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day $month $year à ${hour}h$minute';
  }

  void _openDetails(OrderHistoryItem item) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _MerchantOrderDetailsSheet(
        item: item,
        currentUser: _currentUser,
        formatDate: _formatDate,
        onOrderUpdated: _replaceOrder,
        socketController: _socketCtrl,
      ),
    );
  }

  void _replaceOrder(OrderHistoryItem updated) {
    if (!mounted) return;
    setState(() {
      _orders = _orders
          .map((item) => item.id == updated.id ? updated : item)
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Mes livraisons',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : RefreshIndicator(
              color: const Color(0xFF0FB271),
              onRefresh: _load,
              child: _buildBody(),
            ),
    );
  }

  Widget _buildBody() {
    if (_hasError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
            child: Column(
              children: [
                const Icon(
                  Icons.error_outline,
                  color: Color(0xFFF0453D),
                  size: 48,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Impossible de charger vos livraisons.',
                  style: TextStyle(color: Colors.white, fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text('Réessayer'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E90FA),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_orders.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 100, 24, 24),
            child: Column(
              children: [
                const Icon(
                  Icons.local_shipping_outlined,
                  color: Colors.white24,
                  size: 56,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Aucune livraison créée',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Créez votre première livraison pour un client depuis l’onglet dédié.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        adaptiveConstrainedContent(
          maxWidth: 760,
          child: _MerchantOrdersStats(orders: _orders),
        ),
        const SizedBox(height: 12),
        ..._orders.map(
          (item) => adaptiveConstrainedContent(
            maxWidth: 760,
            child: _MerchantOrderCard(
              item: item,
              formatDate: _formatDate,
              onTap: () => _openDetails(item),
            ),
          ),
        ),
      ],
    );
  }
}

class _MerchantOrdersStats extends StatelessWidget {
  final List<OrderHistoryItem> orders;

  const _MerchantOrdersStats({required this.orders});

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayCount = orders.where((item) {
      final createdAt = item.createdAt?.toLocal();
      if (createdAt == null) return false;
      return createdAt.year == today.year &&
          createdAt.month == today.month &&
          createdAt.day == today.day;
    }).length;
    final completedCount = orders
        .where((item) => item.status == 'COMPLETED')
        .length;
    final totalAmount = orders.fold<int>(
      0,
      (sum, item) => sum + (item.priceFcfa ?? 0),
    );

    return Row(
      children: [
        Expanded(
          child: _StatTile(
            label: 'Aujourd’hui',
            value: '$todayCount',
            color: const Color(0xFF2E90FA),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatTile(
            label: 'Terminées',
            value: '$completedCount',
            color: const Color(0xFF0FB271),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatTile(
            label: 'Montant',
            value: _compactAmount(totalAmount),
            color: const Color(0xFFFF9E1B),
          ),
        ),
      ],
    );
  }

  String _compactAmount(int amount) {
    if (amount >= 1000000) return '${(amount / 1000000).toStringAsFixed(1)}M';
    if (amount >= 1000) return '${(amount / 1000).toStringAsFixed(1)}k';
    return '$amount';
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatTile({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _MerchantOrderCard extends StatelessWidget {
  final OrderHistoryItem item;
  final String Function(DateTime?) formatDate;
  final VoidCallback onTap;

  const _MerchantOrderCard({
    required this.item,
    required this.formatDate,
    required this.onTap,
  });

  String _formatPrice(int? p) {
    if (p == null) return '-';
    final s = p.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '$buf FCFA';
  }

  String? _clientLine() {
    final client = item.client;
    if (client != null) {
      final first = (client['firstName'] ?? '').toString().trim();
      final last = (client['lastName'] ?? '').toString().trim();
      final phone = (client['phone'] ?? item.clientPhone ?? '')
          .toString()
          .trim();
      final name = '$first $last'.trim();
      if (name.isNotEmpty) {
        return phone.isEmpty ? name : '$name · $phone';
      }
    }
    final name = (item.clientName ?? '').trim();
    final phone = (item.clientPhone ?? '').trim();
    if (name.isEmpty && phone.isEmpty) return null;
    if (name.isEmpty) return phone;
    if (phone.isEmpty) return name;
    return '$name · $phone';
  }

  @override
  Widget build(BuildContext context) {
    final clientLine = _clientLine();
    final paymentStatus = item.paymentStatus;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _Pill(
                      label: OrderStatusUtils.label(item.status),
                      color: OrderStatusUtils.color(item.status),
                    ),
                    if ((paymentStatus ?? '').isNotEmpty) ...[
                      const SizedBox(width: 6),
                      _Pill(
                        label: PaymentStatusUtils.label(paymentStatus),
                        color: PaymentStatusUtils.color(paymentStatus),
                      ),
                    ],
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        formatDate(item.createdAt),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _AddressLine(
                  icon: Icons.my_location,
                  color: const Color(0xFF2E90FA),
                  text: item.pickupAddress.isEmpty ? '—' : item.pickupAddress,
                ),
                const SizedBox(height: 6),
                _AddressLine(
                  icon: Icons.location_on,
                  color: const Color(0xFF0FB271),
                  text: item.deliveryAddress.isEmpty
                      ? '—'
                      : item.deliveryAddress,
                ),
                if (clientLine != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(
                        Icons.person_outline,
                        color: Colors.white54,
                        size: 16,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          clientLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 10),
                Text(
                  [
                    if (item.distanceKm != null)
                      '${item.distanceKm!.toStringAsFixed(1)} km',
                    if (item.priceFcfa != null) _formatPrice(item.priceFcfa),
                  ].join(' · '),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MerchantOrderDetailsSheet extends StatefulWidget {
  final OrderHistoryItem item;
  final User? currentUser;
  final String Function(DateTime?) formatDate;
  final ValueChanged<OrderHistoryItem> onOrderUpdated;
  final OrderSocketController socketController;

  const _MerchantOrderDetailsSheet({
    required this.item,
    required this.currentUser,
    required this.formatDate,
    required this.onOrderUpdated,
    required this.socketController,
  });

  @override
  State<_MerchantOrderDetailsSheet> createState() =>
      _MerchantOrderDetailsSheetState();
}

class _MerchantOrderDetailsSheetState
    extends State<_MerchantOrderDetailsSheet> {
  final ConversationService _conversationService = ConversationService();
  final MerchantOrdersService _ordersService = MerchantOrdersService();
  final EstimateService _estimateService = EstimateService();
  final EtaService _etaService = EtaService();

  ConversationSnapshot? _snapshot;
  late OrderHistoryItem _item;
  bool _loadingConversation = true;
  bool _conversationBusy = false;
  String? _conversationError;
  Place? _pickup;
  Place? _delivery;
  List<LatLng> _routePolyline = const [];
  LatLng? _driverPosition;
  DateTime? _driverPositionAt;
  EtaResult? _eta;
  StreamSubscription<DriverPosition>? _driverPositionSub;
  StreamSubscription<OrderStatusUpdate>? _statusSub;
  StreamSubscription<OrderPaymentUpdate>? _paymentSub;
  Timer? _etaTimer;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    _setPlacesFromRaw(_item.raw);
    _attachSocketStreams();
    _startEtaPolling();
    _loadRoutePreview();
    _loadConversation();
  }

  @override
  void dispose() {
    widget.socketController.unwatchOrder(_item.id);
    _driverPositionSub?.cancel();
    _statusSub?.cancel();
    _paymentSub?.cancel();
    _etaTimer?.cancel();
    _estimateService.dispose();
    super.dispose();
  }

  Future<void> _loadConversation() async {
    setState(() {
      _loadingConversation = true;
      _conversationError = null;
    });
    try {
      final snapshot = await _conversationService.getConversation(
        widget.item.id,
      );
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _loadingConversation = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingConversation = false;
        _conversationError = e.toString();
      });
    }
  }

  bool get _isCurrentUserParticipant {
    final userId = widget.currentUser?.id;
    if (userId == null) return false;
    return _snapshot?.participants.any((p) => p.userId == userId) == true;
  }

  Future<void> _joinConversation() async {
    setState(() => _conversationBusy = true);
    try {
      await _conversationService.addSelf(widget.item.id);
      await _loadConversation();
      if (!mounted) return;
      showAdaptiveSnack(context, 'Vous avez rejoint la conversation.');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) {
        setState(() => _conversationBusy = false);
      }
    }
  }

  Future<void> _leaveConversation() async {
    setState(() => _conversationBusy = true);
    try {
      await _conversationService.removeSelf(widget.item.id);
      await _loadConversation();
      if (!mounted) return;
      showAdaptiveSnack(context, 'Vous avez quitté la conversation.');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) {
        setState(() => _conversationBusy = false);
      }
    }
  }

  Future<void> _openChat() async {
    if (!_isCurrentUserParticipant) {
      await _joinConversation();
    }
    if (!mounted) return;
    final subtitle =
        '${_snapshot?.participants.length ?? 0} participant${(_snapshot?.participants.length ?? 0) > 1 ? 's' : ''}';
    await pushAdaptive<void>(
      context,
      ChatScreen(
        orderId: _item.id,
        otherPartyName: 'Conversation de livraison',
        headerSubtitle: subtitle,
        orderStatus: _item.status,
      ),
    );
    if (mounted) {
      _loadConversation();
    }
  }

  Future<void> _editPaymentStatus() async {
    final allowedStatuses =
        MerchantOrdersService.allowedMerchantPaymentStatuses(
          orderStatus: _item.status,
          currentPaymentStatus: _item.paymentStatus,
        );
    if (allowedStatuses.isEmpty) {
      showAdaptiveSnack(
        context,
        'Aucune mise à jour de paiement disponible pour ce statut.',
        isError: true,
      );
      return;
    }
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF122530),
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: allowedStatuses
              .map(
                (status) => ListTile(
                  title: Text(
                    PaymentStatusUtils.label(status),
                    style: const TextStyle(color: Colors.white),
                  ),
                  trailing: status == _item.paymentStatus
                      ? const Icon(Icons.check, color: Color(0xFF0FB271))
                      : null,
                  onTap: () => Navigator.of(context).pop(status),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (selected == null || selected == _item.paymentStatus) return;
    try {
      final updated = await _ordersService.updatePaymentStatus(
        orderId: _item.id,
        paymentStatus: selected,
      );
      if (!mounted) return;
      setState(() => _item = updated);
      widget.onOrderUpdated(updated);
      showAdaptiveSnack(context, 'Statut de paiement mis à jour.');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, e.toString(), isError: true);
    }
  }

  Future<void> _editPrice() async {
    final priceCtrl = TextEditingController(
      text: (_item.priceFcfa ?? '').toString(),
    );
    final reasonCtrl = TextEditingController();
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Ajuster le prix',
          style: TextStyle(color: Colors.white),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: priceCtrl,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Prix final (FCFA)',
                labelStyle: TextStyle(color: Colors.white70),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Raison (optionnel)',
                labelStyle: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    if (result != true) return;
    final newPrice = int.tryParse(priceCtrl.text.trim());
    if (newPrice == null || newPrice <= 0) {
      if (!mounted) return;
      showAdaptiveSnack(context, 'Prix invalide.', isError: true);
      return;
    }
    try {
      final updated = await _ordersService.updatePrice(
        orderId: _item.id,
        priceFcfa: newPrice,
        reason: reasonCtrl.text.trim(),
      );
      if (!mounted) return;
      setState(() => _item = updated);
      widget.onOrderUpdated(updated);
      showAdaptiveSnack(context, 'Prix mis à jour.');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, e.toString(), isError: true);
    }
  }

  void _setPlacesFromRaw(Map<String, dynamic> raw) {
    double? toDouble(dynamic value) {
      if (value == null) return null;
      if (value is num) return value.toDouble();
      return double.tryParse(value.toString());
    }

    final pickupLat = toDouble(raw['pickupLat']);
    final pickupLng = toDouble(raw['pickupLng']);
    final deliveryLat = toDouble(raw['deliveryLat']);
    final deliveryLng = toDouble(raw['deliveryLng']);
    final pickupAddress = raw['pickupAddress']?.toString() ?? '';
    final deliveryAddress = raw['deliveryAddress']?.toString() ?? '';

    if (pickupLat != null && pickupLng != null) {
      _pickup = Place(
        displayName: pickupAddress,
        shortName: pickupAddress.split(',').first,
        location: LatLng(pickupLat, pickupLng),
      );
    }
    if (deliveryLat != null && deliveryLng != null) {
      _delivery = Place(
        displayName: deliveryAddress,
        shortName: deliveryAddress.split(',').first,
        location: LatLng(deliveryLat, deliveryLng),
      );
    }
  }

  Future<void> _loadRoutePreview() async {
    final pickup = _pickup?.location;
    final delivery = _delivery?.location;
    if (pickup == null || delivery == null) return;
    final route = await _estimateService.estimate(
      lat1: pickup.latitude,
      lng1: pickup.longitude,
      lat2: delivery.latitude,
      lng2: delivery.longitude,
    );
    if (!mounted || route == null) return;
    setState(() => _routePolyline = route.polyline);
  }

  void _attachSocketStreams() {
    widget.socketController.watchOrder(_item.id);
    _driverPositionSub = widget.socketController.driverPosition$
        .where((event) => event.orderId == _item.id)
        .listen((event) {
          if (!mounted) return;
          setState(() {
            _driverPosition = event.location;
            _driverPositionAt = event.receivedAt;
          });
          _refreshEta();
        });

    _statusSub = widget.socketController.statusUpdates$
        .where((event) => event.orderId == _item.id)
        .listen((event) {
          if (!mounted) return;
          final updated = OrderHistoryItem.fromJson({
            ..._item.raw,
            'status': event.status,
          });
          setState(() {
            _item = updated;
            if (!_canTrackLive) {
              _driverPosition = null;
              _driverPositionAt = null;
              _eta = null;
            }
          });
          widget.onOrderUpdated(updated);
          if (_canTrackLive) {
            if (_etaTimer == null) {
              _startEtaPolling();
            }
            _refreshEta();
          } else {
            _etaTimer?.cancel();
            _etaTimer = null;
          }
        });

    // P1 : changement de paiement poussé par le backend (fait par le client,
    // le livreur ou un admin) — synchronise le détail ET la liste parente.
    _paymentSub = widget.socketController.paymentUpdates$
        .where((event) => event.orderId == _item.id)
        .listen((event) {
          if (!mounted) return;
          final updated = OrderHistoryItem.fromJson({
            ..._item.raw,
            'paymentStatus': event.paymentStatus,
          });
          setState(() => _item = updated);
          widget.onOrderUpdated(updated);
        });
  }

  bool get _canTrackLive {
    switch (_item.status) {
      case 'ACCEPTED':
      case 'EN_ROUTE_PICKUP':
      case 'AT_PICKUP':
      case 'IN_PROGRESS':
      case 'NEAR_CLIENT':
        return true;
      default:
        return false;
    }
  }

  void _startEtaPolling() {
    _etaTimer?.cancel();
    if (!_canTrackLive) return;
    _etaTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _refreshEta(),
    );
    _refreshEta();
  }

  Future<void> _refreshEta() async {
    if (!_canTrackLive) return;
    final eta = await _etaService.fetchEta(_item.id);
    if (!mounted) return;
    setState(() {
      _eta = eta;
      final persistedPosition = eta?.driverPosition;
      if (persistedPosition != null) {
        _driverPosition = persistedPosition;
        _driverPositionAt = eta?.positionAt ?? eta?.fetchedAt;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final shortId = item.id.length >= 6 ? item.id.substring(0, 6) : item.id;
    final participants = _snapshot?.participants ?? const [];
    final canEditPrice =
        item.status != 'COMPLETED' &&
        item.status != 'CANCELLED' &&
        item.status != 'FAILED';

    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.45,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFF122530),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: Color(0xFF22414D))),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _Pill(
                    label: OrderStatusUtils.label(item.status),
                    color: OrderStatusUtils.color(item.status),
                  ),
                  const SizedBox(width: 8),
                  if ((item.paymentStatus ?? '').isNotEmpty)
                    _Pill(
                      label: PaymentStatusUtils.label(item.paymentStatus),
                      color: PaymentStatusUtils.color(item.paymentStatus),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Course #$shortId',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                widget.formatDate(item.createdAt),
                style: const TextStyle(color: Colors.white60, fontSize: 12),
              ),
              const SizedBox(height: 16),
              _DetailBlock(
                title: 'Trajet',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _AddressLine(
                      icon: Icons.my_location,
                      color: const Color(0xFF2E90FA),
                      text: item.pickupAddress,
                    ),
                    const SizedBox(height: 8),
                    _AddressLine(
                      icon: Icons.location_on,
                      color: const Color(0xFF0FB271),
                      text: item.deliveryAddress,
                    ),
                    if ((_canTrackLive ||
                            _driverPosition != null ||
                            _eta != null) &&
                        _pickup != null &&
                        _delivery != null) ...[
                      const SizedBox(height: 14),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: SizedBox(
                          height: 220,
                          child: OrderMapWidget(
                            pickup: _pickup,
                            delivery: _delivery,
                            polyline: _routePolyline,
                            driverPosition: _driverPosition,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      LiveTrackingBanner(
                        driverPosition: _driverPosition,
                        driverPositionAt: _driverPositionAt,
                        distanceKm: _eta?.distanceKm,
                        eta: _eta,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _DetailBlock(
                title: 'Client',
                child: Text(
                  _clientLabel(item),
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
              const SizedBox(height: 12),
              _DetailBlock(
                title: 'Tarification',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (item.distanceKm != null)
                      Text(
                        'Distance : ${item.distanceKm!.toStringAsFixed(1)} km',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                    if (item.priceFcfa != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Prix : ${_formatPrice(item.priceFcfa)}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                    ],
                    if (canEditPrice) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _editPrice,
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Ajuster le prix'),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _DetailBlock(
                title: 'Paiement',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      PaymentStatusUtils.label(item.paymentStatus),
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _editPaymentStatus,
                        icon: const Icon(Icons.payments_outlined),
                        label: const Text('Mettre à jour le paiement'),
                      ),
                    ),
                  ],
                ),
              ),
              if ((item.description ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _DetailBlock(
                  title: 'Description',
                  child: Text(
                    item.description!.trim(),
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              _DetailBlock(
                title: 'Conversation',
                child: _loadingConversation
                    ? Row(
                        children: [
                          adaptiveLoader(color: const Color(0xFF2E90FA)),
                          const SizedBox(width: 12),
                          const Text(
                            'Chargement des participants…',
                            style: TextStyle(color: Colors.white70),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (_conversationError != null)
                            Text(
                              _conversationError!,
                              style: const TextStyle(
                                color: Colors.white54,
                                fontSize: 12,
                              ),
                            ),
                          if (participants.isEmpty &&
                              _conversationError == null)
                            const Text(
                              'Aucun participant actif pour le moment.',
                              style: TextStyle(
                                color: Colors.white60,
                                fontSize: 13,
                              ),
                            ),
                          if (participants.isNotEmpty)
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: participants
                                  .map(
                                    (participant) => _Pill(
                                      label: _participantLabel(
                                        participant,
                                        item,
                                        widget.currentUser,
                                      ),
                                      color: _participantColor(
                                        participant.role,
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _conversationBusy ? null : _openChat,
                              icon: _conversationBusy
                                  ? SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: adaptiveLoader(
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Icon(Icons.chat_bubble_outline),
                              label: Text(
                                _isCurrentUserParticipant
                                    ? 'Ouvrir le chat'
                                    : 'Rejoindre puis ouvrir le chat',
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF2E90FA),
                                foregroundColor: Colors.white,
                              ),
                            ),
                          ),
                          if (_isCurrentUserParticipant) ...[
                            const SizedBox(height: 8),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: _conversationBusy
                                    ? null
                                    : _leaveConversation,
                                icon: const Icon(
                                  Icons.logout,
                                  color: Color(0xFFF0453D),
                                ),
                                label: const Text(
                                  'Quitter la conversation',
                                  style: TextStyle(color: Color(0xFFF0453D)),
                                ),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(
                                    color: Color(0xFFF0453D),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _clientLabel(OrderHistoryItem item) {
    final client = item.client;
    if (client != null) {
      final name = '${client['firstName'] ?? ''} ${client['lastName'] ?? ''}'
          .trim();
      final phone = client['phone']?.toString() ?? item.clientPhone ?? '';
      if (name.isNotEmpty && phone.isNotEmpty) return '$name · $phone';
      if (name.isNotEmpty) return name;
      if (phone.isNotEmpty) return phone;
    }
    final fallback = '${item.clientName ?? ''} ${item.clientPhone ?? ''}'
        .trim();
    return fallback.isEmpty ? '—' : fallback;
  }

  String _formatPrice(int? price) {
    if (price == null) return '-';
    final raw = price.toString();
    final buffer = StringBuffer();
    for (int i = 0; i < raw.length; i++) {
      if (i > 0 && (raw.length - i) % 3 == 0) buffer.write(' ');
      buffer.write(raw[i]);
    }
    return '$buffer FCFA';
  }

  String _participantLabel(
    ConversationParticipantInfo participant,
    OrderHistoryItem item,
    User? currentUser,
  ) {
    if (participant.userId == currentUser?.id) {
      return 'Vous (${_roleLabel(participant.role)})';
    }
    if (participant.role == 'CLIENT') {
      final client = item.client;
      final name =
          '${client?['firstName'] ?? item.clientName ?? ''} ${client?['lastName'] ?? ''}'
              .trim();
      return name.isEmpty ? 'Client' : '$name (Client)';
    }
    if (participant.role == 'LIVREUR') {
      final livreur = item.livreur;
      final name =
          '${livreur?['firstName'] ?? ''} ${livreur?['lastName'] ?? ''}'.trim();
      return name.isEmpty ? 'Livreur' : '$name (Livreur)';
    }
    return _roleLabel(participant.role);
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'CLIENT':
        return 'Client';
      case 'LIVREUR':
        return 'Livreur';
      case 'MERCHANT':
        return 'Commerçant';
      case 'ADMIN':
        return 'Admin';
      default:
        return role;
    }
  }

  Color _participantColor(String role) {
    switch (role) {
      case 'CLIENT':
        return const Color(0xFF2E90FA);
      case 'LIVREUR':
        return const Color(0xFF0FB271);
      case 'MERCHANT':
        return const Color(0xFFFF9E1B);
      case 'ADMIN':
        return const Color(0xFFF0453D);
      default:
        return Colors.white54;
    }
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color color;

  const _Pill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AddressLine extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;

  const _AddressLine({
    required this.icon,
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _DetailBlock extends StatelessWidget {
  final String title;
  final Widget child;

  const _DetailBlock({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0C1A22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}
