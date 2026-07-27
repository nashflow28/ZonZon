import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';

/// Rouge destructif ZonZon, partagé par le dialogue et la section « Zone de
/// danger » des trois profils (client, livreur, commerçant).
const Color kDeleteAccountDanger = Color(0xFFF0453D);

/// Signature de l'appel réseau de suppression. Injectable pour permettre de
/// tester le dialogue sans toucher au stockage sécurisé ni au réseau.
typedef DeleteAccountSubmit = Future<void> Function(String password);

/// Dialogue de suppression de compte, en deux temps :
/// 1. explication de ce qui est supprimé et de ce qui est conservé ;
/// 2. saisie du mot de passe actuel pour confirmer.
///
/// Renvoie `true` uniquement si le compte a réellement été supprimé (200 côté
/// backend) ; `false` ou `null` si l'utilisateur a renoncé.
Future<bool?> showDeleteAccountDialog(
  BuildContext context, {
  DeleteAccountSubmit? onSubmit,
}) {
  return showDialog<bool>(
    context: context,
    // Action irréversible : on n'autorise pas la fermeture par un tap à côté,
    // et surtout pas pendant l'appel réseau.
    barrierDismissible: false,
    builder: (_) => _DeleteAccountDialog(
      onSubmit: onSubmit ?? AuthService().deleteAccount,
    ),
  );
}

class _DeleteAccountDialog extends StatefulWidget {
  final DeleteAccountSubmit onSubmit;

  const _DeleteAccountDialog({required this.onSubmit});

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _passwordController = TextEditingController();

  /// `false` = étape d'explication, `true` = étape de saisie du mot de passe.
  bool _confirmStep = false;
  bool _loading = false;
  bool _hidePassword = true;
  String? _error;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  void _goToConfirmStep() {
    setState(() {
      _confirmStep = true;
      _error = null;
    });
  }

  void _backToInfoStep() {
    if (_loading) return;
    setState(() {
      _confirmStep = false;
      _error = null;
      _passwordController.clear();
    });
  }

  Future<void> _submit() async {
    // Garde-fou anti double suppression : le bouton est déjà désactivé pendant
    // le chargement, on re-vérifie ici au cas où (double tap très rapide).
    if (_loading) return;

    final password = _passwordController.text;
    if (password.isEmpty) {
      setState(() => _error = 'Saisissez votre mot de passe pour confirmer.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.onSubmit(password);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _messageFor(error);
      });
    }
  }

  /// Les refus du backend (403 mot de passe incorrect, 409 course en cours)
  /// sont affichés tels quels ; le reste (réseau, timeout, DNS) passe par le
  /// formatage commun de l'application.
  String _messageFor(Object error) {
    if (error is DeleteAccountException) return error.message;
    return apiErrorMessage(error);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF122530),
      title: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: kDeleteAccountDanger),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _confirmStep ? 'Confirmer la suppression' : 'Supprimer mon compte',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: _confirmStep ? _buildConfirmStep() : _buildInfoStep(),
        ),
      ),
      actions: _confirmStep ? _confirmActions() : _infoActions(),
    );
  }

  Widget _buildInfoStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Cette action est définitive et irréversible. Vous ne pourrez plus vous connecter avec ce compte.',
          style: TextStyle(color: Colors.white, fontSize: 14),
        ),
        const SizedBox(height: 16),
        _bullet(
          icon: Icons.delete_outline,
          color: kDeleteAccountDanger,
          title: 'Ce qui est supprimé',
          text:
              'Vos données personnelles : prénom, nom, numéro de téléphone, photo de profil et pièce d\'identité.',
        ),
        const SizedBox(height: 12),
        _bullet(
          icon: Icons.inventory_2_outlined,
          color: const Color(0xFF8FA6AE),
          title: 'Ce qui est conservé',
          text:
              'L\'historique de vos livraisons, sous forme anonymisée, pour des raisons comptables et légales.',
        ),
      ],
    );
  }

  Widget _bullet({
    required IconData icon,
    required Color color,
    required String title,
    required String text,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                text,
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildConfirmStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Saisissez votre mot de passe actuel pour confirmer la suppression définitive de votre compte.',
          style: TextStyle(color: Colors.white70, fontSize: 14),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _passwordController,
          obscureText: _hidePassword,
          enabled: !_loading,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(
            labelText: 'Mot de passe actuel',
            labelStyle: const TextStyle(color: Colors.white60),
            suffixIcon: IconButton(
              tooltip: _hidePassword ? 'Afficher' : 'Masquer',
              onPressed: () => setState(() => _hidePassword = !_hidePassword),
              icon: Icon(
                _hidePassword
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
                color: Colors.white54,
              ),
            ),
            filled: true,
            fillColor: const Color(0xFF0C1A22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: kDeleteAccountDanger),
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: const TextStyle(
              color: kDeleteAccountDanger,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }

  List<Widget> _infoActions() {
    return [
      TextButton(
        onPressed: () => Navigator.of(context).pop(false),
        child: const Text('Annuler'),
      ),
      ElevatedButton(
        onPressed: _goToConfirmStep,
        style: ElevatedButton.styleFrom(
          backgroundColor: kDeleteAccountDanger,
          foregroundColor: Colors.white,
        ),
        child: const Text('Continuer'),
      ),
    ];
  }

  List<Widget> _confirmActions() {
    return [
      TextButton(
        onPressed: _loading ? null : _backToInfoStep,
        child: const Text('Retour'),
      ),
      ElevatedButton(
        onPressed: _loading ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: kDeleteAccountDanger,
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
            : const Text('Supprimer définitivement'),
      ),
    ];
  }
}
