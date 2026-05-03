import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'order_screen.dart';
import 'driver_screen.dart';
import 'router/app_router.dart';
import 'screens/merchant_home_screen.dart';
import 'services/auth_service.dart';
import 'utils/platform_adapter.dart';

/// Aiguillage par rôle après authentification.
/// - CLIENT    → OrderScreen (commande directe + accès aux commerces)
/// - LIVREUR   → DriverScreen
/// - COMMERCANT → MerchantHomeScreen
/// - ADMIN     → web dashboard (l'app mobile montre une page neutre avec logout)
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _role;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  Future<void> _loadRole() async {
    final user = await AuthService().getCurrentUser();
    if (!mounted) return;
    setState(() {
      _role = user?.role;
      _loading = false;
    });
  }

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: Center(child: adaptiveLoader()),
      );
    }
    switch (_role) {
      case 'LIVREUR':
        return const DriverScreen();
      case 'COMMERCANT':
        return const MerchantHomeScreen();
      case 'CLIENT':
        return const OrderScreen();
      default:
        return Scaffold(
          backgroundColor: const Color(0xFF0F172A),
          body: SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.admin_panel_settings,
                      color: Color(0xFF0EA5E9), size: 80),
                  const SizedBox(height: 16),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 32),
                    child: Text(
                      'Compte administrateur. Utilisez le tableau de bord web.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                  ),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    onPressed: _logout,
                    icon: const Icon(Icons.logout),
                    label: const Text('Se déconnecter'),
                  ),
                ],
              ),
            ),
          ),
        );
    }
  }
}
