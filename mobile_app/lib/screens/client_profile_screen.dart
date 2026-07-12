import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/env.dart';
import '../utils/media_url.dart';
import '../models/user.dart';
import '../router/app_router.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/client_services.dart';
import '../services/notifications_service.dart';
import '../screens/order_history_screen.dart';
import '../screens/notifications_screen.dart';
import '../utils/platform_adapter.dart';

class ClientProfileScreen extends StatefulWidget {
  const ClientProfileScreen({super.key});

  @override
  State<ClientProfileScreen> createState() => _ClientProfileScreenState();
}

class _ClientProfileScreenState extends State<ClientProfileScreen> {
  final _api = ApiClient();
  final _auth = AuthService();
  final _picker = ImagePicker();
  final _notificationsService = NotificationsService();

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
    if (mounted) setState(() => _loading = false);
  }

  /// Charge le nombre de notifications non lues pour afficher le badge sur
  /// l'icône cloche. Non bloquant : échec silencieux (badge à 0).
  Future<void> _loadUnreadNotificationsCount() async {
    try {
      final notifications = await _notificationsService.listAll();
      if (!mounted) return;
      setState(() {
        _unreadNotificationsCount = notifications
            .where((n) => n.isUnread)
            .length;
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
    MediaType mimeFromPath(String p) {
      final ext = p.toLowerCase().split('.').last;
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
    if (res.statusCode == 200 || res.statusCode == 201) {
      await _load();
      if (mounted) {
        showAdaptiveSnack(context, 'Profil mis à jour');
      }
    } else {
      if (mounted) {
        showAdaptiveSnack(
          context,
          'Erreur lors de la mise à jour',
          isError: true,
        );
      }
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
    // Libère socket + store côté client avant le clear du token.
    await ClientServices.reset();
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
          'Mon profil',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        elevation: 0,
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
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 1,
                    ),
                    constraints: const BoxConstraints(
                      minWidth: 16,
                      minHeight: 16,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0453D),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: const Color(0xFF122530),
                        width: 1.5,
                      ),
                    ),
                    child: Text(
                      _unreadNotificationsCount > 99
                          ? '99+'
                          : '$_unreadNotificationsCount',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        height: 1.2,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF2E90FA)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: adaptiveConstrainedContent(
                maxWidth: 720,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildPhotoSection(),
                    const SizedBox(height: 24),
                    _buildHistoryTile(),
                    const SizedBox(height: 16),
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
                    const SizedBox(height: 32),
                  ],
                ),
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
                  color: Color(0xFF2E90FA),
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

  Widget _buildHistoryTile() {
    return Material(
      color: const Color(0xFF122530),
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => pushAdaptive<void>(context, const OrderHistoryScreen()),
        child: const Padding(
          padding: EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.history, color: Color(0xFF2E90FA), size: 24),
              SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Mes commandes',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Voir l\'historique de mes commandes',
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
              backgroundColor: const Color(0xFF2E90FA),
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
      decoration: _inputDecoration(label, icon),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
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
        borderSide: const BorderSide(color: Color(0xFF2E90FA)),
      ),
    );
  }
}
