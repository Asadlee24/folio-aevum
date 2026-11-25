import { icon } from './icons.js';
import { addressURL, shortAddress, txURL } from './chain.js';
import { CHAIN_ID, EXPLORER, FAUCET } from './config.js';
import { dateText, invoiceStatus, invoiceTotals, ITEM_LABEL_LIMIT, MAX_LINE_ITEMS, price, sumItems } from './model.js';

export const esc = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const mark = '<img class="brand-mark" src="/assets/folio-mark.png" alt="" width="36" height="36">';
const button = (text, action, options = {}) => {
  const { symbol, className = 'secondary', disabled = false, attrs = '', type = 'button' } = options;
  return '<button type="' + type + '" class="button ' + className + '"' +
    (action ? ' data-action="' + action + '"' : '') + (disabled ? ' disabled' : '') + ' ' + attrs + '>' +
    (symbol ? icon(symbol) : '') + '<span>' + text + '</span></button>';
};
const copyStatus = '<p class="copy-status" data-copy-status role="status"></p>';
function newButton() {
  return button('New invoice', 'new', { symbol: 'plus', className: 'primary' });
}
const clock = '<span class="network-dot" aria-hidden="true"></span>';
const external = (label, url) => '<a class="external" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + ' ' + icon('external-link') + '</a>';

function whatsappLink(invoice, link) {
  const url = new URL('https://wa.me/');
  url.searchParams.set('text', [
    invoice.title ? `Invoice #${invoice.id} · ${invoice.title}` : `Invoice #${invoice.id}`,
    `Amount due: ${price(invoice.amount)} tUSD8`,
    `Due: ${dateText(invoice.dueAt)} (UTC)`,
    '',
    'Review and pay on Folio:',
    link,
  ].join('\n'));
  return `<a class="button secondary" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${icon('message-circle')}<span>Share on WhatsApp</span></a>`;
}
const tabs = [['all', 'All invoices'], ['open', 'Unpaid'], ['paid', 'Paid'], ['closed', 'Closed']];
const statusLabels = { open: 'Unpaid', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' };

export function badge(status) {
  return '<span class="status ' + status + '">' + (status === 'paid' ? icon('check') : '<i aria-hidden="true"></i>') + statusLabels[status] + '</span>';
}

export function header(state, checkout = false) {
  const brand = '<a class="brand" href="' + (state.recording ? '/?record=1' : '/') + '" data-action="home" aria-label="Folio home">' + mark + '<span>folio<span class="word-dot">.</span></span></a>';
  const network = '<span class="net">' + clock + ' Aevum Testnet</span>';
  const wallet = walletAction(walletLabel(state), 'connect', 'secondary header-wallet', state.busy);
  const nav = checkout ? '' : `<nav aria-label="Workspace" class="primary-nav">
    <button data-action="home" ${state.view === 'invoices' ? 'aria-current="page"' : ''}>Invoices</button>
    <button data-action="settings" ${state.view === 'settings' ? 'aria-current="page"' : ''}>Setup &amp; help</button>
  </nav>`;
  return '<header class="mast"><div class="mast-inner">' + brand + nav +
    '<div class="mast-wallet">' + network + wallet + '</div></div></header>';
}

export function featuredInvoice(featured) {
  if (!featured) return '';
  const paid = featured.state === 'paid';
  return `<section class="example-section" aria-labelledby="example-title">
    <h2 id="example-title">${paid ? 'Explore a real receipt' : 'Explore a real invoice'}</h2>
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
    <h2 id="payment-guide-title">From invoice to receipt.</h2>
    <ol class="glass-steps">
      ${paymentSteps.map(([symbol, title, detail]) => `<li class="glass-step">
        <span class="glass-step-icon">${icon(symbol)}</span>
        <h3>${title}</h3><p>${detail}</p>
      </li>`).join('')}
    </ol>
    <div class="guide-bottom"><span>${icon('shield-check')} Transactions use Aevum test tokens.</span>${button('Setup &amp; help', 'settings', { symbol: 'circle-help' })}</div>
  </section>`;
}

function hero(preview) {
  const paid = preview === 'receipt';
  return `<section class="folio-hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <h1 id="hero-title">Send an invoice.<br><span>Share a receipt.</span></h1>
      <p class="hero-description">Send your client one payment link. Once they pay, that same link becomes a receipt they can verify on Aevum.</p>
      <div class="hero-actions">
        ${newButton()}
        <a class="hero-secondary" href="#payment-guide-title">How it works ${icon('chevron-down')}</a>
      </div>
      <p class="hero-footnote">${icon('shield-check')} Testnet payments use test tokens</p>
    </div>
    <section class="glass-stage" aria-labelledby="preview-title">
      <div class="preview-header">
        <h2 id="preview-title">Payment preview</h2>
        <div class="preview-switch" role="group" aria-label="Document preview">
          ${button('Invoice', 'preview', { symbol: 'file-text', className: 'preview-toggle', attrs: `data-id="invoice" aria-controls="preview-document" aria-pressed="${!paid}"` })}
          ${button('Receipt', 'preview', { symbol: 'receipt', className: 'preview-toggle', attrs: `data-id="receipt" aria-controls="preview-document" aria-pressed="${paid}"` })}
        </div>
      </div>
      <div class="preview-scene" data-preview="${preview}">
        <div class="glass-arrival">
          <div class="glass-stack">
            <div class="glass-layer glass-layer--rear" aria-hidden="true"></div>
            <div class="glass-layer glass-layer--middle" aria-hidden="true"></div>
            <div class="preview-document" id="preview-document" aria-live="polite" aria-atomic="true">
              <div class="document-face document-invoice" ${paid ? 'aria-hidden="true" inert' : ''}>
                <div class="document-header"><span class="document-brand">${mark} folio.</span><span>INVOICE</span></div>
                <p class="document-label">Billed to</p>
                <h3>Studio North</h3>
                <dl class="document-lines"><div><dt>Brand identity design</dt><dd>250.00</dd></div></dl>
                <div class="document-total"><span>Amount due</span><strong>250.00 <small>tUSD8</small></strong></div>
                <span class="document-note">Due in 7 days</span>
              </div>
              <div class="document-face document-receipt" ${paid ? '' : 'aria-hidden="true" inert'}>
                <div class="document-header"><span class="document-brand">${mark} folio.</span><span>RECEIPT</span></div>
                <p class="document-label">Received from</p>
                <h3>Studio North</h3>
                <dl class="document-lines"><div><dt>Brand identity design</dt><dd>250.00</dd></div></dl>
                <div class="document-total"><span>Amount paid</span><strong>250.00 <small>tUSD8</small></strong></div>
                <span class="document-note">${icon('shield-check')} Aevum Testnet</span>
              </div>
            </div>
            <div class="preview-status" aria-hidden="true">
              <span class="preview-status-icon">${icon('clock')}${icon('shield-check')}</span>
              <span><small>Payment status</small><strong class="preview-unpaid">Awaiting payment</strong><strong class="preview-paid">Payment confirmed</strong></span>
            </div>
          </div>
        </div>
      </div>
      <p class="preview-caption">Sample data · No transaction</p>
    </section>
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

function totalsContent(state) {
  if (state.summaryFailed) return '<p class="totals-status">Totals unavailable. Refresh your invoices to try again.</p>';
  if (!state.summary) return '<p class="totals-status">Loading invoice totals…</p>';
  const labels = { paid: ['Paid', 'circle-check'], open: ['Awaiting payment', 'clock'], expired: ['Overdue', 'triangle-alert'] };
  return '<dl class="invoice-totals">' + invoiceTotals(state.summary).map(([status, amount]) =>
    `<div class="total-card ${status}"><dt>${icon(labels[status][1])}${labels[status][0]}</dt>
      <dd>${price(amount)} <small>tUSD8</small></dd></div>`).join('') + '</dl>';
}

export function refreshTotals(state) {
  const target = document.getElementById('invoice-totals');
  if (target) target.innerHTML = totalsContent(state);
}

export function workspace(state, collection) {
  if (state.recording && !state.count && !state.loading) {
    return header(state) + '<main class="workspace" id="main" tabindex="-1">' +
      hero(state.preview) + paymentGuide() + '</main>' + footer();
  }
  return header(state) + `<main class="workspace" id="main" tabindex="-1">
    ${hero(state.preview)}
    <section class="invoices" aria-labelledby="invoice-title">
      <div class="section-head">
        <div><h2 id="invoice-title">Your workspace</h2><p>Manage your invoices and receipts.</p></div>
        ${newButton()}
      </div>
      ${(state.account || state.recording) ? `<div id="invoice-totals" aria-label="Invoice totals">${totalsContent(state)}</div>` : ''}
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
    '</div></section>' + (state.recording ? '' : '<div id="featured-invoice">' + featuredInvoice(state.featured) + '</div>') +
    paymentGuide() + '</main>' + footer();
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
        <div class="mode-options">${newButton()}
          ${state.recording ? '<a class="button secondary" href="/">Show full invoice history</a>' : ''}
        </div>
      </section>
      <section class="setting"><div class="setting-icon">${icon('wallet')}</div><h2>Wallet and test tokens</h2>
        <p>Connect your wallet to Aevum Testnet. Use tQDAY for gas and tUSD8 to pay invoices.</p>
        <div class="mode-options">${walletAction(walletLabel(state), 'connect')} ${openInMetaMask()} ${external('QDay faucet', FAUCET)}</div>
        <div class="progress-inline" aria-live="polite">${progress(state)}</div>
      </section>
    </div>
  </main>` + footer();
}

export function createDialog(state) {
  const ready = state.account && state.walletChain === CHAIN_ID;
  const items = state.draft.items;
  const amount = items.length ? sumItems(items.map(([label, value]) => [label, value.trim()])) : state.draft.amount;
  return `<dialog class="composer" aria-labelledby="create-title">
    <div class="composer-top"><div class="setting-icon">${icon('file-text')}</div><button class="icon-button close" data-action="close" aria-label="Close" ${state.busy ? 'disabled' : ''}>${icon('x')}</button></div>
    <div class="dialog-title"><h2 id="create-title">New invoice</h2><p>Publish an invoice to Aevum and share its payment link.</p></div>
    <form id="invoice-form" class="invoice-form">
      <label for="merchant">Your studio or business name</label><input id="merchant" name="merchant" placeholder="e.g. North Studio" value="${esc(state.draft.merchant)}" required maxlength="60" autocomplete="organization">
      <label for="title">What is this invoice for?</label><input id="title" name="title" placeholder="e.g. Brand identity design" value="${esc(state.draft.title)}" required maxlength="100">
      <div class="composer-items">
        ${items.length ? `<div class="item-column-labels" aria-hidden="true"><span>Item</span><span>tUSD8</span></div>` : ''}
        ${items.map(([label, value], index) => `<div class="item-input-row" data-item-row="${index}">
          <input id="item-label-${index}" name="item-label" aria-label="Item ${index + 1} description" placeholder="e.g. Logo design" value="${esc(label)}" maxlength="${ITEM_LABEL_LIMIT}" required>
          <input name="item-amount" aria-label="Item ${index + 1} amount in tUSD8" placeholder="0.00" inputmode="decimal" value="${esc(value)}" maxlength="16" required>
          <button class="icon-button" type="button" data-action="remove-item" data-id="${index}" aria-label="Remove item ${index + 1}" ${state.busy ? 'disabled' : ''}>${icon('x')}</button>
        </div>`).join('')}
        ${items.length < MAX_LINE_ITEMS ? button('Add line item', 'add-item', { symbol: 'plus', className: 'secondary add-item', disabled: state.busy }) : ''}
      </div>
      <div class="form-pair"><div><label for="amount">${items.length ? 'Total amount' : 'Amount'}</label><div class="amount-input">
        <input id="amount" name="amount" placeholder="0.00" inputmode="decimal" value="${esc(amount)}" ${items.length ? 'readonly' : 'required'} maxlength="18"><span>tUSD8</span></div></div>
        <div><label for="due">Payment window</label><div class="select-wrap">
          <select id="due" name="due">${[[1, '24 hours'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(([v, s]) => '<option value="' + v + '"' + (v === state.draft.due ? ' selected' : '') + '>' + s + '</option>').join('')}</select>${icon('chevron-down')}</div></div></div>
      <div class="form-note">${icon('shield-check')} Amount and recipient are fixed once an invoice is issued.</div>
      <div class="progress-inline" aria-live="polite">${progress(state)}</div>
      <div class="dialog-actions">${button('Cancel', 'close', { disabled: state.busy })}${button(ready ? 'Create invoice' : walletLabel(state), '', { symbol: ready ? 'plus' : 'wallet', className: 'primary', type: 'submit', disabled: state.busy })}</div>
      ${!state.account ? openInMetaMask(true, state.recording) : ''}
    </form>
  </dialog>`;
}

export function readyDialog(invoice, link) {
  return `<dialog class="composer" aria-labelledby="ready-title" data-link-share>
    <div class="composer-top"><div class="setting-icon success">${icon('check')}</div><button class="icon-button close" data-action="close" aria-label="Close">${icon('x')}</button></div>
    <div class="dialog-title"><h2 id="ready-title">Invoice ready</h2><p>Share this link so your client can review the invoice and pay.</p></div>
    <div class="summary"><strong>${esc(invoice.title || 'Invoice #' + invoice.id)}</strong><span>${price(invoice.amount)} tUSD8</span></div>
    <label class="link-label" for="share-url">Client link</label><div class="share-row"><input id="share-url" data-share-url readonly value="${esc(link)}">
    ${button('Copy', 'copy-link', { symbol: 'copy', className: 'primary' })}</div>
    ${copyStatus}
    <div class="dialog-actions ready-actions">${whatsappLink(invoice, link)}${button('Open checkout', 'open-ready', { symbol: 'external-link' })}</div>
  </dialog>`;
}

export function progress(state) {
  const spinner = state.busy ? icon('loader-circle') : '';
  return (state.progress ? '<div class="operation">' + spinner + '<span>' + esc(state.progress) + '</span>' +
    (state.tx ? external('Transaction', txURL(state.tx)) : '') + '</div>' : '') +
    (state.error ? '<div class="error" role="alert">' + icon('triangle-alert') + '<span>' + esc(state.error) +
      (state.tx ? '<br>' + external('View transaction', txURL(state.tx)) : '') + '</span></div>' : '');
}

function checkoutSteps(step) {
  const labels = ['Approve tUSD8', 'Confirm payment', 'Receipt ready'];
  const current = ['approval', 'payment'].indexOf(step);
  return '<ol class="checkout-steps" aria-label="Payment steps">' + labels.map((label, index) =>
    `<li${index === current ? ' aria-current="step"' : ''}><span aria-hidden="true">${index < current ? icon('check') : index + 1}</span>${label}</li>`).join('') + '</ol>';
}

function lineItems(items) {
  return `<section class="line-items" aria-label="Invoice items">
    <div class="line-items-heading"><strong>Items</strong><span>tUSD8</span></div>
    <ul>${items.map(([label, amount]) => `<li><span>${esc(label)}</span><strong>${price(amount)}</strong></li>`).join('')}</ul>
  </section>`;
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
  const paymentAction = state.account && state.walletChain === CHAIN_ID && invoice
    ? 'Pay ' + price(invoice.amount) + ' tUSD8'
    : state.account ? 'Switch to Aevum' : 'Connect wallet to pay';
  const receiptTitle = paid ? 'Payment receipt' : 'Payment request';
  const amountLabel = paid ? 'AMOUNT PAID' : 'AMOUNT DUE';

  return header(state, true) + '<main class="checkout-shell" id="main" tabindex="-1"><button class="back-button" data-action="home">' + icon('arrow-left') + ' Invoices</button>' +
    (!invoice ? '<section class="checkout-card">' + (state.loading ?
      '<div class="checkout-loading" role="status">' + icon('loader-circle') + '<span>Checking invoice on Aevum…</span></div>' :
      '<h1>Invoice unavailable</h1>' + progress(state) + button('Try again', 'reload-checkout')) + '</section>' :
      `<section class="checkout-card ${paid ? 'receipt-paid' : ''}" aria-labelledby="checkout-title">
      ${paid ? `<div class="payment-confirmation">
        <span class="confirmation-mark" aria-hidden="true">${icon('check')}</span>
        <div class="confirmation-copy"><strong>Payment confirmed</strong><span>Settled on Aevum Testnet</span></div>
      </div>` : ''}
      <div class="checkout-document">
        <div class="checkout-top">
          <div class="checkout-reference"><span class="setting-icon" aria-hidden="true">${icon('receipt')}</span><span class="eyebrow">${receiptTitle} / #${esc(invoice.id)}</span></div>
          ${badge(status)}
        </div>
        <div class="checkout-title">
          <h1 id="checkout-title">${esc(invoice.title || 'Invoice #' + invoice.id)}</h1>
          <p>From ${esc(invoice.merchant || shortAddress(invoice.issuer))}${verified ? ' <span class="verified-name" aria-label="Invoice details verified" title="Invoice details match the on-chain hash">' + icon('shield-check') + '</span>' : ''}</p>
        </div>
        ${invoice.items ? lineItems(invoice.items) : ''}
        <dl class="checkout-details">
          <div><dt>${paid ? 'Paid on (UTC)' : 'Due date (UTC)'}</dt><dd>${dateText(paid ? invoice.paidAt : invoice.dueAt)}</dd></div>
          <div><dt>Recipient</dt><dd>${external(esc(shortAddress(invoice.issuer)), addressURL(invoice.issuer))}</dd></div>
          ${paid ? '<div><dt>Payer</dt><dd>' + external(esc(shortAddress(invoice.payer)), addressURL(invoice.payer)) + '</dd></div>' : ''}
        </dl>
      </div>
      <div class="checkout-settlement" data-link-share>
        <div class="checkout-amount"><span>${amountLabel}</span><div>${price(invoice.amount)} <small>tUSD8</small></div></div>
        ${!verified ? '<div class="checkout-note warning">' + icon('triangle-alert') + ' The invoice description is unverified. Check the recipient and amount.</div>' : ''}
        ${status === 'open' ? '<div class="checkout-note">' + icon('shield-check') + ' Test tokens settle directly to the recipient’s wallet.</div>' : ''}
        ${state.paymentStep ? checkoutSteps(state.paymentStep) : ''}
        ${progress(state)}
        <div class="checkout-actions">
          ${status === 'open' ? walletAction(paymentAction, 'pay', 'primary', state.busy) : ''}
          ${status === 'open' && !state.account ? openInMetaMask() : ''}
          ${paid && invoice.hash ? external('Verify transaction', txURL(invoice.hash)) : ''}
          ${paid ? button('Download receipt PDF', 'download-receipt', { symbol: 'download', className: 'primary receipt-download' }) : ''}
          ${button(paid ? 'Copy receipt link' : 'Copy invoice link', 'copy-link', { symbol: 'copy' })}
          ${status === 'open' && !state.busy ? whatsappLink(invoice, link) : ''}
          ${cancellable ? button('Cancel invoice', 'cancel-invoice', { className: 'quiet', disabled: state.busy }) : ''}
        </div>
        <input class="checkout-share-url" aria-label="${paid ? 'Receipt link' : 'Invoice link'}" data-share-url readonly hidden value="${esc(link)}">
        ${copyStatus}
      </div>
      </section>${invoiceProof(invoice, status)}`) + '</main>' + footer();
}

function openInMetaMask(composer = false, recording = false) {
  const phone = /iphone|android|ipad/i.test(navigator.userAgent);
  if (!phone || location.protocol !== 'https:' || window.ethereum) return '';
  const url = new URL(location.href);
  if (composer) url.searchParams.set('new', '1');
  if (recording) url.searchParams.set('record', '1');
  return `<a class="external" href="https://metamask.app.link/dapp/${esc(url.href.slice('https://'.length))}">Open in MetaMask ${icon('external-link')}</a>`;
}

function walletLabel(state) {
  if (!state.account) return 'Connect wallet';
  return state.walletChain === CHAIN_ID ? shortAddress(state.account) : 'Switch to Aevum';
}

function walletAction(label, action, style = 'secondary', busy = false) {
  return button(label, action, { symbol: 'wallet', className: style, disabled: busy });
}
