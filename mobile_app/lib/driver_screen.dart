import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'controllers/order_socket_controller.dart';
import 'models/user.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/driver_service.dart';
import 'services/whatsapp_service.dart';
import 'screens/chat_screen.dart';
import 'screens/driver_navigation_screen.dart';
import 'screens/messaging_hub_screen.dart';
import 'screens/driver_profile_screen.dart';
import 'screens/order_history_screen.dart';
import 'utils/order_status_utils.dart';
import 'utils/platform_adapter.dart';
import 'widgets/status_timeline.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

/// Décrit l'étape "suivante" proposée au livreur pour un statut donné, dans
/// le cadre de la progression manuelle granulaire (en plus du géofencing
/// automatique qui ne couvre que ACCEPTED → IN_PROGRESS).
///
/// Reflète les transitions autorisées par le backend :
/// ACCEPTED → {EN_ROUTE_PICKUP, AT_PICKUP, IN_PROGRESS, CANCELLED, FAILED}
/// EN_ROUTE_PICKUP → {AT_PICKUP, IN_PROGRESS, CANCELLED, FAILED}
/// AT_PICKUP → {IN_PROGRESS, CANCELLED, FAILED}
/// IN_PROGRESS → {NEAR_CLIENT, COMPLETED, CANCELLED, FAILED}
/// NEAR_CLIENT → {COMPLETED, CANCELLED, FAILED}
class _NextStepAction {
  final String targetStatus;
  final String label;
  final IconData icon;
  final Color color;
  const _NextStepAction({
    required this.targetStatus,
    required this.label,
    required this.icon,
    required this.color,
  });
}

/// Retourne l'action "avancer" proposée pour [status], ou `null` si le
/// statut est terminal (aucune progression possible).
_NextStepAction? _nextStepFor(String status) {
  switch (status) {
    case 'ACCEPTED':
      return const _NextStepAction(
        targetStatus: 'EN_ROUTE_PICKUP',
        label: 'En route vers le retrait',
        icon: Icons.directions_bike,
        color: Color(0xFF2E90FA),
      );
    case 'EN_ROUTE_PICKUP':
      return const _NextStepAction(
        targetStatus: 'AT_PICKUP',
        label: 'Arrivé au retrait',
        icon: Icons.storefront,
        color: Color(0xFF6366F1),
      );
    case 'AT_PICKUP':
      return const _NextStepAction(
        targetStatus: 'IN_PROGRESS',
        label: 'Colis récupéré / Démarrer la livraison',
        icon: Icons.local_shipping,
        color: Color(0xFF2E90FA),
      );
    case 'IN_PROGRESS':
      return const _NextStepAction(
        targetStatus: 'NEAR_CLIENT',
        label: 'Proche du client',
        icon: Icons.near_me,
        color: Color(0xFFF97316),
      );
    case 'NEAR_CLIENT':
      return const _NextStepAction(
        targetStatus: 'COMPLETED',
        label: 'Livré',
        icon: Icons.check_circle,
        color: Color(0xFF0FB271),
      );
    default:
      return null;
  }
}

/// `true` si [status] permet encore de signaler un échec (FAILED) — c'est-
/// à-dire toute étape active non terminale.
bool _canFail(String status) {
  const active = {
    'ACCEPTED',
    'EN_ROUTE_PICKUP',
    'AT_PICKUP',
    'IN_PROGRESS',
    'NEAR_CLIENT',
  };
  return active.contains(status);
}

/// `true` si [status] permet encore l'annulation (CANCELLED) — mêmes étapes
/// que [_canFail] : le backend autorise CANCELLED depuis tous les statuts
/// actifs non terminaux.
bool _canCancel(String status) => _canFail(status);

/// Petit badge pill réutilisé pour afficher le statut de la course et le
/// statut de paiement dans le dialog de course active.
class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

Map<String, dynamic>? _coerceRadarOrder(dynamic raw) {
  if (raw is Map<String, dynamic>) {
    return Map<String, dynamic>.from(raw);
  }
  if (raw is Map) {
    try {
      return Map<String, dynamic>.from(raw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

String? _radarOrderId(dynamic raw) {
  final order = _coerceRadarOrder(raw);
  final orderId = order?['id']?.toString() ?? order?['orderId']?.toString();
  if (orderId == null || orderId.isEmpty) return null;
  return orderId;
}

/// Normalise un snapshot radar venu du backend : seules les courses valides
/// avec un identifiant exploitable sont conservées, sans doublon.
@visibleForTesting
List<Map<String, dynamic>> normalizeRadarOrders(Iterable<dynamic> rawOrders) {
  final normalized = <Map<String, dynamic>>[];
  final seenIds = <String>{};
  for (final rawOrder in rawOrders) {
    final order = _coerceRadarOrder(rawOrder);
    final orderId = _radarOrderId(order);
    if (order == null || orderId == null || !seenIds.add(orderId)) {
      continue;
    }
    normalized.add(order);
  }
  return normalized;
}

/// Insère ou remplace une course temps réel en tête du radar sans créer de
/// doublon. Utilisé pour fusionner `newOrderAvailable` avec le snapshot HTTP.
@visibleForTesting
List<Map<String, dynamic>> upsertRadarOrder(
  List<dynamic> currentOrders,
  dynamic incomingOrder,
) {
  final normalizedCurrent = normalizeRadarOrders(currentOrders);
  final incoming = _coerceRadarOrder(incomingOrder);
  final incomingOrderId = _radarOrderId(incoming);
  if (incoming == null || incomingOrderId == null) return normalizedCurrent;

  return <Map<String, dynamic>>[
    incoming,
    for (final order in normalizedCurrent)
      if (_radarOrderId(order) != incomingOrderId) order,
  ];
}

class _DriverScreenState extends State<DriverScreen> {
  int _currentTab = 0;
  List<Map<String, dynamic>> availableOrders = [];
  String? currentDriverId;
  final ApiClient _api = ApiClient();
  final AuthService _authService = AuthService();
  final DriverService _driverService = DriverService();

  /// Statut de validation admin du compte livreur. `null` tant que non
  /// encore chargé (on affiche alors un loader plutôt que de présumer un
  /// état). Une fois chargé, vaut `"PENDING"` | `"APPROVED"` | `"REJECTED"`.
  String? _driverApprovalStatus;
  String? _driverRejectionReason;
  bool _isAvailable = false;

  /// `true` tant que l'état de validation/disponibilité n'a pas été chargé
  /// (depuis le user local puis rafraîchi via `GET /users/me`).
  bool _statusLoading = true;

  /// `true` pendant l'appel réseau de bascule de disponibilité (désactive
  /// le switch pour éviter les doubles taps).
  bool _togglingAvailability = false;

  bool get _isApproved => _driverApprovalStatus == 'APPROVED';

  /// Socket unifié partagé avec `order_screen.dart`. Côté livreur on ne
  /// définit jamais `activeOrderId` (on n'a pas de course "à suivre" comme
  /// le client) → tous les events `orderAccepted` / `orderStatusUpdated`
  /// remontent, ce qui permet de retirer une course du radar dès qu'un
  /// autre livreur l'a prise.
  final OrderSocketController _socketCtrl = OrderSocketController();

  StreamSubscription<NewOrderEvent>? _newOrderSub;
  StreamSubscription<OrderAcceptedEvent>? _orderAcceptedSub;
  StreamSubscription<OrderStatusUpdate>? _statusSub;
  StreamSubscription<OrderPaymentUpdate>? _paymentSub;
  StreamSubscription<void>? _connectedSub;
  StreamSubscription<SocketLifecycleEvent>? _socketLifecycleSub;
  Timer? _radarRefreshTimer;

  /// Statuts pour lesquels une course est considérée « active » côté livreur
  /// (mêmes valeurs que ACTIVE_DELIVERY_STATUSES backend).
  static const Set<String> _activeStatuses = {
    'ACCEPTED',
    'EN_ROUTE_PICKUP',
    'AT_PICKUP',
    'IN_PROGRESS',
    'NEAR_CLIENT',
  };

  /// Course active affichée dans le dialog de progression (null sinon).
  /// Sert au filtrage des events socket et au cycle de vie du GPS (P2 :
  /// tracking uniquement pendant une course active).
  String? _activeOrderId;

  /// Payload de la course active — le même objet Map que celui affiché par
  /// le dialog, pour que les mises à jour distantes (paiement) soient
  /// visibles au prochain rebuild.
  Map<String, dynamic>? _activeOrderData;

  /// Callback branché par le dialog : reçoit les statuts poussés par le
  /// serveur (`orderStatusUpdated`) — annulation client/admin comprise.
  void Function(String status)? _onRemoteStatusChanged;

  /// Callback branché par le dialog : force un rebuild (ex. changement de
  /// statut de paiement reçu par socket).
  void Function()? _refreshActiveDialog;

  /// Stream de positions (remplace l'ancien Timer.periodic 30s pour économiser
  /// la batterie : on n'émet que quand le livreur a réellement bougé).
  StreamSubscription<Position>? _positionSub;

  /// Heartbeat de fallback : si la position n'a pas changé depuis 90 s,
  /// on re-broadcast la dernière position connue pour garder le client
  /// informé que le livreur est toujours là.
  Timer? _heartbeatTimer;
  Position? _lastKnownPosition;
  DateTime? _lastEmittedAt;

  /// Géofencing pickup — coordonnées du point de retrait de la course
  /// actuellement ACCEPTED (dialog ouvert). Reset quand la course passe
  /// IN_PROGRESS / COMPLETED / CANCELLED ou qu'aucune course n'est active.
  double? _currentPickupLat;
  double? _currentPickupLng;

  /// Identifiant de la course actuellement traquée pour le géofencing.
  /// Sert à éviter qu'un trigger reste actif après changement de course.
  String? _geofenceOrderId;

  /// Une fois passé à `true` pour la course en cours, on ne propose plus
  /// "Vous êtes arrivé(e)" tant qu'une nouvelle course n'est pas acceptée.
  /// Évite les répétitions si le livreur sort puis revient dans le rayon.
  bool _geofenceTriggered = false;

  /// Rayon (en mètres) sous lequel on considère que le livreur est arrivé
  /// au point de retrait. 80 m est un bon compromis : assez large pour
  /// absorber l'imprécision GPS (15-30 m typique en ville), assez serré
  /// pour ne pas se déclencher quand le livreur passe juste devant.
  static const double _pickupGeofenceMeters = 80;

  /// ScaffoldMessenger key pour pouvoir afficher un Snackbar par-dessus
  /// un dialog modal (le dialog masque le Scaffold ambient).
  final GlobalKey<ScaffoldMessengerState> _messengerKey =
      GlobalKey<ScaffoldMessengerState>();

  /// Callback fourni par le `_showActiveOrderDialog` pour faire avancer
  /// `dialogStatus` quand la transition vient de la suggestion de
  /// géofencing (sans devoir cliquer le bouton du dialog).
  void Function(String status)? _onGeofenceTransitioned;

  bool _hasSeenRealtimeConnection = false;
  bool _radarSyncInFlight = false;
  int _historyVersion = 0;
  int _profileVersion = 0;

  @override
  void initState() {
    super.initState();
    _connectAsDriver();
  }

  Future<void> _connectAsDriver() async {
    final user = await _authService.getCurrentUser();
    if (user != null) {
      currentDriverId = user.id;
      if (mounted) {
        setState(() {
          _driverApprovalStatus = user.driverApprovalStatus;
          _driverRejectionReason = user.driverRejectionReason;
          _isAvailable = user.isAvailable;
        });
      }
    }

    // Rafraîchit depuis le serveur pour avoir la valeur à jour (un admin a
    // pu valider/refuser le compte, ou changer la disponibilité ailleurs).
    await _refreshDriverStatus();

    await _initSocket();
    _radarRefreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_isApproved && _isAvailable && mounted) {
        unawaited(_reconcileAvailableOrders());
      }
    });

    // On n'interroge le radar que si le compte est validé : sinon le
    // backend répond 403 (ce qui déclencherait un état d'erreur opaque).
    if (_isApproved) {
      // P0 : restaure la course active éventuelle AVANT le radar — sans ça,
      // un redémarrage de l'app pendant une course faisait perdre au livreur
      // tout moyen de la faire avancer/terminer.
      await _restoreActiveOrder();
      await _reconcileAvailableOrders();
    }
  }

  /// Recharge depuis `GET /orders/mine` la course active éventuellement
  /// assignée à ce livreur (statut ACCEPTED → NEAR_CLIENT) et rouvre le
  /// dialog de progression complet (boutons d'avancement, chat, géofencing).
  Future<void> _restoreActiveOrder() async {
    if (_activeOrderId != null) return;
    try {
      final res = await _api.get('/orders/mine');
      if (res.statusCode != 200 && res.statusCode != 201) return;
      final data = jsonDecode(res.body);
      if (data is! List) return;
      // /orders/mine est trié createdAt DESC → la première course active
      // trouvée est la plus récente.
      final active = data.firstWhere(
        (o) => o is Map && _activeStatuses.contains(o['status']?.toString()),
        orElse: () => null,
      );
      if (active is! Map || !mounted) return;
      _showActiveOrderDialog(Map<String, dynamic>.from(active), restored: true);
    } catch (_) {
      // Hors-ligne au boot : rien à restaurer pour l'instant.
    }
  }

  /// Recharge `driverApprovalStatus` / `isAvailable` / `driverRejectionReason`
  /// depuis `GET /users/me` et synchronise le user stocké localement.
  Future<void> _refreshDriverStatus() async {
    try {
      final res = await _api.get('/users/me');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final user = User.fromJson(data);
        await _authService.saveUser(user);
        if (mounted) {
          setState(() {
            _driverApprovalStatus = user.driverApprovalStatus;
            _driverRejectionReason = user.driverRejectionReason;
            _isAvailable = user.isAvailable;
          });
        }
      }
    } catch (_) {
      // Pas de connexion : on garde les valeurs locales déjà affichées.
    } finally {
      if (mounted) setState(() => _statusLoading = false);
    }
  }

  Future<bool> _reconcileAvailableOrders() async {
    if (_radarSyncInFlight) return false;
    _radarSyncInFlight = true;
    try {
      final res = await _api.get('/orders/available');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        if (data is List && mounted) {
          setState(() {
            availableOrders = normalizeRadarOrders(data);
          });
          return true;
        }
        return false;
      }

      if ((res.statusCode == 401 || res.statusCode == 403) && mounted) {
        setState(() {
          availableOrders = <Map<String, dynamic>>[];
        });
        unawaited(_refreshDriverStatus());
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      _radarSyncInFlight = false;
    }
  }

  /// Bascule la disponibilité du livreur. Verrouillé si le compte n'est pas
  /// validé (le backend refuserait de toute façon avec un 403).
  Future<void> _toggleAvailability(bool value) async {
    if (!_isApproved || _togglingAvailability) return;
    setState(() => _togglingAvailability = true);
    try {
      final effective = await _driverService.setAvailability(value);
      if (!mounted) return;
      setState(() {
        _isAvailable = effective;
      });
      showAdaptiveSnack(
        context,
        effective
            ? 'Vous êtes maintenant disponible'
            : 'Vous êtes maintenant indisponible',
      );
      if (effective) {
        await _reconcileAvailableOrders();
      } else {
        setState(() {
          availableOrders = <Map<String, dynamic>>[];
        });
      }
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _togglingAvailability = false);
    }
  }

  /// Initialise `OrderSocketController` et abonne les streams pertinents
  /// pour le livreur (nouvelle course / acceptation par un autre / statuts
  /// et paiement de SA course active / connexion). Le backend n'émet
  /// `orderStatusUpdated` au livreur que pour les courses dont il est
  /// partie — le filtrage sur [_activeOrderId] suffit.
  Future<void> _initSocket() async {
    await _socketCtrl.init();

    _socketLifecycleSub = _socketCtrl.lifecycle$.listen((event) {
      if (!mounted) return;
      switch (event.state) {
        case SocketLifecycleState.connectError:
          if (_hasSeenRealtimeConnection) return;
          showAdaptiveSnack(
            context,
            'Connexion temps réel impossible. Le radar sera resynchronisé dès que le réseau revient.',
            isError: true,
          );
          return;
        case SocketLifecycleState.disconnected:
          if (!_hasSeenRealtimeConnection) return;
          showAdaptiveSnack(
            context,
            'Connexion temps réel perdue. Reconnexion automatique en cours…',
            isError: true,
          );
          return;
        case SocketLifecycleState.reconnecting:
          if (event.attempt != 1) return;
          showAdaptiveSnack(context, 'Reconnexion du temps réel…');
          return;
        case SocketLifecycleState.reconnectFailed:
          showAdaptiveSnack(
            context,
            'Temps réel indisponible. Le radar restera figé jusqu’à la prochaine reconnexion.',
            isError: true,
          );
          return;
        case SocketLifecycleState.skipped:
        case SocketLifecycleState.connecting:
        case SocketLifecycleState.connected:
        case SocketLifecycleState.error:
          return;
      }
    });

    // P2 (GPS strict) : le tracking GPS ne démarre plus à la connexion du
    // socket mais à l'ouverture d'une course active. À la (re)connexion, on
    // ne le (re)lance que si une course est effectivement en cours.
    _connectedSub = _socketCtrl.connected$.listen((_) async {
      final shouldNotify = _hasSeenRealtimeConnection;
      _hasSeenRealtimeConnection = true;
      debugPrint('Connecté aux WebSockets du serveur.');
      if (_activeOrderId != null) {
        await _startLocationUpdates();
      }
      final synced = await _reconcileAvailableOrders();
      if (shouldNotify && synced && mounted) {
        showAdaptiveSnack(
          context,
          'Connexion temps réel rétablie. Radar resynchronisé.',
        );
      }
    });

    // P0 : synchronise le dialog non-dismissible avec les statuts décidés
    // ailleurs — annulation par le client ou l'admin en tête. Sans cette
    // écoute, le livreur restait bloqué sur une course annulée.
    _statusSub = _socketCtrl.statusUpdates$.listen((evt) {
      if (!mounted || evt.orderId != _activeOrderId) return;
      _onRemoteStatusChanged?.call(evt.status);
    });

    // P1 : reflète en direct un changement de statut de paiement fait par
    // le client, le commerçant ou un admin.
    _paymentSub = _socketCtrl.paymentUpdates$.listen((evt) {
      if (!mounted || evt.orderId != _activeOrderId) return;
      _activeOrderData?['paymentStatus'] = evt.paymentStatus;
      _refreshActiveDialog?.call();
    });

    _newOrderSub = _socketCtrl.newOrderAvailable$.listen((evt) {
      if (!mounted || !_isApproved || !_isAvailable) return;
      final alreadyPresent = availableOrders.any(
        (order) => _radarOrderId(order) == evt.orderId,
      );
      setState(() {
        availableOrders = upsertRadarOrder(availableOrders, evt.raw);
      });
      if (!alreadyPresent) {
        showAdaptiveSnack(context, '🔔 Nouvelle course disponible !');
      }
    });

    _orderAcceptedSub = _socketCtrl.orderAccepted$.listen((evt) {
      if (!mounted) return;
      setState(() {
        availableOrders.removeWhere(
          (order) => order['id']?.toString() == evt.orderId,
        );
      });
    });
  }

  Future<bool> _ensureLocationPermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return false;
    }
    if (permission == LocationPermission.deniedForever) return false;
    return true;
  }

  void _emitPosition(Position pos) {
    _socketCtrl.emitDriverLocation(pos.latitude, pos.longitude);
    _lastKnownPosition = pos;
    _lastEmittedAt = DateTime.now();
    _checkPickupGeofence(pos.latitude, pos.longitude);
    _refreshActiveDialog?.call();
  }

  /// Vérifie si la position actuelle se trouve dans le rayon du pickup
  /// d'une course ACCEPTED. Si oui (et que le trigger n'a pas déjà été
  /// déclenché pour cette course), propose au livreur de marquer la
  /// course "En cours" via [_suggestArrival].
  void _checkPickupGeofence(double lat, double lng) {
    if (_currentPickupLat == null || _currentPickupLng == null) return;
    if (_geofenceTriggered) return;
    final distance = Geolocator.distanceBetween(
      lat,
      lng,
      _currentPickupLat!,
      _currentPickupLng!,
    );
    if (distance <= _pickupGeofenceMeters) {
      _geofenceTriggered = true;
      _suggestArrival();
    }
  }

  /// Affiche un Snackbar non-bloquant suggérant au livreur de passer la
  /// course en `IN_PROGRESS`. Pas d'auto-transition : on attend une
  /// confirmation explicite via le bouton "Démarrer".
  void _suggestArrival() {
    final orderId = _geofenceOrderId;
    if (orderId == null) return;
    final messenger = _messengerKey.currentState;
    if (messenger == null) return;
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF122530),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFF0FB271), width: 1),
        ),
        content: const Text(
          '✅ Vous êtes arrivé(e) au point de retrait. '
          'Marquer la course comme « En cours » ?',
          style: TextStyle(color: Colors.white),
        ),
        action: SnackBarAction(
          label: 'Démarrer',
          textColor: const Color(0xFF0FB271),
          onPressed: () => _confirmArrival(orderId),
        ),
      ),
    );
  }

  /// Déclenche la transition `IN_PROGRESS` après confirmation utilisateur.
  /// Notifie le dialog ouvert pour qu'il mette à jour son `dialogStatus`.
  Future<void> _confirmArrival(String orderId) async {
    final ok = await _updateStatus(orderId, 'IN_PROGRESS');
    if (!ok) {
      // Échec serveur : on ré-arme pour permettre une nouvelle tentative.
      _geofenceTriggered = false;
      return;
    }
    _onGeofenceTransitioned?.call('IN_PROGRESS');
    // Plus besoin de surveiller le pickup une fois en livraison.
    _currentPickupLat = null;
    _currentPickupLng = null;
  }

  /// Réinitialise l'état de géofencing. Appelé à la fermeture du dialog
  /// (course terminée/annulée) ou avant d'amorcer une nouvelle course.
  void _resetGeofenceState() {
    _currentPickupLat = null;
    _currentPickupLng = null;
    _geofenceOrderId = null;
    _geofenceTriggered = false;
    _onGeofenceTransitioned = null;
  }

  Future<void> _startLocationUpdates() async {
    final granted = await _ensureLocationPermission();
    if (!granted) return;

    // Première position pour amorcer le tracking et avoir une référence
    try {
      final first = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      _emitPosition(first);
    } catch (_) {
      // pas grave, le stream prendra le relais
    }

    // On annule un éventuel ancien stream avant d'en démarrer un nouveau
    await _positionSub?.cancel();

    const settings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25, // ne re-broadcast que tous les 25 m parcourus
    );
    _positionSub = Geolocator.getPositionStream(locationSettings: settings)
        .listen(
          (pos) {
            _emitPosition(pos);
          },
          onError: (_) {
            // on ignore : le heartbeat continuera à pousser la dernière position
          },
        );

    // Heartbeat de fallback : si rien n'a été émis depuis 90 s, on re-pousse
    // la dernière position connue pour rassurer le client.
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 90), (_) {
      final last = _lastKnownPosition;
      final lastAt = _lastEmittedAt;
      if (last == null) return;
      if (lastAt == null ||
          DateTime.now().difference(lastAt) >= const Duration(seconds: 90)) {
        _socketCtrl.emitDriverLocation(
          last.latitude,
          last.longitude,
          heartbeat: true,
        );
        _lastEmittedAt = DateTime.now();
      }
    });
  }

  /// Arrête le tracking GPS (stream de positions + heartbeat). Appelé quand
  /// la course active se termine — P2 : pas de tracking hors course.
  Future<void> _stopLocationUpdates() async {
    await _positionSub?.cancel();
    _positionSub = null;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _lastEmittedAt = null;
  }

  Future<void> _acceptOrder(String orderId) async {
    try {
      final res = await _api.post('/orders/$orderId/accept', body: {});

      if (res.statusCode == 200 || res.statusCode == 201) {
        final orderData = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            availableOrders.removeWhere(
              (order) => order['id']?.toString() == orderId,
            );
          });
        }
        _showActiveOrderDialog(orderData);
      } else {
        throw Exception('Course déjà prise ou erreur serveur.');
      }
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          'Désolé, cette course a déjà été prise !',
          isError: true,
        );
      }
    }
  }

  void _declineOrder(String orderId) {
    setState(() {
      availableOrders.removeWhere(
        (order) => order['id']?.toString() == orderId,
      );
    });
    showAdaptiveSnack(
      context,
      'Course refusée. Elle est masquée jusqu’au prochain rafraîchissement.',
    );
  }

  /// Statuts de paiement considérés « réglés » — plus rien à confirmer.
  static const Set<String> _settledPayments = {
    'PAID',
    'RECEIVED_BY_LIVREUR',
    'RECEIVED_BY_MERCHANT',
    'CASH_ON_DELIVERY',
    'REFUNDED',
  };

  /// PATCH /orders/:id/payment-status — retourne `true` si accepté.
  /// Le backend autorise le livreur assigné (paiement espèces, CDC §4).
  Future<bool> _updatePaymentStatus(
    String orderId,
    String paymentStatus,
  ) async {
    try {
      final res = await _api.patch(
        '/orders/$orderId/payment-status',
        body: {'paymentStatus': paymentStatus},
      );
      return res.statusCode == 200 || res.statusCode == 201;
    } catch (_) {
      return false;
    }
  }

  /// Après un COMPLETED : si le paiement n'est pas réglé, propose au livreur
  /// de confirmer la réception des espèces (le flux CDC : le client paie en
  /// espèces à la fin de la course). Sans ce point d'entrée, une course
  /// client↔livreur restait UNPAID à vie.
  Future<void> _promptCashPaymentIfNeeded(
    Map<String, dynamic> data,
    String orderId,
  ) async {
    final current = data['paymentStatus']?.toString() ?? '';
    if (_settledPayments.contains(current)) return;
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Paiement en espèces',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Avez-vous reçu le paiement en espèces du client ?',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Plus tard',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0FB271),
            ),
            child: const Text(
              'Oui, reçu',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final ok = await _updatePaymentStatus(orderId, 'CASH_ON_DELIVERY');
    if (ok) data['paymentStatus'] = 'CASH_ON_DELIVERY';
    if (mounted) {
      showAdaptiveSnack(
        context,
        ok
            ? 'Paiement en espèces enregistré'
            : 'Impossible d’enregistrer le paiement — réessayez depuis l’historique.',
        isError: !ok,
      );
    }
  }

  /// Retourne `true` si la mise à jour a réussi.
  Future<bool> _updateStatus(String orderId, String status) async {
    try {
      final res = await _api.patch(
        '/orders/$orderId/status',
        body: {'status': status},
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        if (mounted) {
          showAdaptiveSnack(context, 'Statut mis à jour : $status');
        }
        return true;
      } else {
        throw Exception('Transition refusée');
      }
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(context, 'Erreur : $e', isError: true);
      }
      return false;
    }
  }

  /// Ouvre WhatsApp côté livreur pour contacter le client. Visible quand la
  /// course est `ACCEPTED` ou `IN_PROGRESS`.
  Future<void> _openWhatsappToClient(dynamic orderData) async {
    final client = orderData['client'] as Map<String, dynamic>?;
    final phone =
        client?['phone']?.toString() ?? orderData['clientPhone']?.toString();
    if (phone == null || phone.trim().isEmpty) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          'Numéro du client indisponible.',
          isError: true,
        );
      }
      return;
    }
    final shortId = orderData['id'].toString().substring(
      0,
      orderData['id'].toString().length < 6
          ? orderData['id'].toString().length
          : 6,
    );
    final message =
        'Bonjour, je suis votre livreur ZonZon pour la course #$shortId. J’arrive bientôt.';
    await WhatsappService.openChat(phone: phone, message: message);
  }

  /// Affiche un Snackbar (par-dessus le dialog via [_messengerKey]) quand la
  /// course active a été clôturée à distance (annulation client/admin, etc.).
  void _notifyRemoteTermination(String status) {
    final label = switch (status) {
      'CANCELLED' => 'La course a été annulée.',
      'FAILED' => 'La course a été marquée en échec.',
      _ => 'La course est terminée.',
    };
    final messenger = _messengerKey.currentState;
    messenger?.clearSnackBars();
    messenger?.showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF122530),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFF0453D), width: 1),
        ),
        content: Text(label, style: const TextStyle(color: Colors.white)),
      ),
    );
  }

  /// Dialog de progression de la course active. Ouvert à l'acceptation
  /// ([restored] = false) ou à la restauration après redémarrage de l'app
  /// ([restored] = true — P0).
  void _showActiveOrderDialog(dynamic orderData, {bool restored = false}) {
    final orderId = orderData['id'].toString();

    // Variables d'état du dialog (closures partagées avec StatefulBuilder)
    String dialogStatus = orderData['status']?.toString() ?? 'ACCEPTED';
    bool dialogProcessing = false;

    // Garde anti double-fermeture : une transition terminale locale ET
    // l'event socket qui en résulte peuvent vouloir fermer le même dialog.
    bool dialogClosed = false;

    final Map<String, dynamic> data = orderData is Map<String, dynamic>
        ? orderData
        : Map<String, dynamic>.from(orderData as Map);
    _activeOrderId = orderId;
    _activeOrderData = data;

    // P2 (GPS strict) : le tracking ne tourne que pendant une course active.
    _startLocationUpdates();

    final client = orderData['client'] as Map<String, dynamic>?;
    final clientName = client != null
        ? '${client['firstName'] ?? ''} ${client['lastName'] ?? ''}'.trim()
        : 'Client';

    // ── Géofencing : on stocke les coords pickup tant que la course est
    // ACCEPTED. Reset à la fermeture du dialog.
    final pickupLat = (orderData['pickupLat'] as num?)?.toDouble();
    final pickupLng = (orderData['pickupLng'] as num?)?.toDouble();
    _resetGeofenceState();
    if (dialogStatus == 'ACCEPTED' && pickupLat != null && pickupLng != null) {
      _currentPickupLat = pickupLat;
      _currentPickupLng = pickupLng;
      _geofenceOrderId = orderId;
      // Edge case : si le livreur est déjà tout proche au moment de l'accept
      // (ex. course créée dans la même rue), on déclenche immédiatement la
      // suggestion sur la base de la dernière position connue.
      final last = _lastKnownPosition;
      if (last != null) {
        _checkPickupGeofence(last.latitude, last.longitude);
      }
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dlgCtx) => StatefulBuilder(
        builder: (dlgCtx, setDialogState) {
          // Action sécurisée : désactive les boutons, applique la transition,
          // ferme le dialog si la course est terminée/annulée.
          Future<void> doTransition(String targetStatus) async {
            setDialogState(() => dialogProcessing = true);
            final ok = await _updateStatus(orderId, targetStatus);
            if (!ok) {
              if (dlgCtx.mounted) {
                setDialogState(() => dialogProcessing = false);
              }
              return;
            }
            if (targetStatus == 'COMPLETED' ||
                targetStatus == 'CANCELLED' ||
                targetStatus == 'FAILED') {
              dialogClosed = true;
              _resetGeofenceState();
              if (dlgCtx.mounted) Navigator.pop(dlgCtx);
              if (targetStatus == 'COMPLETED') {
                await _promptCashPaymentIfNeeded(data, orderId);
                if (mounted) {
                  setState(() {
                    _historyVersion++;
                    _profileVersion++;
                  });
                }
              }
            } else {
              // IN_PROGRESS (et tout statut atteint après) via le dialog
              // manuel : plus besoin de surveiller le pickup (mais on garde
              // _geofenceTriggered à true pour ne pas re-trigger si jamais
              // le statut revient en arrière côté serveur).
              if (targetStatus == 'IN_PROGRESS' ||
                  targetStatus == 'NEAR_CLIENT') {
                _currentPickupLat = null;
                _currentPickupLng = null;
                _geofenceTriggered = true;
              }
              if (dlgCtx.mounted) {
                setDialogState(() {
                  dialogStatus = targetStatus;
                  dialogProcessing = false;
                });
              }
            }
          }

          // Branche du callback de géofencing pour que le dialog reste
          // synchronisé quand la transition est faite via le Snackbar.
          _onGeofenceTransitioned = (newStatus) {
            if (!dlgCtx.mounted) return;
            setDialogState(() {
              dialogStatus = newStatus;
              dialogProcessing = false;
            });
          };

          // P0 : statuts poussés par le serveur (annulation client/admin en
          // tête). Statut terminal → fermeture du dialog non-dismissible ;
          // sinon simple synchronisation de l'affichage.
          _onRemoteStatusChanged = (newStatus) {
            if (dialogClosed) return;
            if (newStatus == 'COMPLETED' ||
                newStatus == 'CANCELLED' ||
                newStatus == 'FAILED') {
              dialogClosed = true;
              if (dlgCtx.mounted) {
                // Dépile d'abord ce qui est empilé au-dessus du dialog
                // (chat…) — la conversation est de toute façon fermée côté
                // serveur pour un statut terminal — puis ferme le dialog.
                final navigator = Navigator.of(dlgCtx);
                final route = ModalRoute.of(dlgCtx);
                if (route != null) {
                  navigator.popUntil((r) => r == route);
                }
                navigator.pop();
              }
              _notifyRemoteTermination(newStatus);
              if (mounted) {
                setState(() {
                  _historyVersion++;
                  _profileVersion++;
                });
              }
              return;
            }
            if (!dlgCtx.mounted) return;
            if (newStatus == 'IN_PROGRESS' || newStatus == 'NEAR_CLIENT') {
              _currentPickupLat = null;
              _currentPickupLng = null;
              _geofenceTriggered = true;
            }
            setDialogState(() {
              dialogStatus = newStatus;
              dialogProcessing = false;
            });
          };

          // P1 : rebuild sur changement distant (statut de paiement).
          _refreshActiveDialog = () {
            if (dialogClosed || !dlgCtx.mounted) return;
            setDialogState(() {});
          };

          final paymentStatus = data['paymentStatus']?.toString();

          return AlertDialog(
            backgroundColor: const Color(0xFF122530),
            title: Text(
              restored ? 'Course en cours 🚴' : 'Course Acceptée ! 🎉',
              style: const TextStyle(color: Colors.white),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Allez au ${orderData['pickupAddress']} pour récupérer le colis.',
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _StatusChip(
                      label: OrderStatusUtils.label(dialogStatus),
                      color: OrderStatusUtils.color(dialogStatus),
                    ),
                    if (paymentStatus != null)
                      _StatusChip(
                        label: PaymentStatusUtils.label(paymentStatus),
                        color: PaymentStatusUtils.color(paymentStatus),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                StatusTimeline(status: dialogStatus),
              ],
            ),
            actionsAlignment: MainAxisAlignment.center,
            actionsOverflowDirection: VerticalDirection.down,
            actions: [
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ── Bouton Chat ────────────────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: dialogProcessing
                          ? null
                          : () {
                              if (_lastKnownPosition == null) {
                                showAdaptiveSnack(
                                  context,
                                  'Position GPS en cours de récupération. Réessayez dans un instant.',
                                );
                                return;
                              }
                              pushAdaptive<void>(
                                dlgCtx,
                                DriverNavigationScreen(
                                  status: dialogStatus,
                                  pickupAddress:
                                      orderData['pickupAddress']?.toString() ??
                                      '',
                                  deliveryAddress:
                                      orderData['deliveryAddress']
                                          ?.toString() ??
                                      '',
                                  pickupLat: (orderData['pickupLat'] as num?)
                                      ?.toDouble(),
                                  pickupLng: (orderData['pickupLng'] as num?)
                                      ?.toDouble(),
                                  deliveryLat:
                                      (orderData['deliveryLat'] as num?)
                                          ?.toDouble(),
                                  deliveryLng:
                                      (orderData['deliveryLng'] as num?)
                                          ?.toDouble(),
                                  driverPosition: LatLng(
                                    _lastKnownPosition!.latitude,
                                    _lastKnownPosition!.longitude,
                                  ),
                                ),
                              );
                            },
                      icon: const Icon(Icons.map_outlined, color: Colors.white),
                      label: const Text(
                        'Ouvrir la carte de navigation',
                        style: TextStyle(color: Colors.white),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0FB271),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: dialogProcessing
                          ? null
                          : () => pushAdaptive<void>(
                              dlgCtx,
                              ChatScreen(
                                orderId: orderId,
                                otherPartyName: clientName.isEmpty
                                    ? 'Client'
                                    : clientName,
                                otherPartyPhone:
                                    client?['phone']?.toString() ??
                                    orderData['clientPhone']?.toString(),
                                otherPartyRole: 'CLIENT',
                                orderStatus: dialogStatus,
                              ),
                            ),
                      icon: const Icon(
                        Icons.chat_bubble_outline,
                        color: Colors.white,
                      ),
                      label: const Text(
                        'Discuter avec le client',
                        style: TextStyle(color: Colors.white),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2E90FA),
                      ),
                    ),
                  ),
                  // ── WhatsApp ───────────────────────────────────────────
                  if (_canFail(dialogStatus)) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: dialogProcessing
                            ? null
                            : () => _openWhatsappToClient(orderData),
                        icon: const Icon(Icons.message, color: Colors.white),
                        label: const Text(
                          'Contacter par WhatsApp',
                          style: TextStyle(color: Colors.white),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366),
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(height: 8),

                  // ── Actions selon le statut courant ────────────────────
                  if (dialogProcessing)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: CircularProgressIndicator(
                        color: Color(0xFF0FB271),
                      ),
                    )
                  else ...[
                    // ── Progression granulaire : bouton "étape suivante"
                    // selon le statut courant. Coexiste avec le géofencing
                    // (`_suggestArrival`) qui propose automatiquement
                    // ACCEPTED → IN_PROGRESS via un Snackbar : les deux
                    // chemins mènent au même backend, qui valide la
                    // transition dans tous les cas.
                    if (_nextStepFor(dialogStatus) case final next?) ...[
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () => doTransition(next.targetStatus),
                          icon: Icon(next.icon, color: Colors.white),
                          label: Text(
                            next.label,
                            style: const TextStyle(color: Colors.white),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: next.color,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],

                    // Raccourci "Livré" depuis IN_PROGRESS : le chemin
                    // historique ACCEPTED → IN_PROGRESS → COMPLETED reste
                    // valide côté backend, donc on permet de clôturer la
                    // course directement sans forcer l'étape intermédiaire
                    // "Proche du client".
                    if (dialogStatus == 'IN_PROGRESS') ...[
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => doTransition('COMPLETED'),
                          icon: const Icon(
                            Icons.done_all,
                            color: Color(0xFF0FB271),
                          ),
                          label: const Text(
                            'Livré directement',
                            style: TextStyle(color: Color(0xFF0FB271)),
                          ),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(
                              color: Color(0xFF0FB271),
                              width: 1.2,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],

                    // Signaler un échec — accessible à toutes les étapes
                    // actives (backend : FAILED atteignable depuis ACCEPTED,
                    // EN_ROUTE_PICKUP, AT_PICKUP, IN_PROGRESS, NEAR_CLIENT).
                    if (_canFail(dialogStatus)) ...[
                      SizedBox(
                        width: double.infinity,
                        child: TextButton.icon(
                          onPressed: () => doTransition('FAILED'),
                          icon: const Icon(
                            Icons.error_outline,
                            color: Colors.orangeAccent,
                          ),
                          label: const Text(
                            'Signaler un échec',
                            style: TextStyle(color: Colors.orangeAccent),
                          ),
                        ),
                      ),
                    ],

                    // Annuler — disponible tant que pas terminal
                    if (_canCancel(dialogStatus))
                      SizedBox(
                        width: double.infinity,
                        child: TextButton.icon(
                          onPressed: () => doTransition('CANCELLED'),
                          icon: const Icon(
                            Icons.cancel,
                            color: Colors.redAccent,
                          ),
                          label: const Text(
                            'Annuler la course',
                            style: TextStyle(color: Colors.redAccent),
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ],
          );
        },
      ),
    ).then((_) {
      // Fermeture du dialog (locale ou distante) : plus de course active.
      // P2 (GPS strict) : le tracking s'arrête avec la course.
      dialogClosed = true;
      _activeOrderId = null;
      _activeOrderData = null;
      _onRemoteStatusChanged = null;
      _refreshActiveDialog = null;
      _resetGeofenceState();
      _stopLocationUpdates();
    });
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _heartbeatTimer?.cancel();
    _newOrderSub?.cancel();
    _orderAcceptedSub?.cancel();
    _statusSub?.cancel();
    _paymentSub?.cancel();
    _connectedSub?.cancel();
    _socketLifecycleSub?.cancel();
    _radarRefreshTimer?.cancel();
    _socketCtrl.dispose();
    super.dispose();
  }

  String _currentTabTitle() {
    switch (_currentTab) {
      case 0:
        return 'Radar Livreur';
      case 1:
        return 'Mes courses';
      case 2:
        return 'Mon Profil';
      default:
        return 'Livreur';
    }
  }

  @override
  Widget build(BuildContext context) {
    return ScaffoldMessenger(
      // Une key dédiée au géofencing : permet de pousser un Snackbar même
      // quand un AlertDialog modal est ouvert par-dessus.
      key: _messengerKey,
      child: Scaffold(
        backgroundColor: const Color(0xFF0C1A22),
        appBar: AppBar(
          title: Text(
            _currentTabTitle(),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
          backgroundColor: const Color(0xFF122530),
          iconTheme: const IconThemeData(color: Colors.white),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              tooltip: 'Messagerie',
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () =>
                  pushAdaptive<void>(context, const MessagingHubScreen()),
            ),
          ],
        ),
        body: IndexedStack(
          index: _currentTab,
          children: [
            _buildRadar(),
            OrderHistoryScreen(
              key: ValueKey('driver-history-$_historyVersion'),
              embedInTab: true,
            ),
            DriverProfileScreen(
              key: ValueKey('driver-profile-$_profileVersion'),
            ),
          ],
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: isCupertinoPlatform
              ? CupertinoTabBar(
                  currentIndex: _currentTab,
                  onTap: _onTabSelected,
                  backgroundColor: const Color(0xF2122530),
                  activeColor: const Color(0xFF0FB271),
                  inactiveColor: CupertinoColors.inactiveGray,
                  items: const [
                    BottomNavigationBarItem(
                      icon: Icon(CupertinoIcons.scope),
                      label: 'Radar',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(CupertinoIcons.doc_text),
                      label: 'Mes courses',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(CupertinoIcons.person),
                      label: 'Profil',
                    ),
                  ],
                )
              : NavigationBar(
                  selectedIndex: _currentTab,
                  onDestinationSelected: _onTabSelected,
                  height: 72,
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.radar),
                      label: 'Radar',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.receipt_long_outlined),
                      selectedIcon: Icon(Icons.receipt_long),
                      label: 'Mes courses',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.person_outline),
                      selectedIcon: Icon(Icons.person),
                      label: 'Profil',
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  void _onTabSelected(int index) {
    setState(() {
      if (index == 1 && _currentTab != 1) _historyVersion++;
      if (index == 2 && _currentTab != 2) _profileVersion++;
      _currentTab = index;
    });
  }

  Widget _buildRadar() {
    if (_statusLoading) {
      return Center(child: adaptiveLoader(color: const Color(0xFF0FB271)));
    }

    return Column(
      children: [
        _buildAvailabilityHeader(),
        Expanded(child: _buildRadarBody()),
      ],
    );
  }

  /// En-tête toujours visible en haut du Radar : bandeau de statut si le
  /// compte n'est pas validé, sinon le switch de disponibilité.
  Widget _buildAvailabilityHeader() {
    if (!_isApproved) {
      return _buildApprovalBanner();
    }
    return _buildAvailabilitySwitch();
  }

  /// Bandeau affiché tant que le compte livreur n'est pas `APPROVED`.
  Widget _buildApprovalBanner() {
    final isRejected = _driverApprovalStatus == 'REJECTED';
    final color = isRejected
        ? const Color(0xFFF0453D)
        : const Color(0xFFFF9E1B);
    final title = isRejected
        ? 'Votre compte livreur a été refusé'
        : 'Compte en attente de validation';
    final subtitle = isRejected
        ? (_driverRejectionReason?.trim().isNotEmpty == true
              ? _driverRejectionReason!
              : 'Contactez le support pour plus de détails.')
        : 'Votre compte est en attente de validation par un administrateur. '
              'Vous pourrez accepter des courses une fois validé.';

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isRejected ? Icons.error_outline : Icons.hourglass_top,
            color: color,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Switch « Disponible / Indisponible » — actif uniquement si le compte
  /// est validé (sinon désactivé, cf. `_buildApprovalBanner`).
  Widget _buildAvailabilitySwitch() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(
            _isAvailable ? Icons.wifi_tethering : Icons.wifi_tethering_off,
            color: _isAvailable ? const Color(0xFF0FB271) : Colors.white38,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _isAvailable ? 'Disponible' : 'Indisponible',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
          if (_togglingAvailability)
            SizedBox(
              width: 24,
              height: 24,
              child: adaptiveLoader(color: const Color(0xFF0FB271)),
            )
          else
            Switch(
              value: _isAvailable,
              activeThumbColor: const Color(0xFF0FB271),
              onChanged: _toggleAvailability,
            ),
        ],
      ),
    );
  }

  Widget _buildRadarBody() {
    if (!_isApproved) {
      // Compte non validé : pas de radar, le bandeau ci-dessus suffit.
      return const SizedBox.shrink();
    }

    if (!_isAvailable) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.pause_circle_outline,
                color: Colors.white38,
                size: 48,
              ),
              const SizedBox(height: 16),
              const Text(
                'Vous êtes indisponible.',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Passez disponible pour recevoir des courses.',
                style: TextStyle(color: Colors.white54, fontSize: 14),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return availableOrders.isEmpty
        ? Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                adaptiveLoader(color: const Color(0xFF0FB271)),
                const SizedBox(height: 20),
                const Text(
                  'En attente de nouvelles courses...',
                  style: TextStyle(color: Colors.white70, fontSize: 16),
                ),
              ],
            ),
          )
        : ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: availableOrders.length,
            itemBuilder: (context, index) {
              final order = availableOrders[index];
              return Card(
                color: const Color(0xFF122530),
                margin: const EdgeInsets.only(bottom: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${order['priceFcfa']} FCFA',
                            style: const TextStyle(
                              color: Color(0xFF0FB271),
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${order['distanceKm']} km',
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(
                            Icons.my_location,
                            color: Colors.blue,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${order['pickupAddress']}',
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on,
                            color: Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${order['deliveryAddress']}',
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () =>
                                  _declineOrder(order['id'].toString()),
                              child: const Text('Refuser'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: SizedBox(
                              height: 50,
                              child: ElevatedButton(
                                onPressed: () =>
                                    _acceptOrder(order['id'].toString()),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF2E90FA),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: const Text(
                                  'Accepter la course',
                                  style: TextStyle(
                                    fontSize: 18,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
  }
}
