import '../router/app_router.dart';
import 'auth_service.dart';

class NotificationNavigationService {
  NotificationNavigationService._();

  static Future<void> openFromPayload(Map<String, String> data) async {
    final user = await AuthService().getCurrentUser();
    final role = user?.role;
    final orderId = data['orderId']?.trim();
    final deliveryId = data['deliveryId']?.trim();
    final targetId = (orderId != null && orderId.isNotEmpty)
        ? orderId
        : ((deliveryId != null && deliveryId.isNotEmpty) ? deliveryId : null);

    if (data['kind'] == 'direct_message') {
      if (role == 'CLIENT') {
        appRouter.go(AppRoutes.clientMessages);
      } else {
        appRouter.go(AppRoutes.messages);
      }
      return;
    }

    switch (role) {
      case 'CLIENT':
        if (targetId != null) {
          appRouter.go(AppRoutes.clientOrderDetails(targetId));
        } else {
          appRouter.go(AppRoutes.clientOrders);
        }
        return;
      case 'COMMERCANT':
        if (targetId != null) {
          appRouter.go(AppRoutes.merchantOrderDetails(targetId));
        } else {
          appRouter.go(AppRoutes.merchantOrders);
        }
        return;
      case 'LIVREUR':
        appRouter.go(AppRoutes.homeDriver);
        return;
      default:
        appRouter.go(AppRoutes.notifications);
    }
  }
}
