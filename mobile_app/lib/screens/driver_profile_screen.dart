import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/env.dart';
import '../models/user.dart';
import '../router/app_router.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/driver_service.dart';
import '../screens/order_history_screen.dart';
import '../utils/platform_adapter.dart';

class DriverProfileScreen extends StatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  State<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends State<DriverProfileScreen> {
  final _api = ApiClient();
  final _auth = AuthService();
  final _driverService = DriverService();
  final _picker = ImagePicker();

  User? _user;
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _stats;
  bool _loading = true;
  bool _togglingAvailability = false;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _vehicleType = 'MOTO';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _plateCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _api.get('/users/me'),
        _api.get('/vehicles/me'),
      ]);

      final userRes = results[0];
      final vehicleRes = results[1];

      if (userRes.statusCode == 200) {
        final data = jsonDecode(userRes.body) as Map<String, dynamic>;
        _user = User.fromJson(data);
        _firstNameCtrl.text = _user!.firstName;
        _lastNameCtrl.text = _user!.lastName;

        // Charger les stats de notation
        final statsRes = await _api.get('/users/${_user!.id}/ratings/stats');
        if (statsRes.statusCode == 200) {
          _stats = jsonDecode(statsRes.body) as Map<String, dynamic>;
        }
      }

      if (vehicleRes.statusCode == 200) {
        _vehicle = jsonDecode(vehicleRes.body) as Map<String, dynamic>;
        _vehicleType = _vehicle!['type'] ?? 'MOTO';
        _plateCtrl.text = _vehicle!['licensePlate'] ?? '';
        _descCtrl.text = _vehicle!['description'] ?? '';
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _pickAndUploadPhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      imageQuality: 80,
    );
    if (picked == null) return;

    final token = await _auth.getToken();
    MediaType mimeFromPath(String p) {
      final ext = p.toLowerCase().split('.').last;
      return switch (ext) {
        'png' => MediaType('image', 'png'),
        'webp' => MediaType('image', 'webp'),
        _ => MediaType('image', 'jpeg'),
      };
    }

    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiUrl$apiPrefix/users/me/photo'),
    )
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(await http.MultipartFile.fromPath(
        'file',
        picked.path,
        contentType: mimeFromPath(picked.path),
      ));

    final response = await request.send();
    if (response.statusCode == 200 || response.statusCode == 201) {
      await _load();
      if (mounted) {
        showAdaptiveSnack(context, 'Photo mise à jour');
      }
    }
  }

  Future<void> _saveProfile() async {
    final res = await _api.patch('/users/me', body: {
      'firstName': _firstNameCtrl.text.trim(),
      'lastName': _lastNameCtrl.text.trim(),
    });
    if (res.statusCode == 200 || res.statusCode == 201) {
      await _load();
      if (mounted) {
        showAdaptiveSnack(context, 'Profil mis à jour');
      }
    }
  }

  Future<void> _saveVehicle() async {
    final body = <String, dynamic>{'type': _vehicleType};
    if (_plateCtrl.text.trim().isNotEmpty) body['licensePlate'] = _plateCtrl.text.trim();
    if (_descCtrl.text.trim().isNotEmpty) body['description'] = _descCtrl.text.trim();

    final res = await _api.put('/vehicles/me', body: body);
    if (res.statusCode == 200 || res.statusCode == 201) {
      await _load();
      if (mounted) {
        showAdaptiveSnack(context, 'Véhicule mis à jour');
      }
    }
  }

  Future<void> _toggleAvailability(bool value) async {
    if (_user == null || _togglingAvailability) return;
    if (!_user!.isDriverApproved) return;
    setState(() => _togglingAvailability = true);
    try {
      final effective = await _driverService.setAvailability(value);
      if (!mounted) return;
      setState(() {
        _user = _user!.copyWith(isAvailable: effective);
      });
      showAdaptiveSnack(
        context,
        effective ? 'Vous êtes maintenant disponible' : 'Vous êtes maintenant indisponible',
      );
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(context, e.toString().replaceFirst('Exception: ', ''), isError: true);
      }
    } finally {
      if (mounted) setState(() => _togglingAvailability = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showAdaptiveConfirmDialog(
      context,
      title: 'Déconnexion',
      message: 'Voulez-vous vous déconnecter ?',
      confirmLabel: 'Déconnecter',
      cancelLabel: 'Annuler',
      isDestructive: true,
    );
    if (confirmed != true) return;
    await _auth.logout();
    if (mounted) {
      context.go(AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Center(child: adaptiveLoader(color: const Color(0xFF10B981)));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildPhotoSection(),
          const SizedBox(height: 24),
          _buildAvailabilitySection(),
          const SizedBox(height: 16),
          _buildStatsRow(),
          const SizedBox(height: 16),
          _buildHistoryTile(),
          const SizedBox(height: 16),
          _buildSection('Informations personnelles', _buildProfileFields()),
          const SizedBox(height: 16),
          _buildSection('Mon véhicule', _buildVehicleFields()),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: Colors.redAccent),
              label: const Text('Se déconnecter', style: TextStyle(color: Colors.redAccent)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.redAccent),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildPhotoSection() {
    final photoUrl = _user?.profilePhotoUrl;
    return Center(
      child: Stack(
        children: [
          CircleAvatar(
            radius: 56,
            backgroundColor: const Color(0xFF334155),
            backgroundImage: photoUrl != null
                ? NetworkImage('$apiUrl$photoUrl')
                : null,
            child: photoUrl == null
                ? Text(
                    ((_user?.firstName ?? '?')[0] + (_user?.lastName ?? '?')[0]).toUpperCase(),
                    style: const TextStyle(fontSize: 36, color: Colors.white, fontWeight: FontWeight.bold),
                  )
                : null,
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: GestureDetector(
              onTap: _pickAndUploadPhoto,
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFF3B82F6),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(8),
                child: const Icon(Icons.camera_alt, color: Colors.white, size: 18),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Section disponibilité : bandeau de statut si le compte n'est pas
  /// validé par un admin, sinon switch Disponible/Indisponible.
  Widget _buildAvailabilitySection() {
    final user = _user;
    if (user == null) return const SizedBox.shrink();

    if (!user.isDriverApproved) {
      final isRejected = user.isDriverRejected;
      final color = isRejected ? const Color(0xFFEF4444) : const Color(0xFFF59E0B);
      final title = isRejected
          ? 'Compte refusé'
          : 'En attente de validation par un administrateur';
      final subtitle = isRejected
          ? (user.driverRejectionReason?.trim().isNotEmpty == true
              ? user.driverRejectionReason!
              : 'Contactez le support pour plus de détails.')
          : 'Vous pourrez passer disponible une fois votre compte validé.';

      return Container(
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
                  Text(title, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(
            user.isAvailable ? Icons.wifi_tethering : Icons.wifi_tethering_off,
            color: user.isAvailable ? const Color(0xFF10B981) : Colors.white38,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              user.isAvailable ? 'Disponible' : 'Indisponible',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15),
            ),
          ),
          if (_togglingAvailability)
            SizedBox(
              width: 24,
              height: 24,
              child: adaptiveLoader(color: const Color(0xFF10B981)),
            )
          else
            Switch(
              value: user.isAvailable,
              activeThumbColor: const Color(0xFF10B981),
              onChanged: _toggleAvailability,
            ),
        ],
      ),
    );
  }

  Widget _buildStatsRow() {
    final avg = (_stats?['average'] as num?)?.toStringAsFixed(1) ?? '-';
    final total = _stats?['total']?.toString() ?? '0';
    return Row(
      children: [
        _statCard(Icons.star_rounded, avg, 'Note moy.', const Color(0xFFF59E0B)),
        const SizedBox(width: 12),
        _statCard(Icons.delivery_dining, total, 'Avis reçus', const Color(0xFF3B82F6)),
      ],
    );
  }

  Widget _statCard(IconData icon, String value, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTile() {
    return Material(
      color: const Color(0xFF1E293B),
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => pushAdaptive<void>(
          context,
          const OrderHistoryScreen(),
        ),
        child: const Padding(
          padding: EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.history, color: Color(0xFF0EA5E9), size: 24),
              SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Mes courses',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Voir l\'historique de mes livraisons',
                      style: TextStyle(color: Colors.white60, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white38),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSection(String title, Widget content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(16),
          ),
          child: content,
        ),
      ],
    );
  }

  Widget _buildProfileFields() {
    return Column(
      children: [
        _field('Prénom', _firstNameCtrl, Icons.person_outline),
        const SizedBox(height: 12),
        _field('Nom', _lastNameCtrl, Icons.person_outline),
        const SizedBox(height: 12),
        _field('Téléphone', TextEditingController(text: _user?.phone ?? ''), Icons.phone_outlined, readOnly: true),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saveProfile,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Enregistrer', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  Widget _buildVehicleFields() {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: _vehicleType,
          dropdownColor: const Color(0xFF0F172A),
          decoration: _inputDecoration('Type de véhicule', Icons.two_wheeler),
          style: const TextStyle(color: Colors.white),
          items: const [
            DropdownMenuItem(value: 'MOTO', child: Text('Moto')),
            DropdownMenuItem(value: 'VOITURE', child: Text('Voiture')),
            DropdownMenuItem(value: 'TRICYCLE', child: Text('Tricycle')),
          ],
          onChanged: (v) => setState(() => _vehicleType = v ?? 'MOTO'),
        ),
        const SizedBox(height: 12),
        _field('Plaque d’immatriculation', _plateCtrl, Icons.badge_outlined),
        const SizedBox(height: 12),
        _field('Description (modèle, couleur…)', _descCtrl, Icons.info_outline),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saveVehicle,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Mettre à jour le véhicule', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  Widget _field(String label, TextEditingController ctrl, IconData icon, {bool readOnly = false}) {
    return TextField(
      controller: ctrl,
      readOnly: readOnly,
      style: const TextStyle(color: Colors.white),
      decoration: _inputDecoration(label, icon),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Colors.white54),
      prefixIcon: Icon(icon, color: Colors.white60),
      filled: true,
      fillColor: const Color(0xFF0F172A),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
      ),
    );
  }
}
