import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../config/env.dart';
import '../models/product.dart';
import '../services/shops_service.dart';
import '../utils/platform_adapter.dart';

class MerchantProductFormScreen extends StatefulWidget {
  final Product? initial;
  const MerchantProductFormScreen({super.key, this.initial});

  @override
  State<MerchantProductFormScreen> createState() =>
      _MerchantProductFormScreenState();
}

class _MerchantProductFormScreenState extends State<MerchantProductFormScreen> {
  final ShopsService _service = ShopsService();
  final _name = TextEditingController();
  final _price = TextEditingController();
  final _description = TextEditingController();
  bool _available = true;
  bool _saving = false;
  String? _photoUrl;
  String? _localPhotoPath;

  @override
  void initState() {
    super.initState();
    final p = widget.initial;
    if (p != null) {
      _name.text = p.name;
      _price.text = p.priceFcfa.toString();
      _description.text = p.description ?? '';
      _available = p.available;
      _photoUrl = p.photoUrl;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
    );
    if (picked != null && mounted) {
      setState(() => _localPhotoPath = picked.path);
    }
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final priceText = _price.text.trim();
    if (name.isEmpty) {
      _snack('Nom requis');
      return;
    }
    final price = int.tryParse(priceText);
    if (price == null || price < 0) {
      _snack('Prix invalide');
      return;
    }

    setState(() => _saving = true);

    Product? saved;
    if (widget.initial == null) {
      saved = await _service.createProduct(
        name: name,
        priceFcfa: price,
        description: _description.text.trim(),
        available: _available,
      );
    } else {
      saved = await _service.updateProduct(widget.initial!.id, {
        'name': name,
        'priceFcfa': price,
        'description': _description.text.trim(),
        'available': _available,
      });
    }

    if (saved != null && _localPhotoPath != null) {
      await _service.uploadProductPhoto(saved.id, _localPhotoPath!);
    }

    if (!mounted) return;
    setState(() => _saving = false);
    if (saved != null) {
      Navigator.of(context).pop(true);
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
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          widget.initial == null ? 'Nouveau produit' : 'Modifier le produit',
          style: const TextStyle(color: Colors.white),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GestureDetector(
            onTap: _pickPhoto,
            child: Container(
              height: 180,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: Colors.white.withValues(alpha: 0.05),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                image: _localPhotoPath != null
                    ? DecorationImage(
                        image: FileImage(File(_localPhotoPath!)),
                        fit: BoxFit.cover,
                      )
                    : (_photoUrl != null
                        ? DecorationImage(
                            image: NetworkImage('$apiUrl$_photoUrl'),
                            fit: BoxFit.cover,
                          )
                        : null),
              ),
              child: (_localPhotoPath == null && _photoUrl == null)
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_a_photo,
                              color: Color(0xFF10B981), size: 40),
                          SizedBox(height: 8),
                          Text('Ajouter une photo',
                              style: TextStyle(color: Color(0xFF10B981))),
                        ],
                      ),
                    )
                  : Align(
                      alignment: Alignment.bottomRight,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Material(
                          color: Colors.black.withValues(alpha: 0.6),
                          shape: const CircleBorder(),
                          child: IconButton(
                            icon: const Icon(Icons.edit, color: Colors.white),
                            onPressed: _pickPhoto,
                          ),
                        ),
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 16),
          _input('Nom du produit', _name, icon: Icons.label_outline),
          const SizedBox(height: 12),
          _input(
            'Prix en FCFA',
            _price,
            icon: Icons.attach_money,
            keyboard: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          ),
          const SizedBox(height: 12),
          _input('Description (optionnel)', _description,
              icon: Icons.notes, maxLines: 4),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: SwitchListTile(
              value: _available,
              onChanged: (v) => setState(() => _available = v),
              title: const Text('Disponible',
                  style: TextStyle(color: Colors.white, fontSize: 15)),
              subtitle: const Text(
                'Décocher pour cacher le produit du catalogue',
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
              activeThumbColor: const Color(0xFF10B981),
              contentPadding: EdgeInsets.zero,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.check),
              label: Text(_saving ? 'Enregistrement…' : 'Enregistrer',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _input(
    String label,
    TextEditingController controller, {
    IconData? icon,
    TextInputType? keyboard,
    int maxLines = 1,
    List<TextInputFormatter>? inputFormatters,
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
        inputFormatters: inputFormatters,
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
