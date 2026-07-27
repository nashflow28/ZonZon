import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../router/app_router.dart';
import '../utils/platform_adapter.dart';
import 'delete_account_dialog.dart';

/// Bloc « Zone de danger » placé sous le bouton « Se déconnecter » des trois
/// profils (client, livreur, commerçant).
///
/// Volontairement séparé du reste par un filet et un intitulé propre, avec un
/// fond rouge translucide et une icône de corbeille : impossible de le
/// confondre avec la déconnexion, qui reste un bouton simplement contourné.
class DeleteAccountSection extends StatelessWidget {
  /// Uniquement pour les tests : remplace l'appel réseau réel.
  final DeleteAccountSubmit? onSubmit;

  const DeleteAccountSection({super.key, this.onSubmit});

  Future<void> _open(BuildContext context) async {
    final deleted = await showDeleteAccountDialog(context, onSubmit: onSubmit);
    if (deleted != true || !context.mounted) return;
    // La session locale a déjà été purgée par `AuthService.deleteAccount` :
    // il ne reste qu'à sortir de l'espace authentifié.
    showAdaptiveSnack(context, 'Votre compte a été supprimé.');
    context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(color: Color(0xFF24404C), height: 40),
        const Text(
          'ZONE DE DANGER',
          style: TextStyle(
            color: kDeleteAccountDanger,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            onPressed: () => _open(context),
            icon: const Icon(
              Icons.delete_forever_outlined,
              color: kDeleteAccountDanger,
              size: 20,
            ),
            label: const Text(
              'Supprimer mon compte',
              style: TextStyle(
                color: kDeleteAccountDanger,
                fontWeight: FontWeight.w700,
              ),
            ),
            style: TextButton.styleFrom(
              alignment: Alignment.centerLeft,
              backgroundColor: kDeleteAccountDanger.withValues(alpha: 0.10),
              padding: const EdgeInsets.symmetric(
                vertical: 14,
                horizontal: 14,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Action définitive et irréversible. Vos données personnelles sont effacées ; '
          'l\'historique de vos livraisons est conservé de façon anonymisée.',
          style: TextStyle(color: Colors.white54, fontSize: 12),
        ),
      ],
    );
  }
}
