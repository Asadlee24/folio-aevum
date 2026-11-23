import { formatUnits, parseUnits } from 'ethers';

export const now = () => Math.floor(Date.now() / 1000);
export const DAY = 86400;
export const MAX_LINE_ITEMS = 5;
export const ITEM_LABEL_LIMIT = 48;
const memoKey = 'folio.invoice.memos.v1';

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Private browsing may disable local storage. */ }
}

export function saveMemo(invoice, memo) {
  const records = readLocal(memoKey, {});
  records[invoice.contract.toLowerCase() + ':' + invoice.id] = memo;
  writeLocal(memoKey, records);
}

export function getMemo(invoice) {
  return readLocal(memoKey, {})[invoice.contract?.toLowerCase() + ':' + invoice.id];
}

export function pack(data) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function unpack(value) {
  if (!value || value.length > 2500) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch { return null; }
}

export function invoiceStatus(invoice) {
  return invoice.state === 'open' && invoice.dueAt <= now() ? 'expired' : invoice.state;
}

export function amountValid(value) {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value) && Number(value) > 0;
}

export function sumItems(items) {
  if (!items.length || !items.every(([, amount]) => amountValid(amount))) return '';
  return formatUnits(items.reduce((sum, [, amount]) => sum + parseUnits(amount, 6), 0n), 6);
}

export function invoiceTotals(invoices) {
  const totals = { paid: 0n, open: 0n, expired: 0n };
  for (const invoice of invoices) {
    const status = invoiceStatus(invoice);
    if (status in totals) totals[status] += invoice.raw;
  }
  return Object.entries(totals).map(([status, raw]) => [status, formatUnits(raw, 6)]);
}

export function price(value) {
  const [integer, fraction = ''] = String(value).split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0').replace(/(\d{2}\d*?)0+$/, '$1');
}

export function dateText(time) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time * 1000);
}
