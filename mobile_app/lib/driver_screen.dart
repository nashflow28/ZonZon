import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'config/env.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'screens/chat_screen.dart';

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
  Timer? _positionTimer;

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

  Future<void> _emitCurrentPosition() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      socket?.emit('driver:location', {
        'lat': pos.latitude,
        'lng': pos.longitude,
      });
    } catch (_) {
      // Position temporairement indisponible — on réessaiera au prochain tick.
    }
  }

  Future<void> _startLocationUpdates() async {
    final granted = await _ensureLocationPermission();
    if (!granted) return;

    await _emitCurrentPosition();

    _positionTimer?.cancel();
    _positionTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _emitCurrentPosition();
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

  void _showSuccessDialog(dynamic orderData) {
    final orderId = orderData['id'].toString();
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
    _positionTimer?.cancel();
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
