import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/message.dart';
import '../services/chat_service.dart';
import '../utils/order_status_utils.dart';
import '../utils/platform_adapter.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  final String otherPartyName;
  final String? headerSubtitle;
  final String? otherPartyPhone;
  final String? otherPartyRole; // 'CLIENT' ou 'LIVREUR'
  final String orderStatus;

  const ChatScreen({
    super.key,
    required this.orderId,
    required this.otherPartyName,
    required this.orderStatus,
    this.headerSubtitle,
    this.otherPartyPhone,
    this.otherPartyRole,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  late final ChatService _chat;
  final TextEditingController _input = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  final FocusNode _focusNode = FocusNode();

  List<ChatMessage> _messages = [];
  bool _otherTyping = false;
  bool _ready = false;

  /// Statut vivant de la course : initialisé depuis le paramètre (figé au
  /// push de l'écran) puis mis à jour via `orderStatusUpdated` — la saisie
  /// se ferme donc en direct si la course se termine pendant la discussion.
  late String _orderStatus;

  late final StreamSubscription _msgSub;
  late final StreamSubscription _typingSub;
  late final StreamSubscription _statusSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _orderStatus = widget.orderStatus;
    _chat = ChatService(widget.orderId);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _msgSub = _chat.messages$.listen((msgs) {
      if (!mounted) return;
      final scrollToBottom = _isNearBottom() || msgs.length > _messages.length;
      setState(() => _messages = msgs);
      if (scrollToBottom) {
        _scrollToBottom();
      }
    });
    _typingSub = _chat.otherTyping$.listen((isTyping) {
      if (!mounted) return;
      setState(() => _otherTyping = isTyping);
      if (isTyping) _scrollToBottom();
    });
    _statusSub = _chat.orderStatus$.listen((status) {
      if (!mounted || status == _orderStatus) return;
      setState(() => _orderStatus = status);
    });

    await _chat.init();
    if (!mounted) return;
    setState(() => _ready = true);
    _scrollToBottom(immediate: true);
  }

  bool _isNearBottom() {
    if (!_scrollCtrl.hasClients) return true;
    final pos = _scrollCtrl.position;
    return (pos.maxScrollExtent - pos.pixels) < 80;
  }

  void _scrollToBottom({bool immediate = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      final target = _scrollCtrl.position.maxScrollExtent;
      if (immediate) {
        _scrollCtrl.jumpTo(target);
      } else {
        _scrollCtrl.animateTo(
          target,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _chat.markRead();
    }
  }

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    HapticFeedback.lightImpact();
    await _chat.sendText(text);
  }

  Future<void> _sendQuickReply(String content) async {
    HapticFeedback.selectionClick();
    await _chat.sendQuickReply(content);
  }

  List<String> _quickRepliesForRole() {
    final role = widget.otherPartyRole;
    final status = _orderStatus;
    if (role == 'CLIENT') {
      // Le livreur écrit au client
      if (status == 'ACCEPTED') {
        return ['Je suis en route', '5 min de retard', 'Vous êtes où ?'];
      }
      if (status == 'IN_PROGRESS') {
        return ['Je suis en bas', 'J’arrive', 'Quel étage ?'];
      }
      return ['Bonjour', 'Merci'];
    }
    // Le client écrit au livreur
    if (status == 'ACCEPTED' || status == 'IN_PROGRESS') {
      return ['Vous êtes loin ?', 'Sonnez en bas', 'Merci'];
    }
    return ['Bonjour', 'Merci'];
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _msgSub.cancel();
    _typingSub.cancel();
    _statusSub.cancel();
    _input.dispose();
    _scrollCtrl.dispose();
    _focusNode.dispose();
    _chat.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final closed = OrderStatusUtils.isTerminal(_orderStatus);
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: const Color(0xFF2E90FA).withValues(alpha: 0.2),
              child: Text(
                widget.otherPartyName.isNotEmpty
                    ? widget.otherPartyName[0].toUpperCase()
                    : '?',
                style: const TextStyle(
                  color: Color(0xFF2E90FA),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.otherPartyName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      _otherTyping
                          ? 'écrit…'
                          : (widget.headerSubtitle ?? 'En ligne'),
                      key: ValueKey(_otherTyping),
                      style: TextStyle(
                        color: _otherTyping
                            ? const Color(0xFF0FB271)
                            : Colors.white60,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (closed)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              color: const Color(0xFFFF9E1B).withValues(alpha: 0.15),
              child: Text(
                'Conversation fermée — la course est ${_orderStatus == 'COMPLETED'
                    ? 'terminée'
                    : _orderStatus == 'FAILED'
                    ? 'en échec'
                    : 'annulée'}.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFFF9E1B), fontSize: 13),
              ),
            ),
          Expanded(
            child: !_ready
                ? Center(child: adaptiveLoader())
                : _MessagesList(
                    messages: _messages,
                    myId: _chat.myId,
                    recipients: _chat.recipients,
                    otherTyping: _otherTyping,
                    scrollCtrl: _scrollCtrl,
                    conversationTitle: widget.otherPartyName,
                  ),
          ),
          if (!closed) ...[
            _QuickReplies(
              replies: _quickRepliesForRole(),
              onTap: _sendQuickReply,
            ),
            _Composer(
              controller: _input,
              focusNode: _focusNode,
              onSend: _send,
              onChanged: (_) => _chat.notifyTyping(),
            ),
          ],
        ],
      ),
    );
  }
}

class _MessagesList extends StatelessWidget {
  final List<ChatMessage> messages;
  final String? myId;
  final Set<String> recipients;
  final bool otherTyping;
  final ScrollController scrollCtrl;
  final String conversationTitle;

  const _MessagesList({
    required this.messages,
    required this.myId,
    required this.recipients,
    required this.otherTyping,
    required this.scrollCtrl,
    required this.conversationTitle,
  });

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty && !otherTyping) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(40),
          child: Text(
            'Aucun message pour le moment.\nDémarrez la conversation !',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 15),
          ),
        ),
      );
    }
    final itemCount = messages.length + (otherTyping ? 1 : 0);
    return ListView.builder(
      controller: scrollCtrl,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (otherTyping && index == itemCount - 1) {
          return const Align(
            alignment: Alignment.centerLeft,
            child: _TypingBubble(),
          );
        }
        final m = messages[index];
        final mine = m.senderId != null && m.senderId == myId;
        // Pour ne pas re-grouper les bulles consécutives du même expéditeur
        final prev = index > 0 ? messages[index - 1] : null;
        final tight =
            prev != null &&
            prev.senderId == m.senderId &&
            m.createdAt.difference(prev.createdAt).inMinutes < 2;
        return _Bubble(
          message: m,
          mine: mine,
          tight: tight,
          recipients: recipients,
          fallbackSenderName: conversationTitle,
        );
      },
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  final bool mine;
  final bool tight;
  final Set<String> recipients;
  final String fallbackSenderName;

  const _Bubble({
    required this.message,
    required this.mine,
    required this.tight,
    required this.recipients,
    required this.fallbackSenderName,
  });

  @override
  Widget build(BuildContext context) {
    final bg = mine ? const Color(0xFF2E90FA) : const Color(0xFF122530);
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(18),
      topRight: const Radius.circular(18),
      bottomLeft: Radius.circular(mine ? 18 : 4),
      bottomRight: Radius.circular(mine ? 4 : 18),
    );

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, (1 - value) * 8),
          child: child,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(top: tight ? 2 : 8, bottom: 2),
        child: Row(
          mainAxisAlignment: mine
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78,
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: radius,
                  border: mine
                      ? null
                      : Border.all(color: Colors.white.withValues(alpha: 0.05)),
                ),
                child: Column(
                  crossAxisAlignment: mine
                      ? CrossAxisAlignment.end
                      : CrossAxisAlignment.start,
                  children: [
                    if (!mine && !tight) ...[
                      Text(
                        message.senderDisplayName ?? fallbackSenderName,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                    Text(
                      message.content,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15.5,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _formatTime(message.createdAt),
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 10.5,
                          ),
                        ),
                        if (mine) ...[
                          const SizedBox(width: 4),
                          _StatusIndicator(
                            message: message,
                            recipients: recipients,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime t) {
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

/// Accusé de lecture honnête (conversations à 3+) :
/// - `done` : envoyé, lu par personne ;
/// - `done_all` estompé : lu par UNE PARTIE des destinataires connus ;
/// - `done_all` plein : lu par TOUS les destinataires connus.
/// Si les destinataires sont inconnus (endpoint conversation indisponible),
/// on retombe sur l'ancienne sémantique : `readAt`/`readBy` non vide = lu.
class _StatusIndicator extends StatelessWidget {
  final ChatMessage message;
  final Set<String> recipients;
  const _StatusIndicator({required this.message, required this.recipients});

  @override
  Widget build(BuildContext context) {
    if (message.status == MessageStatus.pending) {
      return const SizedBox(
        width: 12,
        height: 12,
        child: Icon(Icons.access_time, size: 12, color: Colors.white70),
      );
    }
    if (message.status == MessageStatus.failed) {
      return const Icon(Icons.error_outline, size: 14, color: Colors.redAccent);
    }
    final someRead = message.readBy.isNotEmpty || message.readAt != null;
    final allRead = recipients.isNotEmpty
        ? recipients.every(message.readBy.contains)
        : someRead;
    if (allRead) {
      return const Icon(Icons.done_all, size: 14, color: Colors.white);
    }
    if (someRead) {
      return Icon(
        Icons.done_all,
        size: 14,
        color: Colors.white.withValues(alpha: 0.55),
      );
    }
    return Icon(
      Icons.done,
      size: 14,
      color: Colors.white.withValues(alpha: 0.7),
    );
  }
}

class _TypingBubble extends StatefulWidget {
  const _TypingBubble();

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF122530),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(18),
            topRight: Radius.circular(18),
            bottomRight: Radius.circular(18),
            bottomLeft: Radius.circular(4),
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
        ),
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (context, _) {
            return Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                final t = (_ctrl.value * 3 - i).clamp(0.0, 1.0);
                final scale = 0.6 + (t < 0.5 ? t : 1 - t) * 0.8;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.5),
                  child: Transform.scale(
                    scale: scale,
                    child: Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: Color(0xFF94A3B8),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                );
              }),
            );
          },
        ),
      ),
    );
  }
}

class _QuickReplies extends StatelessWidget {
  final List<String> replies;
  final ValueChanged<String> onTap;

  const _QuickReplies({required this.replies, required this.onTap});

  @override
  Widget build(BuildContext context) {
    if (replies.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: replies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final r = replies[i];
          return Material(
            color: const Color(0xFF122530),
            shape: StadiumBorder(
              side: BorderSide(
                color: const Color(0xFF2E90FA).withValues(alpha: 0.3),
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => onTap(r),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Center(
                  child: Text(
                    r,
                    style: const TextStyle(
                      color: Color(0xFF2E90FA),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
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

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  final ValueChanged<String> onChanged;

  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.onSend,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 10),
        decoration: const BoxDecoration(
          color: Color(0xFF0C1A22),
          border: Border(top: BorderSide(color: Color(0xFF122530), width: 1)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF122530),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.06),
                  ),
                ),
                child: TextField(
                  controller: controller,
                  focusNode: focusNode,
                  onChanged: onChanged,
                  onSubmitted: (_) => onSend(),
                  textInputAction: TextInputAction.send,
                  textCapitalization: TextCapitalization.sentences,
                  minLines: 1,
                  maxLines: 4,
                  style: const TextStyle(color: Colors.white, fontSize: 15.5),
                  decoration: const InputDecoration(
                    hintText: 'Écrire un message…',
                    hintStyle: TextStyle(color: Colors.white60),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) {
                final canSend = value.text.trim().isNotEmpty;
                return AnimatedScale(
                  scale: canSend ? 1 : 0.85,
                  duration: const Duration(milliseconds: 150),
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 150),
                    opacity: canSend ? 1 : 0.45,
                    child: Material(
                      color: const Color(0xFF2E90FA),
                      shape: const CircleBorder(),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: canSend ? onSend : null,
                        child: const SizedBox(
                          width: 46,
                          height: 46,
                          child: Icon(
                            Icons.send_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
