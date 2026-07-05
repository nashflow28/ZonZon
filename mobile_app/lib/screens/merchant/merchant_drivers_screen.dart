import 'package:flutter/material.dart';

import '../../services/merchant_drivers_service.dart';
import '../../utils/platform_adapter.dart';

/// Écran « Mes livreurs » pour un COMMERCANT (Priorité 3, Lot 3, item 2).
///
/// Liste les livreurs affiliés (`GET /merchants/me/drivers`), permet d'en
/// ajouter un par numéro de téléphone (`POST`) et d'en retirer un
/// (`DELETE /merchants/me/drivers/:driverId`) après confirmation.
class MerchantDriversScreen extends StatefulWidget {
  const MerchantDriversScreen({super.key});

  @override
  State<MerchantDriversScreen> createState() => _MerchantDriversScreenState();
}

class _MerchantDriversScreenState extends State<MerchantDriversScreen> {
  final MerchantDriversService _service = MerchantDriversService();

  bool _loading = true;
  bool _hasError = false;
  String? _errorMessage;
  List<AffiliatedDriver> _drivers = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _hasError = false;
    });
    try {
      final drivers = await _service.getAffiliatedDrivers();
      if (!mounted) return;
      setState(() {
        _drivers = drivers;
        _loading = false;
        _hasError = false;
        _errorMessage = null;
      });
    } on MerchantDriversException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
        _errorMessage = 'Erreur : $e';
      });
    }
  }

  Future<void> _openAddDialog() async {
    final controller = TextEditingController();
    final phone = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Ajouter un livreur',
            style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.phone,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Numéro de téléphone du livreur',
            hintStyle: TextStyle(color: Colors.white54),
            enabledBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.white24),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
            ),
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Ajouter'),
          ),
        ],
      ),
    );

    if (phone == null || phone.isEmpty || !mounted) return;

    try {
      await _service.addDriverByPhone(phone);
      if (!mounted) return;
      hapticSuccess();
      showAdaptiveSnack(context, 'Livreur affilié avec succès.');
      _load();
    } on MerchantDriversException catch (e) {
      if (!mounted) return;
      hapticError();
      showAdaptiveSnack(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      hapticError();
      showAdaptiveSnack(context, 'Erreur : $e', isError: true);
    }
  }

  Future<void> _removeDriver(AffiliatedDriver driver) async {
    final ok = await showAdaptiveConfirmDialog(
      context,
      title: 'Retirer ce livreur ?',
      message:
          '${driver.fullName} ne sera plus mis en avant lors du choix manuel '
          'd\'un livreur pour vos livraisons.',
      confirmLabel: 'Retirer',
      cancelLabel: 'Annuler',
      isDestructive: true,
    );
    if (ok != true || !mounted) return;

    try {
      await _service.removeDriver(driver.id);
      if (!mounted) return;
      hapticSuccess();
      showAdaptiveSnack(context, 'Livreur retiré.');
      _load();
    } on MerchantDriversException catch (e) {
      if (!mounted) return;
      hapticError();
      showAdaptiveSnack(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      hapticError();
      showAdaptiveSnack(context, 'Erreur : $e', isError: true);
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
        title: const Text(
          'Mes livreurs',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: 'Rafraîchir',
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddDialog,
        backgroundColor: const Color(0xFF10B981),
        icon: const Icon(Icons.person_add),
        label: const Text('Ajouter un livreur'),
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) {
      return Center(child: adaptiveLoader(color: const Color(0xFF10B981)));
    }

    if (_hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 44),
              const SizedBox(height: 12),
              Text(
                _errorMessage ?? 'Une erreur est survenue.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _load, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }

    if (_drivers.isEmpty) {
      return RefreshIndicator(
        color: const Color(0xFF10B981),
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 80),
            const Icon(Icons.group_outlined, color: Colors.white24, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Aucun livreur affilié',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Affiliez vos livreurs de confiance pour les retrouver en tête '
              'de liste lors du choix manuel d\'un livreur.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF10B981),
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        itemCount: _drivers.length,
        itemBuilder: (ctx, index) {
          final driver = _drivers[index];
          return _DriverTile(
            driver: driver,
            onRemove: () => _removeDriver(driver),
          );
        },
      ),
    );
  }
}

class _DriverTile extends StatelessWidget {
  final AffiliatedDriver driver;
  final VoidCallback onRemove;

  const _DriverTile({required this.driver, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final vehicle = driver.vehicle;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: const Color(0xFF10B981).withValues(alpha: 0.15),
            child: const Icon(Icons.two_wheeler, color: Color(0xFF10B981)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  driver.fullName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  vehicle != null
                      ? vehicle.label
                      : (driver.phone ?? 'Véhicule non renseigné'),
                  style: const TextStyle(color: Colors.white54, fontSize: 12.5),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Retirer',
            icon: const Icon(Icons.person_remove_outlined, color: Colors.redAccent),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
