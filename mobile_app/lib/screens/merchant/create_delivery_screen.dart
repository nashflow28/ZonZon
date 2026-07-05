import 'package:flutter/material.dart';

import '../../models/place.dart';
import '../../services/estimate_service.dart';
import '../../services/merchant_orders_service.dart';
import '../../utils/platform_adapter.dart';
import '../location_picker_screen.dart';

/// Écran « Créer une livraison » pour un COMMERCANT.
///
/// Reprend la structure du formulaire client (`home_tab.dart`) : sélection
/// retrait/livraison via [LocationPickerScreen], estimation debouncée via
/// [EstimateService], puis `POST /orders/merchant`.
///
/// Contrairement au client, le commerçant doit aussi renseigner le client
/// destinataire (téléphone obligatoire, nom optionnel). Le backend résout
/// automatiquement un compte client existant à partir du téléphone ; sinon
/// la livraison est créée avec juste ces informations (client sans compte).
class CreateDeliveryScreen extends StatefulWidget {
  const CreateDeliveryScreen({super.key});

  @override
  State<CreateDeliveryScreen> createState() => _CreateDeliveryScreenState();
}

class _CreateDeliveryScreenState extends State<CreateDeliveryScreen> {
  final MerchantOrdersService _service = MerchantOrdersService();
  final EstimateService _estimateSvc = EstimateService();

  final TextEditingController _clientPhone = TextEditingController();
  final TextEditingController _clientName = TextEditingController();
  final TextEditingController _description =
      TextEditingController(text: '1 colis');

  Place? _pickup;
  Place? _delivery;

  double? _estimateKm;
  int? _estimatePrice;
  bool _estimateLoading = false;
  bool _saving = false;

  @override
  void dispose() {
    _estimateSvc.dispose();
    _clientPhone.dispose();
    _clientName.dispose();
    _description.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Sélection des points
  // ---------------------------------------------------------------------------

  Future<void> _pickPickup() async {
    final result = await pushAdaptive<Place>(
      context,
      LocationPickerScreen(
        title: 'Point de retrait',
        hint: 'Rechercher le lieu de retrait',
        initial: _pickup?.location,
      ),
    );
    if (result != null && mounted) {
      setState(() => _pickup = result);
      _scheduleEstimate();
    }
  }

  Future<void> _pickDelivery() async {
    final result = await pushAdaptive<Place>(
      context,
      LocationPickerScreen(
        title: 'Point de livraison',
        hint: 'Rechercher le lieu de livraison',
        initial: _delivery?.location ?? _pickup?.location,
      ),
    );
    if (result != null && mounted) {
      setState(() => _delivery = result);
      _scheduleEstimate();
    }
  }

  void _scheduleEstimate() {
    final pickup = _pickup;
    final delivery = _delivery;
    if (pickup == null || delivery == null) {
      _estimateSvc.cancel();
      setState(() {
        _estimateKm = null;
        _estimatePrice = null;
        _estimateLoading = false;
      });
      return;
    }
    _estimateSvc.scheduleEstimate(
      lat1: pickup.location.latitude,
      lng1: pickup.location.longitude,
      lat2: delivery.location.latitude,
      lng2: delivery.location.longitude,
      onLoading: (loading) {
        if (!mounted) return;
        setState(() => _estimateLoading = loading);
      },
      onResult: (result) {
        if (!mounted || result == null) return;
        setState(() {
          _estimateKm = result.km;
          _estimatePrice = result.priceFcfa;
        });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Soumission
  // ---------------------------------------------------------------------------

  Future<void> _submit() async {
    final phone = _clientPhone.text.trim();
    final pickup = _pickup;
    final delivery = _delivery;
    final description = _description.text.trim();

    if (phone.isEmpty) {
      showAdaptiveSnack(context, 'Renseignez le téléphone du client', isError: true);
      return;
    }
    if (pickup == null) {
      showAdaptiveSnack(context, 'Sélectionnez un point de retrait', isError: true);
      return;
    }
    if (delivery == null) {
      showAdaptiveSnack(context, 'Sélectionnez un point de livraison', isError: true);
      return;
    }
    if (description.isEmpty) {
      showAdaptiveSnack(context, 'Décrivez le colis à livrer', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      await _service.createMerchantOrder(
        pickupAddress: pickup.displayName,
        pickupLat: pickup.location.latitude,
        pickupLng: pickup.location.longitude,
        deliveryAddress: delivery.displayName,
        deliveryLat: delivery.location.latitude,
        deliveryLng: delivery.location.longitude,
        description: description,
        clientPhone: phone,
        clientName: _clientName.text.trim().isEmpty
            ? null
            : _clientName.text.trim(),
      );
      if (!mounted) return;
      hapticSuccess();
      showAdaptiveSnack(context, 'Livraison créée avec succès.');
      Navigator.of(context).pop(true);
    } on MerchantOrderException catch (e) {
      if (mounted) {
        hapticError();
        showAdaptiveSnack(context, e.message, isError: true);
      }
    } catch (e) {
      if (mounted) {
        hapticError();
        showAdaptiveSnack(context, 'Erreur : $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Créer une livraison',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionTitle('Client destinataire'),
          const SizedBox(height: 8),
          _input(
            'Téléphone du client',
            _clientPhone,
            icon: Icons.phone_outlined,
            keyboard: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          _input(
            'Nom du client (optionnel)',
            _clientName,
            icon: Icons.person_outline,
          ),
          const SizedBox(height: 24),
          _SectionTitle('Retrait'),
          const SizedBox(height: 8),
          _addressTile(
            label: 'Point de retrait',
            address: _pickup?.displayName,
            icon: Icons.my_location,
            color: const Color(0xFF0EA5E9),
            onTap: _pickPickup,
          ),
          const SizedBox(height: 24),
          _SectionTitle('Livraison'),
          const SizedBox(height: 8),
          _addressTile(
            label: 'Point de livraison',
            address: _delivery?.displayName,
            icon: Icons.location_on,
            color: const Color(0xFF10B981),
            onTap: _pickDelivery,
          ),
          const SizedBox(height: 24),
          _SectionTitle('Description'),
          const SizedBox(height: 8),
          _input(
            'Description du colis',
            _description,
            icon: Icons.notes,
            maxLines: 3,
          ),
          const SizedBox(height: 20),
          if (_pickup != null && _delivery != null) _estimateCard(),
          const SizedBox(height: 24),
          SizedBox(
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _submit,
              icon: const Icon(Icons.local_shipping),
              label: _saving
                  ? const Text('Création…')
                  : const Text(
                      'Créer la livraison',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Si le numéro correspond à un compte client ZonZon existant, '
            'la livraison lui sera automatiquement rattachée. Sinon, elle '
            'sera créée avec le nom et le téléphone renseignés.',
            style: TextStyle(color: Colors.white54, fontSize: 12),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _estimateCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: _estimateLoading
          ? Row(
              children: [
                adaptiveLoader(color: const Color(0xFF10B981)),
                const SizedBox(width: 12),
                const Text('Estimation en cours…',
                    style: TextStyle(color: Colors.white70)),
              ],
            )
          : _estimateKm != null && _estimatePrice != null
              ? Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.route, color: Color(0xFF0EA5E9), size: 20),
                        const SizedBox(width: 8),
                        Text(
                          '${_estimateKm!.toStringAsFixed(1)} km',
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    Text(
                      '$_estimatePrice FCFA',
                      style: const TextStyle(
                        color: Color(0xFF10B981),
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                )
              : const Text(
                  'Estimation indisponible',
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
    );
  }

  Widget _addressTile({
    required String label,
    required String? address,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: address == null
                  ? color.withValues(alpha: 0.5)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, color: color),
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
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      address ?? 'Toucher pour choisir',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: address == null ? Colors.white54 : Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white54),
            ],
          ),
        ),
      ),
    );
  }

  Widget _input(
    String label,
    TextEditingController controller, {
    IconData? icon,
    TextInputType? keyboard,
    int maxLines = 1,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white, fontSize: 15),
        decoration: InputDecoration(
          hintText: label,
          hintStyle: const TextStyle(color: Colors.white60),
          prefixIcon: icon != null ? Icon(icon, color: const Color(0xFF10B981)) : null,
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 15,
        fontWeight: FontWeight.bold,
      ),
    );
  }
}
