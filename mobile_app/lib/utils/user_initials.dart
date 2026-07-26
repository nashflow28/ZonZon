/// Initiales affichées dans les avatars de profil.
///
/// Le motif naïf `(firstName ?? '?')[0]` ne protège que du `null`, pas de la
/// chaîne vide : `''[0]` lève un `RangeError` pendant `build()`, ce qui détruit
/// l'écran entier (écran gris en release). Le cas est atteignable — le
/// formulaire de profil peut envoyer une chaîne vide — et il est alors
/// définitif : l'utilisateur ne peut plus ouvrir son profil pour se corriger.
String userInitials(String? firstName, String? lastName, {String fallback = '?'}) {
  final first = (firstName ?? '').trim();
  final last = (lastName ?? '').trim();
  final buffer = StringBuffer();
  if (first.isNotEmpty) buffer.write(first[0]);
  if (last.isNotEmpty) buffer.write(last[0]);
  final initials = buffer.toString().toUpperCase();
  return initials.isEmpty ? fallback : initials;
}
