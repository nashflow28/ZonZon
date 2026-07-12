import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../models/place.dart';
import '../services/eta_service.dart';
import '../utils/order_status_utils.dart';

/// Header glass + logo + bouton logout pour l'écran de commande.
class OrderHeader extends StatelessWidget {
  final VoidCallback onLogout;
  final VoidCallback? onOpenHistory;
  final VoidCallback? onOpenProfile;
  const OrderHeader({
    super.key,
    required this.onLogout,
    this.onOpenHistory,
    this.onOpenProfile,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 8,
      left: 20,
      right: 20,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20),
            decoration: BoxDecoration(
              color: const Color(0xFF122530).withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (onOpenHistory != null)
                  Material(
                    color: Colors.white.withValues(alpha: 0.06),
                    shape: const CircleBorder(),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: onOpenHistory,
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.history,
                          color: Colors.white70,
                          size: 20,
                        ),
                      ),
                    ),
                  )
                else
                  const SizedBox(width: 44),
                const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'ZonZon',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.5,
                      ),
                    ),
                    Text(
                      'Express',
                      style: TextStyle(
                        color: Color(0xFFFF9E1B),
                        fontSize: 24,
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ],
                ),
                Material(
                  color: Colors.white.withValues(alpha: 0.06),
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onOpenProfile ?? onLogout,
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(
                        onOpenProfile != null
                            ? Icons.account_circle_outlined
                            : Icons.logout,
                        color: Colors.white70,
                        size: onOpenProfile != null ? 22 : 18,
                      ),
                    ),
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

/// Bandeau "Commande : produit" affiché quand le pickup vient d'une boutique.
class ShopOriginBanner extends StatelessWidget {
  final String productName;
  final VoidCallback onCancel;

  const ShopOriginBanner({
    super.key,
    required this.productName,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0FB271).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFF0FB271).withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.shopping_bag, color: Color(0xFF0FB271), size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Commande : $productName',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 16, color: Colors.white60),
            tooltip: 'Annuler',
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            onPressed: onCancel,
          ),
        ],
      ),
    );
  }
}

/// Carte d'adresse cliquable (départ / arrivée).
class AddressCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final Place? place;
  final String emptyHint;
  final VoidCallback onTap;

  const AddressCard({
    super.key,
    required this.icon,
    required this.color,
    required this.label,
    required this.place,
    required this.emptyHint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.04),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: place == null
                  ? color.withValues(alpha: 0.35)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      place?.shortName ?? emptyHint,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: place == null ? Colors.white54 : Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (place != null &&
                        place!.displayName != place!.shortName) ...[
                      const SizedBox(height: 1),
                      Text(
                        place!.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: Colors.white.withValues(alpha: 0.4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bouton pour intervertir départ ↔ arrivée.
class SwapButton extends StatelessWidget {
  final VoidCallback onTap;
  const SwapButton({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 1,
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Material(
              color: const Color(0xFF122530),
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: const SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(
                    Icons.swap_vert,
                    color: Color(0xFF2E90FA),
                    size: 20,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: Container(
              height: 1,
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bandeau d'estimation distance / prix (résultat OSRM).
class EstimatePreview extends StatelessWidget {
  final Place? pickup;
  final Place? delivery;
  final bool loading;
  final double? km;
  final int? priceFcfa;
  final bool showPrice;

  const EstimatePreview({
    super.key,
    required this.pickup,
    required this.delivery,
    required this.loading,
    required this.km,
    required this.priceFcfa,
    this.showPrice = true,
  });

  static String _formatThousands(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    if (pickup == null || delivery == null) return const SizedBox.shrink();
    return AnimatedSize(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              const Color(0xFF2E90FA).withValues(alpha: 0.18),
              const Color(0xFF0FB271).withValues(alpha: 0.10),
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFF2E90FA).withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFF2E90FA).withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.alt_route,
                color: Color(0xFF2E90FA),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (loading)
                    const Row(
                      children: [
                        SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF2E90FA),
                          ),
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Calcul du trajet…',
                          style: TextStyle(color: Colors.white, fontSize: 13),
                        ),
                      ],
                    )
                  else if (km != null) ...[
                    Text(
                      '${km!.toStringAsFixed(1)} km',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      showPrice
                          ? 'Prix estimé'
                          : 'Le livreur proposera son prix',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (showPrice && priceFcfa != null && !loading)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${_formatThousands(priceFcfa!)} FCFA',
                    style: const TextStyle(
                      color: Color(0xFF0FB271),
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Text(
                    'à payer en livraison',
                    style: TextStyle(color: Colors.white60, fontSize: 11),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// Champ de description du colis ("Que transportez-vous ?").
class DescriptionField extends StatelessWidget {
  final TextEditingController controller;
  const DescriptionField({super.key, required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white, fontSize: 16),
        decoration: InputDecoration(
          hintText: 'Que transportez-vous ?',
          hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
          prefixIcon: const Icon(
            Icons.inventory_2_outlined,
            color: Color(0xFF2E90FA),
          ),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 20,
            vertical: 18,
          ),
        ),
      ),
    );
  }
}

/// Gros bouton "Commander maintenant" gradient bleu.
class PrimaryGradientButton extends StatelessWidget {
  final bool loading;
  final VoidCallback onPressed;
  final String label;

  const PrimaryGradientButton({
    super.key,
    required this.loading,
    required this.onPressed,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        // Direction A : vert de marque avec profondeur (clair → foncé) plutôt
        // qu'un aplat bleu générique. Le bouton principal porte la couleur
        // signature « Go ».
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF14C784), Color(0xFF0FB271)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0FB271).withValues(alpha: 0.45),
            blurRadius: 26,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        child: loading
            ? const CircularProgressIndicator(color: Color(0xFF06140F))
            : Text(
                label,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  // Texte foncé sur fond vert vif → meilleur contraste et
                  // rendu plus « premium » que le blanc pur.
                  color: Color(0xFF06140F),
                  letterSpacing: 0.3,
                ),
              ),
      ),
    );
  }
}

/// Bottom-sheet glass + grip qui héberge le formulaire ou la vue acceptée.
class OrderBottomSheet extends StatelessWidget {
  final Widget child;
  const OrderBottomSheet({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.38,
      minChildSize: 0.16,
      maxChildSize: 0.82,
      snap: true,
      snapSizes: const [0.16, 0.38, 0.82],
      builder: (context, scrollController) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(40)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: EdgeInsets.fromLTRB(
              24,
              18,
              24,
              24 + MediaQuery.of(context).padding.bottom,
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  const Color(0xFF122530).withValues(alpha: 0.85),
                  const Color(0xFF0C1A22).withValues(alpha: 0.95),
                ],
              ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(40),
              ),
              border: Border(
                top: BorderSide(
                  color: Colors.white.withValues(alpha: 0.15),
                  width: 1.5,
                ),
              ),
            ),
            child: SingleChildScrollView(
              controller: scrollController,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 50,
                      height: 6,
                      margin: const EdgeInsets.only(bottom: 18),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  child,
                  const SizedBox(height: 6),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Formulaire complet de création de course (avant acceptation).
/// Reçoit l'état observable et délègue toute action au parent.
class OrderFormSection extends StatelessWidget {
  final Place? pickup;
  final Place? delivery;
  final TextEditingController descController;
  final bool hasShopOrigin;
  final String? shopProductName;
  final bool estimateLoading;
  final double? estimateKm;
  final int? estimatePrice;
  final bool submitLoading;
  final Widget? extraSection;
  final bool showEstimatedPrice;

  final VoidCallback onOpenShops;
  final VoidCallback onCancelShop;
  final VoidCallback onPickPickup;
  final VoidCallback onPickDelivery;
  final VoidCallback onSwap;
  final VoidCallback onSubmit;

  const OrderFormSection({
    super.key,
    required this.pickup,
    required this.delivery,
    required this.descController,
    required this.hasShopOrigin,
    required this.shopProductName,
    required this.estimateLoading,
    required this.estimateKm,
    required this.estimatePrice,
    required this.submitLoading,
    this.extraSection,
    this.showEstimatedPrice = true,
    required this.onOpenShops,
    required this.onCancelShop,
    required this.onPickPickup,
    required this.onPickDelivery,
    required this.onSwap,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Prêt à livrer ?',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Choisissez les points de la course.',
                    style: TextStyle(fontSize: 14, color: Colors.white60),
                  ),
                ],
              ),
            ),
            Material(
              color: const Color(0xFF0FB271).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(14),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onOpenShops,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.storefront, color: Color(0xFF0FB271)),
                      SizedBox(height: 4),
                      Text(
                        'Commerces',
                        style: TextStyle(
                          color: Color(0xFF0FB271),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        if (hasShopOrigin) ...[
          const SizedBox(height: 12),
          ShopOriginBanner(
            productName: shopProductName ?? '',
            onCancel: onCancelShop,
          ),
        ],
        const SizedBox(height: 18),
        AddressCard(
          icon: Icons.my_location,
          color: const Color(0xFF2E90FA),
          label: 'Départ',
          place: pickup,
          emptyHint: 'Choisir le point de départ',
          onTap: onPickPickup,
        ),
        SwapButton(onTap: onSwap),
        AddressCard(
          icon: Icons.location_on,
          color: const Color(0xFF0FB271),
          label: 'Arrivée',
          place: delivery,
          emptyHint: 'Choisir le point d’arrivée',
          onTap: onPickDelivery,
        ),
        if (extraSection != null) ...[
          const SizedBox(height: 14),
          extraSection!,
        ],
        const SizedBox(height: 14),
        EstimatePreview(
          pickup: pickup,
          delivery: delivery,
          loading: estimateLoading && estimatePrice == null,
          km: estimateKm,
          priceFcfa: estimatePrice,
          showPrice: showEstimatedPrice,
        ),
        const SizedBox(height: 14),
        DescriptionField(controller: descController),
        const SizedBox(height: 18),
        PrimaryGradientButton(
          loading: submitLoading,
          onPressed: onSubmit,
          label: 'Commander maintenant',
        ),
      ],
    );
  }
}

/// Vue affichée quand la commande est acceptée (icône check + suivi live
/// + bouton chat / WhatsApp).
class OrderAcceptedSection extends StatelessWidget {
  final Map<String, dynamic>? assignedLivreur;
  final String? activeOrderStatus;
  final String? paymentStatus;
  final LatLng? driverPosition;
  final DateTime? driverPositionAt;
  final double? distanceKm;
  final int unreadChatCount;
  final VoidCallback onOpenChat;
  final VoidCallback onOpenWhatsapp;
  final VoidCallback? onCancelOrder;

  /// Déclaration de paiement en espèces par le client (CDC §4 : le règlement
  /// se fait en espèces au livreur). Null = action masquée (déjà payé…).
  final VoidCallback? onMarkPaid;
  final EtaResult? eta;

  const OrderAcceptedSection({
    super.key,
    required this.assignedLivreur,
    required this.activeOrderStatus,
    required this.paymentStatus,
    required this.driverPosition,
    required this.driverPositionAt,
    required this.distanceKm,
    required this.onOpenChat,
    required this.onOpenWhatsapp,
    this.unreadChatCount = 0,
    this.onCancelOrder,
    this.onMarkPaid,
    this.eta,
  });

  bool get _showWhatsapp =>
      assignedLivreur != null &&
      (activeOrderStatus == 'ACCEPTED' || activeOrderStatus == 'IN_PROGRESS');

  bool get _showCancel =>
      onCancelOrder != null &&
      (activeOrderStatus == 'PENDING' || activeOrderStatus == 'ACCEPTED');

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TweenAnimationBuilder(
          duration: const Duration(milliseconds: 800),
          tween: Tween<double>(begin: 0, end: 1),
          builder: (context, double value, child) {
            return Transform.scale(
              scale: value,
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF0FB271).withValues(alpha: 0.1),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF0FB271).withValues(alpha: 0.2),
                      blurRadius: 30,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.check_circle,
                  color: Color(0xFF0FB271),
                  size: 60,
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 16),
        const Text(
          'Coursier en route !',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        if ((paymentStatus ?? '').isNotEmpty) ...[
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: PaymentStatusUtils.color(
                  paymentStatus,
                ).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: PaymentStatusUtils.color(
                    paymentStatus,
                  ).withValues(alpha: 0.45),
                ),
              ),
              child: Text(
                'Paiement : ${PaymentStatusUtils.label(paymentStatus)}',
                style: TextStyle(
                  color: PaymentStatusUtils.color(paymentStatus),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          if (onMarkPaid != null)
            Center(
              child: TextButton.icon(
                onPressed: onMarkPaid,
                icon: const Icon(
                  Icons.payments_outlined,
                  size: 16,
                  color: Color(0xFF0FB271),
                ),
                label: const Text(
                  'J’ai payé en espèces',
                  style: TextStyle(
                    color: Color(0xFF0FB271),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 12),
        ],
        LiveTrackingBanner(
          driverPosition: driverPosition,
          driverPositionAt: driverPositionAt,
          distanceKm: distanceKm,
          eta: eta,
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          child: assignedLivreur == null
              ? Container(
                  key: const ValueKey('waiting'),
                  height: 60,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: Colors.white.withValues(alpha: 0.04),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: const Center(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF2E90FA),
                          ),
                        ),
                        SizedBox(width: 12),
                        Text(
                          'Recherche d’un livreur…',
                          style: TextStyle(color: Colors.white70, fontSize: 15),
                        ),
                      ],
                    ),
                  ),
                )
              : Container(
                  key: const ValueKey('chat'),
                  height: 60,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF2E90FA), Color(0xFF2E90FA)],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF2E90FA).withValues(alpha: 0.4),
                        blurRadius: 25,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ElevatedButton(
                    onPressed: onOpenChat,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            const Icon(
                              Icons.chat_bubble_rounded,
                              color: Colors.white,
                              size: 22,
                            ),
                            if (unreadChatCount > 0)
                              Positioned(
                                top: -6,
                                right: -8,
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(
                                    color: Colors.redAccent,
                                    shape: BoxShape.circle,
                                  ),
                                  constraints: const BoxConstraints(
                                    minWidth: 16,
                                    minHeight: 16,
                                  ),
                                  child: Text(
                                    unreadChatCount > 9
                                        ? '9+'
                                        : '$unreadChatCount',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'Discuter avec ${assignedLivreur!['firstName'] ?? 'le livreur'}',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
        ),
        if (_showWhatsapp) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 52,
            child: ElevatedButton.icon(
              onPressed: onOpenWhatsapp,
              icon: const Icon(Icons.message, color: Colors.white, size: 20),
              label: const Text(
                'Contacter le livreur par WhatsApp',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF25D366),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          ),
        ],
        if (_showCancel) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 52,
            child: OutlinedButton.icon(
              onPressed: onCancelOrder,
              icon: const Icon(
                Icons.cancel_outlined,
                color: Color(0xFFF0453D),
                size: 20,
              ),
              label: const Text(
                'Annuler la commande',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFF0453D),
                ),
              ),
              style: OutlinedButton.styleFrom(
                backgroundColor: const Color(
                  0xFFF0453D,
                ).withValues(alpha: 0.08),
                side: const BorderSide(color: Color(0xFFF0453D), width: 1.2),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Bandeau de suivi live (point vert pulsant + ETA).
///
/// L'`eta` (si fourni) est affiché en priorité dans la ligne secondaire,
/// car il vient du backend (calcul Haversine sur la dernière position
/// persistée du livreur, vitesse moyenne 25 km/h). Le calcul local
/// `distanceKm` (Haversine côté mobile) est utilisé en fallback uniquement
/// si l'ETA backend n'est pas disponible.
class LiveTrackingBanner extends StatelessWidget {
  final LatLng? driverPosition;
  final DateTime? driverPositionAt;
  final double? distanceKm;
  final EtaResult? eta;

  const LiveTrackingBanner({
    super.key,
    required this.driverPosition,
    required this.driverPositionAt,
    required this.distanceKm,
    this.eta,
  });

  static String _formatLastSeen(DateTime when) {
    final s = DateTime.now().difference(when).inSeconds;
    if (s < 10) return 'à l’instant';
    if (s < 60) return '${s}s';
    final m = (s / 60).floor();
    return '$m min';
  }

  @override
  Widget build(BuildContext context) {
    final hasPosition = driverPosition != null;
    final lastSeen = driverPositionAt;
    final etaAvailable = eta != null && eta!.isAvailable;
    final etaIsFallback = eta?.isFallback == true;

    String subtitle;
    if (etaAvailable) {
      // Priorité au calcul backend (plus précis que le delta local).
      final km = eta!.distanceKm ?? distanceKm;
      if (km != null) {
        subtitle = '${km.toStringAsFixed(1)} km · ~${eta!.etaMinutes} min';
      } else {
        subtitle = '~${eta!.etaMinutes} min';
      }
    } else if (!hasPosition) {
      subtitle = 'En attente de la position du livreur…';
    } else if (distanceKm != null) {
      // Fallback local : 30 km/h en moto, donc minutes ≈ km × 2
      final minutes = (distanceKm! * 2).round().clamp(1, 99);
      subtitle = '${distanceKm!.toStringAsFixed(1)} km · ~$minutes min';
    } else {
      subtitle = 'Livreur localisé';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF2E90FA).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF2E90FA).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              if (hasPosition)
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0FB271).withValues(alpha: 0.25),
                    shape: BoxShape.circle,
                  ),
                ),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: hasPosition
                      ? const Color(0xFF0FB271)
                      : const Color(0xFF94A3B8),
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      hasPosition ? 'Livreur en chemin' : 'Localisation…',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (etaAvailable) ...[
                      const SizedBox(width: 8),
                      _EtaBadge(
                        minutes: eta!.etaMinutes!,
                        isFallback: etaIsFallback,
                      ),
                    ],
                  ],
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: etaIsFallback ? Colors.white54 : Colors.white70,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          if (lastSeen != null)
            Text(
              _formatLastSeen(lastSeen),
              style: const TextStyle(color: Colors.white60, fontSize: 11),
            ),
        ],
      ),
    );
  }
}

/// Petit badge "horloge + minutes" affiché dans le bandeau de tracking quand
/// le backend a renvoyé un ETA exploitable. Greyé (avec icône d'alerte) quand
/// l'ETA est en mode fallback (pas de position fraîche du livreur).
class _EtaBadge extends StatelessWidget {
  final int minutes;
  final bool isFallback;

  const _EtaBadge({required this.minutes, required this.isFallback});

  @override
  Widget build(BuildContext context) {
    final color = isFallback
        ? const Color(0xFF94A3B8)
        : const Color(0xFF2E90FA);
    final icon = isFallback ? Icons.warning_amber_rounded : Icons.access_time;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 12),
          const SizedBox(width: 4),
          Text(
            '~ $minutes min',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
