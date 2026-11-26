export function calculateQuote(destination, field, quantity) {
  const normalizedQuantity = Math.max(1, Math.min(99, Math.trunc(Number(quantity) || 1)));
  const unitPrice = Number(destination?.[field]);
  if (!destination || !Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return { unitPrice, quantity: normalizedQuantity, total: unitPrice * normalizedQuantity };
}

export function createWhatsAppQuoteUrl({ number, destinationName, containerLabel, quantity, total }) {
  const safeNumber = String(number || '').replace(/\D/g, '');
  if (!safeNumber || !destinationName || !containerLabel || !Number.isFinite(Number(total))) {
    throw new Error('بيانات طلب WhatsApp غير مكتملة.');
  }
  const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });
  const message = [
    'طلب استفسار سعر من بوابة SAFATRANS',
    `الوجهة: ${destinationName}`,
    `نوع الحاوية: ${containerLabel}`,
    `العدد: ${quantity}`,
    `الإجمالي التقديري: ${money.format(Number(total))}`
  ].join('\n');
  return `https://wa.me/${safeNumber}?text=${encodeURIComponent(message)}`;
}
