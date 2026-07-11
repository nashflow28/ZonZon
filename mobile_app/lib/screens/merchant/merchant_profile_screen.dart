import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';

import '../../config/env.dart';
import '../../utils/media_url.dart';
import '../../models/user.dart';
import '../../router/app_router.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/notifications_service.dart';
import '../../utils/platform_adapter.dart';
import 'create_delivery_screen.dart';
import 'merchant_drivers_screen.dart';
import 'merchant_orders_screen.dart';
import '../notifications_screen.dart';

class MerchantProfileScreen extends StatefulWidget {
  const MerchantProfileScreen({super.key});

  @override
  State<MerchantProfileScreen> createState() => _MerchantProfileScreenState();
}

class _MerchantProfileScreenState extends State<MerchantProfileScreen> {
  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();
  final NotificationsService _notificationsService = NotificationsService();
  final ImagePicker _picker = ImagePicker();

  User? _user;
  bool _loading = true;
  int _unreadNotificationsCount = 0;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
    _loadUnreadNotificationsCount();
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await _api.get('/users/me');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        _user = User.fromJson(data);
        _firstNameCtrl.text = _user!.firstName;
        _lastNameCtrl.text = _user!.lastName;
      }
    } catch (_) {}
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadUnreadNotificationsCount() async {
    try {
      final page = await _notificationsService.list();
      if (!mounted) return;
      setState(() {
        _unreadNotificationsCount = page.items.where((n) => n.isUnread).length;
      });
    } catch (_) {}
  }

  Future<void> _openNotifications() async {
    await pushAdaptive<void>(context, const NotificationsScreen());
    if (mounted) _loadUnreadNotificationsCount();
  }

  Future<void> _pickAndUploadPhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      imageQuality: 80,
    );
    if (picked == null) return;

    final token = await _auth.getToken();
    if (token == null || token.isEmpty) return;

    MediaType mimeFromPath(String path) {
      final ext = path.toLowerCase().split('.').last;
      return switch (ext) {
        'png' => MediaType('image', 'png'),
        'webp' => MediaType('image', 'webp'),
        _ => MediaType('image', 'jpeg'),
      };
    }

    final request =
        http.MultipartRequest(
            'POST',
            Uri.parse('$apiUrl$apiPrefix/users/me/photo'),
          )
          ..headers['Authorization'] = 'Bearer $token'
          ..files.add(
            await http.MultipartFile.fromPath(
              'file',
              picked.path,
              contentType: mimeFromPath(picked.path),
            ),
          );

    final response = await request.send();
    if (response.statusCode == 200 || response.statusCode == 201) {
      await _load();
      if (mounted) {
        showAdaptiveSnack(context, 'Photo mise à jour');
      }
    }
  }

  Future<void> _saveProfile() async {
    final res = await _api.patch(
      '/users/me',
      body: {
        'firstName': _firstNameCtrl.text.trim(),
        'lastName': _lastNameCtrl.text.trim(),
      },
    );
    if (!mounted) return;
    if (res.statusCode == 200 || res.statusCode == 201) {
      await _load();
      if (!mounted) return;
      showAdaptiveSnack(context, 'Profil commerçant mis à jour');
    } else {
      showAdaptiveSnack(
        context,
        'Erreur lors de la mise à jour',
        isError: true,
      );
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
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        foregroundColor: Colors.white,
        title: const Text(
          'Profil commerçant',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                onPressed: _openNotifications,
              ),
              if (_unreadNotificationsCount > 0)
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0453D),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _unreadNotificationsCount > 99
                          ? '99+'
                          : '$_unreadNotificationsCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildPhotoSection(),
                  const SizedBox(height: 24),
                  _buildActionTile(
                    icon: Icons.local_shipping_outlined,
                    color: const Color(0xFF0FB271),
                    title: 'Créer une livraison',
                    subtitle: 'Lancer rapidement une nouvelle course client',
                    onTap: () => pushAdaptive<bool>(
                      context,
                      const CreateDeliveryScreen(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildActionTile(
                    icon: Icons.receipt_long_outlined,
                    color: const Color(0xFF2E90FA),
                    title: 'Mes livraisons',
                    subtitle: 'Suivre statuts, paiement et conversation',
                    onTap: () => pushAdaptive<void>(
                      context,
                      const MerchantOrdersScreen(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildActionTile(
                    icon: Icons.two_wheeler,
                    color: const Color(0xFFFF9E1B),
                    title: 'Mes livreurs',
                    subtitle: 'Gérer vos affiliations et invitations',
                    onTap: () => pushAdaptive<void>(
                      context,
                      const MerchantDriversScreen(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildActionTile(
                    icon: Icons.notifications_outlined,
                    color: const Color(0xFF2E90FA),
                    title: 'Notifications',
                    subtitle: 'Consulter les alertes et messages reçus',
                    onTap: _openNotifications,
                  ),
                  const SizedBox(height: 18),
                  _buildSection(
                    'Informations personnelles',
                    _buildProfileFields(),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _logout,
                      icon: const Icon(Icons.logout, color: Colors.redAccent),
                      label: const Text(
                        'Se déconnecter',
                        style: TextStyle(color: Colors.redAccent),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.redAccent),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
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
            backgroundColor: const Color(0xFF22414D),
            backgroundImage: photoUrl != null
                ? NetworkImage(mediaUrl(photoUrl))
                : null,
            child: photoUrl == null
                ? Text(
                    ((_user?.firstName ?? '?')[0] + (_user?.lastName ?? '?')[0])
                        .toUpperCase(),
                    style: const TextStyle(
                      fontSize: 36,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
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
                  color: Color(0xFF0FB271),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(8),
                child: const Icon(
                  Icons.camera_alt,
                  color: Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: const Color(0xFF122530),
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white38),
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
        Text(
          title,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 13,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF122530),
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
        _field(
          'Téléphone',
          TextEditingController(text: _user?.phone ?? ''),
          Icons.phone_outlined,
          readOnly: true,
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saveProfile,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0FB271),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              'Enregistrer',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _field(
    String label,
    TextEditingController ctrl,
    IconData icon, {
    bool readOnly = false,
  }) {
    return TextField(
      controller: ctrl,
      readOnly: readOnly,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white54),
        prefixIcon: Icon(icon, color: Colors.white60),
        filled: true,
        fillColor: const Color(0xFF0C1A22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF0FB271)),
        ),
      ),
    );
  }
}
