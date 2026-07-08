import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'controllers/order_socket_controller.dart';
import 'models/user.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/driver_service.dart';
import 'services/whatsapp_service.dart';
import 'screens/chat_screen.dart';
import 'screens/rating_screen.dart';
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

class _DriverScreenState extends State<DriverScreen> {
  int _currentTab = 0;
  List<dynamic> availableOrders = [];
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
  StreamSubscription<void>? _connectedSub;

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

  /// Callback fourni par le `_showSuccessDialog` pour faire avancer
  /// `dialogStatus` quand la transition vient de la suggestion de
  /// géofencing (sans devoir cliquer le bouton du dialog).
  void Function(String status)? _onGeofenceTransitioned;

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

    // On n'interroge le radar que si le compte est validé : sinon le
    // backend répond 403 (ce qui déclencherait un état d'erreur opaque).
    if (_isApproved) {
      await _loadAvailableOrders();
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

  Future<void> _loadAvailableOrders() async {
    try {
      final res = await _api.get('/orders/available');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        if (data is List && mounted) {
          setState(() {
            availableOrders = data;
          });
        }
      }
    } catch (_) {}
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
        effective ? 'Vous êtes maintenant disponible' : 'Vous êtes maintenant indisponible',
      );
      // Si on vient de passer disponible et que le radar n'avait jamais été
      // chargé (ex. compte validé entre-temps), on rafraîchit la liste.
      if (effective) {
        await _loadAvailableOrders();
      }
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(context, e.toString().replaceFirst('Exception: ', ''), isError: true);
      }
    } finally {
      if (mounted) setState(() => _togglingAvailability = false);
    }
  }

  /// Initialise `OrderSocketController` et abonne les streams pertinents
  /// pour le livreur (nouvelle course / acceptation par un autre / connexion).
  /// L'ancien `socket.on('orderStatusUpdated')` n'était pas utilisé côté
  /// livreur (les transitions sont déclenchées par le livreur lui-même via
  /// `_updateStatus`), donc on n'écoute pas `statusUpdates$` ici.
  Future<void> _initSocket() async {
    await _socketCtrl.init();

    // Démarrer le tracking GPS dès que le socket est effectivement connecté
    // (comportement identique à l'ancien `socket.onConnect`).
    _connectedSub = _socketCtrl.connected$.listen((_) {
      debugPrint('Connecté aux WebSockets du serveur !');
      _startLocationUpdates();
    });

    _newOrderSub = _socketCtrl.newOrderAvailable$.listen((evt) {
      if (!mounted) return;
      setState(() {
        availableOrders.insert(0, evt.raw);
      });
      showAdaptiveSnack(context, '🔔 Nouvelle course disponible !');
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
        desiredAccuracy: LocationAccuracy.high,
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
    _positionSub =
        Geolocator.getPositionStream(locationSettings: settings).listen(
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

  Future<void> _acceptOrder(String orderId) async {
    try {
      final res = await _api.post('/orders/$orderId/accept', body: {});

      if (res.statusCode == 200 || res.statusCode == 201) {
        final orderData = jsonDecode(res.body);
        _showSuccessDialog(orderData);
      } else {
        throw Exception('Course déjà prise ou erreur serveur.');
      }
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(context, 'Désolé, cette course a déjà été prise !', isError: true);
      }
    }
  }

  /// Retourne `true` si la mise à jour a réussi.
  Future<bool> _updateStatus(String orderId, String status) async {
    try {
      final res = await _api.patch('/orders/$orderId/status', body: {'status': status});
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
    final phone = client?['phone']?.toString();
    if (phone == null || phone.trim().isEmpty) {
      if (mounted) {
        showAdaptiveSnack(context, 'Numéro du client indisponible.', isError: true);
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

  /// Présente l'écran de notation du client après que le livreur a marqué
  /// la course COMPLETED.
  Future<void> _promptRatingForClient(dynamic orderData) async {
    final orderId = orderData?['id']?.toString();
    if (orderId == null) return;
    final client = orderData['client'] as Map<String, dynamic>?;
    final clientName = client != null
        ? '${client['firstName'] ?? ''} ${client['lastName'] ?? ''}'.trim()
        : '';
    if (!mounted) return;
    await pushAdaptive<void>(
      context,
      RatingScreen(
        orderId: orderId,
        otherPartyName: clientName,
        otherPartyRole: 'CLIENT',
      ),
    );
  }

  void _showSuccessDialog(dynamic orderData) {
    final orderId = orderData['id'].toString();

    // Variables d'état du dialog (closures partagées avec StatefulBuilder)
    String dialogStatus = orderData['status']?.toString() ?? 'ACCEPTED';
    bool dialogProcessing = false;

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
              _resetGeofenceState();
              if (dlgCtx.mounted) Navigator.pop(dlgCtx);
              if (targetStatus == 'COMPLETED') {
                await _promptRatingForClient(orderData);
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

          final paymentStatus = orderData['paymentStatus']?.toString();

          return AlertDialog(
            backgroundColor: const Color(0xFF122530),
            title: const Text('Course Acceptée ! 🎉',
                style: TextStyle(color: Colors.white)),
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
                          : () => pushAdaptive<void>(
                                dlgCtx,
                                ChatScreen(
                                  orderId: orderId,
                                  otherPartyName:
                                      clientName.isEmpty ? 'Client' : clientName,
                                  otherPartyPhone: client?['phone']?.toString(),
                                  otherPartyRole: 'CLIENT',
                                  orderStatus: dialogStatus,
                                ),
                              ),
                      icon: const Icon(Icons.chat_bubble_outline,
                          color: Colors.white),
                      label: const Text('Discuter avec le client',
                          style: TextStyle(color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2E90FA)),
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
                        icon:
                            const Icon(Icons.message, color: Colors.white),
                        label: const Text('Contacter par WhatsApp',
                            style: TextStyle(color: Colors.white)),
                        style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF25D366)),
                      ),
                    ),
                  ],

                  const SizedBox(height: 8),

                  // ── Actions selon le statut courant ────────────────────
                  if (dialogProcessing)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: CircularProgressIndicator(
                          color: Color(0xFF0FB271)),
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
                          label: Text(next.label,
                              style: const TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(
                              backgroundColor: next.color),
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
                          icon: const Icon(Icons.done_all,
                              color: Color(0xFF0FB271)),
                          label: const Text('Livré directement',
                              style: TextStyle(color: Color(0xFF0FB271))),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(
                                color: Color(0xFF0FB271), width: 1.2),
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
                          icon: const Icon(Icons.error_outline,
                              color: Colors.orangeAccent),
                          label: const Text('Signaler un échec',
                              style:
                                  TextStyle(color: Colors.orangeAccent)),
                        ),
                      ),
                    ],

                    // Annuler — disponible tant que pas terminal
                    if (_canCancel(dialogStatus))
                      SizedBox(
                        width: double.infinity,
                        child: TextButton.icon(
                          onPressed: () => doTransition('CANCELLED'),
                          icon: const Icon(Icons.cancel,
                              color: Colors.redAccent),
                          label: const Text('Annuler la course',
                              style:
                                  TextStyle(color: Colors.redAccent)),
                        ),
                      ),
                  ],
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _heartbeatTimer?.cancel();
    _newOrderSub?.cancel();
    _orderAcceptedSub?.cancel();
    _connectedSub?.cancel();
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
        ),
        body: IndexedStack(
          index: _currentTab,
          children: [
            _buildRadar(),
            const OrderHistoryScreen(embedInTab: true),
            const DriverProfileScreen(),
          ],
        ),
        bottomNavigationBar: BottomNavigationBar(
          type: BottomNavigationBarType.fixed,
          currentIndex: _currentTab,
          onTap: (i) => setState(() => _currentTab = i),
          backgroundColor: const Color(0xFF122530),
          selectedItemColor: const Color(0xFF0FB271),
          unselectedItemColor: Colors.white60,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.radar),
              label: 'Radar',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.receipt_long_outlined),
              activeIcon: Icon(Icons.receipt_long),
              label: 'Mes courses',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              activeIcon: Icon(Icons.person),
              label: 'Profil',
            ),
          ],
        ),
      ),
    );
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
    final color = isRejected ? const Color(0xFFF0453D) : const Color(0xFFFF9E1B);
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
          Icon(isRejected ? Icons.error_outline : Icons.hourglass_top, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 13)),
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
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15),
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
              const Icon(Icons.pause_circle_outline, color: Colors.white38, size: 48),
              const SizedBox(height: 16),
              const Text(
                'Vous êtes indisponible.',
                style: TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600),
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
                const Text('En attente de nouvelles courses...', style: TextStyle(color: Colors.white70, fontSize: 16)),
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${order['priceFcfa']} FCFA', style: const TextStyle(color: Color(0xFF0FB271), fontSize: 22, fontWeight: FontWeight.bold)),
                          Text('${order['distanceKm']} km', style: const TextStyle(color: Colors.white54, fontSize: 14)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(children: [const Icon(Icons.my_location, color: Colors.blue, size: 20), const SizedBox(width: 8), Expanded(child: Text('${order['pickupAddress']}', style: const TextStyle(color: Colors.white)))]),
                      const SizedBox(height: 8),
                      Row(children: [const Icon(Icons.location_on, color: Colors.red, size: 20), const SizedBox(width: 8), Expanded(child: Text('${order['deliveryAddress']}', style: const TextStyle(color: Colors.white)))]),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: () => _acceptOrder(order['id'].toString()),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2E90FA),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Accepter la course', style: TextStyle(fontSize: 18, color: Colors.white)),
                        ),
                      )
                    ],
                  ),
                ),
              );
            },
          );
  }
}
