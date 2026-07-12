import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/services/geocoding_service.dart';

void main() {
  test('autocomplete Photon retourne et priorise Adidogomé pour Adi', () async {
    final client = MockClient((request) async {
      expect(request.url.host, 'photon.komoot.io');
      expect(request.url.queryParameters['q'], 'Adi');
      return http.Response(
        jsonEncode({
          'features': [
            {
              'geometry': {
                'coordinates': [1.1471, 6.1979],
              },
              'properties': {
                'name': 'Adidogomé Assiyeye',
                'country': 'Togo',
                'countrycode': 'TG',
                'type': 'district',
              },
            },
            {
              'geometry': {
                'coordinates': [1.1547, 6.2101],
              },
              'properties': {
                'name': 'Adidogomé',
                'country': 'Togo',
                'countrycode': 'TG',
                'type': 'district',
              },
            },
            {
              'geometry': {
                'coordinates': [1.67, 6.24],
              },
              'properties': {
                'name': 'Adinkomè',
                'country': 'Bénin',
                'countrycode': 'BJ',
              },
            },
          ],
        }),
        200,
      );
    });

    final results = await GeocodingService(client: client).search('Adi');

    expect(results, hasLength(2));
    expect(results.first.shortName, startsWith('Adidogomé'));
    expect(
      results.every((place) => place.displayName.contains('Togo')),
      isTrue,
    );
  });
}
