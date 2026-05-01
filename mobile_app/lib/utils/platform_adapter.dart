import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Helpers d'adaptation iOS / Android pour respecter Apple HIG sur iOS
/// et Material 3 sur Android, sans dupliquer la logique d'écran.
///
/// Convention : tout code UI partagé devrait passer par ces helpers afin
/// que la même feature ressemble à du natif sur chaque plateforme.

bool get _isCupertino {
  if (kIsWeb) return false;
  try {
    return Platform.isIOS || Platform.isMacOS;
  } catch (_) {
    return false;
  }
}

/// Push une nouvelle route avec une transition adaptée à la plateforme.
Future<T?> pushAdaptive<T>(BuildContext context, Widget page) {
  if (_isCupertino) {
    return Navigator.of(context).push<T>(
      CupertinoPageRoute<T>(builder: (_) => page),
    );
  }
  return Navigator.of(context).push<T>(
    MaterialPageRoute<T>(builder: (_) => page),
  );
}

/// Affiche un dialog de confirmation natif (Cupertino sur iOS, Material ailleurs).
Future<bool?> showAdaptiveConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirmer',
  String cancelLabel = 'Annuler',
  bool isDestructive = false,
}) {
  if (_isCupertino) {
    return showCupertinoDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(title),
        content: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(message),
        ),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(cancelLabel),
          ),
          CupertinoDialogAction(
            isDestructiveAction: isDestructive,
            isDefaultAction: !isDestructive,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF1E293B),
      title: Text(title, style: const TextStyle(color: Colors.white)),
      content: Text(message, style: const TextStyle(color: Colors.white70)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text(cancelLabel),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: isDestructive ? Colors.redAccent : null,
          ),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
}

/// Loader natif (CupertinoActivityIndicator sur iOS, sinon CircularProgressIndicator).
Widget adaptiveLoader({Color? color}) {
  if (_isCupertino) {
    return CupertinoActivityIndicator(color: color);
  }
  return SizedBox(
    width: 24,
    height: 24,
    child: CircularProgressIndicator(
      strokeWidth: 2.5,
      color: color ?? const Color(0xFF0EA5E9),
    ),
  );
}

/// Affiche une notification courte (SnackBar Material, banner top sur iOS).
void showAdaptiveSnack(
  BuildContext context,
  String message, {
  bool isError = false,
}) {
  if (!_isCupertino) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.redAccent : null,
        behavior: SnackBarBehavior.floating,
      ),
    );
    return;
  }
  // iOS : banner overlay 2s en haut, look HIG.
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) return;
  final entry = OverlayEntry(
    builder: (_) => _IosTopToast(
      message: message,
      isError: isError,
    ),
  );
  overlay.insert(entry);
  Timer(const Duration(seconds: 2), () {
    if (entry.mounted) entry.remove();
  });
}

class _IosTopToast extends StatefulWidget {
  final String message;
  final bool isError;
  const _IosTopToast({required this.message, required this.isError});

  @override
  State<_IosTopToast> createState() => _IosTopToastState();
}

class _IosTopToastState extends State<_IosTopToast>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220))
        ..forward();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top + 8;
    return Positioned(
      top: top,
      left: 16,
      right: 16,
      child: IgnorePointer(
        child: FadeTransition(
          opacity: _ctrl,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, -0.4),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
            ),
            child: Material(
              color: Colors.transparent,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: widget.isError
                      ? const Color(0xFFB00020).withValues(alpha: 0.95)
                      : const Color(0xFF1E293B).withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.25),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Text(
                  widget.message,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Choisit l'icône appropriée selon plateforme.
IconData adaptiveIcon({
  required IconData material,
  required IconData cupertino,
}) =>
    _isCupertino ? cupertino : material;

// === Haptics ===
void hapticLight() {
  HapticFeedback.lightImpact();
}

void hapticSelection() {
  HapticFeedback.selectionClick();
}

void hapticSuccess() {
  // Pas d'API "success" cross-platform : medium impact = retour clair.
  HapticFeedback.mediumImpact();
}

void hapticError() {
  HapticFeedback.heavyImpact();
}
