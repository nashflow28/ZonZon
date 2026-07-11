import 'package:flutter/material.dart';
import '../utils/media_url.dart';
import '../models/product.dart';
import '../models/shop.dart';
import '../services/shops_service.dart';
import '../utils/platform_adapter.dart';

class ShopDetailScreen extends StatefulWidget {
  final String shopId;
  final Shop? preview;

  /// État favori initial transmis par l'écran appelant (`ShopListScreen`) pour
  /// éviter un re-fetch de la liste des favoris quand on ouvre une boutique.
  /// Si `null`, l'écran charge `getFavoriteIds()` au `initState`.
  final bool? isFavoriteInitial;

  /// Callback optionnel : prévient l'écran appelant quand l'état favori change
  /// (utile pour mettre à jour le `Set<String>` local sans refetch).
  final void Function(bool isFavorite)? onFavoriteChanged;

  const ShopDetailScreen({
    super.key,
    required this.shopId,
    this.preview,
    this.isFavoriteInitial,
    this.onFavoriteChanged,
  });

  @override
  State<ShopDetailScreen> createState() => _ShopDetailScreenState();
}

class _ShopDetailScreenState extends State<ShopDetailScreen> {
  final ShopsService _service = ShopsService();
  Shop? _shop;
  bool _isFavorite = false;
  bool _favoriteLoaded = false;

  @override
  void initState() {
    super.initState();
    _shop = widget.preview;
    if (widget.isFavoriteInitial != null) {
      _isFavorite = widget.isFavoriteInitial!;
      _favoriteLoaded = true;
    }
    _load();
    if (!_favoriteLoaded) {
      _loadFavoriteStatus();
    }
  }

  Future<void> _load() async {
    final s = await _service.getPublic(widget.shopId);
    if (!mounted) return;
    setState(() {
      _shop = s ?? _shop;
    });
  }

  Future<void> _loadFavoriteStatus() async {
    final ids = await _service.getFavoriteIds();
    if (!mounted) return;
    setState(() {
      _isFavorite = ids.contains(widget.shopId);
      _favoriteLoaded = true;
    });
  }

  Future<void> _toggleFavorite() async {
    final wasFav = _isFavorite;
    setState(() => _isFavorite = !wasFav);
    widget.onFavoriteChanged?.call(!wasFav);
    hapticLight();
    try {
      if (wasFav) {
        await _service.removeFavorite(widget.shopId);
      } else {
        await _service.addFavorite(widget.shopId);
      }
    } catch (_) {
      if (!mounted) return;
      // Revert.
      setState(() => _isFavorite = wasFav);
      widget.onFavoriteChanged?.call(wasFav);
      showAdaptiveSnack(context, 'Erreur, veuillez réessayer.', isError: true);
    }
  }

  void _selectProduct(Product p) {
    Navigator.of(context).pop({'shop': _shop, 'product': p});
  }

  @override
  Widget build(BuildContext context) {
    final s = _shop;
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      body: s == null
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : CustomScrollView(
              slivers: [
                SliverAppBar(
                  expandedHeight: 220,
                  pinned: true,
                  backgroundColor: const Color(0xFF122530),
                  iconTheme: const IconThemeData(color: Colors.white),
                  actions: [
                    IconButton(
                      tooltip: _isFavorite
                          ? 'Retirer des favoris'
                          : 'Ajouter aux favoris',
                      icon: Icon(
                        _isFavorite ? Icons.favorite : Icons.favorite_border,
                        color: _isFavorite
                            ? const Color(0xFFF0453D)
                            : Colors.white,
                      ),
                      onPressed: _favoriteLoaded ? _toggleFavorite : null,
                    ),
                  ],
                  flexibleSpace: FlexibleSpaceBar(
                    title: Text(
                      s.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    background: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (s.logoUrl != null)
                          Image.network(mediaUrl(s.logoUrl!), fit: BoxFit.cover)
                        else
                          Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [Color(0xFF0FB271), Color(0xFF2E90FA)],
                              ),
                            ),
                            child: const Center(
                              child: Icon(
                                Icons.storefront,
                                color: Colors.white,
                                size: 80,
                              ),
                            ),
                          ),
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                Colors.black.withValues(alpha: 0.7),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverList(
                  delegate: SliverChildListDelegate([
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (s.description != null &&
                              s.description!.isNotEmpty) ...[
                            Text(
                              s.description!,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 14,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                          _infoRow(Icons.place, s.address),
                          if (s.hours != null && s.hours!.isNotEmpty)
                            _infoRow(Icons.access_time, s.hours!),
                          if (s.phone != null && s.phone!.isNotEmpty)
                            _infoRow(Icons.phone, s.phone!),
                          const SizedBox(height: 18),
                          const Text(
                            'Produits',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (s.products.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: Center(
                                child: Text(
                                  'Aucun produit pour le moment.',
                                  style: TextStyle(color: Colors.white54),
                                ),
                              ),
                            )
                          else
                            ...s.products.map(
                              (p) => _ProductCard(
                                product: p,
                                onOrder: () => _selectProduct(p),
                              ),
                            ),
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ]),
                ),
              ],
            ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF0FB271), size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Product product;
  final VoidCallback onOrder;
  const _ProductCard({required this.product, required this.onOrder});

  @override
  Widget build(BuildContext context) {
    final photo = product.photoUrl;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF122530),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          Container(
            width: 70,
            height: 70,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: Colors.white.withValues(alpha: 0.05),
              image: photo != null
                  ? DecorationImage(
                      image: NetworkImage(mediaUrl(photo)),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: photo == null
                ? const Icon(
                    Icons.image_outlined,
                    color: Colors.white24,
                    size: 32,
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (product.description != null &&
                    product.description!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      product.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  '${product.priceFcfa} FCFA',
                  style: const TextStyle(
                    color: Color(0xFF0FB271),
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: onOrder,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0FB271),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text('Commander', style: TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
