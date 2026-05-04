import 'package:flutter/foundation.dart';

import '../controllers/order_socket_controller.dart';
import '../models/product.dart';
import '../models/shop.dart';
import 'active_orders_store.dart';

/// Sélection en attente côté HomeTab : produit + boutique chosen depuis
/// l'onglet Boutiques. Le HomeTab consomme cette valeur et la reset.
class PendingShopSelection {
  final Shop shop;
  final Product product;

  const PendingShopSelection({required this.shop, required this.product});
}

/// Registre statique des services partagés côté CLIENT.
///
/// `OrderSocketController` est unique pour la session : un seul socket pour
/// l'utilisateur connecté, partagé entre la coquille, l'onglet Commandes,
/// l'écran de tracking et le formulaire d'accueil.
///
/// `ActiveOrdersStore` est branché sur ce socket et expose un
/// [ChangeNotifier] que les widgets peuvent écouter via [ListenableBuilder].
///
/// Le registre fournit `reset()` pour libérer ces ressources au logout
/// (et permettre une réinstanciation à la prochaine connexion).
class ClientServices {
  ClientServices._();

  static OrderSocketController? _socket;
  static ActiveOrdersStore? _activeOrders;

  /// Socket controller unique pour la session client.
  static OrderSocketController get socket =>
      _socket ??= OrderSocketController();

  /// Store des commandes actives (auto-sync via le socket).
  static ActiveOrdersStore get activeOrders =>
      _activeOrders ??= ActiveOrdersStore();

  /// Sélection en attente depuis l'onglet Boutiques. Le HomeTab écoute ce
  /// notifier et applique la sélection au formulaire avant de la reset.
  static final ValueNotifier<PendingShopSelection?> pendingShopSelection =
      ValueNotifier<PendingShopSelection?>(null);

  /// À appeler au logout pour libérer le socket et vider le store.
  static Future<void> reset() async {
    final s = _socket;
    final a = _activeOrders;
    _socket = null;
    _activeOrders = null;
    pendingShopSelection.value = null;
    if (s != null) await s.dispose();
    a?.dispose();
  }
}
