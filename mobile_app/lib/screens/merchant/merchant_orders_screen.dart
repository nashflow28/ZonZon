import 'package:flutter/material.dart';

import '../../models/order_history_item.dart';
import '../../services/merchant_orders_service.dart';
import '../../utils/platform_adapter.dart';

/// Écran « Mes livraisons » pour un COMMERCANT.
///
/// Liste les livraisons créées par le commerçant connecté via
/// `GET /orders/mine` (le backend renvoie directement le sous-ensemble
/// pertinent selon le rôle de l'utilisateur).
class MerchantOrdersScreen extends StatefulWidget {
  const MerchantOrdersScreen({super.key});

  @override
  State<MerchantOrdersScreen> createState() => _MerchantOrdersScreenState();
}

class _MerchantOrdersScreenState extends State<MerchantOrdersScreen> {
  final MerchantOrdersService _service = MerchantOrdersService();

  bool _loading = true;
  bool _hasError = false;
  String? _errorMessage;
  List<OrderHistoryItem> _orders = const [];

  static const _months = <String>[
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final orders = await _service.getMyMerchantOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _loading = false;
        _hasError = false;
        _errorMessage = null;
      });
    } on MerchantOrderException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = e.toString();
      });
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '—';
    final local = date.toLocal();
    final day = local.day;
    final month = _months[local.month - 1];
    final year = local.year;
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day $month $year à ${hour}h$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Mes livraisons',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : RefreshIndicator(
              color: const Color(0xFF0FB271),
              onRefresh: _load,
              child: _buildBody(),
            ),
    );
  }

  Widget _buildBody() {
    if (_hasError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
            child: Column(
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFF0453D), size: 48),
                const SizedBox(height: 16),
                const Text(
                  'Impossible de charger vos livraisons.',
                  style: TextStyle(color: Colors.white, fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text('Réessayer'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E90FA),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_orders.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 100, 24, 24),
            child: Column(
              children: [
                const Icon(Icons.local_shipping_outlined,
                    color: Colors.white24, size: 56),
                const SizedBox(height: 16),
                const Text(
                  'Aucune livraison créée',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Créez votre première livraison pour un client depuis l’onglet dédié.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: _orders.length,
      itemBuilder: (ctx, i) => _MerchantOrderCard(
        item: _orders[i],
        formatDate: _formatDate,
      ),
    );
  }
}

class _StatusVisual {
  final String label;
  final Color color;
  const _StatusVisual(this.label, this.color);

  static _StatusVisual of(String status) {
    switch (status) {
      case 'PENDING':
        return const _StatusVisual('En attente', Color(0xFFEAB308));
      case 'ACCEPTED':
        return const _StatusVisual('Acceptée', Color(0xFF2E90FA));
      case 'IN_PROGRESS':
        return const _StatusVisual('En cours', Color(0xFFA855F7));
      case 'COMPLETED':
        return const _StatusVisual('Terminée', Color(0xFF0FB271));
      case 'CANCELLED':
        return const _StatusVisual('Annulée', Color(0xFFF0453D));
      default:
        return _StatusVisual(status, Colors.white54);
    }
  }
}

class _MerchantOrderCard extends StatelessWidget {
  final OrderHistoryItem item;
  final String Function(DateTime?) formatDate;

  const _MerchantOrderCard({
    required this.item,
    required this.formatDate,
  });

  String _formatPrice(int? p) {
    if (p == null) return '-';
    final s = p.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '$buf FCFA';
  }

  String? _clientLine() {
    final client = item.client;
    if (client != null) {
      final first = (client['firstName'] ?? '').toString().trim();
      final last = (client['lastName'] ?? '').toString().trim();
      final phone = (client['phone'] ?? item.clientPhone ?? '').toString().trim();
      final name = '$first $last'.trim();
      if (name.isNotEmpty) {
        return phone.isEmpty ? name : '$name · $phone';
      }
    }
    final name = (item.clientName ?? '').trim();
    final phone = (item.clientPhone ?? '').trim();
    if (name.isEmpty && phone.isEmpty) return null;
    if (name.isEmpty) return phone;
    if (phone.isEmpty) return name;
    return '$name · $phone';
  }

  @override
  Widget build(BuildContext context) {
    final visual = _StatusVisual.of(item.status);
    final clientLine = _clientLine();
    final distance = item.distanceKm;
    final price = item.priceFcfa;
    final metaParts = <String>[];
    if (distance != null) metaParts.add('${distance.toStringAsFixed(1)} km');
    if (price != null) metaParts.add(_formatPrice(price));

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF122530),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _StatusPill(visual: visual),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    formatDate(item.createdAt),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _AddressLine(
              icon: Icons.my_location,
              color: const Color(0xFF2E90FA),
              text: item.pickupAddress.isEmpty ? '—' : item.pickupAddress,
            ),
            const SizedBox(height: 6),
            _AddressLine(
              icon: Icons.location_on,
              color: const Color(0xFF0FB271),
              text: item.deliveryAddress.isEmpty ? '—' : item.deliveryAddress,
            ),
            if (clientLine != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.person_outline, color: Colors.white54, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      clientLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ],
            if (metaParts.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                metaParts.join(' · '),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final _StatusVisual visual;
  const _StatusPill({required this.visual});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: visual.color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: visual.color.withValues(alpha: 0.5)),
      ),
      child: Text(
        visual.label,
        style: TextStyle(
          color: visual.color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
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
      crossAxisAlignment: CrossAxisAlignment.start,
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
