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

class DirectThreadScreen extends StatefulWidget {
  const DirectThreadScreen({
    super.key,
    required this.contact,
    this.initialOrderId,
  });

  final DirectContact contact;
  final String? initialOrderId;

  @override
  State<DirectThreadScreen> createState() => _DirectThreadScreenState();
}

class _DirectThreadScreenState extends State<DirectThreadScreen> {
  final DirectMessagesService _service = DirectMessagesService();
  final AuthService _auth = AuthService();
  final ApiClient _api = ApiClient();
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final OrderSocketController _socket = RealtimeServices.socket;

  List<DirectMessageItem> _items = const [];
  List<OrderHistoryItem> _orders = const [];
  String _me = '';
  String? _linkedOrderId;
  bool _loading = true;
  bool _sending = false;
  StreamSubscription<DirectMessageEvent>? _directMessageSub;
  StreamSubscription<void>? _reconnectSub;

  @override
  void initState() {
    super.initState();
    _linkedOrderId = widget.initialOrderId;
    _socket.init();
    _directMessageSub = _socket.directMessages$
        .where(
          (event) =>
              event.senderId == widget.contact.id ||
              event.recipientId == widget.contact.id,
        )
        .listen(_onDirectMessage);
    _reconnectSub = _socket.connected$.listen((_) => _load(showError: false));
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _directMessageSub?.cancel();
    _reconnectSub?.cancel();
    super.dispose();
  }

  String _shortId(String id) => id.length <= 6 ? id : id.substring(0, 6);

  void _onDirectMessage(DirectMessageEvent event) {
    final item = DirectMessageItem.fromJson(event.raw);
    if (!mounted || item.id.isEmpty || _items.any((m) => m.id == item.id)) {
      return;
    }
    setState(() => _items = [..._items, item]);
    _scrollToBottom();
  }

  Future<void> _load({bool showError = true}) async {
    try {
      final user = await _auth.getCurrentUser();
      final results = await Future.wait([
        _service.thread(widget.contact.id),
        _api.get('/orders/mine'),
      ]);
      final rawOrders = jsonDecode((results[1] as dynamic).body);
      if (!mounted) return;
      final orders = rawOrders is List
          ? rawOrders
                .whereType<Map>()
                .map(
                  (raw) =>
                      OrderHistoryItem.fromJson(Map<String, dynamic>.from(raw)),
                )
                .toList()
          : <OrderHistoryItem>[];
      setState(() {
        _me = user?.id ?? '';
        _items = results[0] as List<DirectMessageItem>;
        _orders = orders;
        if (_linkedOrderId != null &&
            !_sharedOrders().any((order) => order.id == _linkedOrderId)) {
          _linkedOrderId = null;
        }
        _loading = false;
      });
      _scrollToBottom(immediate: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      if (showError) {
        showAdaptiveSnack(
          context,
          error.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final sent = await _service.send(
        widget.contact.id,
        text,
        orderId: _linkedOrderId,
      );
      if (!mounted) return;
      _controller.clear();
      setState(() {
        _linkedOrderId = null;
        if (!_items.any((message) => message.id == sent.id)) {
          _items = [..._items, sent];
        }
      });
      _scrollToBottom();
    } catch (error) {
      if (mounted) {
        showAdaptiveSnack(
          context,
          error.toString().replaceFirst('Exception: ', ''),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _hideThread() async {
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
      await _service.hideThread(widget.contact.id);
      if (mounted) Navigator.pop(context, true);
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
            ..._sharedOrders().map(
              (order) => ListTile(
                leading: const Icon(
                  Icons.local_shipping_outlined,
                  color: Color(0xFF2E90FA),
                ),
                title: Text(
                  'Course #${_shortId(order.id)}',
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

  List<OrderHistoryItem> _sharedOrders() => _orders.where((order) {
    final partyIds = <String>{
      order.client?['id']?.toString() ?? '',
      order.livreur?['id']?.toString() ?? '',
      order.raw['merchant'] is Map
          ? (order.raw['merchant'] as Map)['id']?.toString() ?? ''
          : '',
    };
    return partyIds.contains(widget.contact.id);
  }).toList();

  void _scrollToBottom({bool immediate = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final target = _scrollController.position.maxScrollExtent;
      if (immediate) {
        _scrollController.jumpTo(target);
      } else {
        _scrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        foregroundColor: Colors.white,
        title: Text(
          widget.contact.name.isEmpty ? 'Contact' : widget.contact.name,
        ),
        actions: [
          IconButton(
            tooltip: 'Supprimer pour moi',
            onPressed: _hideThread,
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? Center(child: adaptiveLoader())
                : _items.isEmpty
                ? const Center(
                    child: Text(
                      'Aucun message pour le moment.',
                      style: TextStyle(color: Colors.white60),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: _items.length,
                    itemBuilder: (_, index) {
                      final message = _items[index];
                      final mine = message.senderId == _me;
                      return Align(
                        alignment: mine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 520),
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
                                message.content,
                                style: const TextStyle(color: Colors.white),
                              ),
                              if ((message.orderId ?? '').isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 5),
                                  child: Text(
                                    'Lié à la course #${_shortId(message.orderId!)}',
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
                        label: Text('Course #${_shortId(_linkedOrderId!)}'),
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
                          controller: _controller,
                          style: const TextStyle(color: Colors.white),
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(
                            hintText: 'Écrire un message',
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
                        onPressed: _sending ? null : _send,
                        icon: _sending
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.send, color: Color(0xFF2E90FA)),
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
}
