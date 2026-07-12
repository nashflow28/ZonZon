import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../controllers/order_socket_controller.dart';
import 'package:image_picker/image_picker.dart';
import '../utils/media_url.dart';
import '../models/order_history_item.dart';
import '../models/product.dart';
import '../models/shop.dart';
import '../router/app_router.dart';
import '../services/auth_service.dart';
import '../services/merchant_orders_service.dart';
import '../services/shops_service.dart';
import 'merchant/create_delivery_screen.dart';
import 'merchant/merchant_drivers_screen.dart';
import 'merchant/merchant_orders_screen.dart';
import 'merchant/merchant_profile_screen.dart';
import 'messaging_hub_screen.dart';
import 'merchant_shop_form_screen.dart';
import 'merchant_product_form_screen.dart';
import '../utils/platform_adapter.dart';

class MerchantHomeScreen extends StatefulWidget {
  const MerchantHomeScreen({super.key});

  @override
  State<MerchantHomeScreen> createState() => _MerchantHomeScreenState();
}

class _MerchantHomeScreenState extends State<MerchantHomeScreen> {
  final ShopsService _shops = ShopsService();
  final MerchantOrdersService _merchantOrders = MerchantOrdersService();
  final OrderSocketController _socketCtrl = OrderSocketController();
  Shop? _shop;
  List<Product> _products = [];
  List<OrderHistoryItem> _orders = const [];
  bool _loading = true;
  StreamSubscription<void>? _realtimeReconnectSub;

  @override
  void initState() {
    super.initState();
    _socketCtrl.init();
    _realtimeReconnectSub = _socketCtrl.connected$.listen((_) {
      // Rattrape les transitions de livraison manquées hors ligne.
      if (mounted) _refresh();
    });
    _socketCtrl.orderAccepted$.listen((evt) {
      if (!mounted || !_orders.any((order) => order.id == evt.orderId)) return;
      _refresh();
    });
    _socketCtrl.statusUpdates$.listen((evt) {
      if (!mounted || !_orders.any((order) => order.id == evt.orderId)) return;
      _refresh();
    });
    _refresh();
  }

  @override
  void dispose() {
    _realtimeReconnectSub?.cancel();
    _socketCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final shop = await _shops.getMyShop();
    final products = shop != null ? await _shops.myProducts() : <Product>[];
    List<OrderHistoryItem> orders = const [];
    try {
      orders = await _merchantOrders.getMyMerchantOrders();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _shop = shop;
      _products = products;
      _orders = orders;
      _loading = false;
    });
    _socketCtrl.clearWatchedOrders();
    for (final order in orders) {
      _socketCtrl.watchOrder(order.id);
    }
  }

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    context.go(AppRoutes.login);
  }

  Future<void> _openShopForm() async {
    final saved = await pushAdaptive<Shop>(
      context,
      MerchantShopFormScreen(initial: _shop),
    );
    if (saved != null) _refresh();
  }

  Future<void> _openProductForm({Product? edit}) async {
    final saved = await pushAdaptive<bool>(
      context,
      MerchantProductFormScreen(initial: edit),
    );
    if (saved == true) _refresh();
  }

  Future<void> _openCreateDelivery() async {
    final created = await pushAdaptive<bool>(
      context,
      const CreateDeliveryScreen(),
    );
    if (created == true && mounted) await _refresh();
  }

  Future<void> _openMerchantOrders() async {
    await pushAdaptive<void>(context, const MerchantOrdersScreen());
  }

  Future<void> _openMerchantDrivers() async {
    await pushAdaptive<void>(context, const MerchantDriversScreen());
  }

  Future<void> _openMerchantProfile() async {
    await pushAdaptive<void>(context, const MerchantProfileScreen());
    if (mounted) {
      _refresh();
    }
  }

  Future<void> _openMessaging() =>
      pushAdaptive<void>(context, const MessagingHubScreen());

  Future<void> _pickShopLogo() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
    );
    if (picked == null) return;
    final updated = await _shops.uploadShopLogo(picked.path);
    if (updated != null && mounted) {
      setState(() => _shop = updated);
    }
  }

  Future<void> _toggleAvailable(Product p) async {
    final updated = await _shops.updateProduct(p.id, {
      'available': !p.available,
    });
    if (updated != null && mounted) {
      setState(() {
        _products = _products
            .map((x) => x.id == updated.id ? updated : x)
            .toList();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        elevation: 0,
        title: const Row(
          children: [
            Icon(Icons.storefront, color: Color(0xFF0FB271)),
            SizedBox(width: 10),
            Text(
              'Espace commerçant',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Messagerie',
            icon: const Icon(Icons.chat_bubble_outline, color: Colors.white70),
            onPressed: _openMessaging,
          ),
          IconButton(
            tooltip: 'Profil',
            icon: const Icon(
              Icons.account_circle_outlined,
              color: Colors.white70,
            ),
            onPressed: _openMerchantProfile,
          ),
          IconButton(
            tooltip: 'Rafraîchir',
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: _refresh,
          ),
          IconButton(
            tooltip: 'Se déconnecter',
            icon: const Icon(Icons.logout, color: Colors.white70),
            onPressed: _logout,
          ),
        ],
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : _shop == null
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: [
                adaptiveConstrainedContent(
                  maxWidth: 760,
                  child: Column(
                    children: [
                      _DeliveriesQuickActions(
                        onCreate: _openCreateDelivery,
                        onViewOrders: _openMerchantOrders,
                        onViewDrivers: _openMerchantDrivers,
                        stats: _orders,
                      ),
                      const SizedBox(height: 24),
                      _OnboardingState(onCreate: _openShopForm),
                    ],
                  ),
                ),
              ],
            )
          : RefreshIndicator(
              color: const Color(0xFF0FB271),
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  adaptiveConstrainedContent(
                    maxWidth: 760,
                    child: Column(
                      children: [
                        _DeliveriesQuickActions(
                          onCreate: _openCreateDelivery,
                          onViewOrders: _openMerchantOrders,
                          onViewDrivers: _openMerchantDrivers,
                          stats: _orders,
                        ),
                        const SizedBox(height: 24),
                        _ShopHeaderCard(
                          shop: _shop!,
                          onEdit: _openShopForm,
                          onPickLogo: _pickShopLogo,
                        ),
                        const SizedBox(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Mes produits',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            TextButton.icon(
                              onPressed: () => _openProductForm(),
                              icon: const Icon(
                                Icons.add,
                                color: Color(0xFF0FB271),
                              ),
                              label: const Text(
                                'Ajouter',
                                style: TextStyle(color: Color(0xFF0FB271)),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        if (_products.isEmpty)
                          _EmptyProducts(onAdd: () => _openProductForm())
                        else
                          ..._products.map(
                            (p) => _ProductTile(
                              product: p,
                              onEdit: () => _openProductForm(edit: p),
                              onToggle: () => _toggleAvailable(p),
                              onDelete: () async {
                                final ok = await showAdaptiveConfirmDialog(
                                  context,
                                  title: 'Supprimer ?',
                                  message:
                                      'Le produit "${p.name}" sera retiré du catalogue.',
                                  confirmLabel: 'Supprimer',
                                  cancelLabel: 'Annuler',
                                  isDestructive: true,
                                );
                                if (ok != true) return;
                                await _shops.deleteProduct(p.id);
                                _refresh();
                              },
                            ),
                          ),
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _OnboardingState extends StatelessWidget {
  final VoidCallback onCreate;
  const _OnboardingState({required this.onCreate});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF0FB271).withValues(alpha: 0.15),
              ),
              child: const Icon(
                Icons.add_business,
                color: Color(0xFF0FB271),
                size: 56,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Bienvenue !',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Créez votre boutique pour rejoindre la marketplace ZonZon. '
              'C’est gratuit, et vos premiers clients vous attendent.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white70,
                fontSize: 14,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: onCreate,
                icon: const Icon(Icons.storefront),
                label: const Text(
                  'Créer ma boutique',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0FB271),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeliveriesQuickActions extends StatelessWidget {
  final VoidCallback onCreate;
  final VoidCallback onViewOrders;
  final VoidCallback onViewDrivers;
  final List<OrderHistoryItem> stats;
  const _DeliveriesQuickActions({
    required this.onCreate,
    required this.onViewOrders,
    required this.onViewDrivers,
    required this.stats,
  });

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final deliveriesToday = stats.where((item) {
      final createdAt = item.createdAt?.toLocal();
      if (createdAt == null) return false;
      return createdAt.year == today.year &&
          createdAt.month == today.month &&
          createdAt.day == today.day;
    }).length;
    final completed = stats.where((item) => item.status == 'COMPLETED').length;
    final totalAmount = stats
        .where((item) => item.status == 'COMPLETED')
        .fold<int>(0, (sum, item) => sum + (item.priceFcfa ?? 0));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.local_shipping_outlined, color: Color(0xFF2E90FA)),
              SizedBox(width: 10),
              Text(
                'Livraisons clients',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onCreate,
                  icon: const Icon(Icons.add_road, size: 18),
                  label: const Text('Créer une livraison'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0FB271),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onViewOrders,
                  icon: const Icon(
                    Icons.receipt_long,
                    size: 18,
                    color: Color(0xFF2E90FA),
                  ),
                  label: const Text(
                    'Mes livraisons',
                    style: TextStyle(color: Color(0xFF2E90FA)),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFF2E90FA)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onViewDrivers,
              icon: const Icon(
                Icons.two_wheeler,
                size: 18,
                color: Color(0xFFFBBF24),
              ),
              label: const Text(
                'Mes livreurs',
                style: TextStyle(color: Color(0xFFFBBF24)),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFFFBBF24)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MerchantStatTile(
                  label: 'Aujourd’hui',
                  value: '$deliveriesToday',
                  color: const Color(0xFF2E90FA),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MerchantStatTile(
                  label: 'Terminées',
                  value: '$completed',
                  color: const Color(0xFF0FB271),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MerchantStatTile(
                  label: 'Montant',
                  value: _formatCompactPrice(totalAmount),
                  color: const Color(0xFFFF9E1B),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatCompactPrice(int amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M';
    }
    if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(1)}k';
    }
    return '$amount';
  }
}

class _MerchantStatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _MerchantStatTile({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ShopHeaderCard extends StatelessWidget {
  final Shop shop;
  final VoidCallback onEdit;
  final VoidCallback onPickLogo;
  const _ShopHeaderCard({
    required this.shop,
    required this.onEdit,
    required this.onPickLogo,
  });

  @override
  Widget build(BuildContext context) {
    final logoUrl = shop.logoUrl;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                GestureDetector(
                  onTap: onPickLogo,
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.05),
                      border: Border.all(
                        color: const Color(0xFF0FB271).withValues(alpha: 0.4),
                      ),
                      image: logoUrl != null
                          ? DecorationImage(
                              image: NetworkImage(mediaUrl(logoUrl)),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    child: logoUrl == null
                        ? const Icon(
                            Icons.add_a_photo,
                            color: Color(0xFF0FB271),
                            size: 28,
                          )
                        : null,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        shop.name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _StatusBadge(
                        status: shop.status,
                        reason: shop.rejectionReason,
                      ),
                      if (shop.address.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(
                              Icons.place,
                              color: Colors.white60,
                              size: 14,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                shop.address,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white60,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit, color: Colors.white70),
                ),
              ],
            ),
          ),
          if (shop.description != null && shop.description!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              child: Text(
                shop.description!,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final ShopStatus status;
  final String? reason;
  const _StatusBadge({required this.status, required this.reason});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    IconData icon;
    switch (status) {
      case ShopStatus.approved:
        color = const Color(0xFF0FB271);
        label = 'Approuvée';
        icon = Icons.check_circle;
        break;
      case ShopStatus.rejected:
        color = Colors.redAccent;
        label = reason != null && reason!.isNotEmpty
            ? 'Rejetée : $reason'
            : 'Rejetée';
        icon = Icons.cancel;
        break;
      case ShopStatus.suspended:
        color = Colors.orange;
        label = 'Suspendue';
        icon = Icons.pause_circle;
        break;
      case ShopStatus.pending:
        color = const Color(0xFFFBBF24);
        label = 'En attente de validation';
        icon = Icons.hourglass_top;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 2,
              style: TextStyle(
                color: color,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyProducts extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyProducts({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.inventory_2_outlined,
            color: Colors.white24,
            size: 48,
          ),
          const SizedBox(height: 12),
          const Text(
            'Aucun produit pour l’instant',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Ajoutez votre premier article pour qu’il apparaisse dans la marketplace.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 12.5),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, color: Color(0xFF0FB271)),
            label: const Text(
              'Ajouter un produit',
              style: TextStyle(color: Color(0xFF0FB271)),
            ),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFF0FB271)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  final Product product;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;
  const _ProductTile({
    required this.product,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final photo = product.photoUrl;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: product.available
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.orange.withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: Colors.white.withValues(alpha: 0.05),
              image: photo != null
                  ? DecorationImage(
                      image: NetworkImage(mediaUrl(photo)),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: photo == null
                ? const Icon(Icons.image_outlined, color: Colors.white24)
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${product.priceFcfa} FCFA',
                  style: const TextStyle(
                    color: Color(0xFF0FB271),
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (!product.available)
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Text(
                      'Indisponible',
                      style: TextStyle(color: Colors.orange, fontSize: 11),
                    ),
                  ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            iconColor: Colors.white60,
            color: const Color(0xFF122530),
            onSelected: (v) {
              if (v == 'edit') onEdit();
              if (v == 'toggle') onToggle();
              if (v == 'delete') onDelete();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'edit',
                child: Text('Modifier', style: TextStyle(color: Colors.white)),
              ),
              PopupMenuItem(
                value: 'toggle',
                child: Text(
                  product.available
                      ? 'Marquer indisponible'
                      : 'Remettre en vente',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              const PopupMenuItem(
                value: 'delete',
                child: Text(
                  'Supprimer',
                  style: TextStyle(color: Colors.redAccent),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
