import '../config/env.dart';

/// Retourne une URL média utilisable pour les anciens chemins `/uploads/*`
/// comme pour les URLs absolues livrées par le stockage objet.
String mediaUrl(String path) {
  final uri = Uri.tryParse(path);
  if (uri != null && uri.hasScheme) return path;
  return '$apiUrl$path';
}
