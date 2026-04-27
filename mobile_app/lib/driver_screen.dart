import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:geolocator/geolocator.dart';
import 'config/env.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/whatsapp_service.dart';
import 'screens/chat_screen.dart';
import 'screens/rating_screen.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  IO.Socket? socket;
  List<dynamic> availableOrders = [];
  String? currentDriverId;
  final ApiClient _api = ApiClient();
  final AuthService _authService = AuthService();

  /// Stream de positions (remplace l'ancien Timer.periodic 30s pour économiser
  /// la batterie : on n'émet que quand le livreur a réellement bougé).
  StreamSubscription<Position>? _positionSub;

  /// Heartbeat de fallback : si la position n'a pas changé depuis 90 s,
  /// on re-broadcast la dernière position connue pour garder le client
  /// informé que le livreur est toujours là.
  Timer? _heartbeatTimer;
  Position? _lastKnownPosition;
  DateTime? _lastEmittedAt;

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
    await _initWebSocket();
    await _loadAvailableOrders();
  }

  Future<void> _loadAvailableOrders() async {
    try {
      final res = await _api.get('/orders');
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

  Future<void> _initWebSocket() async {
    final token = await _authService.getToken();
    socket = IO.io(apiUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });

    socket!.connect();

    socket!.onConnect((_) {
      print('Connecté aux WebSockets du serveur !');
      _startLocationUpdates();
    });

    socket!.on('newOrderAvailable', (data) {
      if (mounted) {
        setState(() {
          availableOrders.insert(0, data);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🔔 Nouvelle course disponible !'), backgroundColor: Colors.orange),
        );
      }
    });

    socket!.on('orderAccepted', (data) {
      if (mounted) {
        setState(() {
          availableOrders.removeWhere((order) => order['id'] == data['orderId']);
        });
      }
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
    socket?.emit('driver:location', {
      'lat': pos.latitude,
      'lng': pos.longitude,
    });
    _lastKnownPosition = pos;
    _lastEmittedAt = DateTime.now();
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
        socket?.emit('driver:location', {
          'lat': last.latitude,
          'lng': last.longitude,
          'heartbeat': true,
        });
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Désolé, cette course a déjà été prise !'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _updateStatus(String orderId, String status) async {
    try {
      final res = await _api.patch('/orders/$orderId/status', body: {'status': status});
      if (res.statusCode == 200 || res.statusCode == 201) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Statut mis à jour : $status'), backgroundColor: const Color(0xFF10B981)),
          );
        }
      } else {
        throw Exception('Transition refusée');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  /// Ouvre WhatsApp côté livreur pour contacter le client. Visible quand la
  /// course est `ACCEPTED` ou `IN_PROGRESS`.
  Future<void> _openWhatsappToClient(dynamic orderData) async {
    final client = orderData['client'] as Map<String, dynamic>?;
    final phone = client?['phone']?.toString();
    if (phone == null || phone.trim().isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Numéro du client indisponible.'),
            backgroundColor: Colors.redAccent,
          ),
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
        'Bonjour, je suis votre livreur ZonZon pour la course #$shortId. J\'arrive bientôt.';
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
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RatingScreen(
          orderId: orderId,
          otherPartyName: clientName,
          otherPartyRole: 'CLIENT',
        ),
      ),
    );
  }

  void _showSuccessDialog(dynamic orderData) {
    final orderId = orderData['id'].toString();
    final status = orderData['status']?.toString() ?? 'ACCEPTED';
    final canWhatsapp = status == 'ACCEPTED' || status == 'IN_PROGRESS';
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Course Acceptée ! 🎉', style: TextStyle(color: Colors.white)),
        content: Text('Allez au ${orderData['pickupAddress']} pour récupérer le colis.', style: const TextStyle(color: Colors.white70)),
        actionsAlignment: MainAxisAlignment.center,
        actionsOverflowDirection: VerticalDirection.down,
        actions: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    final client = orderData['client'] as Map<String, dynamic>?;
                    final clientName = client != null
                        ? '${client['firstName'] ?? ''} ${client['lastName'] ?? ''}'.trim()
                        : 'Client';
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChatScreen(
                          orderId: orderId,
                          otherPartyName: clientName.isEmpty ? 'Client' : clientName,
                          otherPartyPhone: client?['phone']?.toString(),
                          otherPartyRole: 'CLIENT',
                          orderStatus: orderData['status']?.toString() ?? 'ACCEPTED',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.chat_bubble_outline, color: Colors.white),
                  label: const Text('Discuter avec le client', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0EA5E9)),
                ),
              ),
              if (canWhatsapp) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _openWhatsappToClient(orderData),
                    icon: const Icon(Icons.message, color: Colors.white),
                    label: const Text(
                      'Contacter le client par WhatsApp',
                      style: TextStyle(color: Colors.white),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF25D366),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _updateStatus(orderId, 'IN_PROGRESS'),
                  icon: const Icon(Icons.directions_bike, color: Colors.white),
                  label: const Text('Je suis sur place', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0EA5E9)),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () async {
                    await _updateStatus(orderId, 'COMPLETED');
                    if (context.mounted) Navigator.pop(context);
                    await _promptRatingForClient(orderData);
                  },
                  icon: const Icon(Icons.check_circle, color: Colors.white),
                  label: const Text('Course terminée', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: () async {
                    await _updateStatus(orderId, 'CANCELLED');
                    if (context.mounted) Navigator.pop(context);
                  },
                  icon: const Icon(Icons.cancel, color: Colors.redAccent),
                  label: const Text('Annuler la course', style: TextStyle(color: Colors.redAccent)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _heartbeatTimer?.cancel();
    socket?.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text('Radar Livreur', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E293B),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: availableOrders.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  CircularProgressIndicator(color: Color(0xFF10B981)),
                  SizedBox(height: 20),
                  Text('En attente de nouvelles courses...', style: TextStyle(color: Colors.white70, fontSize: 16)),
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
            ),
    );
  }
}
