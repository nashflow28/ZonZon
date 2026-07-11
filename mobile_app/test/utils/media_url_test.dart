import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/config/env.dart';
import 'package:mobile_app/utils/media_url.dart';

void main() {
  test('préserve une URL objet absolue', () {
    expect(
      mediaUrl('https://cdn.example.com/avatars/photo.jpg'),
      'https://cdn.example.com/avatars/photo.jpg',
    );
  });

  test('résout les chemins legacy uploads via l’API', () {
    expect(mediaUrl('/uploads/photo.jpg'), '$apiUrl/uploads/photo.jpg');
  });
}
