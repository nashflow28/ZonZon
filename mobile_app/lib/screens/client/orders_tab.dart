import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/order_history_item.dart';
import '../../router/app_router.dart';
import '../../services/active_orders_store.dart';
import '../../services/client_services.dart';
import '../../utils/platform_adapter.dart';
import '../order_history_screen.dart';

/// Onglet « Commandes » du shell client.
///
/// Affiche la liste des commandes actives (PENDING / ACCEPTED / IN_PROGRESS)
/// au-dessus, avec un accès vers l'historique complet en bas. Chaque carte
/// renvoie vers [OrderTrackingScreen] pour le suivi détaillé.
class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key});

  @override
  State<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends State<OrdersTab>
    with AutomaticKeepAliveClientMixin {
  ActiveOrdersStore get _store => ClientServices.activeOrders;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    // Le store est déjà bootstrapé par ClientShellScreen ; ici on ne force
    // pas un fetch sauf si la liste est vide (cas où l'utilisateur a refresh
    // l'app en plein onglet Commandes).
    if (!_store.isBootstrapped && !_store.isLoading) {
      _store.refresh();
    }
  }

  Future<void> _onRefresh() async {
    await _store.refresh();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        elevation: 0,
        automaticallyImplyLeading: false,
        title: const Text(
          'Mes commandes',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: AnimatedBuilder(
        animation: _store,
        builder: (context, _) {
          return RefreshIndicator(
            color: const Color(0xFF2E90FA),
            backgroundColor: const Color(0xFF122530),
            onRefresh: _onRefresh,
            child: _buildBody(),
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    final orders = _store.orders;

    if (_store.isLoading && orders.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF2E90FA)),
      );
    }

    if (orders.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        children: [
          const SizedBox(height: 60),
          Icon(
            Icons.inbox_outlined,
            color: Colors.white.withValues(alpha: 0.3),
            size: 80,
          ),
          const SizedBox(height: 16),
          const Text(
            'Aucune commande en cours',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Vos commandes en cours s\'afficheront ici. '
            'Lancez une livraison depuis l\'onglet Accueil ou les Boutiques.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60, fontSize: 14),
          ),
          const SizedBox(height: 32),
          _HistoryButton(onTap: _openHistory),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: orders.length + 2, // +1 pour le compteur, +1 pour le bouton
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
            child: Row(
              children: [
                Text(
                  '${orders.length} commande${orders.length > 1 ? 's' : ''} en cours',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Text(
                  '${orders.length}/${ActiveOrdersStore.maxActiveOrders}',
                  style: TextStyle(
                    color: _store.isAtLimit
                        ? const Color(0xFFF0453D)
                        : Colors.white54,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          );
        }
        if (index == orders.length + 1) {
          return Padding(
            padding: const EdgeInsets.only(top: 16),
            child: _HistoryButton(onTap: _openHistory),
          );
        }
        final order = orders[index - 1];
        return _ActiveOrderCard(
          order: order,
          onTap: () => _openTracking(order.id),
        );
      },
    );
  }

  void _openTracking(String orderId) {
    context.go('${AppRoutes.clientOrders}/$orderId');
  }

  void _openHistory() {
    pushAdaptive<void>(context, const OrderHistoryScreen());
  }
}

class _ActiveOrderCard extends StatelessWidget {
  final OrderHistoryItem order;
  final VoidCallback onTap;

  const _ActiveOrderCard({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final palette = _statusPalette(order.status);
    return Card(
      color: const Color(0xFF122530),
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: palette.bg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: palette.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(palette.icon, color: palette.fg, size: 12),
                        const SizedBox(width: 4),
                        Text(
                          palette.label,
                          style: TextStyle(
                            color: palette.fg,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (order.priceFcfa != null &&
                      (order.status != 'PENDING' ||
                          order.raw['merchant'] != null))
                    Text(
                      '${order.priceFcfa} FCFA',
                      style: const TextStyle(
                        color: Color(0xFF0FB271),
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              _AddressLine(
                icon: Icons.my_location,
                color: const Color(0xFF2E90FA),
                text: order.pickupAddress,
              ),
              const SizedBox(height: 6),
              _AddressLine(
                icon: Icons.location_on,
                color: const Color(0xFF0FB271),
                text: order.deliveryAddress,
              ),
              if (order.livreur != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.person_pin_circle_outlined,
                        color: Colors.white60,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Livreur : ${order.livreur!['firstName'] ?? '—'} ${order.livreur!['lastName'] ?? ''}',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: Colors.white38,
                        size: 18,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static _StatusPalette _statusPalette(String status) {
    switch (status) {
      case 'PENDING':
        return const _StatusPalette(
          label: 'EN ATTENTE',
          icon: Icons.hourglass_top,
          fg: Color(0xFFFF9E1B),
          bg: Color(0x33FF9E1B),
          border: Color(0x66FF9E1B),
        );
      case 'ACCEPTED':
        return const _StatusPalette(
          label: 'ACCEPTÉE',
          icon: Icons.directions_bike,
          fg: Color(0xFF2E90FA),
          bg: Color(0x332E90FA),
          border: Color(0x662E90FA),
        );
      case 'IN_PROGRESS':
        return const _StatusPalette(
          label: 'EN COURS',
          icon: Icons.local_shipping,
          fg: Color(0xFF0FB271),
          bg: Color(0x330FB271),
          border: Color(0x660FB271),
        );
      default:
        return const _StatusPalette(
          label: 'EN COURS',
          icon: Icons.local_shipping,
          fg: Color(0xFF0FB271),
          bg: Color(0x330FB271),
          border: Color(0x660FB271),
        );
    }
  }
}

class _StatusPalette {
  final String label;
  final IconData icon;
  final Color fg;
  final Color bg;
  final Color border;

  const _StatusPalette({
    required this.label,
    required this.icon,
    required this.fg,
    required this.bg,
    required this.border,
  });
}

class _AddressLine extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;

  const _AddressLine({
    required this.icon,
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _HistoryButton extends StatelessWidget {
  final VoidCallback onTap;
  const _HistoryButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.04),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: const Row(
            children: [
              Icon(Icons.history, color: Colors.white70, size: 20),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Voir l\'historique complet',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white38),
            ],
          ),
        ),
      ),
    );
  }
}
