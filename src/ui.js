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
export const newButton = () => button('New invoice', 'new', { symbol: 'plus', className: 'primary' });
const clock = '<span class="network-dot" aria-hidden="true"></span>';
const external = (label, url) => '<a class="external" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + ' ' + icon('external-link') + '</a>';
const tabs = [['all', 'All invoices'], ['open', 'Unpaid'], ['paid', 'Paid'], ['closed', 'Closed']];
const statusLabels = { open: 'Unpaid', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' };

export function badge(status) {
  return '<span class="status ' + status + '">' + (status === 'paid' ? icon('check') : '<i aria-hidden="true"></i>') + statusLabels[status] + '</span>';
}

export function header(state, checkout = false) {
  return '<header class="mast"><div class="mast-inner">' + brand +
    (checkout ? '<div class="mast-end">' + (state.mode === 'live' ? '<span class="net">' + clock + ' Aevum Testnet</span>' : '<span class="net demo"><i></i> Demo mode</span>') + '</div>' :
      '<nav aria-label="Workspace" class="primary-nav">' +
      '<button data-action="home" ' + (state.view === 'invoices' ? 'aria-current="page"' : '') + '>Invoices</button>' +
      '<button data-action="settings" ' + (state.view === 'settings' ? 'aria-current="page"' : '') + '>Setup &amp; help</button>' +
      '</nav><div class="mast-end">' +
      '<button class="net ' + (state.mode === 'demo' ? 'demo' : '') + '" data-action="switch-mode">' +
      (state.mode === 'demo' ? '<i></i> Demo mode' : clock + ' Aevum Testnet') + icon('chevron-down') + '</button>' +
      button(state.account ? esc(shortAddress(state.account)) : 'Connect wallet', 'connect', { symbol: 'wallet', className: 'secondary wallet-button', attrs: 'aria-label="' + (state.account ? 'Connected wallet ' + esc(shortAddress(state.account)) : 'Connect wallet') + '"' }) + '</div>') + '</div></header>';
}

const hero = () => `
  <section class="hero" aria-label="Folio invoice workspace">
    <div class="hero-copy">
      <div class="eyebrow"><span></span> FREELANCE PAYMENTS</div>
      <h1>Good work.<br><em>Paid on record.</em></h1>
      <p>Send a payment link and give clients a receipt they can verify.</p>
      ${newButton()}
    </div>
    <div class="hero-graphic" aria-hidden="true">
      <div class="graphic-lines"></div>
      <div class="graphic-arc arc-one"></div><div class="graphic-arc arc-two"></div>
      <div class="receipt-shadow"></div>
      <div class="hero-receipt">
        <div class="receipt-caption"><span>PAYMENT RECEIPT</span><i>✳</i></div>
        <strong>240.00</strong><small>tUSD8</small>
        <div class="receipt-perf"></div>
        <div class="receipt-bottom"><span><b></b><b></b><b></b></span><i>${icon('check')} Paid</i></div>
      </div>
      <div class="hero-seal">${icon('check')}</div>
    </div>
  </section>`;

function tableRow(invoice, index) {
  const status = invoiceStatus(invoice);
  return '<tr><td><button class="invoice-name" data-action="open" data-id="' + esc(invoice.id) + '">' +
    '<span class="row-icon tone-' + (index % 4) + '">' + icon('file-text') + '</span><span><strong>' + esc(invoice.title || 'Invoice #' + invoice.id) +
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
    const canCreate = state.mode === 'demo' || Boolean(state.account && state.contract);
    const message = state.loading ? 'Loading invoices from Aevum…' : !collection.length && !canCreate ?
      'Connect your wallet to see invoices you issued.' : 'No invoices match this view.';
    return '<div class="empty">' + icon(state.loading ? 'loader-circle' : 'inbox') + '<p>' + message + '</p></div>';
  }
  return '<table><thead><tr><th scope="col">Invoice</th><th scope="col">Amount</th><th scope="col">Status</th>' +
    '<th scope="col" class="row-date">Due date (UTC)</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>' +
    '<tbody>' + filtered.map(tableRow).join('') + '</tbody></table>';
}

export function workspace(state, collection) {
  return header(state) + '<main class="workspace" id="main">' + hero() +
    '<section class="invoices" aria-labelledby="invoice-title"><div class="section-head"><div><h2 id="invoice-title">Invoices</h2>' +
    '<p>' + (state.mode === 'demo' ? 'Sample workspace. Try the full flow without a wallet.' : 'Invoices issued by your connected Aevum wallet.') + '</p></div>' +
    '<button class="button secondary sample-button" data-action="' + (state.mode === 'demo' ? 'sample' : 'refresh') + '">' +
    icon(state.mode === 'demo' ? 'play' : 'layout-grid') + '<span>' + (state.mode === 'demo' ? 'Try sample checkout' : 'Refresh invoices') + '</span></button></div>' +
    '<div class="table-frame"><div class="table-controls"><div class="filters" aria-label="Filter invoices">' +
    tabs.map(([value, label]) => '<button data-action="filter" data-filter="' + value + '" aria-pressed="' + (state.filter === value) + '">' + label + '</button>').join('') +
    '</div><label class="search">' + icon('search') + '<span class="sr-only">Search invoices</span><input type="search" id="invoice-search" placeholder="Find an invoice" value="' + esc(state.query) + '"></label></div>' +
    '<div id="invoice-table">' + invoiceTable(collection, state) + '</div>' +
    (state.mode === 'live' && state.count > 10 ? '<div class="pagination">' +
      button('Previous', 'previous', { disabled: state.offset === 0 }) + '<span>' + (state.offset + 1) + '–' + Math.min(state.offset + 10, state.count) + ' of ' + state.count + '</span>' +
      button('Next', 'next', { disabled: state.offset + 10 >= state.count }) + '</div>' : '') +
    '</div></section></main>' + footer();
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
  return header(state) + `<main class="workspace setup-page">
    <div class="setup-intro"><div class="eyebrow">WORKSPACE SETTINGS</div><h1>Setup &amp; help</h1></div>
    <div class="settings-grid">
      <section class="setting"><div class="setting-icon">${icon('layers')}</div><h2>Choose a workspace</h2>
        <p>Try sample invoices in demo mode or create on-chain invoices on Aevum Testnet.</p>
        <div class="mode-options">
          ${button('Demo mode', 'demo-mode', { symbol: 'play', className: state.mode === 'demo' ? 'primary' : 'secondary' })}
          ${button('Aevum Testnet', 'live-mode', { symbol: 'globe', className: state.mode === 'live' ? 'primary' : 'secondary' })}
        </div>
      </section>
      <section class="setting"><div class="setting-icon">${icon('wallet')}</div><h2>Wallet and test tokens</h2>
        <p>tQDAY covers testnet gas and tUSD8 is the currency used for invoice payments.</p>
        <div class="mode-options">${button(state.account ? 'Wallet connected' : 'Connect wallet', 'connect', { symbol: 'wallet' })} ${external('QDay faucet', FAUCET)}</div>
      </section>
      <section class="setting wide"><div class="setting-icon">${icon('shield-check')}</div><h2>Folio contract</h2>
        <p>${state.contract ? 'This workspace uses the contract below. Each new client link keeps its original contract address.' : 'Deploy a Folio contract with a testnet wallet or connect an existing Folio deployment.'}</p>
        ${state.contract ? '<p class="contract-code">' + external(esc(state.contract), addressURL(state.contract)) + '</p>' : ''}
        <form id="contract-form" class="contract-form"><label class="sr-only" for="contract-input">Folio contract address</label>
          <input id="contract-input" name="contract" placeholder="Enter a Folio contract address" spellcheck="false" autocomplete="off" required maxlength="42">
          ${button('Use contract', '', { type: 'submit', disabled: state.busy })}
          ${button('Deploy contract', 'deploy', { symbol: 'plus', disabled: state.busy })}
        </form>
        <div class="progress-inline" aria-live="polite">${progress(state)}</div>
      </section>
    </div>
  </main>` + footer();
}

export function createDialog(state) {
  return `<dialog class="composer" aria-labelledby="create-title">
    <div class="composer-top"><div class="setting-icon">${icon('file-text')}</div><button class="icon-button close" data-action="close" aria-label="Close" ${state.busy ? 'disabled' : ''}>${icon('x')}</button></div>
    <div class="dialog-title"><h2 id="create-title">New invoice</h2><p>${state.mode === 'demo' ? 'Create a practice invoice and preview its client link.' : 'Publish an invoice to Aevum and share its payment link.'}</p></div>
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
    <div class="dialog-title"><h2 id="ready-title">Invoice ready.</h2><p>Share this link so your client can review the invoice and pay.</p></div>
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

export function checkout(state, invoice, link) {
  const status = invoice ? invoiceStatus(invoice) : '';
  const paid = status === 'paid';
  const live = state.mode === 'live';
  const cancellable = live && state.account && invoice?.issuer.toLowerCase() === state.account.toLowerCase() && invoice.state === 'open';
  const verified = live && invoice?.memoVerified;
  const paymentAction = live ? (state.account ? 'Pay ' + price(invoice?.amount) + ' tUSD8' : 'Connect wallet to pay') : 'Simulate payment';
  const receiptTitle = paid ? 'Payment receipt' : 'Payment request';
  const amountLabel = paid ? 'AMOUNT PAID' : 'AMOUNT DUE';

  return header(state, true) + '<main class="checkout-shell"><button class="back-button" data-action="home">' + icon('arrow-left') + ' Invoices</button>' +
    (!invoice ? '<section class="checkout-card">' + (state.loading ?
      '<div class="empty">' + icon('loader-circle') + '<p>Checking invoice on Aevum…</p></div>' :
      '<h1>Invoice unavailable</h1>' + progress(state) + button('Try again', 'reload-checkout')) + '</section>' :
      `<section class="checkout-card">
      <div class="checkout-top"><div class="setting-icon ${paid ? 'success' : ''}">${icon(paid ? 'check' : 'receipt')}</div>${badge(status)}</div>
      <div class="checkout-title"><span class="eyebrow">${receiptTitle.toUpperCase()} / #${esc(invoice.id)}</span>
        <h1>${esc(invoice.title || 'Invoice #' + invoice.id)}</h1>
        <p>${invoice.merchant ? 'From ' + esc(invoice.merchant) : 'From ' + esc(shortAddress(invoice.issuer))}${verified ? ' <span class="verified-name" title="Invoice details match the on-chain hash">' + icon('shield-check') + '</span>' : ''}</p></div>
      <div class="checkout-amount"><span>${amountLabel}</span><div>${price(invoice.amount)} <small>tUSD8</small></div></div>
      <dl class="checkout-details">
        <div><dt>${paid ? 'Paid on' : 'Due date (UTC)'}</dt><dd>${dateText(paid ? invoice.paidAt : invoice.dueAt)}</dd></div>
        <div><dt>Recipient</dt><dd>${live ? external(esc(shortAddress(invoice.issuer)), addressURL(invoice.issuer)) : esc(shortAddress(invoice.issuer))}</dd></div>
        ${paid && live ? '<div><dt>Payer</dt><dd>' + external(esc(shortAddress(invoice.payer)), addressURL(invoice.payer)) + '</dd></div>' : ''}
        <div><dt>Network</dt><dd>${live ? 'QDay Aevum Testnet' : 'Demo preview'}</dd></div>
      </dl>
      ${live && !verified ? '<div class="checkout-note warning">' + icon('triangle-alert') + ' The link has no matching invoice description. Verify the recipient and amount.</div>' : ''}
      ${status === 'open' ? '<div class="checkout-note">' + icon(live ? 'shield-check' : 'play') +
        (live ? 'Only test tokens are used. Check the recipient before confirming.' : 'This practice payment stays in this browser.') + '</div>' : ''}
      ${paid && !live ? '<div class="checkout-note">' + icon('check') + ' Practice payment complete. This receipt is a demo.</div>' : ''}
      ${progress(state)}
      <div class="checkout-actions">
        ${status === 'open' ? button(paymentAction, 'pay', { symbol: 'wallet', className: 'primary', disabled: state.busy }) : ''}
        ${paid && live && invoice.hash ? external('Verify on Aevum Explorer', txURL(invoice.hash)) : ''}
        ${button(paid ? 'Copy receipt link' : 'Copy invoice link', 'copy-current', { symbol: 'copy', attrs: 'data-url="' + esc(link) + '"' })}
        ${cancellable ? button('Cancel invoice', 'cancel-invoice', { className: 'quiet', disabled: state.busy }) : ''}
      </div>
      ${live && status === 'open' && !window.ethereum && /iphone|android|ipad/i.test(navigator.userAgent) && location.protocol === 'https:' ?
        '<a class="mobile-wallet" href="https://metamask.app.link/dapp/' + esc(location.href.replace(/^https:\/\//, '')) + '">Open in MetaMask</a>' : ''}
      </section>`) + '</main>' + footer();
}
