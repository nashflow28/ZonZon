import 'order_status_utils.dart';

typedef ActiveOrder = Map<String, dynamic>;

List<ActiveOrder> upsertActiveOrder(
  List<ActiveOrder> orders,
  ActiveOrder order,
) {
  final id = order['id']?.toString();
  if (id == null ||
      id.isEmpty ||
      OrderStatusUtils.isTerminal(order['status']?.toString())) {
    return orders;
  }
  final next = orders
      .where((candidate) => candidate['id']?.toString() != id)
      .map(ActiveOrder.from)
      .toList();
  next.add(ActiveOrder.from(order));
  return next;
}

List<ActiveOrder> applyActiveOrderStatus(
  List<ActiveOrder> orders,
  String orderId,
  String status,
) {
  if (OrderStatusUtils.isTerminal(status)) {
    return orders
        .where((order) => order['id']?.toString() != orderId)
        .map(ActiveOrder.from)
        .toList();
  }
  return orders
      .map(
        (order) => order['id']?.toString() == orderId
            ? (ActiveOrder.from(order)..['status'] = status)
            : ActiveOrder.from(order),
      )
      .toList();
}

List<ActiveOrder> applyActiveOrderPayment(
  List<ActiveOrder> orders,
  String orderId,
  String paymentStatus,
) => orders
    .map(
      (order) => order['id']?.toString() == orderId
          ? (ActiveOrder.from(order)..['paymentStatus'] = paymentStatus)
          : ActiveOrder.from(order),
    )
    .toList();
