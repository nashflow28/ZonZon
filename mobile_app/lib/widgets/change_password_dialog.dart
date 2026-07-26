import 'dart:convert';

import 'package:flutter/material.dart';

import '../services/api_client.dart';

/// Dialogue partagé par les profils client, livreur et commerçant.
/// La logique réseau reste dans le service API ; les écrans ne font que
/// déclencher le dialogue et afficher le résultat.
Future<bool?> showChangePasswordDialog(
  BuildContext context, {
  Color accentColor = const Color(0xFF2E90FA),
}) {
  return showDialog<bool>(
    context: context,
    builder: (_) => _ChangePasswordDialog(accentColor: accentColor),
  );
}

class _ChangePasswordDialog extends StatefulWidget {
  final Color accentColor;

  const _ChangePasswordDialog({required this.accentColor});

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmationController = TextEditingController();
  final _api = ApiClient();
  bool _loading = false;
  bool _hideCurrent = true;
  bool _hideNew = true;
  bool _hideConfirmation = true;
  String? _error;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentController.text;
    final next = _newController.text;
    final confirmation = _confirmationController.text;
    if (current.isEmpty || next.isEmpty || confirmation.isEmpty) {
      setState(() => _error = 'Tous les champs sont obligatoires.');
      return;
    }
    if (next.length < 8) {
      setState(
        () => _error =
            'Le nouveau mot de passe doit contenir 8 caractères minimum.',
      );
      return;
    }
    if (next != confirmation) {
      setState(
        () => _error = 'Les deux nouveaux mots de passe ne correspondent pas.',
      );
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.patch(
        '/auth/password',
        body: {'currentPassword': current, 'newPassword': next},
      );
      if (!mounted) return;
      if (response.statusCode == 200 || response.statusCode == 201) {
        Navigator.of(context).pop(true);
        return;
      }
      setState(() {
        _loading = false;
        _error = _extractError(response.body);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Impossible de contacter le serveur. Réessayez.';
      });
    }
  }

  String _extractError(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final message = decoded['message'];
        if (message is List) return message.join(', ');
        return message.toString();
      }
    } catch (_) {}
    return 'Le mot de passe actuel est incorrect ou la modification a échoué.';
  }

  InputDecoration _decoration(String label, {Widget? suffix}) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Colors.white60),
      suffixIcon: suffix,
      filled: true,
      fillColor: const Color(0xFF0C1A22),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: widget.accentColor),
      ),
    );
  }

  Widget _visibilityButton(bool hidden, VoidCallback onPressed) {
    return IconButton(
      tooltip: hidden ? 'Afficher' : 'Masquer',
      onPressed: onPressed,
      icon: Icon(
        hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        color: Colors.white54,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF122530),
      title: const Text(
        'Modifier le mot de passe',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
      content: SingleChildScrollView(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _currentController,
                obscureText: _hideCurrent,
                style: const TextStyle(color: Colors.white),
                decoration: _decoration(
                  'Mot de passe actuel',
                  suffix: _visibilityButton(
                    _hideCurrent,
                    () => setState(() => _hideCurrent = !_hideCurrent),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _newController,
                obscureText: _hideNew,
                style: const TextStyle(color: Colors.white),
                decoration: _decoration(
                  'Nouveau mot de passe',
                  suffix: _visibilityButton(
                    _hideNew,
                    () => setState(() => _hideNew = !_hideNew),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmationController,
                obscureText: _hideConfirmation,
                style: const TextStyle(color: Colors.white),
                decoration: _decoration(
                  'Confirmer le nouveau mot de passe',
                  suffix: _visibilityButton(
                    _hideConfirmation,
                    () =>
                        setState(() => _hideConfirmation = !_hideConfirmation),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      color: Colors.redAccent,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(false),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: _loading ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: widget.accentColor,
            foregroundColor: Colors.white,
          ),
          child: _loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Modifier'),
        ),
      ],
    );
  }
}
