import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Indicatifs téléphoniques pertinents pour le marché togolais
/// (Togo + voisins immédiats + diaspora la plus représentée).
class CountryCode {
  final String code; // ex: '+228'
  final String label;
  final String flag;
  const CountryCode({required this.code, required this.label, required this.flag});
}

const List<CountryCode> kCountryCodes = [
  CountryCode(code: '+228', label: 'Togo', flag: '🇹🇬'),
  CountryCode(code: '+229', label: 'Bénin', flag: '🇧🇯'),
  CountryCode(code: '+233', label: 'Ghana', flag: '🇬🇭'),
  CountryCode(code: '+225', label: 'Côte d\'Ivoire', flag: '🇨🇮'),
  CountryCode(code: '+226', label: 'Burkina Faso', flag: '🇧🇫'),
  CountryCode(code: '+227', label: 'Niger', flag: '🇳🇪'),
  CountryCode(code: '+234', label: 'Nigeria', flag: '🇳🇬'),
  CountryCode(code: '+221', label: 'Sénégal', flag: '🇸🇳'),
  CountryCode(code: '+223', label: 'Mali', flag: '🇲🇱'),
  CountryCode(code: '+224', label: 'Guinée', flag: '🇬🇳'),
  CountryCode(code: '+237', label: 'Cameroun', flag: '🇨🇲'),
  CountryCode(code: '+33', label: 'France', flag: '🇫🇷'),
];

/// Champ téléphone : indicatif sélectionnable + numéro local.
/// Expose la valeur complète (ex: `+22890123456`) via `onFullNumberChanged`.
class PhoneField extends StatefulWidget {
  final TextEditingController controller; // contient SEULEMENT la partie locale
  final String initialCode;
  final ValueChanged<String>? onFullNumberChanged;
  final String hint;

  const PhoneField({
    super.key,
    required this.controller,
    this.initialCode = '+228',
    this.onFullNumberChanged,
    this.hint = 'Numéro de téléphone',
  });

  /// Helper pour découper un numéro sauvegardé en (indicatif, partie locale).
  /// Si non reconnu, on retombe sur +228 + le numéro tel quel.
  static (String code, String local) split(String full) {
    final cleaned = full.trim();
    for (final c in kCountryCodes) {
      if (cleaned.startsWith(c.code)) {
        return (c.code, cleaned.substring(c.code.length));
      }
    }
    return ('+228', cleaned.replaceFirst(RegExp(r'^\+'), ''));
  }

  @override
  State<PhoneField> createState() => _PhoneFieldState();
}

class _PhoneFieldState extends State<PhoneField> {
  late String _code;

  @override
  void initState() {
    super.initState();
    _code = widget.initialCode;
    widget.controller.addListener(_emit);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_emit);
    super.dispose();
  }

  void _emit() {
    widget.onFullNumberChanged?.call(fullNumber);
  }

  String get fullNumber => '$_code${widget.controller.text.trim()}';

  Future<void> _pickCountry() async {
    final selected = await showModalBottomSheet<CountryCode>(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => SafeArea(
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7,
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'Choisir un pays',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: kCountryCodes.length,
                  itemBuilder: (_, i) {
                    final c = kCountryCodes[i];
                    final selected = c.code == _code;
                    return ListTile(
                      onTap: () => Navigator.pop(context, c),
                      leading: Text(c.flag, style: const TextStyle(fontSize: 24)),
                      title: Text(c.label,
                          style: const TextStyle(color: Colors.white, fontSize: 15)),
                      subtitle: Text(c.code,
                          style: const TextStyle(color: Colors.white54, fontSize: 12)),
                      trailing: selected
                          ? const Icon(Icons.check, color: Color(0xFF0EA5E9))
                          : null,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected != null && mounted) {
      setState(() => _code = selected.code);
      _emit();
    }
  }

  @override
  Widget build(BuildContext context) {
    final country = kCountryCodes.firstWhere(
      (c) => c.code == _code,
      orElse: () => kCountryCodes.first,
    );
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: _pickCountry,
            borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(country.flag, style: const TextStyle(fontSize: 20)),
                  const SizedBox(width: 6),
                  Text(
                    _code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Icon(Icons.arrow_drop_down,
                      color: Colors.white60, size: 20),
                ],
              ),
            ),
          ),
          Container(
            width: 1,
            height: 28,
            color: Colors.white.withValues(alpha: 0.08),
          ),
          Expanded(
            child: TextField(
              controller: widget.controller,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(color: Colors.white, fontSize: 16),
              decoration: InputDecoration(
                hintText: widget.hint,
                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
