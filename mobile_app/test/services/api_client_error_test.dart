import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/services/api_client.dart';

void main() {
  test('reconnaît un Failed host lookup encapsulé par le client HTTP', () {
    final error = Exception(
      "ClientException with SocketException: Failed host lookup: 'zonzon-backend.fly.dev'",
    );

    expect(isDnsLookupError(error), isTrue);
  });

  test('traduit une erreur DNS sans exposer l’exception technique', () {
    final message = apiErrorMessage(
      const SocketException("Failed host lookup: 'zonzon-backend.fly.dev'"),
    );

    expect(message, contains('Connexion internet indisponible'));
    expect(message, isNot(contains('SocketException')));
  });

  test('un timeout avertit de vérifier les commandes avant réessai', () {
    final message = apiErrorMessage(TimeoutException('Future not completed'));

    expect(message, contains('Vérifiez vos commandes'));
  });
}
