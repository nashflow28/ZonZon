import 'package:flutter/material.dart';

import '../models/shop.dart';
import '../services/shops_service.dart';
import '../utils/media_url.dart';
import '../utils/platform_adapter.dart';
import 'shop_detail_screen.dart';

/// Écran "Mes favoris" — liste des boutiques que l'utilisateur a marquées
/// comme favorites. Charge `GET /shops/favorites`, gère les états
/// loading / erreur (avec Réessayer) / vide / liste, supporte le pull-to-refresh
/// et permet de retirer un favori via le bouton cœur (avec snackbar de
/// confirmation et possibilité d'annuler localement en cas d'erreur réseau).
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  final ShopsService _service = ShopsService();
  bool _loading = true;
  bool _hasError = false;
  String? _errorMessage;
  List<Shop> _shops = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _hasError = false;
      _errorMessage = null;
    });
    try {
      final list = await _service.getFavorites();
      if (!mounted) return;
      setState(() {
        _shops = list;
        _loading = false;
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

  Future<void> _refresh() async {
    try {
      final list = await _service.getFavorites();
      if (!mounted) return;
      setState(() {
        _shops = list;
        _hasError = false;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(context, 'Erreur, veuillez réessayer.', isError: true);
    }
  }

  Future<void> _openShop(Shop shop) async {
    await pushAdaptive<Map<String, dynamic>>(
      context,
      ShopDetailScreen(shopId: shop.id, preview: shop),
    );
    // Au retour, on rafraîchit silencieusement pour refléter un éventuel
    // unfavorite fait depuis l'écran détail.
    if (mounted) _refresh();
  }

  Future<void> _removeFavorite(Shop shop) async {
    // Optimistic update : retirer immédiatement de la liste locale.
    final index = _shops.indexWhere((s) => s.id == shop.id);
    if (index < 0) return;
    final removed = _shops[index];
    setState(() {
      _shops = List.of(_shops)..removeAt(index);
    });
    try {
      await _service.removeFavorite(shop.id);
      if (!mounted) return;
      hapticLight();
      showAdaptiveSnack(context, 'Retiré des favoris.');
    } catch (_) {
      if (!mounted) return;
      // Revert en cas d'erreur.
      setState(() {
        final next = List.of(_shops);
        next.insert(index.clamp(0, next.length), removed);
        _shops = next;
      });
      showAdaptiveSnack(context, 'Erreur, veuillez réessayer.', isError: true);
    }
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
          'Mes favoris',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(child: adaptiveLoader(color: const Color(0xFF2E90FA)))
          : _hasError
          ? _errorView()
          : RefreshIndicator(
              color: const Color(0xFF2E90FA),
              backgroundColor: const Color(0xFF122530),
              onRefresh: _refresh,
              child: _shops.isEmpty ? _emptyView() : _listView(),
            ),
    );
  }

  Widget _errorView() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
          child: Column(
            children: [
              const Icon(
                Icons.error_outline,
                color: Color(0xFFF0453D),
                size: 48,
              ),
              const SizedBox(height: 16),
              const Text(
                'Impossible de charger les favoris.',
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

  Widget _emptyView() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        Padding(
          padding: EdgeInsets.fromLTRB(32, 100, 32, 32),
          child: Column(
            children: [
              Icon(Icons.favorite_border, color: Colors.white24, size: 64),
              SizedBox(height: 16),
              Text(
                'Aucun favori pour le moment.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 6),
              Text(
                'Cliquez sur le ❤️ d\'une boutique pour l\'ajouter ici.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white60, fontSize: 13),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _listView() {
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      itemCount: _shops.length,
      itemBuilder: (_, i) {
        final shop = _shops[i];
        return _FavoriteShopCard(
          shop: shop,
          onTap: () => _openShop(shop),
          onRemove: () => _removeFavorite(shop),
        );
      },
    );
  }
}

class _FavoriteShopCard extends StatelessWidget {
  final Shop shop;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  const _FavoriteShopCard({
    required this.shop,
    required this.onTap,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final logo = shop.logoUrl;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          onLongPress: onRemove,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.white.withValues(alpha: 0.05),
                    image: logo != null
                        ? DecorationImage(
                            image: NetworkImage(mediaUrl(logo)),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: logo == null
                      ? const Icon(
                          Icons.storefront,
                          color: Color(0xFF0FB271),
                          size: 28,
                        )
                      : null,
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
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        shop.address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 12,
                        ),
                      ),
                      if (shop.distanceKm != null) ...[
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(
                              Icons.near_me,
                              size: 12,
                              color: Color(0xFF2E90FA),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${shop.distanceKm!.toStringAsFixed(1)} km',
                              style: const TextStyle(
                                color: Color(0xFF2E90FA),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                Material(
                  color: Colors.transparent,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: IconButton(
                    icon: const Icon(
                      Icons.favorite,
                      color: Color(0xFFF0453D),
                      size: 22,
                    ),
                    tooltip: 'Retirer des favoris',
                    onPressed: onRemove,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
