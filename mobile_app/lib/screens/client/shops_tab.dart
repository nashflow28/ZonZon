import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/product.dart' as catalog;
import '../../models/shop.dart';
import '../../router/app_router.dart';
import '../../services/client_services.dart';
import '../../utils/platform_adapter.dart';
import '../shop_list_screen.dart';

/// Onglet « Boutiques » du shell client.
///
/// Affiche [ShopListScreen] en mode tab (sans bouton retour). Quand
/// l'utilisateur sélectionne un produit, on dépose la sélection dans
/// [ClientServices.pendingShopSelection] et on bascule sur l'onglet Accueil
/// qui pré-remplit le formulaire et l'estimation.
class ShopsTab extends StatelessWidget {
  const ShopsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return ShopListScreen(
      hideBackButton: true,
      onProductSelected: (selection) {
        final shop = selection['shop'] as Shop?;
        final product = selection['product'] as catalog.Product?;
        if (shop == null || product == null) return;
        ClientServices.pendingShopSelection.value = PendingShopSelection(
          shop: shop,
          product: product,
        );
        if (!context.mounted) return;
        showAdaptiveSnack(
          context,
          'Produit ajouté. Choisissez l\'adresse de livraison.',
        );
        context.go(AppRoutes.clientHome);
      },
    );
  }
}
