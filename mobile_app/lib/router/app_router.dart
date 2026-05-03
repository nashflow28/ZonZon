import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../driver_screen.dart';
import '../order_screen.dart';
import '../screens/client_profile_screen.dart';
import '../screens/driver_profile_screen.dart';
import '../screens/favorites_screen.dart';
import '../screens/login_screen.dart';
import '../screens/merchant_home_screen.dart';
import '../screens/order_history_screen.dart';
import '../screens/register_screen.dart';
import '../screens/shop_list_screen.dart';
import '../services/auth_service.dart';

// ---------------------------------------------------------------------------
// Route path constants — use these everywhere instead of bare strings.
// ---------------------------------------------------------------------------
class AppRoutes {
  AppRoutes._();

  static const String splash = '/';
  static const String login = '/login';
  static const String register = '/register';

  // Role-based home routes
  static const String homeClient = '/home/client';
  static const String homeDriver = '/home/driver';
  static const String homeMerchant = '/home/merchant';

  // Sub-screens (pushed on top of the role home, keeping the back-stack)
  static const String shops = '/shops';
  static const String favorites = '/favorites';
  static const String history = '/history';
  static const String driverProfile = '/driver/profile';
  static const String clientProfile = '/home/client/profile';

  // Helper: returns the home route for a given role string.
  static String homeForRole(String? role) {
    switch (role) {
      case 'LIVREUR':
        return homeDriver;
      case 'COMMERCANT':
        return homeMerchant;
      case 'CLIENT':
      default:
        return homeClient;
    }
  }
}

// ---------------------------------------------------------------------------
// Router instance (top-level, never re-created).
// ---------------------------------------------------------------------------
final GoRouter appRouter = GoRouter(
  initialLocation: AppRoutes.splash,
  redirect: _globalRedirect,
  routes: [
    // Splash / auth-gate: redirect immediately in _globalRedirect.
    GoRoute(
      path: AppRoutes.splash,
      builder: (context, state) => const _SplashRedirector(),
    ),

    GoRoute(
      path: AppRoutes.login,
      builder: (context, state) => const LoginScreen(),
    ),

    GoRoute(
      path: AppRoutes.register,
      builder: (context, state) => const RegisterScreen(),
    ),

    // -----------------------------------------------------------------------
    // CLIENT home
    // -----------------------------------------------------------------------
    GoRoute(
      path: AppRoutes.homeClient,
      builder: (context, state) => const OrderScreen(),
      routes: [
        GoRoute(
          path: 'shops',
          builder: (context, state) => const ShopListScreen(),
        ),
        GoRoute(
          path: 'favorites',
          builder: (context, state) => const FavoritesScreen(),
        ),
        GoRoute(
          path: 'history',
          builder: (context, state) => const OrderHistoryScreen(),
        ),
        GoRoute(
          path: 'profile',
          builder: (context, state) => const ClientProfileScreen(),
        ),
      ],
    ),

    // -----------------------------------------------------------------------
    // LIVREUR home
    // -----------------------------------------------------------------------
    GoRoute(
      path: AppRoutes.homeDriver,
      builder: (context, state) => const DriverScreen(),
      routes: [
        GoRoute(
          path: 'history',
          builder: (context, state) => const OrderHistoryScreen(),
        ),
        GoRoute(
          path: 'profile',
          builder: (context, state) => const DriverProfileScreen(),
        ),
      ],
    ),

    // -----------------------------------------------------------------------
    // COMMERCANT home
    // -----------------------------------------------------------------------
    GoRoute(
      path: AppRoutes.homeMerchant,
      builder: (context, state) => const MerchantHomeScreen(),
    ),

    // -----------------------------------------------------------------------
    // Flat convenience routes (so any screen can navigate without knowing
    // the caller's role).
    // -----------------------------------------------------------------------
    GoRoute(
      path: AppRoutes.shops,
      builder: (context, state) => const ShopListScreen(),
    ),
    GoRoute(
      path: AppRoutes.favorites,
      builder: (context, state) => const FavoritesScreen(),
    ),
    GoRoute(
      path: AppRoutes.history,
      builder: (context, state) => const OrderHistoryScreen(),
    ),
    GoRoute(
      path: AppRoutes.driverProfile,
      builder: (context, state) => const DriverProfileScreen(),
    ),
  ],

  errorBuilder: (context, state) => Scaffold(
    body: Center(
      child: Text(
        'Route introuvable : ${state.error}',
        style: const TextStyle(color: Colors.white),
      ),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Global redirect — runs before every navigation event.
//
// Strategy:
//   • If the user has a valid token  → send them to the role-based home.
//   • If the user has no token       → send them to /login.
//   • If they are already on /login or /register → let them through.
// ---------------------------------------------------------------------------
Future<String?> _globalRedirect(
  BuildContext context,
  GoRouterState state,
) async {
  final token = await AuthService().getToken();
  final hasToken = token != null && token.isNotEmpty;

  final onAuthScreen = state.matchedLocation == AppRoutes.login ||
      state.matchedLocation == AppRoutes.register;

  // Unauthenticated user trying to access a protected route → send to login.
  if (!hasToken && !onAuthScreen) {
    return AppRoutes.login;
  }

  // Authenticated user trying to access login/register → redirect to home.
  if (hasToken && onAuthScreen) {
    final user = await AuthService().getCurrentUser();
    return AppRoutes.homeForRole(user?.role);
  }

  // Authenticated user landing on splash ('/') → send to role-based home.
  if (hasToken && state.matchedLocation == AppRoutes.splash) {
    final user = await AuthService().getCurrentUser();
    return AppRoutes.homeForRole(user?.role);
  }

  return null; // No redirect needed.
}

// ---------------------------------------------------------------------------
// Splash widget: shown only if the redirect hasn't fired yet (very briefly).
// ---------------------------------------------------------------------------
class _SplashRedirector extends StatelessWidget {
  const _SplashRedirector();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF0F172A),
      body: Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: Color(0xFF0EA5E9),
          ),
        ),
      ),
    );
  }
}
