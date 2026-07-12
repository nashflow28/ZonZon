import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/active_orders_store.dart';
import '../../services/client_services.dart';
import '../../utils/platform_adapter.dart';

/// Coquille du client avec bottom-nav 4 onglets.
///
/// Hôte du [StatefulNavigationShell] de go_router : préserve l'état de
/// chaque onglet (carte, formulaire, scroll de liste, etc.) et bascule
/// entre les branches sans rebuild des widgets enfants.
///
/// Au boot, déclenche le bootstrap du [ActiveOrdersStore] pour que la
/// liste des commandes actives soit déjà à jour quand l'utilisateur ouvre
/// l'onglet Commandes.
class ClientShellScreen extends StatefulWidget {
  final StatefulNavigationShell navigationShell;

  const ClientShellScreen({super.key, required this.navigationShell});

  @override
  State<ClientShellScreen> createState() => _ClientShellScreenState();
}

class _ClientShellScreenState extends State<ClientShellScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // Init du socket + bootstrap du store en parallèle.
    await ClientServices.socket.init();
    if (!mounted) return;
    await ClientServices.activeOrders.bootstrap(ClientServices.socket);
  }

  void _onTabTapped(int index) {
    // Si l'utilisateur tape sur l'onglet déjà actif, on ne fait rien.
    // Sinon on switch de branche (préserve l'état des autres branches).
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      body: widget.navigationShell,
      bottomNavigationBar: AnimatedBuilder(
        animation: ClientServices.activeOrders,
        builder: (context, _) {
          return SafeArea(
            top: false,
            child: _ClientBottomNav(
              currentIndex: widget.navigationShell.currentIndex,
              ordersBadgeCount: ClientServices.activeOrders.count,
              onTap: _onTabTapped,
            ),
          );
        },
      ),
    );
  }
}

class _ClientBottomNav extends StatelessWidget {
  final int currentIndex;
  final int ordersBadgeCount;
  final ValueChanged<int> onTap;

  const _ClientBottomNav({
    required this.currentIndex,
    required this.ordersBadgeCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (isCupertinoPlatform) {
      return CupertinoTabBar(
        currentIndex: currentIndex,
        onTap: onTap,
        backgroundColor: const Color(0xF2122530),
        activeColor: const Color(0xFF2E90FA),
        inactiveColor: CupertinoColors.inactiveGray,
        items: [
          const BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.home),
            label: 'Accueil',
          ),
          BottomNavigationBarItem(
            icon: _BadgedIcon(
              icon: CupertinoIcons.doc_text,
              count: ordersBadgeCount,
            ),
            label: 'Commandes',
          ),
          const BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.bag),
            label: 'Boutiques',
          ),
          const BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.person),
            label: 'Profil',
          ),
        ],
      );
    }

    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: onTap,
      height: 72,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      destinations: [
        const NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Accueil',
        ),
        NavigationDestination(
          icon: _BadgedIcon(
            icon: Icons.receipt_long_outlined,
            count: ordersBadgeCount,
          ),
          selectedIcon: _BadgedIcon(
            icon: Icons.receipt_long,
            count: ordersBadgeCount,
            isActive: true,
          ),
          label: 'Commandes',
        ),
        const NavigationDestination(
          icon: Icon(Icons.storefront_outlined),
          selectedIcon: Icon(Icons.storefront),
          label: 'Boutiques',
        ),
        const NavigationDestination(
          icon: Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person),
          label: 'Profil',
        ),
      ],
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  final bool isActive;

  const _BadgedIcon({
    required this.icon,
    required this.count,
    this.isActive = false,
  });

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return Icon(icon);
    final isAtLimit = count >= ActiveOrdersStore.maxActiveOrders;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(icon),
        Positioned(
          top: -4,
          right: -8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
            decoration: BoxDecoration(
              color: isAtLimit
                  ? const Color(0xFFF0453D)
                  : const Color(0xFF2E90FA),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF122530), width: 1.5),
            ),
            child: Text(
              '$count',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
                height: 1.2,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
