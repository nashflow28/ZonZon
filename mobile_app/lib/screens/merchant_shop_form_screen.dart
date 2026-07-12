import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../models/place.dart';
import '../models/shop.dart';
import '../services/shops_service.dart';
import 'location_picker_screen.dart';
import '../utils/platform_adapter.dart';

class MerchantShopFormScreen extends StatefulWidget {
  final Shop? initial;
  const MerchantShopFormScreen({super.key, this.initial});

  @override
  State<MerchantShopFormScreen> createState() => _MerchantShopFormScreenState();
}

class _MerchantShopFormScreenState extends State<MerchantShopFormScreen> {
  final ShopsService _service = ShopsService();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _phone = TextEditingController();
  final _hours = TextEditingController();
  String _category = 'OTHER';
  String _address = '';
  LatLng? _location;

  List<ShopCategory> _categories = [];
  bool _saving = false;
  bool _loadingCats = true;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    if (i != null) {
      _name.text = i.name;
      _description.text = i.description ?? '';
      _phone.text = i.phone ?? '';
      _hours.text = i.hours ?? '';
      _category = i.category;
      _address = i.address;
      _location = i.location;
    }
    _service.categories().then((cats) {
      if (!mounted) return;
      setState(() {
        _categories = cats.isNotEmpty
            ? cats
            : [const ShopCategory(value: 'OTHER', label: 'Autre')];
        _loadingCats = false;
      });
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _phone.dispose();
    _hours.dispose();
    super.dispose();
  }

  Future<void> _pickLocation() async {
    final result = await pushAdaptive<Place>(
      context,
      LocationPickerScreen(
        title: 'Adresse de la boutique',
        hint: 'Rechercher l’adresse de votre commerce',
        initial: _location,
      ),
    );
    if (result != null && mounted) {
      setState(() {
        _location = result.location;
        _address = result.displayName;
      });
    }
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      _snack('Donnez un nom à votre boutique');
      return;
    }
    if (_location == null || _address.isEmpty) {
      _snack('Sélectionnez l’adresse de votre boutique');
      return;
    }
    setState(() => _saving = true);
    Shop? saved;
    if (widget.initial == null) {
      saved = await _service.createMyShop(
        name: _name.text.trim(),
        category: _category,
        address: _address,
        lat: _location!.latitude,
        lng: _location!.longitude,
        description: _description.text.trim(),
        phone: _phone.text.trim(),
        hours: _hours.text.trim(),
      );
    } else {
      saved = await _service.updateMyShop({
        'name': _name.text.trim(),
        'category': _category,
        'address': _address,
        'lat': _location!.latitude,
        'lng': _location!.longitude,
        'description': _description.text.trim(),
        'phone': _phone.text.trim(),
        'hours': _hours.text.trim(),
      });
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (saved != null) {
      Navigator.of(context).pop(saved);
    } else {
      _snack('Échec de l’enregistrement');
    }
  }

  void _snack(String msg) {
    showAdaptiveSnack(context, msg);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        elevation: 0,
        title: Text(
          widget.initial == null ? 'Nouvelle boutique' : 'Modifier ma boutique',
          style: const TextStyle(color: Colors.white),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _loadingCats
          ? Center(child: adaptiveLoader(color: const Color(0xFF0FB271)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _input('Nom de la boutique', _name, icon: Icons.storefront),
                const SizedBox(height: 12),
                _categoryDropdown(),
                const SizedBox(height: 12),
                _addressTile(),
                const SizedBox(height: 12),
                _input(
                  'Téléphone (optionnel)',
                  _phone,
                  icon: Icons.phone_outlined,
                  keyboard: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                _input(
                  'Horaires (ex: Lun-Sam 8h-20h)',
                  _hours,
                  icon: Icons.access_time,
                ),
                const SizedBox(height: 12),
                _input(
                  'Description (optionnel)',
                  _description,
                  icon: Icons.notes,
                  maxLines: 4,
                ),
                const SizedBox(height: 24),
                SizedBox(
                  height: 56,
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.check),
                    label: _saving
                        ? const Text('Enregistrement…')
                        : const Text(
                            'Enregistrer',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0FB271),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (widget.initial == null)
                  const Text(
                    'Votre boutique sera examinée par un administrateur avant publication. Cela ne prend généralement que quelques heures.',
                    style: TextStyle(color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
              ],
            ),
    );
  }

  Widget _categoryDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          const Icon(Icons.category, color: Color(0xFF0FB271)),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButton<String>(
              value: _categories.any((c) => c.value == _category)
                  ? _category
                  : _categories.first.value,
              isExpanded: true,
              underline: const SizedBox(),
              dropdownColor: const Color(0xFF122530),
              iconEnabledColor: const Color(0xFF0FB271),
              style: const TextStyle(color: Colors.white, fontSize: 16),
              items: _categories
                  .map(
                    (c) =>
                        DropdownMenuItem(value: c.value, child: Text(c.label)),
                  )
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _category = v);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _addressTile() {
    return Material(
      color: Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: _pickLocation,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _location == null
                  ? const Color(0xFF0FB271).withValues(alpha: 0.5)
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.place, color: Color(0xFF0FB271)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Adresse de la boutique',
                      style: TextStyle(
                        color: Color(0xFF0FB271),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _address.isEmpty ? 'Toucher pour choisir' : _address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: _address.isEmpty ? Colors.white54 : Colors.white,
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
          prefixIcon: icon != null
              ? Icon(icon, color: const Color(0xFF0FB271))
              : null,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
        ),
      ),
    );
  }
}
