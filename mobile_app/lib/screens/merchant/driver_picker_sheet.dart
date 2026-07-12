import 'package:flutter/material.dart';

import '../../services/merchant_drivers_service.dart';
import '../../utils/platform_adapter.dart';

/// Résultat de la bottom sheet de choix du livreur.
///
/// [driver] vaut `null` si le commerçant a explicitement choisi « Laisser
/// la plateforme choisir » (broadcast normal). La bottom sheet renvoie
/// `null` (au lieu d'un [DriverPickerResult]) si elle a été fermée sans
/// choix explicite, auquel cas l'appelant ne doit rien changer.
class DriverPickerResult {
  final AvailableDriver? driver;
  const DriverPickerResult(this.driver);
}

/// Ouvre une bottom sheet listant les livreurs disponibles autour du point
/// de retrait ([lat]/[lng]), affiliés en tête (badge « Affilié »), avec la
/// distance quand elle est connue. Le commerçant peut sélectionner un
/// livreur précis, ou choisir explicitement de laisser la plateforme
/// décider (broadcast à tous).
Future<DriverPickerResult?> showDriverPickerSheet(
  BuildContext context, {
  required double lat,
  required double lng,
  AvailableDriver? initialSelected,
}) {
  return showModalBottomSheet<DriverPickerResult>(
    context: context,
    backgroundColor: const Color(0xFF122530),
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _DriverPickerSheet(
      lat: lat,
      lng: lng,
      initialSelected: initialSelected,
    ),
  );
}

class _DriverPickerSheet extends StatefulWidget {
  final double lat;
  final double lng;
  final AvailableDriver? initialSelected;

  const _DriverPickerSheet({
    required this.lat,
    required this.lng,
    this.initialSelected,
  });

  @override
  State<_DriverPickerSheet> createState() => _DriverPickerSheetState();
}

class _DriverPickerSheetState extends State<_DriverPickerSheet> {
  final MerchantDriversService _service = MerchantDriversService();

  bool _loading = true;
  String? _error;
  List<AvailableDriver> _drivers = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final drivers = await _service.getAvailableDrivers(
        lat: widget.lat,
        lng: widget.lng,
      );
      if (!mounted) return;
      setState(() {
        _drivers = drivers;
        _loading = false;
      });
    } on MerchantDriversException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Erreur : $e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.9,
          expand: false,
          builder: (ctx, scrollController) {
            return Column(
              children: [
                const SizedBox(height: 12),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 16),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Icon(Icons.two_wheeler, color: Color(0xFFFBBF24)),
                      SizedBox(width: 10),
                      Text(
                        'Choisir un livreur',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(child: _body(scrollController)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _body(ScrollController scrollController) {
    if (_loading) {
      return Center(child: adaptiveLoader(color: const Color(0xFFFBBF24)));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline,
                color: Colors.redAccent,
                size: 40,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: _load, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        _optionTile(
          icon: Icons.shuffle,
          iconColor: const Color(0xFF2E90FA),
          title: 'Laisser la plateforme choisir',
          subtitle: 'La course sera proposée à tous les livreurs disponibles.',
          selected: widget.initialSelected == null,
          onTap: () =>
              Navigator.of(context).pop(const DriverPickerResult(null)),
        ),
        const SizedBox(height: 12),
        if (_drivers.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Aucun livreur disponible pour le moment.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54),
            ),
          )
        else
          ..._drivers.map(
            (d) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _driverOptionTile(d),
            ),
          ),
      ],
    );
  }

  Widget _optionTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Material(
      color: selected
          ? iconColor.withValues(alpha: 0.12)
          : Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? iconColor.withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, color: iconColor),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected) Icon(Icons.check_circle, color: iconColor),
            ],
          ),
        ),
      ),
    );
  }

  Widget _driverOptionTile(AvailableDriver driver) {
    final selected = widget.initialSelected?.id == driver.id;
    final parts = <String>[];
    if (driver.vehicle != null) parts.add(driver.vehicle!.label);
    if (driver.distanceKm != null) {
      parts.add('${driver.distanceKm!.toStringAsFixed(1)} km');
    }
    final subtitle = parts.isEmpty ? 'Livreur ZonZon' : parts.join(' · ');

    return Material(
      color: selected
          ? const Color(0xFF0FB271).withValues(alpha: 0.12)
          : Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context).pop(DriverPickerResult(driver)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? const Color(0xFF0FB271).withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.person, color: Colors.white70),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            driver.fullName,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (driver.isAffiliated) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(
                                0xFF0FB271,
                              ).withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Affilié',
                              style: TextStyle(
                                color: Color(0xFF0FB271),
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Icon(Icons.check_circle, color: Color(0xFF0FB271)),
            ],
          ),
        ),
      ),
    );
  }
}
