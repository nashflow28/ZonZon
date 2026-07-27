import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/driver_screen.dart';

void main() {
  group('normalizeRadarOrders', () {
    test('supprime les entrées invalides et les doublons par id', () {
      final normalized = normalizeRadarOrders([
        {'id': 'order-1', 'pickupAddress': 'Tokoin'},
        {'id': 'order-1', 'pickupAddress': 'Tokoin duplicate'},
        {'orderId': 'order-2', 'pickupAddress': 'Agoe'},
        {'id': ''},
        'not-a-map',
      ]);

      expect(normalized, [
        {'id': 'order-1', 'pickupAddress': 'Tokoin'},
        {'orderId': 'order-2', 'pickupAddress': 'Agoe'},
      ]);
    });
  });

  group('upsertRadarOrder', () {
    test('insère une nouvelle course en tête sans perdre les autres', () {
      final merged = upsertRadarOrder(
        [
          {'id': 'order-1', 'pickupAddress': 'Tokoin'},
          {'id': 'order-2', 'pickupAddress': 'Agoe'},
        ],
        {'id': 'order-3', 'pickupAddress': 'Adidogome'},
      );

      expect(merged.map((order) => order['id']).toList(), [
        'order-3',
        'order-1',
        'order-2',
      ]);
    });

    test('remplace une course existante sans créer de doublon', () {
      final merged = upsertRadarOrder(
        [
          {'id': 'order-1', 'pickupAddress': 'Ancienne adresse'},
          {'id': 'order-2', 'pickupAddress': 'Agoe'},
        ],
        {'id': 'order-1', 'pickupAddress': 'Nouvelle adresse'},
      );

      expect(merged, hasLength(2));
      expect(merged.first['id'], 'order-1');
      expect(merged.first['pickupAddress'], 'Nouvelle adresse');
      expect(merged.where((order) => order['id'] == 'order-1'), hasLength(1));
    });
  });

  group('removeRadarOrder', () {
    test('retire la course annulée et conserve les autres', () {
      final remaining = removeRadarOrder([
        {'id': 'order-1', 'pickupAddress': 'Tokoin'},
        {'id': 'order-2', 'pickupAddress': 'Agoe'},
      ], 'order-1');

      expect(remaining.map((order) => order['id']).toList(), ['order-2']);
    });

    test('retire aussi une carte indexée sur la clé orderId', () {
      final remaining = removeRadarOrder([
        {'orderId': 'order-1', 'pickupAddress': 'Tokoin'},
        {'id': 'order-2', 'pickupAddress': 'Agoe'},
      ], 'order-1');

      expect(remaining.map((order) => order['id']).toList(), ['order-2']);
    });

    test('ne touche à rien pour un identifiant inconnu ou vide', () {
      const current = [
        {'id': 'order-1', 'pickupAddress': 'Tokoin'},
      ];

      expect(removeRadarOrder(current, 'order-inconnue'), current);
      expect(removeRadarOrder(current, ''), current);
      expect(removeRadarOrder(current, null), current);
    });
  });
}
