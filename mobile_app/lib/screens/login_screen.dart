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
    if (_phoneController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      showAdaptiveSnack(context, 'Veuillez remplir tous les champs.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final result = await AuthService().login(
        _fullPhone,
        _passwordController.text,
      );
      if (!mounted) return;
      context.go(AppRoutes.homeForRole(result.user.role));
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, _loginErrorMessage(e), isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

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
      backgroundColor: const Color(0xFF0C1A22),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: Stack(
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
                      const Color(0xFF2E90FA).withValues(alpha: 0.35),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            SafeArea(
              child: SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.all(24),
                child: adaptiveConstrainedContent(
                  maxWidth: 520,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                      child: Container(
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: const Color(0xFF122530).withValues(alpha: 0.7),
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.1),
                          ),
                        ),
                        child: AutofillGroup(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Logo horizontal du kit (symbole + mot-symbole).
                              // Il contient deja le mot « ZonZon » : afficher
                              // le nom en texte a cote le ferait apparaitre
                              // deux fois. `semanticsLabel` conserve
                              // l'information pour les lecteurs d'ecran.
                              Image.asset(
                                'assets/brand/zonzon-horizontal-white.png',
                                height: 56,
                                fit: BoxFit.contain,
                                semanticLabel: 'ZonZon',
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'Connectez-vous pour continuer',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Colors.white60,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 28),
                              PhoneField(
                                controller: _phoneController,
                                onFullNumberChanged: (full) =>
                                    _fullPhone = full,
                                autofillHints: const [
                                  AutofillHints.telephoneNumber,
                                ],
                                onSubmitted: (_) =>
                                    FocusScope.of(context).nextFocus(),
                              ),
                              const SizedBox(height: 14),
                              _buildInput(
                                controller: _passwordController,
                                icon: Icons.lock_outline,
                                hint: 'Mot de passe',
                                obscure: _obscure,
                                textInputAction: TextInputAction.done,
                                autofillHints: const [AutofillHints.password],
                                onSubmitted: (_) => _submit(),
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
                              const SizedBox(height: 24),
                              Container(
                                height: 58,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(18),
                                  gradient: const LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Color(0xFF14C784),
                                      Color(0xFF0FB271),
                                    ],
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(
                                        0xFF0FB271,
                                      ).withValues(alpha: 0.45),
                                      blurRadius: 22,
                                      offset: const Offset(0, 8),
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
                                      ? adaptiveLoader(
                                          color: const Color(0xFF06140F),
                                        )
                                      : const Text(
                                          'Se connecter',
                                          style: TextStyle(
                                            fontSize: 17,
                                            fontWeight: FontWeight.w900,
                                            color: Color(0xFF06140F),
                                            letterSpacing: 0.3,
                                          ),
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
                                    style: TextStyle(
                                      color: Colors.white60,
                                      fontSize: 14,
                                    ),
                                    children: [
                                      TextSpan(text: 'Pas encore de compte ? '),
                                      TextSpan(
                                        text: 'Créer un compte',
                                        style: TextStyle(
                                          color: Color(0xFF2E90FA),
                                          fontWeight: FontWeight.bold,
                                        ),
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
    TextInputAction? textInputAction,
    Iterable<String>? autofillHints,
    ValueChanged<String>? onSubmitted,
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
        textInputAction: textInputAction,
        autofillHints: autofillHints,
        onSubmitted: onSubmitted,
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
