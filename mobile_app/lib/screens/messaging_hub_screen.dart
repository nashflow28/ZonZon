import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../controllers/order_socket_controller.dart';
import '../models/order_history_item.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/direct_messages_service.dart';
import '../services/realtime_services.dart';
import '../utils/platform_adapter.dart';
import 'chat_screen.dart';
import 'direct_thread_screen.dart';

class MessagingHubScreen extends StatefulWidget {
  const MessagingHubScreen({super.key});

  @override
  State<MessagingHubScreen> createState() => _MessagingHubScreenState();
}

class _MessagingHubScreenState extends State<MessagingHubScreen> {
  final DirectMessagesService _direct = DirectMessagesService();
  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();
  final OrderSocketController _socket = RealtimeServices.socket;

  List<DirectContact> _contacts = const [];
  List<OrderHistoryItem> _orders = const [];
  String _role = '';
  bool _loading = true;
  StreamSubscription<DirectMessageEvent>? _directMessageSub;
  StreamSubscription<void>? _reconnectSub;

  @override
  void initState() {
    super.initState();
    _socket.init();
    _directMessageSub = _socket.directMessages$.listen((_) {
      _load(showLoader: false);
    });
    _reconnectSub = _socket.connected$.listen((_) {
      _load(showLoader: false);
    });
    _load();
  }

  @override
  void dispose() {
    _directMessageSub?.cancel();
    _reconnectSub?.cancel();
    super.dispose();
  }

  String _shortId(String id) => id.length <= 6 ? id : id.substring(0, 6);

  List<OrderHistoryItem> get _groupOrders => _orders
      .where((order) => order.raw['merchant'] is Map)
      .toList(growable: false);

  Future<void> _load({bool showLoader = true}) async {
    if (showLoader && mounted) setState(() => _loading = true);
    try {
      final user = await _auth.getCurrentUser();
      final results = await Future.wait([
        _direct.contacts(),
        _api.get('/orders/mine'),
      ]);
      final response = results[1] as dynamic;
      final raw = jsonDecode(response.body as String);
      if (!mounted) return;
      setState(() {
        _role = user?.role ?? '';
        _contacts = results[0] as List<DirectContact>;
        _orders = raw is List
            ? raw
                  .whereType<Map>()
                  .map(
                    (item) => OrderHistoryItem.fromJson(
                      Map<String, dynamic>.from(item),
                    ),
                  )
                  .toList()
            : const [];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openContact(DirectContact contact) async {
    await pushAdaptive<bool>(context, DirectThreadScreen(contact: contact));
    await _load(showLoader: false);
  }

  Future<void> _hideContact(DirectContact contact) async {
    final confirmed = await showAdaptiveConfirmDialog(
      context,
      title: 'Supprimer la conversation ?',
      message:
          'Elle sera masquée uniquement pour vous. Un nouveau message la fera réapparaître.',
      confirmLabel: 'Supprimer pour moi',
      cancelLabel: 'Annuler',
      isDestructive: true,
    );
    if (confirmed != true) return;
    try {
      await _direct.hideThread(contact.id);
      if (!mounted) return;
      setState(() {
        _contacts = _contacts.where((item) => item.id != contact.id).toList();
      });
    } catch (error) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          error.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groupOrders;
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        foregroundColor: Colors.white,
        title: const Text('Messagerie'),
      ),
      body: _loading
          ? Center(child: adaptiveLoader())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if (_contacts.isEmpty && groups.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'Aucune conversation. Vos contacts apparaîtront après une course partagée ou une affiliation active.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white60),
                      ),
                    ),
                  if (_contacts.isNotEmpty) ...[
                    const _SectionTitle('Conversations'),
                    ..._contacts.map(_contactTile),
                  ],
                  if (groups.isNotEmpty) ...[
                    const _SectionTitle('Discussions de course'),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                      child: Text(
                        'Conversations de groupe avec client, livreur et commerçant.',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                    ...groups.map(_groupTile),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _contactTile(DirectContact contact) {
    final subtitle = (contact.lastMessage ?? '').trim().isNotEmpty
        ? contact.lastMessage!
        : _roleLabel(contact.role);
    return adaptiveConstrainedContent(
      child: ListTile(
        onTap: () => _openContact(contact),
        leading: CircleAvatar(
          backgroundColor: const Color(0xFF2E90FA).withValues(alpha: 0.16),
          child: const Icon(Icons.person_outline, color: Color(0xFF2E90FA)),
        ),
        title: Text(
          contact.name.isEmpty ? 'Contact' : contact.name,
          style: const TextStyle(color: Colors.white),
        ),
        subtitle: Text(
          subtitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Colors.white60),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (contact.unreadCount > 0)
              Badge(label: Text('${contact.unreadCount}')),
            PopupMenuButton<String>(
              tooltip: 'Options',
              iconColor: Colors.white54,
              onSelected: (value) {
                if (value == 'delete') _hideContact(contact);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'delete',
                  child: Row(
                    children: [
                      Icon(Icons.delete_outline, color: Color(0xFFF0453D)),
                      SizedBox(width: 10),
                      Text('Supprimer pour moi'),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _groupTile(OrderHistoryItem order) => adaptiveConstrainedContent(
    child: ListTile(
      onTap: () => pushAdaptive<void>(
        context,
        ChatScreen(
          orderId: order.id,
          otherPartyName: 'Course #${_shortId(order.id)}',
          otherPartyRole: _role == 'LIVREUR' ? 'CLIENT' : 'LIVREUR',
          orderStatus: order.status,
        ),
      ),
      leading: const Icon(Icons.groups_outlined, color: Color(0xFF0FB271)),
      title: Text(
        'Course #${_shortId(order.id)}',
        style: const TextStyle(color: Colors.white),
      ),
      subtitle: Text(
        '${order.pickupAddress} → ${order.deliveryAddress}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(color: Colors.white60),
      ),
      trailing: Text(
        order.status,
        style: const TextStyle(color: Color(0xFF0FB271), fontSize: 11),
      ),
    ),
  );

  String _roleLabel(String role) => switch (role) {
    'LIVREUR' => 'Livreur',
    'CLIENT' => 'Client',
    'COMMERCANT' => 'Commerçant',
    _ => role,
  };
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 22, 20, 10),
    child: Text(
      label,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}
