import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/utils/money_format.dart';

void main() {
  test('formate un montant FCFA avec séparateurs', () {
    expect(formatFcfa(12500), '12 500 FCFA');
  });

  test('affiche un fallback lorsque le prix manque', () {
    expect(formatFcfa(null), 'Montant à confirmer');
  });
}
