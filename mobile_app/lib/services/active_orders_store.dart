import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../controllers/order_socket_controller.dart';
import '../models/order_history_item.dart';
import 'api_client.dart';

/// Source de vérité unique pour les commandes actives du client.
///
/// Maintient la liste des commandes en cours (statut PENDING / ACCEPTED /
/// IN_PROGRESS) et expose un [ChangeNotifier] que les écrans peuvent écouter
/// (badge bottom-nav, liste de l'onglet Commandes, garde-fou des 5 commandes
/// max, etc.).
///
/// Le store est branché sur [OrderSocketController] : à chaque commande qu'il
/// suit, il appelle `watchOrder()` pour que les events socket associés
/// remontent côté écrans, et il consomme `orderAccepted$` / `statusUpdates$`
/// pour mettre à jour ses propres données.
class ActiveOrdersStore extends ChangeNotifier {
  ActiveOrdersStore({ApiClient? api}) : _api = api ?? ApiClient();

  /// Limite de commandes actives en parallèle pour un client.
  ///
  /// Garde-fou produit (anti-spam des comptes faux clients), à enforcer aussi
  /// côté backend dans une session future.
  static const int maxActiveOrders = 5;

  final ApiClient _api;

  final List<OrderHistoryItem> _orders = <OrderHistoryItem>[];
  bool _bootstrapped = false;
  bool _loading = false;
  String? _lastError;

  OrderSocketController? _socketCtrl;
  StreamSubscription<OrderAcceptedEvent>? _acceptedSub;
  StreamSubscription<OrderStatusUpdate>? _statusSub;

  // ---------------------------------------------------------------------------
  // Lecture publique
  // ---------------------------------------------------------------------------

  List<OrderHistoryItem> get orders => List.unmodifiable(_orders);
  int get count => _orders.length;
  bool get isAtLimit => _orders.length >= maxActiveOrders;
  bool get isEmpty => _orders.isEmpty;
  bool get isLoading => _loading;
  bool get isBootstrapped => _bootstrapped;
  String? get lastError => _lastError;

  /// Retourne la commande [orderId] si présente dans le store, sinon null.
  OrderHistoryItem? findById(String orderId) {
    for (final o in _orders) {
      if (o.id == orderId) return o;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Bootstrap + branchement socket
  // ---------------------------------------------------------------------------

  /// Charge les commandes actives depuis le backend (`GET /orders/mine`)
  /// et branche les events socket pour rester synchro.
  ///
  /// Idempotent : un appel multiple ne re-télécharge pas. Pour forcer un
  /// refresh, utiliser [refresh].
  Future<void> bootstrap(OrderSocketController socketCtrl) async {
    _socketCtrl = socketCtrl;
    _attachSocket(socketCtrl);
    if (_bootstrapped) return;
    await _fetchActiveOrders();
    _bootstrapped = true;
  }

  /// Recharge la liste depuis le backend. Utile en pull-to-refresh.
  Future<void> refresh() async {
    await _fetchActiveOrders();
  }

  Future<void> _fetchActiveOrders() async {
    _loading = true;
    _lastError = null;
    notifyListeners();
    try {
      final res = await _api.get('/orders/mine');
      if (res.statusCode != 200 && res.statusCode != 201) {
        _lastError = 'HTTP ${res.statusCode}';
        return;
      }
      final raw = jsonDecode(res.body);
      if (raw is! List) return;
      final fetched = raw
          .whereType<Map<String, dynamic>>()
          .map(OrderHistoryItem.fromJson)
          .where((o) => o.isActive)
          .toList()
        ..sort(_byCreatedAtDesc);
      _orders
        ..clear()
        ..addAll(fetched);
      // Re-watch toutes les commandes connues (idempotent côté contrôleur).
      final ctrl = _socketCtrl;
      if (ctrl != null) {
        for (final o in _orders) {
          ctrl.watchOrder(o.id);
        }
      }
    } catch (e) {
      _lastError = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void _attachSocket(OrderSocketController ctrl) {
    _acceptedSub?.cancel();
    _statusSub?.cancel();
    _acceptedSub = ctrl.orderAccepted$.listen(_onOrderAccepted);
    _statusSub = ctrl.statusUpdates$.listen(_onStatusUpdate);
  }

  // ---------------------------------------------------------------------------
  // Mutations explicites (appelées par les écrans)
  // ---------------------------------------------------------------------------

  /// À appeler après un `POST /orders` réussi. Insère la commande en haut
  /// de la liste et la met sous surveillance du socket.
  void onOrderCreated(Map<String, dynamic> raw) {
    final item = OrderHistoryItem.fromJson(raw);
    if (!item.isActive) return;
    // Évite les doublons si le serveur réémet l'event avant le retour HTTP.
    if (_orders.any((o) => o.id == item.id)) return;
    _orders.insert(0, item);
    _socketCtrl?.watchOrder(item.id);
    notifyListeners();
  }

  /// À appeler après une annulation explicite côté écran (réponse HTTP 200
  /// pour `PATCH /orders/:id/status` avec `CANCELLED`). Évite d'attendre le
  /// round-trip socket.
  void onOrderCancelled(String orderId) {
    _removeAndUnwatch(orderId);
  }

  // ---------------------------------------------------------------------------
  // Réactions aux events socket
  // ---------------------------------------------------------------------------

  void _onOrderAccepted(OrderAcceptedEvent evt) {
    final idx = _orders.indexWhere((o) => o.id == evt.orderId);
    if (idx < 0) return;
    final current = _orders[idx];
    // Le payload `orderAccepted` contient en général le livreur assigné
    // ainsi que le nouveau statut. On regénère le `OrderHistoryItem` avec
    // le payload brut fusionné pour garder les autres champs.
    final merged = <String, dynamic>{...current.raw, ...evt.raw};
    if (!merged.containsKey('id')) merged['id'] = current.id;
    if (!merged.containsKey('status')) merged['status'] = 'ACCEPTED';
    _orders[idx] = OrderHistoryItem.fromJson(merged);
    notifyListeners();
  }

  void _onStatusUpdate(OrderStatusUpdate evt) {
    final idx = _orders.indexWhere((o) => o.id == evt.orderId);
    if (idx < 0) return;
    if (evt.status == 'COMPLETED' || evt.status == 'CANCELLED') {
      _removeAndUnwatch(evt.orderId);
      return;
    }
    final current = _orders[idx];
    final merged = <String, dynamic>{...current.raw, 'status': evt.status};
    _orders[idx] = OrderHistoryItem.fromJson(merged);
    notifyListeners();
  }

  void _removeAndUnwatch(String orderId) {
    final removed = _orders.indexWhere((o) => o.id == orderId);
    if (removed < 0) return;
    _orders.removeAt(removed);
    _socketCtrl?.unwatchOrder(orderId);
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Reset (logout)
  // ---------------------------------------------------------------------------

  /// À appeler au logout pour vider l'état et libérer les souscriptions.
  void reset() {
    _orders.clear();
    _bootstrapped = false;
    _loading = false;
    _lastError = null;
    _socketCtrl?.clearWatchedOrders();
    _acceptedSub?.cancel();
    _statusSub?.cancel();
    _acceptedSub = null;
    _statusSub = null;
    _socketCtrl = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _acceptedSub?.cancel();
    _statusSub?.cancel();
    super.dispose();
  }

  static int _byCreatedAtDesc(OrderHistoryItem a, OrderHistoryItem b) {
    final ad = a.createdAt;
    final bd = b.createdAt;
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    return bd.compareTo(ad);
  }
}
