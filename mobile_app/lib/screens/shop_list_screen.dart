import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../config/env.dart';
import '../models/shop.dart';
import '../services/shops_service.dart';
import 'favorites_screen.dart';
import 'shop_detail_screen.dart';
import '../utils/platform_adapter.dart';

/// Sélection de boutique côté client.
/// Retourne `{shop, product}` au order_screen quand un produit est commandé.
class ShopListScreen extends StatefulWidget {
  const ShopListScreen({super.key});

  @override
  State<ShopListScreen> createState() => _ShopListScreenState();
}

class _ShopListScreenState extends State<ShopListScreen> {
  final ShopsService _service = ShopsService();
  List<ShopCategory> _categories = [];
  List<Shop> _shops = [];
  String? _categoryFilter;
  bool _loading = true;
  double? _myLat;
  double? _myLng;
  // IDs des shops favorites du user (chargé une fois au bootstrap, mis à jour
  // localement à chaque toggle pour éviter un appel API à chaque carte).
  Set<String> _favoriteIds = <String>{};

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // Récupère la position pour trier les boutiques par distance
    try {
      final perm = await Geolocator.checkPermission();
      if (perm != LocationPermission.denied &&
          perm != LocationPermission.deniedForever) {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
        );
        _myLat = pos.latitude;
        _myLng = pos.longitude;
      }
    } catch (_) {}

    final cats = await _service.categories();
    if (!mounted) return;
    setState(() => _categories = cats);
    // Charge en parallèle les boutiques et les IDs des favoris.
    await Future.wait([_refresh(), _loadFavoriteIds()]);
  }

  Future<void> _loadFavoriteIds() async {
    final ids = await _service.getFavoriteIds();
    if (!mounted) return;
    setState(() => _favoriteIds = ids);
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final shops = await _service.listPublic(
      category: _categoryFilter,
      lat: _myLat,
      lng: _myLng,
    );
    if (!mounted) return;
    setState(() {
      _shops = shops;
      _loading = false;
    });
  }

  Future<void> _openShop(Shop shop) async {
    final result = await pushAdaptive<Map<String, dynamic>>(
      context,
      ShopDetailScreen(
        shopId: shop.id,
        preview: shop,
        isFavoriteInitial: _favoriteIds.contains(shop.id),
        onFavoriteChanged: (isFav) {
          if (!mounted) return;
          setState(() {
            if (isFav) {
              _favoriteIds.add(shop.id);
            } else {
              _favoriteIds.remove(shop.id);
            }
          });
        },
      ),
    );
    // Si l'utilisateur a choisi un produit, on remonte le résultat à order_screen
    if (result != null && mounted) {
      Navigator.of(context).pop(result);
    }
  }

  Future<void> _openFavorites() async {
    await pushAdaptive<void>(context, const FavoritesScreen());
    // Au retour, on rafraîchit le set de favoris (une boutique a pu être
    // retirée depuis l'écran "Mes favoris").
    if (mounted) _loadFavoriteIds();
  }

  Future<void> _toggleFavorite(Shop shop) async {
    final wasFav = _favoriteIds.contains(shop.id);
    // Optimistic update.
    setState(() {
      if (wasFav) {
        _favoriteIds.remove(shop.id);
      } else {
        _favoriteIds.add(shop.id);
      }
    });
    hapticLight();
    try {
      if (wasFav) {
        await _service.removeFavorite(shop.id);
      } else {
        await _service.addFavorite(shop.id);
      }
    } catch (_) {
      if (!mounted) return;
      // Revert.
      setState(() {
        if (wasFav) {
          _favoriteIds.add(shop.id);
        } else {
          _favoriteIds.remove(shop.id);
        }
      });
      showAdaptiveSnack(context, 'Erreur, veuillez réessayer.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Commerces',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.favorite, color: Color(0xFFEF4444)),
            tooltip: 'Mes favoris',
            onPressed: _openFavorites,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_categories.isNotEmpty)
            SizedBox(
              height: 52,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                itemCount: _categories.length + 1,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  if (i == 0) {
                    return _CategoryChip(
                      label: 'Toutes',
                      selected: _categoryFilter == null,
                      onTap: () {
                        setState(() => _categoryFilter = null);
                        _refresh();
                      },
                    );
                  }
                  final c = _categories[i - 1];
                  return _CategoryChip(
                    label: c.label,
                    selected: _categoryFilter == c.value,
                    onTap: () {
                      setState(() => _categoryFilter = c.value);
                      _refresh();
                    },
                  );
                },
              ),
            ),
          Expanded(
            child: _loading
                ? Center(child: adaptiveLoader(color: const Color(0xFF10B981)))
                : _shops.isEmpty
                    ? _empty()
                    : RefreshIndicator(
                        color: const Color(0xFF10B981),
                        onRefresh: _refresh,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                          itemCount: _shops.length,
                          itemBuilder: (_, i) => _ShopCard(
                            shop: _shops[i],
                            isFavorite: _favoriteIds.contains(_shops[i].id),
                            onTap: () => _openShop(_shops[i]),
                            onToggleFavorite: () => _toggleFavorite(_shops[i]),
                          ),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _empty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.storefront, color: Colors.white24, size: 64),
            const SizedBox(height: 12),
            const Text(
              'Aucune boutique disponible pour cette catégorie.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white60, fontSize: 15),
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh, color: Color(0xFF10B981)),
              label: const Text('Rafraîchir',
                  style: TextStyle(color: Color(0xFF10B981))),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? const Color(0xFF10B981).withValues(alpha: 0.25)
          : Colors.white.withValues(alpha: 0.05),
      shape: StadiumBorder(
        side: BorderSide(
          color: selected
              ? const Color(0xFF10B981)
              : Colors.white.withValues(alpha: 0.1),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? const Color(0xFF10B981) : Colors.white70,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _ShopCard extends StatelessWidget {
  final Shop shop;
  final bool isFavorite;
  final VoidCallback onTap;
  final VoidCallback onToggleFavorite;
  const _ShopCard({
    required this.shop,
    required this.isFavorite,
    required this.onTap,
    required this.onToggleFavorite,
  });

  @override
  Widget build(BuildContext context) {
    final logo = shop.logoUrl;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
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
                                image: NetworkImage('$apiUrl$logo'),
                                fit: BoxFit.cover,
                              )
                            : null,
                      ),
                      child: logo == null
                          ? const Icon(Icons.storefront,
                              color: Color(0xFF10B981), size: 28)
                          : null,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Padding-end pour ne pas chevaucher le cœur en haut à droite.
                          Padding(
                            padding: const EdgeInsets.only(right: 32),
                            child: Text(
                              shop.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            shop.address,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white60, fontSize: 12),
                          ),
                          if (shop.distanceKm != null) ...[
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(Icons.near_me,
                                    size: 12, color: Color(0xFF0EA5E9)),
                                const SizedBox(width: 4),
                                Text(
                                  '${shop.distanceKm!.toStringAsFixed(1)} km',
                                  style: const TextStyle(
                                    color: Color(0xFF0EA5E9),
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
                    const Icon(Icons.chevron_right, color: Colors.white60),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: Material(
              color: Colors.transparent,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onToggleFavorite,
                customBorder: const CircleBorder(),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Icon(
                    isFavorite ? Icons.favorite : Icons.favorite_border,
                    color: isFavorite
                        ? const Color(0xFFEF4444)
                        : Colors.white70,
                    size: 22,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
