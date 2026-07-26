import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/utils/user_initials.dart';

void main() {
  group('userInitials', () {
    test('compose les initiales en majuscules', () {
      expect(userInitials('kodjo', 'mensah'), 'KM');
    });

    test('ne lève pas sur une chaîne vide (cas qui détruisait l’écran)', () {
      expect(userInitials('', ''), '?');
      expect(userInitials('', 'Mensah'), 'M');
      expect(userInitials('Kodjo', ''), 'K');
    });

    test('ne lève pas sur null', () {
      expect(userInitials(null, null), '?');
      expect(userInitials(null, 'Mensah'), 'M');
    });

    test('ignore les espaces seuls', () {
      expect(userInitials('   ', '  '), '?');
      expect(userInitials('  Kodjo ', ' Mensah '), 'KM');
    });

    test('accepte un repli personnalisé', () {
      expect(userInitials(null, null, fallback: '–'), '–');
    });
  });
}
