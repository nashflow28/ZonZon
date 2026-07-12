import 'package:flutter/material.dart';

import '../utils/order_status_utils.dart';
import '../utils/money_format.dart';

class DriverActiveOrderShortcuts extends StatelessWidget {
  final List<Map<String, dynamic>> orders;
  final ValueChanged<Map<String, dynamic>> onOpen;

  const DriverActiveOrderShortcuts({
    super.key,
    required this.orders,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) => Column(
    children: orders.map((order) {
      final status = order['status']?.toString() ?? 'ACCEPTED';
      final pickup = order['pickupAddress']?.toString() ?? 'Retrait';
      final delivery = order['deliveryAddress']?.toString() ?? 'Livraison';
      final price = formatFcfa(order['priceFcfa']);
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Material(
          color: const Color(0xFF0FB271).withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            key: ValueKey('active-order-${order['id']}'),
            borderRadius: BorderRadius.circular(16),
            onTap: () => onOpen(order),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  const Icon(Icons.navigation, color: Color(0xFF0FB271)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Course en cours - ${OrderStatusUtils.label(status)}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '$pickup -> $delivery',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    price,
                    style: const TextStyle(
                      color: Color(0xFF0FB271),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
      );
    }).toList(),
  );
}
