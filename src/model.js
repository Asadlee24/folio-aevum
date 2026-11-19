export const sampleIssuer = '0x7eAa4235D4Ab4237A2AD37D537ED7B7aaD3959aE';
export const now = () => Math.floor(Date.now() / 1000);
export const DAY = 86400;
const demoKey = 'folio.demo.invoices.v1';
const memoKey = 'folio.invoice.memos.v1';

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Private browsing may disable local storage. */ }
}

const seed = [
  ['1048', 'Brand identity', 'North Studio', '240.00', 'open', 5],
  ['1047', 'Landing page design', 'Fieldwork', '160.00', 'paid', 2],
  ['1046', 'April art direction', 'Common Ground', '320.00', 'paid', 1],
  ['1045', 'Illustration set', 'Paper Plane Co.', '85.00', 'open', 8],
];

export let demoInvoices = readLocal(demoKey, seed.map(([id, title, merchant, amount, state, days]) => ({
  id, title, merchant, amount, state, dueAt: now() + days * DAY, issuer: sampleIssuer,
  ...(state === 'paid' ? { paidAt: now() - DAY } : {}),
})));

export function storeDemo(invoice) {
  demoInvoices = [invoice, ...demoInvoices.filter((i) => i.id !== invoice.id)]
    .sort((a, b) => Number(b.id) - Number(a.id));
  writeLocal(demoKey, demoInvoices);
  return invoice;
}

export function saveMemo(invoice, merchant, title) {
  const records = readLocal(memoKey, {});
  records[invoice.contract.toLowerCase() + ':' + invoice.id] = [merchant, title];
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

export function price(value) {
  const [integer, fraction = ''] = String(value).split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0').replace(/(\d{2}\d*?)0+$/, '$1');
}

export function dateText(time) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time * 1000);
}
