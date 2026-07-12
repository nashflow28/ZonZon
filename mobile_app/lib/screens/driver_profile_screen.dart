import 'dart:convert';
import 'dart:typed_data';
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
import '../services/merchant_drivers_service.dart';
import '../services/notifications_service.dart';
import '../screens/order_history_screen.dart';
import '../utils/affiliation_status_utils.dart';
import '../screens/notifications_screen.dart';
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
  final _merchantDriversService = MerchantDriversService();
  final _notificationsService = NotificationsService();
  final _picker = ImagePicker();

  User? _user;
  Uint8List? _idCardBytes;
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _stats;
  bool _loading = true;
  bool _loadingIdCard = false;
  bool _togglingAvailability = false;
  bool _togglingVisibility = false;
  bool _uploadingIdCard = false;
  int _unreadNotificationsCount = 0;
  int _estimatedEarningsFcfa = 0;
  List<DriverAffiliationInvite> _affiliations = const [];
  final Map<String, bool> _respondingAffiliations = <String, bool>{};

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _vehicleType = 'MOTO';

  /// Zones actives récupérées via `GET /zones`, pour le sélecteur de zone
  /// habituelle du véhicule. Chaque entrée contient au moins `id` et `name`.
  List<Map<String, dynamic>> _zones = [];
  String? _selectedZoneId;

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
        _api.get('/zones'),
        _api.get('/orders/mine'),
      ]);

      final userRes = results[0];
      final vehicleRes = results[1];
      final zonesRes = results[2];
      final ordersRes = results[3];

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

        await _loadIdCardPreview();
      }

      if (vehicleRes.statusCode == 200) {
        _vehicle = jsonDecode(vehicleRes.body) as Map<String, dynamic>;
        _vehicleType = _vehicle!['type'] ?? 'MOTO';
        _plateCtrl.text = _vehicle!['licensePlate'] ?? '';
        _descCtrl.text = _vehicle!['description'] ?? '';
        final usualZone = _vehicle!['usualZone'];
        _selectedZoneId = usualZone is Map ? usualZone['id'] as String? : null;
      }

      if (zonesRes.statusCode == 200) {
        final decoded = jsonDecode(zonesRes.body);
        if (decoded is List) {
          _zones = decoded
              .whereType<Map>()
              .map((m) => Map<String, dynamic>.from(m))
              .toList();
        }
      }

      if (ordersRes.statusCode == 200) {
        final decoded = jsonDecode(ordersRes.body);
        if (decoded is List) {
          _estimatedEarningsFcfa = decoded
              .whereType<Map>()
              .map((m) => Map<String, dynamic>.from(m))
              .where((m) => m['status']?.toString() == 'COMPLETED')
              .fold<int>(0, (sum, m) {
                final raw = m['priceFcfa'];
                final value = raw is int
                    ? raw
                    : raw is num
                    ? raw.toInt()
                    : int.tryParse(raw?.toString() ?? '') ?? 0;
                return sum + value;
              });
        }
      }

      try {
        _affiliations = await _merchantDriversService.getDriverAffiliations();
      } catch (_) {
        _affiliations = const [];
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

  Future<void> _loadIdCardPreview() async {
    final user = _user;
    if (user == null) return;

    setState(() => _loadingIdCard = true);
    try {
      final res = await _api.get('/users/${user.id}/id-card-photo');
      if (res.statusCode == 200) {
        _idCardBytes = res.bodyBytes;
      } else {
        _idCardBytes = null;
      }
    } catch (_) {
      _idCardBytes = null;
    } finally {
      if (mounted) setState(() => _loadingIdCard = false);
    }
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

  Future<void> _pickAndUploadIdCardPhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      imageQuality: 80,
    );
    if (picked == null) return;

    setState(() => _uploadingIdCard = true);
    try {
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
              Uri.parse('$apiUrl$apiPrefix/users/me/id-card-photo'),
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
          showAdaptiveSnack(context, 'Pièce d\'identité mise à jour');
        }
      }
    } finally {
      if (mounted) setState(() => _uploadingIdCard = false);
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
    }
  }

  Future<void> _saveVehicle() async {
    final body = <String, dynamic>{'type': _vehicleType};
    if (_plateCtrl.text.trim().isNotEmpty) {
      body['licensePlate'] = _plateCtrl.text.trim();
    }
    if (_descCtrl.text.trim().isNotEmpty) {
      body['description'] = _descCtrl.text.trim();
    }
    // Toujours envoyé explicitement (y compris `null`) pour permettre le
    // retrait de la zone habituelle quand "Aucune" est sélectionnée.
    body['usualZoneId'] = _selectedZoneId;

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
        effective
            ? 'Vous êtes maintenant disponible'
            : 'Vous êtes maintenant indisponible',
      );
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

  Future<void> _toggleVisibility(bool value) async {
    if (_user == null || _togglingVisibility) return;
    setState(() => _togglingVisibility = true);
    try {
      final effective = await _driverService.setVisibility(value);
      if (!mounted) return;
      setState(() {
        _user = _user!.copyWith(isPublic: effective);
      });
      showAdaptiveSnack(
        context,
        effective
            ? 'Vous recevez à nouveau les courses publiques'
            : 'Vous ne recevez plus que les courses assignées par un commerçant',
      );
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _togglingVisibility = false);
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

  Future<void> _respondToAffiliation(
    DriverAffiliationInvite invite,
    String action,
  ) async {
    final merchantId = invite.merchantId;
    if (merchantId.isEmpty || _respondingAffiliations[merchantId] == true) {
      return;
    }
    setState(() => _respondingAffiliations[merchantId] = true);
    try {
      final response = await _merchantDriversService.respondToAffiliation(
        merchantId: merchantId,
        action: action,
      );
      if (!mounted) return;
      setState(() {
        _affiliations = _affiliations
            .map(
              (item) => item.merchantId == merchantId
                  ? DriverAffiliationInvite(
                      merchantId: item.merchantId,
                      status: response.status,
                      createdAt: item.createdAt,
                      acceptedAt: response.acceptedAt ?? item.acceptedAt,
                      removedAt: response.removedAt ?? item.removedAt,
                      merchant: item.merchant,
                    )
                  : item,
            )
            .toList();
      });
      showAdaptiveSnack(
        context,
        action == 'accept' ? 'Affiliation acceptée.' : 'Invitation refusée.',
      );
    } catch (e) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _respondingAffiliations.remove(merchantId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Center(child: adaptiveLoader(color: const Color(0xFF0FB271)));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: adaptiveConstrainedContent(
        maxWidth: 760,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: _NotificationsBellButton(
                unreadCount: _unreadNotificationsCount,
                onTap: _openNotifications,
              ),
            ),
            _buildPhotoSection(),
            const SizedBox(height: 24),
            _buildAvailabilitySection(),
            const SizedBox(height: 16),
            _buildVisibilitySection(),
            const SizedBox(height: 16),
            _buildStatsRow(),
            const SizedBox(height: 16),
            _buildSection(
              'Affiliations commerçants',
              _buildAffiliationsSection(),
            ),
            const SizedBox(height: 16),
            _buildHistoryTile(),
            const SizedBox(height: 16),
            _buildSection('Informations personnelles', _buildProfileFields()),
            const SizedBox(height: 16),
            _buildSection('Pièce d\'identité', _buildIdCardSection()),
            const SizedBox(height: 16),
            _buildSection('Mon véhicule', _buildVehicleFields()),
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

  String mediaUrl(String path) {
    final uri = Uri.tryParse(path);
    if (uri != null && uri.hasScheme) return path;
    return '$apiUrl$path';
  }

  /// Section "Pièce d'identité" : vignette (rectangle) de la pièce
  /// d'identité actuelle ou un placeholder, avec un bouton d'upload vers
  /// `POST /users/me/id-card-photo`.
  Widget _buildIdCardSection() {
    final idCardBytes = _idCardBytes;
    final needsIdCard = _user?.isDriverApproved == false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: double.infinity,
            height: 160,
            color: const Color(0xFF0C1A22),
            child: _loadingIdCard
                ? const Center(
                    child: CircularProgressIndicator(color: Color(0xFF2E90FA)),
                  )
                : idCardBytes != null
                ? Image.memory(
                    idCardBytes,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) =>
                        _idCardPlaceholder(),
                  )
                : _idCardPlaceholder(),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _uploadingIdCard ? null : _pickAndUploadIdCardPhoto,
            icon: _uploadingIdCard
                ? SizedBox(
                    width: 16,
                    height: 16,
                    child: adaptiveLoader(color: const Color(0xFF2E90FA)),
                  )
                : const Icon(Icons.upload_outlined, color: Color(0xFF2E90FA)),
            label: Text(
              idCardBytes != null ? 'Changer la pièce d\'identité' : 'Ajouter',
              style: const TextStyle(color: Color(0xFF2E90FA)),
            ),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFF2E90FA)),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        if (needsIdCard) ...[
          const SizedBox(height: 10),
          const Text(
            'La pièce d\'identité est nécessaire à la validation de votre compte par un administrateur.',
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ],
      ],
    );
  }

  Widget _idCardPlaceholder() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.badge_outlined, color: Colors.white38, size: 36),
          SizedBox(height: 8),
          Text(
            'Aucune pièce d\'identité',
            style: TextStyle(color: Colors.white54, fontSize: 13),
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
      final color = isRejected
          ? const Color(0xFFF0453D)
          : const Color(0xFFFF9E1B);
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
                      fontSize: 14,
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

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(
            user.isAvailable ? Icons.wifi_tethering : Icons.wifi_tethering_off,
            color: user.isAvailable ? const Color(0xFF0FB271) : Colors.white38,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              user.isAvailable ? 'Disponible' : 'Indisponible',
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
              value: user.isAvailable,
              activeThumbColor: const Color(0xFF0FB271),
              onChanged: _toggleAvailability,
            ),
        ],
      ),
    );
  }

  /// Section « Visibilité » : bascule `isPublic` pour recevoir (ou non) les
  /// courses du broadcast général. Indépendante de la disponibilité : un
  /// livreur peut être disponible mais privé (assignation manuelle only).
  Widget _buildVisibilitySection() {
    final user = _user;
    if (user == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                user.isPublic ? Icons.public : Icons.lock_outline,
                color: user.isPublic ? const Color(0xFF2E90FA) : Colors.white38,
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Recevoir les courses publiques',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ),
              if (_togglingVisibility)
                SizedBox(
                  width: 24,
                  height: 24,
                  child: adaptiveLoader(color: const Color(0xFF2E90FA)),
                )
              else
                Switch(
                  value: user.isPublic,
                  activeThumbColor: const Color(0xFF2E90FA),
                  onChanged: _toggleVisibility,
                ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Désactivé, vous ne recevez que les courses assignées par un commerçant.',
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsRow() {
    final avg = (_stats?['average'] as num?)?.toStringAsFixed(1) ?? '-';
    final total = _stats?['total']?.toString() ?? '0';
    return Column(
      children: [
        Row(
          children: [
            _statCard(
              Icons.star_rounded,
              avg,
              'Note moy.',
              const Color(0xFFFF9E1B),
            ),
            const SizedBox(width: 12),
            _statCard(
              Icons.delivery_dining,
              total,
              'Avis reçus',
              const Color(0xFF2E90FA),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _wideStatCard(
          Icons.account_balance_wallet_outlined,
          _formatPrice(_estimatedEarningsFcfa),
          'Gains estimés (courses terminées)',
          const Color(0xFF0FB271),
        ),
      ],
    );
  }

  Widget _statCard(IconData icon, String value, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF122530),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  label,
                  style: const TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _wideStatCard(IconData icon, String value, String label, Color color) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  label,
                  style: const TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAffiliationsSection() {
    if (_affiliations.isEmpty) {
      return const Text(
        'Aucune invitation ou affiliation commerçant pour le moment.',
        style: TextStyle(color: Colors.white60, fontSize: 13),
      );
    }

    return Column(
      children: _affiliations.map((invite) {
        final merchant = invite.merchant;
        final merchantName = merchant?.fullName.trim().isNotEmpty == true
            ? merchant!.fullName
            : 'Commerçant';
        final color = AffiliationStatusUtils.color(invite.status);
        final busy = _respondingAffiliations[invite.merchantId] == true;
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF0C1A22),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          merchantName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if ((merchant?.phone ?? '').trim().isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            merchant!.phone!,
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: color.withValues(alpha: 0.45)),
                    ),
                    child: Text(
                      AffiliationStatusUtils.label(invite.status),
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              if (invite.isPending) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () => _respondToAffiliation(invite, 'reject'),
                        icon: const Icon(Icons.close, color: Color(0xFFF0453D)),
                        label: const Text(
                          'Refuser',
                          style: TextStyle(color: Color(0xFFF0453D)),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFFF0453D)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: busy
                            ? null
                            : () => _respondToAffiliation(invite, 'accept'),
                        icon: busy
                            ? SizedBox(
                                width: 16,
                                height: 16,
                                child: adaptiveLoader(color: Colors.white),
                              )
                            : const Icon(Icons.check, color: Colors.white),
                        label: const Text(
                          'Accepter',
                          style: TextStyle(color: Colors.white),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0FB271),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      }).toList(),
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

  Widget _buildVehicleFields() {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          initialValue: _vehicleType,
          dropdownColor: const Color(0xFF0C1A22),
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
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          initialValue: _selectedZoneId,
          dropdownColor: const Color(0xFF0C1A22),
          decoration: _inputDecoration('Zone habituelle', Icons.map_outlined),
          style: const TextStyle(color: Colors.white),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Aucune')),
            ..._zones.map(
              (z) => DropdownMenuItem<String?>(
                value: z['id'] as String?,
                child: Text(z['name']?.toString() ?? ''),
              ),
            ),
          ],
          onChanged: (v) => setState(() => _selectedZoneId = v),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saveVehicle,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0FB271),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              'Mettre à jour le véhicule',
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

  String _formatPrice(int value) {
    final raw = value.toString();
    final buffer = StringBuffer();
    for (int i = 0; i < raw.length; i++) {
      if (i > 0 && (raw.length - i) % 3 == 0) buffer.write(' ');
      buffer.write(raw[i]);
    }
    return '$buffer FCFA';
  }
}

/// Bouton icône cloche avec badge de non-lus, discret, pour accéder à
/// l'écran des notifications in-app depuis le profil livreur.
class _NotificationsBellButton extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onTap;

  const _NotificationsBellButton({
    required this.unreadCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              const Icon(
                Icons.notifications_outlined,
                color: Colors.white70,
                size: 26,
              ),
              if (unreadCount > 0)
                Positioned(
                  top: -2,
                  right: -4,
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
                        color: const Color(0xFF0C1A22),
                        width: 1.5,
                      ),
                    ),
                    child: Text(
                      unreadCount > 99 ? '99+' : '$unreadCount',
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
        ),
      ),
    );
  }
}
