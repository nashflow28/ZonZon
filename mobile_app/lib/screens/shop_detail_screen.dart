import 'package:flutter/material.dart';
import '../config/env.dart';
import '../models/product.dart';
import '../models/shop.dart';
import '../services/shops_service.dart';

class ShopDetailScreen extends StatefulWidget {
  final String shopId;
  final Shop? preview;
  const ShopDetailScreen({super.key, required this.shopId, this.preview});

  @override
  State<ShopDetailScreen> createState() => _ShopDetailScreenState();
}

class _ShopDetailScreenState extends State<ShopDetailScreen> {
  final ShopsService _service = ShopsService();
  Shop? _shop;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _shop = widget.preview;
    _load();
  }

  Future<void> _load() async {
    final s = await _service.getPublic(widget.shopId);
    if (!mounted) return;
    setState(() {
      _shop = s ?? _shop;
      _loading = false;
    });
  }

  void _selectProduct(Product p) {
    Navigator.of(context).pop({'shop': _shop, 'product': p});
  }

  @override
  Widget build(BuildContext context) {
    final s = _shop;
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: s == null
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF10B981)))
          : CustomScrollView(
              slivers: [
                SliverAppBar(
                  expandedHeight: 220,
                  pinned: true,
                  backgroundColor: const Color(0xFF1E293B),
                  iconTheme: const IconThemeData(color: Colors.white),
                  flexibleSpace: FlexibleSpaceBar(
                    title: Text(s.name,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),
                    background: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (s.logoUrl != null)
                          Image.network('$apiUrl${s.logoUrl}',
                              fit: BoxFit.cover)
                        else
                          Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [Color(0xFF10B981), Color(0xFF0EA5E9)],
                              ),
                            ),
                            child: const Center(
                              child: Icon(Icons.storefront,
                                  color: Colors.white, size: 80),
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
                          if (s.description != null && s.description!.isNotEmpty) ...[
                            Text(
                              s.description!,
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 14, height: 1.4),
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
          Icon(icon, color: const Color(0xFF10B981), size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: const TextStyle(color: Colors.white, fontSize: 13)),
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
        color: const Color(0xFF1E293B),
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
                      image: NetworkImage('$apiUrl$photo'),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: photo == null
                ? const Icon(Icons.image_outlined,
                    color: Colors.white24, size: 32)
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
                      fontWeight: FontWeight.w600),
                ),
                if (product.description != null && product.description!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      product.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  '${product.priceFcfa} FCFA',
                  style: const TextStyle(
                    color: Color(0xFF10B981),
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
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Commander', style: TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
