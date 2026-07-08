import 'package:flutter/material.dart';

import '../services/notifications_service.dart';
import '../utils/platform_adapter.dart';

/// Écran « Notifications » in-app (liste `GET /notifications`).
///
/// Distinct des notifications push FCM (gérées par `push_service.dart`) :
/// ceci est l'historique persistant côté backend, consultable à tout moment.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _service = NotificationsService();

  bool _initialLoading = true;
  bool _hasError = false;
  String? _errorMessage;
  bool _markingAll = false;
  List<AppNotification> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final page = await _service.list();
      if (!mounted) return;
      setState(() {
        _items = page.items;
        _initialLoading = false;
        _hasError = false;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initialLoading = false;
        _hasError = true;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _onTapNotification(AppNotification n) async {
    if (n.isUnread) {
      // Optimiste : on marque tout de suite localement, puis on appelle l'API.
      setState(() {
        _items = _items
            .map((it) => it.id == n.id
                ? AppNotification(
                    id: it.id,
                    deliveryId: it.deliveryId,
                    type: it.type,
                    title: it.title,
                    body: it.body,
                    readAt: DateTime.now(),
                    createdAt: it.createdAt,
                  )
                : it)
            .toList();
      });
      try {
        await _service.markRead(n.id);
      } catch (_) {
        // Pas bloquant pour l'UX : au pire un prochain refresh corrigera l'état.
      }
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAll || _items.every((n) => !n.isUnread)) return;
    setState(() => _markingAll = true);
    try {
      await _service.markAllRead();
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _items = _items
            .map((it) => AppNotification(
                  id: it.id,
                  deliveryId: it.deliveryId,
                  type: it.type,
                  title: it.title,
                  body: it.body,
                  readAt: it.readAt ?? now,
                  createdAt: it.createdAt,
                ))
            .toList();
      });
      showAdaptiveSnack(context, 'Toutes les notifications sont marquées comme lues');
    } catch (e) {
      if (!mounted) return;
      showAdaptiveSnack(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '';
    final local = date.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day/$month à ${hour}h$minute';
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _items.any((n) => n.isUnread);
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        title: const Text(
          'Notifications',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF122530),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
        actions: [
          if (hasUnread)
            TextButton(
              onPressed: _markingAll ? null : _markAllRead,
              child: _markingAll
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: adaptiveLoader(color: Colors.white),
                    )
                  : const Text(
                      'Tout marquer comme lu',
                      style: TextStyle(color: Color(0xFF2E90FA), fontSize: 13),
                    ),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_initialLoading) {
      return Center(child: adaptiveLoader());
    }

    if (_hasError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 100, 24, 24),
            child: Column(
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFF0453D), size: 48),
                const SizedBox(height: 16),
                const Text(
                  'Impossible de charger les notifications.',
                  style: TextStyle(color: Colors.white, fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() => _initialLoading = true);
                    _load();
                  },
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text('Réessayer'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E90FA),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_items.isEmpty) {
      return RefreshIndicator(
        color: const Color(0xFF2E90FA),
        backgroundColor: const Color(0xFF122530),
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 100, 24, 24),
              child: Column(
                children: [
                  const Icon(Icons.notifications_none, color: Colors.white24, size: 56),
                  const SizedBox(height: 16),
                  const Text(
                    'Aucune notification pour le moment.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 15),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF2E90FA),
      backgroundColor: const Color(0xFF122530),
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: _items.length,
        itemBuilder: (ctx, i) {
          final n = _items[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: const Color(0xFF122530),
              borderRadius: BorderRadius.circular(14),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => _onTapNotification(n),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Icon(
                          Icons.circle,
                          size: 8,
                          color: n.isUnread
                              ? const Color(0xFF2E90FA)
                              : Colors.transparent,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              n.title,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight:
                                    n.isUnread ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              n.body,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _formatDate(n.createdAt),
                              style: const TextStyle(
                                color: Colors.white38,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
