import 'package:flutter/material.dart';
import '../services/ratings_service.dart';
import '../utils/platform_adapter.dart';

/// Ecran de notation post-course (1-5 étoiles + commentaire optionnel).
///
/// Présenté au client une fois la course passée à `COMPLETED`, ainsi qu'au
/// livreur depuis sa propre interface, pour qu'ils s'évaluent mutuellement.
///
/// Depuis l'évolution "évaluation par catégories", l'utilisateur peut aussi
/// noter (optionnellement) la ponctualité, la communication et la courtoisie
/// du livreur. Ces sous-notes sont strictement additionnelles : si elles ne
/// sont pas définies, on envoie `null` au backend.
class RatingScreen extends StatefulWidget {
  final String orderId;
  final String otherPartyName;

  /// Rôle de la personne notée : `LIVREUR` ou `CLIENT`.
  final String otherPartyRole;

  const RatingScreen({
    super.key,
    required this.orderId,
    required this.otherPartyName,
    required this.otherPartyRole,
  });

  @override
  State<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends State<RatingScreen> {
  final RatingsService _service = RatingsService();
  final TextEditingController _commentCtrl = TextEditingController();

  int _score = 0;
  // Sous-notes par catégorie : 0 = non noté (envoyé null au backend).
  int _punctualityScore = 0;
  int _communicationScore = 0;
  int _courtesyScore = 0;
  bool _submitting = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_score < 1 || _score > 5) {
      showAdaptiveSnack(context, 'Sélectionnez une note de 1 à 5 étoiles');
      return;
    }
    setState(() => _submitting = true);
    final result = await _service.submit(
      orderId: widget.orderId,
      score: _score,
      comment: _commentCtrl.text,
      punctualityScore: _punctualityScore > 0 ? _punctualityScore : null,
      communicationScore: _communicationScore > 0 ? _communicationScore : null,
      courtesyScore: _courtesyScore > 0 ? _courtesyScore : null,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (result != null) {
      showAdaptiveSnack(context, 'Merci pour votre retour !');
      Navigator.of(context).pop(true);
    } else {
      showAdaptiveSnack(
        context,
        'Impossible d’envoyer la note (déjà notée ou erreur réseau)',
        isError: true,
      );
    }
  }

  void _skip() {
    Navigator.of(context).pop(false);
  }

  String get _roleLabel =>
      widget.otherPartyRole == 'LIVREUR' ? 'votre livreur' : 'votre client';

  /// Construit une rangée de 5 étoiles cliquables pour une catégorie donnée.
  Widget _buildStars({
    required int currentScore,
    required ValueChanged<int> onTap,
    double size = 32,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: List.generate(5, (i) {
        final value = i + 1;
        final filled = value <= currentScore;
        return IconButton(
          iconSize: size,
          padding: const EdgeInsets.symmetric(horizontal: 2),
          constraints: const BoxConstraints(),
          onPressed: _submitting ? null : () => onTap(value),
          icon: Icon(
            filled ? Icons.star : Icons.star_border,
            color: filled ? const Color(0xFFFACC15) : Colors.white54,
          ),
          tooltip: '$value étoile${value > 1 ? 's' : ''}',
        );
      }),
    );
  }

  /// Construit une section "catégorie" avec icône, titre, sous-titre et
  /// rangée d'étoiles. Cliquer sur la même valeur deux fois la réinitialise
  /// (permet de revenir à un état "non noté" → null en submit).
  Widget _buildCategorySection({
    required IconData icon,
    required String title,
    required String subtitle,
    required int currentScore,
    required ValueChanged<int> onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xFF0EA5E9), size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Text(
              subtitle,
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
          ),
          const SizedBox(height: 4),
          _buildStars(
            currentScore: currentScore,
            onTap: (value) {
              // Re-cliquer la même étoile → réinitialise (note effacée).
              onTap(currentScore == value ? 0 : value);
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayName =
        widget.otherPartyName.isEmpty ? _roleLabel : widget.otherPartyName;
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text(
          'Noter la course',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1E293B),
        iconTheme: const IconThemeData(color: Colors.white),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                'Comment s’est passée votre expérience avec $displayName ?',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 24),
              // Note globale (étoiles centrées, plus grosses)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final value = i + 1;
                  final filled = value <= _score;
                  return IconButton(
                    iconSize: 44,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _score = value),
                    icon: Icon(
                      filled ? Icons.star : Icons.star_border,
                      color: filled
                          ? const Color(0xFFFACC15)
                          : Colors.white54,
                    ),
                    tooltip: '$value étoile${value > 1 ? 's' : ''}',
                  );
                }),
              ),
              const SizedBox(height: 16),
              // Sections catégories (toutes optionnelles)
              const Padding(
                padding: EdgeInsets.only(left: 4, bottom: 8),
                child: Text(
                  'Évaluez ces aspects (optionnel)',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              _buildCategorySection(
                icon: Icons.access_time,
                title: 'Ponctualité',
                subtitle: 'Le livreur était-il à l’heure ?',
                currentScore: _punctualityScore,
                onTap: (v) => setState(() => _punctualityScore = v),
              ),
              _buildCategorySection(
                icon: Icons.chat_bubble_outline,
                title: 'Communication',
                subtitle: 'Le livreur communiquait-il bien ?',
                currentScore: _communicationScore,
                onTap: (v) => setState(() => _communicationScore = v),
              ),
              _buildCategorySection(
                icon: Icons.handshake_outlined,
                title: 'Courtoisie',
                subtitle: 'Le livreur était-il aimable ?',
                currentScore: _courtesyScore,
                onTap: (v) => setState(() => _courtesyScore = v),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _commentCtrl,
                enabled: !_submitting,
                maxLines: 4,
                maxLength: 500,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Commentaire (optionnel)',
                  labelStyle: const TextStyle(color: Colors.white70),
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  counterStyle: const TextStyle(color: Colors.white60),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0EA5E9),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _submitting
                      ? adaptiveLoader(color: Colors.white)
                      : const Text(
                          'Envoyer',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _submitting ? null : _skip,
                child: const Text(
                  'Passer',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
