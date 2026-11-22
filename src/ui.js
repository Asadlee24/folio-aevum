import { icon } from './icons.js';
import { addressURL, shortAddress, txURL } from './chain.js';
import { EXPLORER, FAUCET } from './config.js';
import { dateText, invoiceStatus, price } from './model.js';

export const esc = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const mark = '<img class="brand-mark" src="/assets/folio-mark.png" alt="" width="36" height="36">';
const brand = '<a class="brand" href="/" data-action="home" aria-label="Folio home">' + mark + '<span>folio<span class="word-dot">.</span></span></a>';
const button = (text, action, options = {}) => {
  const { symbol, className = 'secondary', disabled = false, attrs = '', type = 'button' } = options;
  return '<button type="' + type + '" class="button ' + className + '"' +
    (action ? ' data-action="' + action + '"' : '') + (disabled ? ' disabled' : '') + ' ' + attrs + '>' +
    (symbol ? icon(symbol) : '') + '<span>' + text + '</span></button>';
};
function newButton() {
  const url = new URL('/', location.origin);
  url.searchParams.set('new', '1');
  const link = mobileWalletLink(url.href);
  return link
    ? `<a class="button primary" href="${link}">${icon('plus')}<span>New invoice</span></a>`
    : button('New invoice', 'new', { symbol: 'plus', className: 'primary' });
}
const clock = '<span class="network-dot" aria-hidden="true"></span>';
const external = (label, url) => '<a class="external" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + ' ' + icon('external-link') + '</a>';
const tabs = [['all', 'All invoices'], ['open', 'Unpaid'], ['paid', 'Paid'], ['closed', 'Closed']];
const statusLabels = { open: 'Unpaid', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' };

export function badge(status) {
  return '<span class="status ' + status + '">' + (status === 'paid' ? icon('check') : '<i aria-hidden="true"></i>') + statusLabels[status] + '</span>';
}

export function header(state, checkout = false) {
  const network = '<span class="net">' + clock + ' Aevum Testnet</span>';
  const nav = checkout ? '' : `<nav aria-label="Workspace" class="primary-nav">
    <button data-action="home" ${state.view === 'invoices' ? 'aria-current="page"' : ''}>Invoices</button>
    <button data-action="settings" ${state.view === 'settings' ? 'aria-current="page"' : ''}>Setup &amp; help</button>
  </nav>`;
  return '<header class="mast"><div class="mast-inner">' + brand + nav + network + '</div></header>';
}

export function featuredInvoice(featured) {
  if (!featured) return '';
  const paid = featured.state === 'paid';
  return `<section class="example-section" aria-labelledby="example-title">
    <h2 id="example-title">${paid ? 'Live receipt' : 'Live invoice'}</h2>
    <a class="example-row" href="${esc(featured.url)}">
      <span class="setting-icon">${icon(paid ? 'check' : 'receipt')}</span>
      <span class="example-name"><strong>${esc(featured.merchant || shortAddress(featured.issuer))}</strong>
        <small>Invoice #${esc(featured.id)}</small></span>
      <span class="example-value"><strong>${price(featured.amount)} <small>tUSD8</small></strong>${badge(featured.state)}</span>
      <span class="example-chevron">${icon('chevron-right')}</span>
    </a>
  </section>`;
}

const paymentSteps = [
  ['file-text', 'Create an invoice', 'Set an amount in tUSD8 and choose when payment is due.'],
  ['link-2', 'Share the payment link', 'Your client opens the link and pays directly to your wallet.'],
  ['shield-check', 'Verify the receipt', 'After payment confirms, the same link opens a receipt with proof on Aevum Explorer.'],
];

function paymentGuide() {
  return `<section class="payment-guide" aria-labelledby="payment-guide-title">
    <h2 id="payment-guide-title">From invoice to receipt</h2>
    <div class="paper-scene" aria-hidden="true">
      <div class="paper-shadow"></div>
      <div class="paper-stack">
        <div class="paper-sheet paper-back"></div>
        <div class="paper-sheet paper-middle"></div>
        <div class="paper-sheet paper-front">
          <span class="paper-fold"></span>
          <span class="paper-icon">${icon('receipt')}</span>
          <span class="paper-lines"></span>
        </div>
        <span class="paper-seal">${icon('check')}</span>
      </div>
    </div>
    <div class="payment-guide-content">
      <ol class="payment-steps">
        ${paymentSteps.map(([symbol, title, detail]) => `<li>
          <span class="setting-icon">${icon(symbol)}</span>
          <div><h3>${title}</h3><p>${detail}</p></div>
        </li>`).join('')}
      </ol>
      ${button('Setup &amp; help', 'settings', { symbol: 'circle-help' })}
    </div>
  </section>`;
}

function tableRow(invoice) {
  const status = invoiceStatus(invoice);
  return '<tr><td><button class="invoice-name" data-action="open" data-id="' + esc(invoice.id) + '">' +
    '<span class="row-icon">' + icon('file-text') + '</span><span><strong>' + esc(invoice.title || 'Invoice #' + invoice.id) +
    '</strong><small>' + esc(invoice.merchant || shortAddress(invoice.issuer)) + '</small></span></button></td>' +
    '<td class="row-amount"><strong>' + price(invoice.amount) + '</strong> <small>tUSD8</small></td>' +
    '<td class="row-status">' + badge(status) + '</td><td class="row-date">' + dateText(invoice.dueAt) + '</td>' +
    '<td class="row-action"><button class="icon-button" title="Open invoice" aria-label="Open invoice ' + esc(invoice.title || invoice.id) +
    '" data-action="open" data-id="' + esc(invoice.id) + '">' + icon('external-link') + '</button></td></tr>';
}

function invoiceTable(collection, state) {
  const filtered = collection.filter((invoice) => {
    const status = invoiceStatus(invoice);
    const fits = state.filter === 'all' || state.filter === status || (state.filter === 'closed' && ['expired', 'cancelled'].includes(status));
    return fits && (!state.query || [invoice.id, invoice.title, invoice.merchant, invoice.amount].some((value) =>
      String(value ?? '').toLowerCase().includes(state.query.toLowerCase())));
  });
  if (!filtered.length) {
    if (state.loading) return '<div class="empty" role="status">' + icon('loader-circle') + '<p>Loading invoices from Aevum…</p></div>';
    const title = state.account ? (collection.length ? 'No matching invoices' : 'No invoices yet') : 'Connect your wallet';
    const detail = state.account ? (collection.length ? 'Clear the search or pick another status.' : 'Create your first invoice to get a shareable payment link.') :
      'Your issued invoices and receipts will appear here.';
    return `<div class="empty empty-workspace">
      <span class="setting-icon">${icon(state.account ? 'inbox' : 'wallet')}</span>
      <div class="empty-copy"><h2>${title}</h2><p>${detail}</p></div>
      ${state.account ? '' : walletAction('Connect wallet', 'connect')}
    </div>`;
  }
  return '<table><thead><tr><th scope="col">Invoice</th><th scope="col">Amount</th><th scope="col">Status</th>' +
    '<th scope="col" class="row-date">Due date (UTC)</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>' +
    '<tbody>' + filtered.map(tableRow).join('') + '</tbody></table>';
}

export function workspace(state, collection) {
  return header(state) + `<main class="workspace" id="main" tabindex="-1">
    <section class="invoices" aria-labelledby="invoice-title">
      <div class="section-head">
        <div><h1 id="invoice-title">Invoices</h1><p>Share payment links.</p></div>
        ${newButton()}
      </div>
      ${state.account ? `<div class="invoice-toolbar">
        <span class="account-label">${icon('wallet')} <span>${esc(shortAddress(state.account))}</span></span>
        ${button('Refresh', 'refresh', { symbol: 'refresh-cw', className: 'secondary refresh-button', disabled: state.loading })}
      </div>` : ''}
      <div class="table-frame">` + (state.account && collection.length ? '<div class="table-controls"><div class="filters" aria-label="Filter invoices">' +
    tabs.map(([value, label]) => '<button data-action="filter" data-filter="' + value + '" aria-pressed="' + (state.filter === value) + '">' + label + '</button>').join('') +
    '</div><label class="search">' + icon('search') + '<span class="sr-only">Search invoices</span><input type="search" id="invoice-search" placeholder="Find an invoice" value="' + esc(state.query) + '"></label></div>' : '') + '<div id="invoice-table" aria-busy="' + state.loading + '">' + invoiceTable(collection, state) + '</div>' +
    (state.count > 10 ? '<div class="pagination">' +
      button('Previous', 'previous', { disabled: state.offset === 0 }) + '<span>' + (state.offset + 1) + '–' + Math.min(state.offset + 10, state.count) + ' of ' + state.count + '</span>' +
      button('Next', 'next', { disabled: state.offset + 10 >= state.count }) + '</div>' : '') +
    '</div></section><div id="featured-invoice">' + featuredInvoice(state.featured) + '</div>' + paymentGuide() + '</main>' + footer();
}

export const refreshTable = (state, collection) => {
  const target = document.getElementById('invoice-table');
  if (target) target.innerHTML = invoiceTable(collection, state);
};

function footer() {
  return '<footer class="footer"><span>Folio <span class="foot-dot">·</span> Aevum Builder Challenge</span>' +
    external('QDay Aevum', EXPLORER) + '</footer>';
}

export function settings(state) {
  return header(state) + `<main class="workspace setup-page" id="main" tabindex="-1">
    <div class="setup-intro"><h1 tabindex="-1">Setup &amp; help</h1></div>
    <div class="settings-grid">
      <section class="setting"><div class="setting-icon">${icon('receipt')}</div><h2>How payments work</h2>
        <p>Issue an invoice with a fixed amount and due date. Your client pays your wallet directly, and the invoice link becomes a verifiable receipt.</p>
        <div class="mode-options">${newButton()}</div>
      </section>
      <section class="setting"><div class="setting-icon">${icon('wallet')}</div><h2>Wallet and test tokens</h2>
        <p>Connect your wallet to Aevum Testnet. Use tQDAY for gas and tUSD8 to pay invoices.</p>
        <div class="mode-options">${walletAction(state.account ? 'Wallet connected' : 'Connect wallet', 'connect')} ${external('QDay faucet', FAUCET)}</div>
        <div class="progress-inline" aria-live="polite">${progress(state)}</div>
      </section>
    </div>
  </main>` + footer();
}

export function createDialog(state) {
  return `<dialog class="composer" aria-labelledby="create-title">
    <div class="composer-top"><div class="setting-icon">${icon('file-text')}</div><button class="icon-button close" data-action="close" aria-label="Close" ${state.busy ? 'disabled' : ''}>${icon('x')}</button></div>
    <div class="dialog-title"><h2 id="create-title">New invoice</h2><p>Publish an invoice to Aevum and share its payment link.</p></div>
    <form id="invoice-form" class="invoice-form">
      <label for="merchant">Your studio or business name</label><input id="merchant" name="merchant" placeholder="e.g. North Studio" value="${esc(state.draft.merchant)}" required maxlength="60" autocomplete="organization">
      <label for="title">What is this invoice for?</label><input id="title" name="title" placeholder="e.g. Brand identity design" value="${esc(state.draft.title)}" required maxlength="100">
      <div class="form-pair"><div><label for="amount">Amount</label><div class="amount-input">
        <input id="amount" name="amount" placeholder="0.00" inputmode="decimal" value="${esc(state.draft.amount)}" required maxlength="18"><span>tUSD8</span></div></div>
        <div><label for="due">Payment window</label><div class="select-wrap">
          <select id="due" name="due">${[[1, '24 hours'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(([v, s]) => '<option value="' + v + '"' + (v === state.draft.due ? ' selected' : '') + '>' + s + '</option>').join('')}</select>${icon('chevron-down')}</div></div></div>
      <div class="form-note">${icon('shield-check')} Amount and recipient are fixed once an invoice is issued.</div>
      <div class="progress-inline" aria-live="polite">${progress(state)}</div>
      <div class="dialog-actions">${button('Cancel', 'close', { disabled: state.busy })}${button('Create invoice', '', { symbol: 'plus', className: 'primary', type: 'submit', disabled: state.busy })}</div>
    </form>
  </dialog>`;
}

export function readyDialog(invoice, link) {
  return `<dialog class="composer" aria-labelledby="ready-title">
    <div class="composer-top"><div class="setting-icon success">${icon('check')}</div><button class="icon-button close" data-action="close" aria-label="Close">${icon('x')}</button></div>
    <div class="dialog-title"><h2 id="ready-title">Invoice ready</h2><p>Share this link so your client can review the invoice and pay.</p></div>
    <div class="summary"><strong>${esc(invoice.title || 'Invoice #' + invoice.id)}</strong><span>${price(invoice.amount)} tUSD8</span></div>
    <label class="link-label" for="share-url">Client link</label><div class="share-row"><input id="share-url" readonly value="${esc(link)}">
    ${button('Copy', 'copy-ready', { symbol: 'copy', className: 'primary' })}</div>
    <div class="dialog-actions">${button('Open checkout', 'open-ready', { symbol: 'external-link' })}</div>
  </dialog>`;
}

export function progress(state) {
  const spinner = state.busy ? icon('loader-circle') : '';
  return (state.progress ? '<div class="operation">' + spinner + '<span>' + esc(state.progress) + '</span>' +
    (state.tx ? external('Transaction', txURL(state.tx)) : '') + '</div>' : '') +
    (state.error ? '<div class="error" role="alert">' + icon('triangle-alert') + '<span>' + esc(state.error) +
      (state.tx ? '<br>' + external('View transaction', txURL(state.tx)) : '') + '</span></div>' : '');
}

function invoiceProof(invoice, status) {
  const settled = status === 'paid';
  const payment = {
    open: 'Awaiting payment',
    paid: 'Payment confirmed',
    expired: 'Payment window expired',
    cancelled: 'Invoice cancelled',
  }[status];

  return `
    <section class="invoice-proof" aria-labelledby="proof-title">
      <div class="proof-heading">
        <span class="proof-icon">${icon('shield-check')}</span>
        <div><h2 id="proof-title">On-chain record</h2><p>Aevum Testnet</p></div>
        ${external('View contract', addressURL(invoice.contract))}
      </div>
      <ol class="proof-steps">
        <li><i aria-hidden="true">${icon('check')}</i> Issued on-chain</li>
        <li class="${settled ? 'complete' : 'pending'}"><i aria-hidden="true">${icon(settled ? 'check' : 'clock')}</i> ${payment}</li>
      </ol>
    </section>`;
}

export function checkout(state, invoice, link) {
  const status = invoice ? invoiceStatus(invoice) : '';
  const paid = status === 'paid';
  const cancellable = state.account && invoice?.issuer.toLowerCase() === state.account.toLowerCase() && invoice.state === 'open';
  const verified = invoice?.memoVerified;
  const paymentAction = state.account && invoice ? 'Pay ' + price(invoice.amount) + ' tUSD8' : 'Connect wallet to pay';
  const receiptTitle = paid ? 'Payment receipt' : 'Payment request';
  const amountLabel = paid ? 'AMOUNT PAID' : 'AMOUNT DUE';

  return header(state, true) + '<main class="checkout-shell" id="main" tabindex="-1"><button class="back-button" data-action="home">' + icon('arrow-left') + ' Invoices</button>' +
    (!invoice ? '<section class="checkout-card">' + (state.loading ?
      '<div class="empty">' + icon('loader-circle') + '<p>Checking invoice on Aevum…</p></div>' :
      '<h1>Invoice unavailable</h1>' + progress(state) + button('Try again', 'reload-checkout')) + '</section>' :
      `<section class="checkout-card ${paid ? 'receipt-paid' : ''}">
      <div class="checkout-document">
        <div class="checkout-top"><div class="setting-icon ${paid ? 'success' : ''}">${icon(paid ? 'check' : 'receipt')}</div>${badge(status)}</div>
        <div class="checkout-title"><span class="eyebrow">${receiptTitle} / #${esc(invoice.id)}</span>
          <h1>${esc(invoice.title || 'Invoice #' + invoice.id)}</h1>
          <p>From ${esc(invoice.merchant || shortAddress(invoice.issuer))}${verified ? ' <span class="verified-name" aria-label="Invoice details verified" title="Invoice details match the on-chain hash">' + icon('shield-check') + '</span>' : ''}</p>
        </div>
        <dl class="checkout-details">
          <div><dt>${paid ? 'Paid on (UTC)' : 'Due date (UTC)'}</dt><dd>${dateText(paid ? invoice.paidAt : invoice.dueAt)}</dd></div>
          <div><dt>Recipient</dt><dd>${external(esc(shortAddress(invoice.issuer)), addressURL(invoice.issuer))}</dd></div>
          ${paid ? '<div><dt>Payer</dt><dd>' + external(esc(shortAddress(invoice.payer)), addressURL(invoice.payer)) + '</dd></div>' : ''}
        </dl>
      </div>
      <div class="checkout-settlement">
        <div class="checkout-amount"><span>${amountLabel}</span><div>${price(invoice.amount)} <small>tUSD8</small></div></div>
        ${!verified ? '<div class="checkout-note warning">' + icon('triangle-alert') + ' The invoice description is unverified. Check the recipient and amount.</div>' : ''}
        ${status === 'open' ? '<div class="checkout-note">' + icon('shield-check') + ' Test tokens settle directly to the recipient’s wallet.</div>' : ''}
        ${paid ? '<div class="checkout-note">' + icon('shield-check') + ' Confirmed on Aevum Testnet.</div>' : ''}
        ${progress(state)}
        <div class="checkout-actions">
          ${status === 'open' ? walletAction(paymentAction, 'pay', 'primary', state.busy) : ''}
          ${paid && invoice.hash ? external('Verify transaction', txURL(invoice.hash)) : ''}
          ${button(paid ? 'Copy receipt link' : 'Copy invoice link', 'copy-current', { symbol: 'copy', attrs: 'data-url="' + esc(link) + '"' })}
          ${cancellable ? button('Cancel invoice', 'cancel-invoice', { className: 'quiet', disabled: state.busy }) : ''}
        </div>
      </div>
      </section>${invoiceProof(invoice, status)}`) + '</main>' + footer();
}

function mobileWalletLink(url) {
  const phone = /iphone|android|ipad/i.test(navigator.userAgent);
  if (!window.ethereum && phone && url.startsWith('https://')) {
    return 'https://metamask.app.link/dapp/' + esc(url.slice('https://'.length));
  }
  return '';
}

function walletAction(label, action, style = 'secondary', busy = false) {
  const link = busy ? '' : mobileWalletLink(location.href);
  if (link) return `<a class="button ${style}" href="${link}">${icon('wallet')}<span>Open in MetaMask</span></a>`;
  return button(label, action, { symbol: 'wallet', className: style, disabled: busy });
}
