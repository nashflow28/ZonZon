import 'dart:convert';
import 'package:flutter/material.dart';
import '../models/order_history_item.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/direct_messages_service.dart';
import '../utils/platform_adapter.dart';
import 'chat_screen.dart';

class MessagingHubScreen extends StatefulWidget {
  const MessagingHubScreen({super.key});
  @override
  State<MessagingHubScreen> createState() => _MessagingHubScreenState();
}

class _MessagingHubScreenState extends State<MessagingHubScreen>
    with SingleTickerProviderStateMixin {
  final _direct = DirectMessagesService();
  final _api = ApiClient();
  final _auth = AuthService();
  late final TabController _tabs;
  List<DirectContact> _contacts = [];
  List<OrderHistoryItem> _orders = [];
  String _role = '';
  bool _loading = true;
  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final user = await _auth.getCurrentUser();
      final results = await Future.wait([
        _direct.contacts(),
        _api.get('/orders/mine'),
      ]);
      final raw = jsonDecode((results[1] as dynamic).body);
      if (!mounted) return;
      setState(() {
        _role = user?.role ?? '';
        _contacts = results[0] as List<DirectContact>;
        _orders = raw is List
            ? raw
                  .whereType<Map>()
                  .map(
                    (m) =>
                        OrderHistoryItem.fromJson(Map<String, dynamic>.from(m)),
                  )
                  .toList()
            : [];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFF0C1A22),
    appBar: AppBar(
      backgroundColor: const Color(0xFF122530),
      foregroundColor: Colors.white,
      title: const Text('Messagerie'),
      bottom: TabBar(
        controller: _tabs,
        tabs: const [
          Tab(text: 'Général'),
          Tab(text: 'Courses'),
        ],
      ),
    ),
    body: _loading
        ? Center(child: adaptiveLoader())
        : TabBarView(controller: _tabs, children: [_general(), _courses()]),
  );

  Widget _general() => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      children: _contacts.isEmpty
          ? [
              const Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'Aucun contact disponible. Les contacts apparaissent après une course partagée ou une affiliation active.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white60),
                ),
              ),
            ]
          : _contacts
                .map(
                  (c) => ListTile(
                    onTap: () => pushAdaptive(
                      context,
                      _DirectThread(contact: c, orders: _orders),
                    ),
                    leading: const CircleAvatar(child: Icon(Icons.person)),
                    title: Text(
                      c.name.isEmpty ? 'Contact' : c.name,
                      style: const TextStyle(color: Colors.white),
                    ),
                    subtitle: Text(
                      c.role,
                      style: const TextStyle(color: Colors.white60),
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                      color: Colors.white54,
                    ),
                  ),
                )
                .toList(),
    ),
  );

  Widget _courses() => RefreshIndicator(
    onRefresh: _load,
    child: ListView.separated(
      itemCount: _orders.length,
      itemBuilder: (_, i) {
        final o = _orders[i];
        return ListTile(
          onTap: () => pushAdaptive(
            context,
            ChatScreen(
              orderId: o.id,
              otherPartyName: 'Course #${o.id.substring(0, 6)}',
              otherPartyRole: _role == 'COMMERCANT' ? 'LIVREUR' : 'CLIENT',
              orderStatus: o.status,
            ),
          ),
          leading: const Icon(
            Icons.local_shipping_outlined,
            color: Color(0xFF2E90FA),
          ),
          title: Text(
            'Course #${o.id.substring(0, 6)}',
            style: const TextStyle(color: Colors.white),
          ),
          subtitle: Text(
            '${o.pickupAddress} → ${o.deliveryAddress}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white60),
          ),
          trailing: Text(
            o.status,
            style: const TextStyle(color: Color(0xFF0FB271), fontSize: 11),
          ),
        );
      },
      separatorBuilder: (_, __) => const Divider(color: Colors.white12),
    ),
  );
}

class _DirectThread extends StatefulWidget {
  const _DirectThread({required this.contact, required this.orders});
  final DirectContact contact;
  final List<OrderHistoryItem> orders;
  @override
  State<_DirectThread> createState() => _DirectThreadState();
}

class _DirectThreadState extends State<_DirectThread> {
  final _service = DirectMessagesService();
  final _auth = AuthService();
  final _ctrl = TextEditingController();
  List<DirectMessageItem> _items = [];
  String _me = '';
  String? _linkedOrderId;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final u = await _auth.getCurrentUser();
    final items = await _service.thread(widget.contact.id);
    if (mounted)
      setState(() {
        _me = u?.id ?? '';
        _items = items;
      });
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    await _service.send(widget.contact.id, text, orderId: _linkedOrderId);
    _ctrl.clear();
    setState(() => _linkedOrderId = null);
    await _load();
  }

  Future<void> _pickOrderContext() async {
    final selected = await showModalBottomSheet<String?>(
      context: context,
      backgroundColor: const Color(0xFF122530),
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              leading: const Icon(Icons.clear, color: Colors.white70),
              title: const Text(
                'Message général',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () => Navigator.pop(ctx),
            ),
            ...widget.orders.map(
              (order) => ListTile(
                leading: const Icon(
                  Icons.local_shipping_outlined,
                  color: Color(0xFF2E90FA),
                ),
                title: Text(
                  'Course #${order.id.substring(0, 6)}',
                  style: const TextStyle(color: Colors.white),
                ),
                subtitle: Text(
                  order.deliveryAddress,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white60),
                ),
                onTap: () => Navigator.pop(ctx, order.id),
              ),
            ),
          ],
        ),
      ),
    );
    if (mounted) setState(() => _linkedOrderId = selected);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFF0C1A22),
    appBar: AppBar(
      backgroundColor: const Color(0xFF122530),
      foregroundColor: Colors.white,
      title: Text(widget.contact.name),
    ),
    body: Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _items.length,
            itemBuilder: (_, i) {
              final m = _items[i];
              final mine = m.senderId == _me;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: mine
                        ? const Color(0xFF2E90FA)
                        : const Color(0xFF122530),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        m.content,
                        style: const TextStyle(color: Colors.white),
                      ),
                      if ((m.orderId ?? '').isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 5),
                          child: Text(
                            'Lié à la course #${m.orderId!.substring(0, 6)}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_linkedOrderId != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Chip(
                      label: Text('Course #${_linkedOrderId!.substring(0, 6)}'),
                      onDeleted: () => setState(() => _linkedOrderId = null),
                    ),
                  ),
                Row(
                  children: [
                    IconButton(
                      onPressed: _pickOrderContext,
                      icon: const Icon(Icons.link, color: Color(0xFF2E90FA)),
                      tooltip: 'Lier à une course',
                    ),
                    Expanded(
                      child: TextField(
                        controller: _ctrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          hintText: 'Message général',
                          hintStyle: TextStyle(color: Colors.white54),
                          filled: true,
                          fillColor: Color(0xFF122530),
                          border: OutlineInputBorder(
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _send,
                      icon: const Icon(Icons.send, color: Color(0xFF2E90FA)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
