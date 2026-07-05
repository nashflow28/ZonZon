import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/order_history_item.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../utils/order_status_utils.dart';
import '../utils/platform_adapter.dart';

/// Écran "Historique des courses" partagé client / livreur.
///
/// Charge `GET /orders/mine` et applique les filtres côté client.
/// [embedInTab] : quand `true`, supprime le Scaffold/AppBar propre (le shell
/// parent fournit déjà une AppBar). À utiliser dans un IndexedStack.
class OrderHistoryScreen extends StatefulWidget {
  final bool embedInTab;
  const OrderHistoryScreen({super.key, this.embedInTab = false});

  @override
  State<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

enum _HistoryFilter { all, active, finished }

class _OrderHistoryScreenState extends State<OrderHistoryScreen> {
  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();

  bool _initialLoading = true;
  bool _hasError = false;
  String? _errorMessage;
  String _currentUserRole = 'CLIENT';
  List<OrderHistoryItem> _items = const [];
  _HistoryFilter _filter = _HistoryFilter.all;

  static const _months = <String>[
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final user = await _auth.getCurrentUser();
    if (user != null && mounted) {
      setState(() => _currentUserRole = user.role);
    }
    await _load();
  }

  Future<void> _load() async {
    if (mounted && !_initialLoading) {
      // Refresh : pas de spinner plein écran, le RefreshIndicator gère.
    }
    try {
      final res = await _api.get('/orders/mine');
      if (!mounted) return;
      if (res.statusCode != 200 && res.statusCode != 201) {
        setState(() {
          _initialLoading = false;
          _hasError = true;
          _errorMessage = 'Erreur ${res.statusCode}';
        });
        return;
      }
      final decoded = jsonDecode(res.body);
      if (decoded is! List) {
        setState(() {
          _initialLoading = false;
          _hasError = true;
          _errorMessage = 'Réponse inattendue du serveur.';
        });
        return;
      }
      final parsed = decoded
          .whereType<Map>()
          .map((m) => OrderHistoryItem.fromJson(Map<String, dynamic>.from(m)))
          .toList();
      setState(() {
        _items = parsed;
        _initialLoading = false;
        _hasError = false;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initialLoading = false;
        _hasError = true;
        _errorMessage = e.toString();
      });
    }
  }

  List<OrderHistoryItem> get _filtered {
    switch (_filter) {
      case _HistoryFilter.all:
        return _items;
      case _HistoryFilter.active:
        return _items.where((o) => o.isActive).toList();
      case _HistoryFilter.finished:
        return _items.where((o) => o.isFinished).toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    final body = _initialLoading
        ? Center(child: adaptiveLoader())
        : Column(
            children: [
              _buildFilterChips(),
              Expanded(
                child: RefreshIndicator(
                  color: const Color(0xFF0EA5E9),
                  backgroundColor: const Color(0xFF1E293B),
                  onRefresh: _load,
                  child: _buildBody(),
                ),
              ),
            ],
          );

    if (widget.embedInTab) return body;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text(
          'Historique des courses',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1E293B),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
      ),
      body: body,
    );
  }

  Widget _buildFilterChips() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          _filterChip('Toutes', _HistoryFilter.all),
          const SizedBox(width: 8),
          _filterChip('En cours', _HistoryFilter.active),
          const SizedBox(width: 8),
          _filterChip('Terminées', _HistoryFilter.finished),
        ],
      ),
    );
  }

  Widget _filterChip(String label, _HistoryFilter value) {
    final selected = _filter == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          if (_filter != value) {
            hapticSelection();
            setState(() => _filter = value);
          }
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? const Color(0xFF0EA5E9).withValues(alpha: 0.18)
                : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? const Color(0xFF0EA5E9)
                  : Colors.white.withValues(alpha: 0.08),
              width: selected ? 1.4 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : Colors.white70,
              fontSize: 13,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_hasError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
            child: Column(
              children: [
                const Icon(Icons.error_outline,
                    color: Color(0xFFEF4444), size: 48),
                const SizedBox(height: 16),
                Text(
                  'Impossible de charger l\'historique.',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(
                        color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text('Réessayer'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0EA5E9),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    final list = _filtered;
    if (list.isEmpty) {
      final emptyMessage = _filter == _HistoryFilter.all
          ? 'Aucune course terminée pour le moment.'
          : _filter == _HistoryFilter.active
              ? 'Aucune course en cours.'
              : 'Aucune course terminée pour le moment.';
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 100, 24, 24),
            child: Column(
              children: [
                const Icon(Icons.history,
                    color: Colors.white24, size: 56),
                const SizedBox(height: 16),
                Text(
                  emptyMessage,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white70, fontSize: 15),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: list.length,
      itemBuilder: (ctx, i) => _OrderHistoryCard(
        item: list[i],
        viewerRole: _currentUserRole,
        onTap: () => _showDetails(list[i]),
        formatDate: _formatDate,
      ),
    );
  }

  void _showDetails(OrderHistoryItem item) {
    final viewerRole = _currentUserRole;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _OrderDetailsSheet(
        item: item,
        viewerRole: viewerRole,
        formatDate: _formatDate,
      ),
    );
  }

  /// Format français : `24 avril 2026 à 14h32`. Pas de package `intl` dans ce
  /// projet → on assemble à la main.
  String _formatDate(DateTime? date) {
    if (date == null) return '—';
    final local = date.toLocal();
    final day = local.day;
    final month = _months[local.month - 1];
    final year = local.year;
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day $month $year à ${hour}h$minute';
  }
}

/// Couleurs + libellés associés à chaque statut, pour la pill et l'affichage.
///
/// Délègue à [OrderStatusUtils] (mapping centralisé partagé avec l'écran de
/// suivi et le dialog livreur) pour éviter toute divergence de libellés.
class _StatusVisual {
  final String label;
  final Color color;
  const _StatusVisual(this.label, this.color);

  static _StatusVisual of(String status) {
    return _StatusVisual(
      OrderStatusUtils.label(status),
      OrderStatusUtils.color(status),
    );
  }
}

class _OrderHistoryCard extends StatelessWidget {
  final OrderHistoryItem item;
  final String viewerRole;
  final VoidCallback onTap;
  final String Function(DateTime?) formatDate;

  const _OrderHistoryCard({
    required this.item,
    required this.viewerRole,
    required this.onTap,
    required this.formatDate,
  });

  String _formatPrice(int? p) {
    if (p == null) return '-';
    final s = p.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '$buf FCFA';
  }

  String? _otherPartyLine() {
    if (viewerRole == 'CLIENT') {
      final l = item.livreur;
      if (l == null) return null;
      final first = (l['firstName'] ?? '').toString().trim();
      final last = (l['lastName'] ?? '').toString().trim();
      if (first.isEmpty && last.isEmpty) return null;
      final lastInitial =
          last.isEmpty ? '' : '${last.substring(0, 1).toUpperCase()}.';
      return 'Livreur : ${first.isEmpty ? '?' : first} $lastInitial'.trim();
    }
    if (viewerRole == 'LIVREUR') {
      final c = item.client;
      if (c == null) return null;
      final first = (c['firstName'] ?? '').toString().trim();
      final last = (c['lastName'] ?? '').toString().trim();
      if (first.isEmpty && last.isEmpty) return null;
      final lastInitial =
          last.isEmpty ? '' : '${last.substring(0, 1).toUpperCase()}.';
      return 'Client : ${first.isEmpty ? '?' : first} $lastInitial'.trim();
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final visual = _StatusVisual.of(item.status);
    final otherParty = _otherPartyLine();
    final distance = item.distanceKm;
    final price = item.priceFcfa;
    final metaParts = <String>[];
    if (distance != null) metaParts.add('${distance.toStringAsFixed(1)} km');
    if (price != null) metaParts.add(_formatPrice(price));

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _StatusPill(visual: visual),
                    if (viewerRole == 'LIVREUR' &&
                        (item.paymentStatus ?? '').isNotEmpty) ...[
                      const SizedBox(width: 6),
                      _PaymentPill(status: item.paymentStatus!),
                    ],
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        formatDate(item.createdAt),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _AddressLine(
                  icon: Icons.my_location,
                  color: const Color(0xFF0EA5E9),
                  text: item.pickupAddress.isEmpty
                      ? '—'
                      : item.pickupAddress,
                ),
                const SizedBox(height: 6),
                _AddressLine(
                  icon: Icons.location_on,
                  color: const Color(0xFF10B981),
                  text: item.deliveryAddress.isEmpty
                      ? '—'
                      : item.deliveryAddress,
                ),
                if (metaParts.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    metaParts.join(' · '),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                if (otherParty != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    otherParty,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final _StatusVisual visual;
  const _StatusPill({required this.visual});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: visual.color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: visual.color.withValues(alpha: 0.5)),
      ),
      child: Text(
        visual.label,
        style: TextStyle(
          color: visual.color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Badge de statut de paiement — affiché côté livreur (carte + détails)
/// pour distinguer d'un coup d'œil les courses déjà réglées de celles à
/// encaisser à la livraison.
class _PaymentPill extends StatelessWidget {
  final String status;
  const _PaymentPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = PaymentStatusUtils.color(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        PaymentStatusUtils.label(status),
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _AddressLine extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  const _AddressLine({
    required this.icon,
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _OrderDetailsSheet extends StatelessWidget {
  final OrderHistoryItem item;
  final String viewerRole;
  final String Function(DateTime?) formatDate;

  const _OrderDetailsSheet({
    required this.item,
    required this.viewerRole,
    required this.formatDate,
  });

  String _formatPrice(int? p) {
    if (p == null) return '-';
    final s = p.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '$buf FCFA';
  }

  String _personLabel(Map<String, dynamic>? person) {
    if (person == null) return '—';
    final first = (person['firstName'] ?? '').toString().trim();
    final last = (person['lastName'] ?? '').toString().trim();
    final phone = (person['phone'] ?? '').toString().trim();
    final name = '$first $last'.trim();
    if (name.isEmpty && phone.isEmpty) return '—';
    if (phone.isEmpty) return name;
    if (name.isEmpty) return phone;
    return '$name · $phone';
  }

  @override
  Widget build(BuildContext context) {
    final visual = _StatusVisual.of(item.status);
    final shortId = item.id.length >= 6 ? item.id.substring(0, 6) : item.id;
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (ctx, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFF1E293B),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: Color(0xFF334155)),
            ),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _StatusPill(visual: visual),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Course #$shortId',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                formatDate(item.createdAt),
                style: const TextStyle(color: Colors.white60, fontSize: 12),
              ),
              const SizedBox(height: 18),
              _detailBlock(
                'Trajet',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _AddressLine(
                      icon: Icons.my_location,
                      color: const Color(0xFF0EA5E9),
                      text: item.pickupAddress.isEmpty
                          ? '—'
                          : item.pickupAddress,
                    ),
                    const SizedBox(height: 8),
                    _AddressLine(
                      icon: Icons.location_on,
                      color: const Color(0xFF10B981),
                      text: item.deliveryAddress.isEmpty
                          ? '—'
                          : item.deliveryAddress,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _detailBlock(
                'Tarification',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _kv([
                      if (item.distanceKm != null)
                        ('Distance',
                            '${item.distanceKm!.toStringAsFixed(1)} km'),
                      if (item.priceFcfa != null)
                        ('Prix', _formatPrice(item.priceFcfa)),
                    ]),
                    if (viewerRole == 'LIVREUR' &&
                        (item.paymentStatus ?? '').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _PaymentPill(status: item.paymentStatus!),
                    ],
                  ],
                ),
              ),
              if ((item.description ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _detailBlock(
                  'Description',
                  Text(
                    item.description!.trim(),
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (viewerRole == 'CLIENT')
                _detailBlock(
                  'Livreur',
                  Text(
                    _personLabel(item.livreur),
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                )
              else if (viewerRole == 'LIVREUR')
                _detailBlock(
                  'Client',
                  Text(
                    _personLabel(item.client),
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              if (item.status == 'CANCELLED') ...[
                const SizedBox(height: 12),
                _detailBlock(
                  'Annulation',
                  _kv([
                    if ((item.cancelledBy ?? '').isNotEmpty)
                      ('Par', item.cancelledBy!),
                    if ((item.cancellationReason ?? '').trim().isNotEmpty)
                      ('Raison', item.cancellationReason!.trim()),
                  ]),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0EA5E9),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    'Fermer',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _detailBlock(String title, Widget content) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 8),
          content,
        ],
      ),
    );
  }

  Widget _kv(List<(String, String)> entries) {
    if (entries.isEmpty) {
      return const Text('—',
          style: TextStyle(color: Colors.white54, fontSize: 13));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final e in entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: RichText(
              text: TextSpan(
                style: const TextStyle(color: Colors.white, fontSize: 14),
                children: [
                  TextSpan(
                    text: '${e.$1} : ',
                    style: const TextStyle(color: Colors.white54),
                  ),
                  TextSpan(text: e.$2),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
