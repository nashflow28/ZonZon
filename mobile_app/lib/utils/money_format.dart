String formatFcfa(dynamic value, {String fallback = 'Montant à confirmer'}) {
  final amount = value is num
      ? value.round()
      : int.tryParse(value?.toString() ?? '');
  if (amount == null) return fallback;
  final digits = amount.toString();
  final formatted = digits.replaceAllMapped(
    RegExp(r'(?=(\d{3})+(?!\d))'),
    (_) => ' ',
  );
  return '$formatted FCFA';
}
