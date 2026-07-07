import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../services/auth_service.dart';
import '../utils/platform_adapter.dart';
import '../widgets/phone_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  String _fullPhone = '+228';
  bool _isLoading = false;
  bool _obscure = true;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_phoneController.text.trim().isEmpty || _passwordController.text.isEmpty) {
      showAdaptiveSnack(context, 'Veuillez remplir tous les champs.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final result = await AuthService().login(_fullPhone, _passwordController.text);
      if (!mounted) return;
      context.go(AppRoutes.homeForRole(result.user.role));
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, _loginErrorMessage(e), isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Construit le message affiché à l'utilisateur à partir de l'erreur
  /// remontée par [AuthService.login]. Le service propage déjà le message
  /// backend (champ `message` du corps de réponse) via `Exception(...)`,
  /// mais `Exception.toString()` préfixe le texte par "Exception: ". On
  /// nettoie ce préfixe pour afficher le message backend tel quel — en
  /// particulier "Compte suspendu. Contactez le support." (401) — et on
  /// garde un message générique de secours si l'erreur n'est pas exploitable.
  String _loginErrorMessage(Object error) {
    var message = error.toString();
    const prefix = 'Exception: ';
    if (message.startsWith(prefix)) {
      message = message.substring(prefix.length);
    }
    if (message.trim().isEmpty) {
      return 'Identifiants incorrects. Veuillez réessayer.';
    }
    return message;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          Positioned(
            top: -120,
            right: -80,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF0EA5E9).withValues(alpha: 0.35),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                    child: Container(
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B).withValues(alpha: 0.7),
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Icon(Icons.delivery_dining, size: 70, color: Color(0xFF0EA5E9)),
                          const SizedBox(height: 12),
                          const Text(
                            'ZonZon',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 1.5),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Connectez-vous pour continuer',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white60, fontSize: 14),
                          ),
                          const SizedBox(height: 28),
                          PhoneField(
                            controller: _phoneController,
                            onFullNumberChanged: (full) => _fullPhone = full,
                          ),
                          const SizedBox(height: 14),
                          _buildInput(
                            controller: _passwordController,
                            icon: Icons.lock_outline,
                            hint: 'Mot de passe',
                            obscure: _obscure,
                            suffix: IconButton(
                              icon: Icon(
                                _obscure ? Icons.visibility_off : Icons.visibility,
                                color: Colors.white60,
                              ),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                          ),
                          const SizedBox(height: 24),
                          Container(
                            height: 58,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(18),
                              gradient: const LinearGradient(colors: [Color(0xFF0EA5E9), Color(0xFF3B82F6)]),
                              boxShadow: [
                                BoxShadow(color: const Color(0xFF0EA5E9).withValues(alpha: 0.45), blurRadius: 20, offset: const Offset(0, 6)),
                              ],
                            ),
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.transparent,
                                shadowColor: Colors.transparent,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                              ),
                              child: _isLoading
                                  ? adaptiveLoader(color: Colors.white)
                                  : const Text(
                                      'Se connecter',
                                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0.4),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          TextButton(
                            onPressed: _isLoading
                                ? null
                                : () => context.push(AppRoutes.register),
                            child: RichText(
                              text: const TextSpan(
                                style: TextStyle(color: Colors.white60, fontSize: 14),
                                children: [
                                  TextSpan(text: 'Pas encore de compte ? '),
                                  TextSpan(
                                    text: 'Créer un compte',
                                    style: TextStyle(color: Color(0xFF0EA5E9), fontWeight: FontWeight.bold),
                                  ),
                                ],
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
          ),
        ],
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
          prefixIcon: Icon(icon, color: const Color(0xFF0EA5E9)),
          suffixIcon: suffix,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        ),
      ),
    );
  }
}
