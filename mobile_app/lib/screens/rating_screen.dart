import 'package:flutter/material.dart';
import '../services/ratings_service.dart';

/// Ecran de notation post-course (1-5 étoiles + commentaire optionnel).
///
/// Présenté au client une fois la course passée à `COMPLETED`, ainsi qu'au
/// livreur depuis sa propre interface, pour qu'ils s'évaluent mutuellement.
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
  bool _submitting = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_score < 1 || _score > 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sélectionnez une note de 1 à 5 étoiles'),
        ),
      );
      return;
    }
    setState(() => _submitting = true);
    final result = await _service.submit(
      orderId: widget.orderId,
      score: _score,
      comment: _commentCtrl.text,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Merci pour votre retour !'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Impossible d\'envoyer la note (déjà notée ou erreur réseau)',
          ),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  void _skip() {
    Navigator.of(context).pop(false);
  }

  String get _roleLabel =>
      widget.otherPartyRole == 'LIVREUR' ? 'votre livreur' : 'votre client';

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
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                'Comment s\'est passée votre expérience avec $displayName ?',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 24),
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
              const SizedBox(height: 12),
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
                  counterStyle: const TextStyle(color: Colors.white38),
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
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.4,
                          ),
                        )
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
