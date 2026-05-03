import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'controllers/order_socket_controller.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/whatsapp_service.dart';
import 'screens/chat_screen.dart';
import 'screens/rating_screen.dart';
import 'screens/driver_profile_screen.dart';
import 'utils/platform_adapter.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  int _currentTab = 0;
  List<dynamic> availableOrders = [];
  String? currentDriverId;
  final ApiClient _api = ApiClient();
  final AuthService _authService = AuthService();

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
    }
    await _initSocket();
    await _loadAvailableOrders();
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
        backgroundColor: const Color(0xFF1E293B),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFF10B981), width: 1),
        ),
        content: const Text(
          '✅ Vous êtes arrivé(e) au point de retrait. '
          'Marquer la course comme « En cours » ?',
          style: TextStyle(color: Colors.white),
        ),
        action: SnackBarAction(
          label: 'Démarrer',
          textColor: const Color(0xFF10B981),
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
            if (targetStatus == 'COMPLETED' || targetStatus == 'CANCELLED') {
              _resetGeofenceState();
              if (dlgCtx.mounted) Navigator.pop(dlgCtx);
              if (targetStatus == 'COMPLETED') {
                await _promptRatingForClient(orderData);
              }
            } else {
              // IN_PROGRESS atteint via le dialog manuel : plus besoin
              // de surveiller le pickup (mais on garde _geofenceTriggered
              // à true pour ne pas re-trigger si jamais le statut revient).
              if (targetStatus == 'IN_PROGRESS') {
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

          return AlertDialog(
            backgroundColor: const Color(0xFF1E293B),
            title: const Text('Course Acceptée ! 🎉',
                style: TextStyle(color: Colors.white)),
            content: Text(
              'Allez au ${orderData['pickupAddress']} pour récupérer le colis.',
              style: const TextStyle(color: Colors.white70),
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
                          backgroundColor: const Color(0xFF0EA5E9)),
                    ),
                  ),
                  // ── WhatsApp ───────────────────────────────────────────
                  if (dialogStatus == 'ACCEPTED' ||
                      dialogStatus == 'IN_PROGRESS') ...[
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
                          color: Color(0xFF10B981)),
                    )
                  else ...[
                    // ACCEPTED → "Je suis sur place" (→ IN_PROGRESS)
                    if (dialogStatus == 'ACCEPTED') ...[
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () => doTransition('IN_PROGRESS'),
                          icon: const Icon(Icons.directions_bike,
                              color: Colors.white),
                          label: const Text('Je suis sur place',
                              style: TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF0EA5E9)),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],

                    // IN_PROGRESS → "Course terminée" (→ COMPLETED)
                    if (dialogStatus == 'IN_PROGRESS') ...[
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () => doTransition('COMPLETED'),
                          icon: const Icon(Icons.check_circle,
                              color: Colors.white),
                          label: const Text('Course terminée',
                              style: TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981)),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],

                    // Annuler — disponible tant que pas terminal
                    if (dialogStatus != 'COMPLETED' &&
                        dialogStatus != 'CANCELLED')
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

  @override
  Widget build(BuildContext context) {
    return ScaffoldMessenger(
      // Une key dédiée au géofencing : permet de pousser un Snackbar même
      // quand un AlertDialog modal est ouvert par-dessus.
      key: _messengerKey,
      child: Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        appBar: AppBar(
          title: Text(
            _currentTab == 0 ? 'Radar Livreur' : 'Mon Profil',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
          backgroundColor: const Color(0xFF1E293B),
          iconTheme: const IconThemeData(color: Colors.white),
          automaticallyImplyLeading: false,
        ),
        body: _currentTab == 0 ? _buildRadar() : const DriverProfileScreen(),
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _currentTab,
          onTap: (i) => setState(() => _currentTab = i),
          backgroundColor: const Color(0xFF1E293B),
          selectedItemColor: const Color(0xFF10B981),
          unselectedItemColor: Colors.white60,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.radar), label: 'Radar'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: 'Profil'),
          ],
        ),
      ),
    );
  }

  Widget _buildRadar() {
    return availableOrders.isEmpty
        ? Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                adaptiveLoader(color: const Color(0xFF10B981)),
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
                color: const Color(0xFF1E293B),
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
                          Text('${order['priceFcfa']} FCFA', style: const TextStyle(color: Color(0xFF10B981), fontSize: 22, fontWeight: FontWeight.bold)),
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
                            backgroundColor: const Color(0xFF3B82F6),
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
