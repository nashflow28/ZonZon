import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import '../config/env.dart';
import '../router/app_router.dart';
import '../services/auth_service.dart';
import '../utils/platform_adapter.dart';
import '../widgets/phone_field.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();

  String _role = 'CLIENT';
  String _vehicleType = 'MOTO';
  String _fullPhone = '+228';
  bool _isLoading = false;
  bool _obscure = true;

  /// Photo de profil, OBLIGATOIRE pour le rôle LIVREUR (CDC §2 : le coursier
  /// s'enregistre avec nom, prénoms, téléphone, type d'engin ET photo de
  /// profil). Optionnelle pour les autres rôles (non demandée dans l'UI).
  final ImagePicker _picker = ImagePicker();
  XFile? _profilePhoto;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _pickProfilePhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      imageQuality: 80,
    );
    if (picked == null || !mounted) return;
    setState(() => _profilePhoto = picked);
  }

  /// Envoie la photo de profil sur `POST /users/me/photo` avec le token
  /// émis par l'inscription, avant de publier la session localement.
  Future<bool> _uploadProfilePhoto(XFile photo, String accessToken) async {
    try {
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
            ..headers['Authorization'] = 'Bearer $accessToken'
            ..files.add(
              await http.MultipartFile.fromPath(
                'file',
                photo.path,
                contentType: mimeFromPath(photo.path),
              ),
            );

      final response = await request.send();
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (_) {
      return false;
    }
  }

  Future<void> _submit() async {
    if (_firstNameController.text.trim().isEmpty ||
        _lastNameController.text.trim().isEmpty ||
        _phoneController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      showAdaptiveSnack(context, 'Veuillez remplir tous les champs.');
      return;
    }
    // CDC §2 : la photo de profil fait partie des prérequis d'inscription
    // du coursier (avec nom, prénoms, téléphone et type d'engin).
    if (_role == 'LIVREUR' && _profilePhoto == null) {
      showAdaptiveSnack(
        context,
        'La photo de profil est obligatoire pour les livreurs.',
        isError: true,
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final result = await AuthService().register(
        firstName: _firstNameController.text.trim(),
        lastName: _lastNameController.text.trim(),
        phone: _fullPhone,
        password: _passwordController.text,
        role: _role,
        vehicleType: _role == 'LIVREUR' ? _vehicleType : null,
        persistSession: false,
      );

      // Tant que la photo n'est pas réellement envoyée, on ne publie PAS la
      // session locale. Cela évite toute sortie prématurée du flux d'inscription.
      if (_profilePhoto != null) {
        var uploaded = await _uploadProfilePhoto(
          _profilePhoto!,
          result.accessToken,
        );
        while (!uploaded) {
          if (!mounted) return;
          final action = await showDialog<String>(
            context: context,
            barrierDismissible: false,
            builder: (ctx) => AlertDialog(
              backgroundColor: const Color(0xFF122530),
              title: const Text(
                'Photo non envoyée',
                style: TextStyle(color: Colors.white),
              ),
              content: const Text(
                'La photo de profil est obligatoire pour les livreurs. '
                'Vérifiez votre connexion puis réessayez, ou choisissez '
                'une autre photo.',
                style: TextStyle(color: Colors.white70),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, 'change'),
                  child: const Text(
                    'Changer de photo',
                    style: TextStyle(color: Colors.white70),
                  ),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(ctx, 'retry'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E90FA),
                  ),
                  child: const Text(
                    'Réessayer',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
          );
          if (!mounted) return;
          if (action == 'change') {
            await _pickProfilePhoto();
          }
          if (_profilePhoto != null) {
            uploaded = await _uploadProfilePhoto(
              _profilePhoto!,
              result.accessToken,
            );
          }
        }
        if (!mounted) return;
      }

      await AuthService().persistSession(result);
      if (!mounted) return;
      // Redirect to the role-appropriate home, clearing the back-stack.
      final user = result.user;
      if (!mounted) return;
      context.go(AppRoutes.homeForRole(user.role));
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, 'Inscription échouée : $e', isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Créer un compte',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: Stack(
        children: [
          Positioned(
            bottom: -120,
            left: -80,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF0FB271).withValues(alpha: 0.3),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: const Color(0xFF122530).withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.1),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildInput(
                          controller: _firstNameController,
                          icon: Icons.person_outline,
                          hint: 'Prénom',
                        ),
                        const SizedBox(height: 12),
                        _buildInput(
                          controller: _lastNameController,
                          icon: Icons.person,
                          hint: 'Nom',
                        ),
                        const SizedBox(height: 12),
                        PhoneField(
                          controller: _phoneController,
                          onFullNumberChanged: (full) => _fullPhone = full,
                        ),
                        const SizedBox(height: 12),
                        _buildInput(
                          controller: _passwordController,
                          icon: Icons.lock_outline,
                          hint: 'Mot de passe',
                          obscure: _obscure,
                          suffix: IconButton(
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                              color: Colors.white60,
                            ),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Je suis :',
                          style: TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: _buildRoleOption(
                                'CLIENT',
                                'Client',
                                Icons.person,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _buildRoleOption(
                                'LIVREUR',
                                'Livreur',
                                Icons.motorcycle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _buildRoleOption(
                                'COMMERCANT',
                                'Commerçant',
                                Icons.storefront,
                              ),
                            ),
                          ],
                        ),
                        if (_role == 'LIVREUR') ...[
                          const SizedBox(height: 18),
                          const Text(
                            'Type d’engin :',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.08),
                              ),
                            ),
                            child: DropdownButton<String>(
                              value: _vehicleType,
                              isExpanded: true,
                              underline: const SizedBox(),
                              dropdownColor: const Color(0xFF122530),
                              iconEnabledColor: const Color(0xFF2E90FA),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: 'MOTO',
                                  child: Text('Moto'),
                                ),
                                DropdownMenuItem(
                                  value: 'VOITURE',
                                  child: Text('Voiture'),
                                ),
                                DropdownMenuItem(
                                  value: 'TRICYCLE',
                                  child: Text('Tricycle'),
                                ),
                              ],
                              onChanged: (v) =>
                                  setState(() => _vehicleType = v ?? 'MOTO'),
                            ),
                          ),
                          const SizedBox(height: 18),
                          const Text(
                            'Photo de profil (obligatoire) :',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _buildProfilePhotoPicker(),
                        ],
                        const SizedBox(height: 28),
                        Container(
                          height: 58,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            gradient: const LinearGradient(
                              colors: [Color(0xFF2E90FA), Color(0xFF2E90FA)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(
                                  0xFF2E90FA,
                                ).withValues(alpha: 0.45),
                                blurRadius: 20,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: ElevatedButton(
                            onPressed: _isLoading ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              shadowColor: Colors.transparent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(18),
                              ),
                            ),
                            child: _isLoading
                                ? adaptiveLoader(color: Colors.white)
                                : const Text(
                                    'Créer mon compte',
                                    style: TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Sélecteur de photo de profil livreur : aperçu circulaire + bouton.
  /// La validation d'obligation est faite dans [_submit].
  Widget _buildProfilePhotoPicker() {
    final photo = _profilePhoto;
    return GestureDetector(
      onTap: _isLoading ? null : _pickProfilePhoto,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: photo != null
                ? const Color(0xFF0FB271)
                : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              backgroundImage: photo != null
                  ? FileImage(File(photo.path))
                  : null,
              child: photo == null
                  ? const Icon(
                      Icons.add_a_photo_outlined,
                      color: Color(0xFF2E90FA),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                photo != null
                    ? 'Photo sélectionnée — touchez pour changer'
                    : 'Ajouter ma photo de profil',
                style: TextStyle(
                  color: photo != null
                      ? const Color(0xFF0FB271)
                      : Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (photo != null)
              const Icon(
                Icons.check_circle,
                color: Color(0xFF0FB271),
                size: 20,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleOption(String value, String label, IconData icon) {
    final selected = _role == value;
    return GestureDetector(
      onTap: () => setState(() => _role = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFF2E90FA).withValues(alpha: 0.25)
              : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected
                ? const Color(0xFF2E90FA)
                : Colors.white.withValues(alpha: 0.08),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: selected ? const Color(0xFF2E90FA) : Colors.white60,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : Colors.white70,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInput({
    required TextEditingController controller,
    required IconData icon,
    required String hint,
    TextInputType? keyboardType,
    bool obscure = false,
    Widget? suffix,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboardType,
        style: const TextStyle(color: Colors.white, fontSize: 16),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
          prefixIcon: Icon(icon, color: const Color(0xFF2E90FA)),
          suffixIcon: suffix,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 18,
          ),
        ),
      ),
    );
  }
}
