import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../models/place.dart';
import '../models/saved_address.dart';
import '../services/geocoding_service.dart';
import '../services/recent_addresses_service.dart';
import '../services/saved_addresses_service.dart';
import '../utils/platform_adapter.dart';

/// Plein écran de sélection d'un point sur la carte.
///
/// Utilisation :
/// ```dart
/// final result = await Navigator.push<Place>(
///   context,
///   MaterialPageRoute(builder: (_) => LocationPickerScreen(
///     title: 'Point de départ',
///     initial: currentPickup,
///   )),
/// );
/// ```
class LocationPickerScreen extends StatefulWidget {
  final String title;
  final LatLng? initial;
  final String? hint;

  const LocationPickerScreen({
    super.key,
    required this.title,
    this.initial,
    this.hint,
  });

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  static const _defaultLome = LatLng(6.1319, 1.2228);

  final MapController _mapCtrl = MapController();
  final GeocodingService _geo = GeocodingService();
  final SavedAddressesService _saved = SavedAddressesService();
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();

  LatLng _center = _defaultLome;
  Place? _resolvedPlace;
  bool _resolving = false;

  Timer? _searchDebounce;
  Timer? _reverseDebounce;
  List<Place> _searchResults = [];
  bool _searching = false;

  List<Place> _recents = [];
  List<SavedAddress> _favorites = [];

  StreamSubscription? _mapEventSub;

  @override
  void initState() {
    super.initState();
    _center = widget.initial ?? _defaultLome;
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _mapEventSub = _mapCtrl.mapEventStream.listen((event) {
      if (event is MapEventMoveEnd ||
          event is MapEventDoubleTapZoomEnd ||
          event is MapEventFlingAnimationEnd) {
        _onMapSettled(_mapCtrl.camera.center);
      }
    });

    final initial = widget.initial;
    if (initial != null) {
      _onMapSettled(initial);
    } else {
      _useMyPosition(silent: true);
    }
    _loadRecents();
    _loadFavorites();
  }

  Future<void> _loadRecents() async {
    final list = await RecentAddressesService.list();
    if (mounted) setState(() => _recents = list);
  }

  Future<void> _loadFavorites() async {
    final list = await _saved.list();
    if (mounted) setState(() => _favorites = list);
  }

  void _onMapSettled(LatLng point) {
    setState(() => _center = point);
    _reverseDebounce?.cancel();
    _reverseDebounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _resolving = true);
      final place = await _geo.reverse(point);
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _resolvedPlace =
            place ??
            Place(
              displayName:
                  '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}',
              shortName: 'Point sur la carte',
              location: point,
            );
      });
    });
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    if (value.trim().length < 3) {
      setState(() {
        _searchResults = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      final results = await _geo.search(value);
      if (!mounted) return;
      setState(() {
        _searchResults = results;
        _searching = false;
      });
    });
  }

  Future<void> _useMyPosition({bool silent = false}) async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      final p = LatLng(pos.latitude, pos.longitude);
      _mapCtrl.move(p, 16);
      _onMapSettled(p);
    } catch (_) {
      if (!silent && mounted) {
        showAdaptiveSnack(
          context,
          'Impossible de récupérer votre position',
          isError: true,
        );
      }
    }
  }

  void _selectPlace(Place place) {
    _searchFocus.unfocus();
    _searchCtrl.clear();
    setState(() {
      _searchResults = [];
      _resolvedPlace = place;
    });
    _mapCtrl.move(place.location, 16);
  }

  Future<void> _confirm() async {
    final place = _resolvedPlace;
    if (place == null) return;
    await RecentAddressesService.push(place);
    if (!mounted) return;
    Navigator.of(context).pop(place);
  }

  Future<void> _saveAsFavorite() async {
    final place = _resolvedPlace;
    if (place == null) return;
    final label = await _askFavoriteLabel();
    if (label == null || label.trim().isEmpty) return;
    final result = await _saved.create(
      label: label.trim(),
      address: place.displayName,
      lat: place.location.latitude,
      lng: place.location.longitude,
    );
    if (!mounted) return;
    if (result != null) {
      setState(() => _favorites = [..._favorites, result]);
      showAdaptiveSnack(context, '« ${result.label} » ajouté à vos favoris');
    }
  }

  Future<String?> _askFavoriteLabel() async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF122530),
        title: const Text(
          'Nom du favori',
          style: TextStyle(color: Colors.white),
        ),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Maison, Travail, École…',
            hintStyle: TextStyle(color: Colors.white60),
          ),
          onSubmitted: (v) => Navigator.of(ctx).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteFavorite(SavedAddress fav) async {
    final ok = await _saved.delete(fav.id);
    if (!ok || !mounted) return;
    setState(
      () => _favorites = _favorites.where((f) => f.id != fav.id).toList(),
    );
  }

  @override
  void dispose() {
    _mapEventSub?.cancel();
    _searchDebounce?.cancel();
    _reverseDebounce?.cancel();
    _mapCtrl.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final showResults = _searchResults.isNotEmpty || _searching;
    final hasInitialQuery = _searchCtrl.text.trim().isNotEmpty;
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      body: SafeArea(
        child: Stack(
          children: [
            // Carte (double couche dark : base sans labels + labels nets par-dessus)
            Positioned.fill(
              child: FlutterMap(
                mapController: _mapCtrl,
                options: MapOptions(
                  initialCenter: _center,
                  initialZoom: 14.5,
                  minZoom: 5,
                  maxZoom: 19,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
                    userAgentPackageName: 'com.zonzon.app',
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: RetinaMode.isHighDensity(context),
                  ),
                  TileLayer(
                    urlTemplate:
                        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
                    userAgentPackageName: 'com.zonzon.app',
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: RetinaMode.isHighDensity(context),
                  ),
                ],
              ),
            ),
            // Crosshair central
            const Center(child: _Crosshair()),

            // Header (search + close)
            Positioned(
              top: 8,
              left: 12,
              right: 12,
              child: Column(
                children: [
                  Row(
                    children: [
                      _CircleIconButton(
                        icon: Icons.arrow_back,
                        onTap: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _SearchField(
                          controller: _searchCtrl,
                          focusNode: _searchFocus,
                          hint: widget.hint ?? widget.title,
                          onChanged: _onSearchChanged,
                          onClear: hasInitialQuery
                              ? () {
                                  _searchCtrl.clear();
                                  _onSearchChanged('');
                                }
                              : null,
                        ),
                      ),
                    ],
                  ),
                  if (showResults)
                    _SearchResults(
                      results: _searchResults,
                      loading: _searching,
                      onTap: _selectPlace,
                    ),
                ],
              ),
            ),

            // Bottom card
            Align(
              alignment: Alignment.bottomCenter,
              child: _BottomPanel(
                resolvedPlace: _resolvedPlace,
                resolving: _resolving,
                recents: _recents,
                favorites: _favorites,
                onTapRecent: _selectPlace,
                onTapFavorite: (f) => _selectPlace(
                  Place(
                    displayName: f.address,
                    shortName: f.label,
                    location: f.location,
                  ),
                ),
                onDeleteFavorite: _deleteFavorite,
                onSaveFavorite: _saveAsFavorite,
                onUseMyPosition: () => _useMyPosition(),
                onConfirm: _confirm,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Crosshair extends StatelessWidget {
  const _Crosshair();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF2E90FA).withValues(alpha: 0.18),
              border: Border.all(color: const Color(0xFF2E90FA), width: 2),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF2E90FA).withValues(alpha: 0.5),
                  blurRadius: 16,
                ),
              ],
            ),
            child: const Center(
              child: Icon(
                Icons.location_on,
                color: Color(0xFF2E90FA),
                size: 22,
              ),
            ),
          ),
          // tige sous le marker
          Container(
            width: 2,
            height: 12,
            color: const Color(0xFF2E90FA).withValues(alpha: 0.7),
          ),
        ],
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _CircleIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF122530).withValues(alpha: 0.95),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      elevation: 4,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback? onClear;

  const _SearchField({
    required this.controller,
    required this.focusNode,
    required this.hint,
    required this.onChanged,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF122530).withValues(alpha: 0.96),
      borderRadius: BorderRadius.circular(28),
      elevation: 4,
      clipBehavior: Clip.antiAlias,
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        style: const TextStyle(color: Colors.white, fontSize: 15),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white60),
          prefixIcon: const Icon(Icons.search, color: Color(0xFF2E90FA)),
          suffixIcon: onClear != null
              ? IconButton(
                  icon: const Icon(Icons.close, color: Colors.white54),
                  onPressed: onClear,
                )
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

class _SearchResults extends StatelessWidget {
  final List<Place> results;
  final bool loading;
  final ValueChanged<Place> onTap;

  const _SearchResults({
    required this.results,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.45,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF122530).withValues(alpha: 0.97),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: loading && results.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(20),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF2E90FA),
                  ),
                ),
              ),
            )
          : ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 4),
              itemCount: results.length,
              separatorBuilder: (_, __) => Divider(
                height: 1,
                color: Colors.white.withValues(alpha: 0.05),
              ),
              itemBuilder: (_, i) {
                final p = results[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(
                    Icons.place_outlined,
                    color: Color(0xFF2E90FA),
                  ),
                  title: Text(
                    p.shortName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14.5,
                    ),
                  ),
                  subtitle: Text(
                    p.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                  onTap: () => onTap(p),
                );
              },
            ),
    );
  }
}

class _BottomPanel extends StatelessWidget {
  final Place? resolvedPlace;
  final bool resolving;
  final List<Place> recents;
  final List<SavedAddress> favorites;
  final ValueChanged<Place> onTapRecent;
  final ValueChanged<SavedAddress> onTapFavorite;
  final ValueChanged<SavedAddress> onDeleteFavorite;
  final VoidCallback onSaveFavorite;
  final VoidCallback onUseMyPosition;
  final VoidCallback onConfirm;

  const _BottomPanel({
    required this.resolvedPlace,
    required this.resolving,
    required this.recents,
    required this.favorites,
    required this.onTapRecent,
    required this.onTapFavorite,
    required this.onDeleteFavorite,
    required this.onSaveFavorite,
    required this.onUseMyPosition,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0C1A22).withValues(alpha: 0.97),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 16),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // Adresse résolue
              Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: const Color(0xFF2E90FA).withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.place,
                      color: Color(0xFF2E90FA),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          resolvedPlace?.shortName ??
                              (resolving
                                  ? 'Résolution…'
                                  : 'Choisissez un point'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          resolvedPlace?.displayName ?? '—',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white60,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Ajouter aux favoris',
                    onPressed: resolvedPlace == null ? null : onSaveFavorite,
                    icon: const Icon(
                      Icons.bookmark_add_outlined,
                      color: Color(0xFF0FB271),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 10),

              // Favoris (chips)
              if (favorites.isNotEmpty) ...[
                _ChipRow(
                  label: 'Favoris',
                  child: SizedBox(
                    height: 38,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: favorites.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final f = favorites[i];
                        return _FavoriteChip(
                          fav: f,
                          onTap: () => onTapFavorite(f),
                          onLongPress: () => onDeleteFavorite(f),
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],

              // Récents
              if (recents.isNotEmpty) ...[
                _ChipRow(
                  label: 'Récents',
                  child: SizedBox(
                    height: 38,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: recents.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final r = recents[i];
                        return _RecentChip(
                          place: r,
                          onTap: () => onTapRecent(r),
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],

              // Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onUseMyPosition,
                      icon: const Icon(
                        Icons.my_location,
                        color: Color(0xFF2E90FA),
                        size: 18,
                      ),
                      label: const Text(
                        'Ma position',
                        style: TextStyle(color: Color(0xFF2E90FA)),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFF2E90FA)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: resolvedPlace == null ? null : onConfirm,
                      icon: const Icon(Icons.check_circle, size: 20),
                      label: const Text(
                        'Confirmer',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0FB271),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChipRow extends StatelessWidget {
  final String label;
  final Widget child;

  const _ChipRow({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white54,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        child,
      ],
    );
  }
}

class _FavoriteChip extends StatelessWidget {
  final SavedAddress fav;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _FavoriteChip({
    required this.fav,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF122530),
      shape: StadiumBorder(
        side: BorderSide(color: const Color(0xFF0FB271).withValues(alpha: 0.4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.star, size: 14, color: Color(0xFF0FB271)),
              const SizedBox(width: 6),
              Text(
                fav.label,
                style: const TextStyle(
                  color: Color(0xFF0FB271),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentChip extends StatelessWidget {
  final Place place;
  final VoidCallback onTap;

  const _RecentChip({required this.place, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF122530),
      shape: StadiumBorder(
        side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 200),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.history, size: 14, color: Colors.white54),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    place.shortName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
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
