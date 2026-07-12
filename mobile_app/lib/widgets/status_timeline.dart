import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Frise de progression d'une course — pièce signature « Direction A ».
///
/// Rend le cycle de vie d'une livraison d'un seul coup d'œil :
///   fait = vert [AppColors.go], en cours = mangue [AppColors.mango],
///   à venir = gris [AppColors.line]/[AppColors.textMut].
///
/// Prend le statut courant (String backend) et calcule automatiquement l'état
/// de chaque étape. Les états terminaux d'exception (`CANCELLED`, `FAILED`)
/// figent la frise en corail avec le libellé, plutôt qu'un cul-de-sac muet.
///
/// Réutilisable côté client (suivi) et livreur (course active).
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({super.key, required this.status});

  /// Statut courant de la course (ex. `EN_ROUTE_PICKUP`).
  final String? status;

  /// Séquence des jalons affichés (chemin nominal). Les statuts fins non émis
  /// (le géofencing peut sauter directement à `IN_PROGRESS`) restent cohérents
  /// grâce au calcul par index.
  static const List<_Milestone> _milestones = [
    _Milestone('ACCEPTED', 'Acceptée', Icons.check_rounded),
    _Milestone('EN_ROUTE_PICKUP', 'Vers retrait', Icons.moving_rounded),
    _Milestone('AT_PICKUP', 'Au retrait', Icons.store_mall_directory_outlined),
    _Milestone('IN_PROGRESS', 'Récupéré', Icons.inventory_2_outlined),
    _Milestone('NEAR_CLIENT', 'Proche', Icons.my_location_rounded),
    _Milestone('COMPLETED', 'Livré', Icons.flag_rounded),
  ];

  bool get _isCancelled => status == 'CANCELLED';
  bool get _isFailed => status == 'FAILED';

  int get _currentIndex => _milestones.indexWhere((m) => m.status == status);

  @override
  Widget build(BuildContext context) {
    if (_isCancelled || _isFailed) {
      return _TerminalBanner(
        label: _isCancelled ? 'Course annulée' : 'Livraison échouée',
      );
    }

    final current = _currentIndex; // -1 si PENDING / inconnu → rien de fait

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(_milestones.length, (i) {
        final m = _milestones[i];
        final _StepState state = i < current
            ? _StepState.done
            : (i == current ? _StepState.now : _StepState.upcoming);
        return Expanded(
          child: _StepView(
            milestone: m,
            state: state,
            isFirst: i == 0,
            isLast: i == _milestones.length - 1,
          ),
        );
      }),
    );
  }
}

enum _StepState { done, now, upcoming }

class _Milestone {
  const _Milestone(this.status, this.shortLabel, this.icon);
  final String status;
  final String shortLabel;
  final IconData icon;
}

class _StepView extends StatelessWidget {
  const _StepView({
    required this.milestone,
    required this.state,
    required this.isFirst,
    required this.isLast,
  });

  final _Milestone milestone;
  final _StepState state;
  final bool isFirst;
  final bool isLast;

  Color get _barColor {
    switch (state) {
      case _StepState.done:
        return AppColors.go;
      case _StepState.now:
        return AppColors.mango;
      case _StepState.upcoming:
        return AppColors.line;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool done = state == _StepState.done;
    final bool now = state == _StepState.now;

    final Color circleBg = done
        ? AppColors.go.withValues(alpha: 0.18)
        : now
        ? AppColors.mango
        : AppColors.line.withValues(alpha: 0.5);
    final Color iconColor = done
        ? AppColors.go
        : now
        ? Colors.white
        : AppColors.textMut;
    final Color labelColor = now
        ? AppColors.textHi
        : done
        ? AppColors.textHi.withValues(alpha: 0.8)
        : AppColors.textMut;

    return Column(
      children: [
        // Barre de progression fine (moitié gauche / droite pour connecter)
        SizedBox(
          height: 4,
          child: Row(
            children: [
              Expanded(
                child: Container(
                  height: 4,
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  decoration: BoxDecoration(
                    color: isFirst ? Colors.transparent : _barColor,
                    borderRadius: BorderRadius.circular(100),
                  ),
                ),
              ),
              Expanded(
                child: Container(
                  height: 4,
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  decoration: BoxDecoration(
                    color: isLast ? Colors.transparent : _barColor,
                    borderRadius: BorderRadius.circular(100),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: circleBg,
            shape: BoxShape.circle,
            boxShadow: now
                ? [
                    BoxShadow(
                      color: AppColors.mango.withValues(alpha: 0.25),
                      blurRadius: 0,
                      spreadRadius: 4,
                    ),
                  ]
                : null,
          ),
          child: Icon(milestone.icon, size: 14, color: iconColor),
        ),
        const SizedBox(height: 5),
        Text(
          milestone.shortLabel,
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 9,
            height: 1.2,
            fontWeight: now ? FontWeight.w700 : FontWeight.w600,
            color: labelColor,
          ),
        ),
      ],
    );
  }
}

class _TerminalBanner extends StatelessWidget {
  const _TerminalBanner({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.coral.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.coral.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: AppColors.coral,
            size: 18,
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.coral,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
