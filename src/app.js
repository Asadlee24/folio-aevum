import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import { CONTRACT, FEATURED_INVOICE } from './config.js';
import * as chain from './chain.js';
import * as model from './model.js';
import * as ui from './ui.js';

const app = document.querySelector('#app');
const savedContract = model.readLocal('folio.contract', null);
const workspaceContract = chain.addressOK(savedContract) ? savedContract : CONTRACT;
const state = {
  view: 'invoices',
  account: '',
  query: '', filter: 'all', offset: 0, count: 0, live: [],
  loading: false, busy: false, error: '', progress: '', tx: '',
  draft: { merchant: model.readLocal('folio.merchant', ''), title: '', amount: '', due: 7 },
  dialog: '', ready: null, current: null, featured: null,
};
let routeVersion = 0;
let listVersion = 0;
let toastTimer;
let receiptTimer;
let issuingWallet = null;
let firstHeroRendered = false;

function invoiceLink(invoice) {
  const url = new URL('/', location.origin);
  url.searchParams.set('invoice', invoice.id);
  url.searchParams.set('contract', invoice.contract);
  if (invoice.merchant && invoice.title) url.hash = model.pack([invoice.merchant, invoice.title]);
  return url.href;
}

function metadataValid(value) {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string' &&
    value[0].length > 0 && value[0].length <= 60 && value[1].length > 0 && value[1].length <= 100;
}

function enrich(invoice, memo) {
  if (!metadataValid(memo) || chain.hashMemo(...memo.slice(0, 2)) !== invoice.memoHash) return invoice;
  return { ...invoice, merchant: memo[0], title: memo[1], memoVerified: true };
}

function render() {
  const previousDialog = app.querySelector('dialog')?.getAttribute('aria-labelledby');
  const focusedAction = app.contains(document.activeElement) ? document.activeElement.closest?.('[data-action]') : null;
  const previousAction = focusedAction ? {
    action: focusedAction.dataset.action,
    filter: focusedAction.dataset.filter,
    id: focusedAction.dataset.id,
  } : null;
  const dialog = state.dialog === 'new' ? ui.createDialog(state) :
    state.dialog === 'ready' ? ui.readyDialog(state.ready, invoiceLink(state.ready)) : '';
  app.innerHTML = (state.view === 'checkout' ? ui.checkout(state, state.current, state.current ? invoiceLink(state.current) : location.href) :
    state.view === 'settings' ? ui.settings(state) : ui.workspace(state, state.live)) + dialog;
  // Play the optional document reveal once, not on each wallet/list render.
  const heroVisual = app.querySelector('.hero-visual');
  if (heroVisual && !firstHeroRendered) {
    heroVisual.classList.add('hero-first-entry');
    firstHeroRendered = true;
  }

  const element = app.querySelector('dialog');
  if (element) {
    element.classList.toggle('entering', previousDialog !== element.getAttribute('aria-labelledby'));
    element.showModal();
    element.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!state.busy) closeDialog();
    });
  } else if (!previousDialog && previousAction) {
    // Full re-renders must not strand keyboard focus on a detached control.
    const next = [...app.querySelectorAll('[data-action]')].find((control) =>
      control.dataset.action === previousAction.action &&
      control.dataset.filter === previousAction.filter &&
      control.dataset.id === previousAction.id);
    if (next && !next.disabled) next.focus({ preventScroll: true });
  }
}

function notice(text) {
  const box = document.querySelector('#toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4000);
}

function clearMessage() {
  state.error = state.progress = state.tx = '';
}

function notifyProgress(text, hash = '') {
  state.progress = text;
  state.tx = hash;
  if (state.view === 'checkout') render();
  else {
    const target = document.querySelector('.progress-inline');
    if (target) target.innerHTML = ui.progress(state);
  }
}

function friendly(error) {
  if (error.code === 4001 || error.code === 'ACTION_REJECTED') return 'Wallet request cancelled.';
  const message = error.reason || error.shortMessage || error.message || 'Something went wrong. Please try again.';
  if (/insufficient funds/i.test(message)) return 'Your wallet needs testnet tQDAY for gas. Open the QDay faucet and try again.';
  if (/network|fetch|timeout|missing response/i.test(message) && message.length > 100) return 'Could not reach Aevum Testnet. Please try again.';
  return message.length > 210 ? message.slice(0, 207) + '…' : message;
}

async function run(operation) {
  if (state.busy) return;
  clearMessage();
  state.busy = true;
  render();
  try {
    await operation();
    clearMessage();
  } catch (error) {
    state.error = friendly(error);
    state.tx = error.hash || state.tx;
    state.progress = '';
  } finally {
    state.busy = false;
    render();
    if (state.error && state.view === 'invoices' && !state.dialog) notice(state.error);
  }
}

function closeDialog() {
  state.dialog = '';
  clearMessage();
  render();
  app.querySelector('[data-action="new"]')?.focus();
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    notice('Link copied');
  } catch {
    const field = app.querySelector('#share-url');
    if (field) { field.focus(); field.select(); }
    notice('Clipboard unavailable. Copy the link manually.');
  }
}

function settings() {
  state.view = 'settings';
  state.dialog = '';
  clearMessage();
  render();
  window.scrollTo(0, 0);
  app.querySelector('.setup-intro h1').focus({ preventScroll: true });
}

async function loadList() {
  const version = ++listVersion;
  if (!state.account || state.view !== 'invoices') return;
  state.loading = true;
  render();
  try {
    const { invoices, count } = await chain.listInvoices(workspaceContract, state.account, state.offset);
    if (version !== listVersion) return;
    state.live = invoices.map((invoice) => enrich(invoice, model.getMemo(invoice)));
    state.count = count;
  } catch (error) {
    if (version !== listVersion) return;
    notice(friendly(error));
  } finally {
    if (version === listVersion && state.view === 'invoices') {
      state.loading = false;
      render();
    }
  }
}

async function restoreWallet() {
  if (!window.ethereum) return;
  try {
    issuingWallet = await chain.wallet({ request: false });
    state.account = issuingWallet.address;
    if (state.view === 'invoices') await loadList();
    else render();
  } catch { /* Show the disconnected state until a wallet is requested. */ }
}

function loadHash(invoice, version) {
  if (invoice.state !== 'paid' || !invoice.contract) return;
  chain.receiptHash(invoice).then((hash) => {
    if (hash && version === routeVersion && state.current?.id === invoice.id) {
      state.current = { ...state.current, hash };
      render();
    }
  }).catch(() => {});
}

async function loadFeatured(version) {
  try {
    const { contract, id, merchant, title } = FEATURED_INVOICE;
    const item = enrich(await chain.getInvoice(contract, id), [merchant, title]);
    if (version !== routeVersion) return;
    state.featured = { ...item, state: model.invoiceStatus(item), url: invoiceLink(item) };
    const featured = app.querySelector('#featured-invoice');
    if (featured && !featured.contains(document.activeElement)) {
      featured.innerHTML = ui.featuredInvoice(state.featured);
    }
  } catch { /* The workspace remains usable when Aevum is temporarily unavailable. */ }
}

async function loadRoute() {
  const version = ++routeVersion;
  ++listVersion;
  const params = new URL(location.href).searchParams;
  const liveId = params.get('invoice');
  const contract = params.get('contract');
  state.dialog = '';
  state.ready = null;
  state.current = null;
  state.loading = false;
  clearMessage();
  clearInterval(receiptTimer);
  if (!liveId) {
    state.view = 'invoices';
    if (params.get('new') === '1') {
      state.dialog = 'new';
      params.delete('new');
      const url = new URL(location.href);
      url.search = params.toString();
      history.replaceState(history.state, '', url.href);
    }
    void loadFeatured(version);
    render();
    await loadList();
    return;
  }
  state.view = 'checkout';
  state.loading = true;
  render();
  const memo = model.unpack(location.hash.slice(1));
  try {
    if (!/^[1-9]\d{0,77}$/.test(liveId) || !chain.addressOK(contract)) throw new Error('This invoice link is incomplete.');
    const item = await chain.getInvoice(contract, liveId);
    if (version !== routeVersion) return;
    state.current = enrich(item, memo ?? model.getMemo(item));
    loadHash(item, version);
    if (item.state === 'open') {
      receiptTimer = setInterval(async () => {
        if (state.busy || version !== routeVersion) return;
        try {
          const fresh = await chain.getInvoice(contract, liveId);
          if (version !== routeVersion || state.busy) return;
          if (state.current?.state !== fresh.state || fresh.dueAt <= model.now()) {
            state.current = enrich(fresh, memo ?? model.getMemo(fresh));
            if (fresh.state !== 'open' || fresh.dueAt <= model.now()) clearInterval(receiptTimer);
            loadHash(fresh, version);
            render();
          }
        } catch { /* Retry when the RPC recovers. */ }
      }, 12000);
    }
  } catch (error) {
    if (version === routeVersion) state.error = friendly(error);
  } finally {
    if (version === routeVersion) {
      state.loading = false;
      render();
    }
  }
}

function go(url) {
  if (url !== location.href) history.pushState({}, '', url);
  window.scrollTo(0, 0);
  void loadRoute();
}

function openInvoice(invoice) {
  if (invoice) go(invoiceLink(invoice));
}

async function connect() {
  issuingWallet = await chain.wallet();
  state.account = issuingWallet.address;
  if (state.view === 'invoices') await loadList();
}

function amountValid(value) {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value) && Number(value) > 0;
}

async function createInvoice(form) {
  const values = Object.fromEntries(new FormData(form));
  state.draft = {
    merchant: String(values.merchant).trim(), title: String(values.title).trim(),
    amount: String(values.amount).trim(), due: Number(values.due),
  };
  await run(async () => {
    if (!metadataValid([state.draft.merchant, state.draft.title])) throw new Error('Enter your business name and an invoice description.');
    if (!amountValid(state.draft.amount)) throw new Error('Enter a positive amount with up to six decimal places, for example 10.00.');
    if (![1, 7, 14, 30].includes(state.draft.due)) throw new Error('Select a payment window.');
    const details = { ...state.draft, dueAt: model.now() + state.draft.due * model.DAY };
    try { issuingWallet = await chain.wallet({ request: false }); }
    catch { issuingWallet = await chain.wallet(); }
    state.account = issuingWallet.address;
    const invoice = await chain.issueInvoice(workspaceContract, issuingWallet.signer, details, notifyProgress);
    model.saveMemo(invoice, details.merchant, details.title);
    state.ready = enrich(invoice, [details.merchant, details.title]);
    state.live = [state.ready, ...state.live.filter((item) => item.id !== state.ready.id)].slice(0, 10);
    state.count++;
    model.writeLocal('folio.merchant', details.merchant);
    state.draft = { merchant: details.merchant, title: '', amount: '', due: 7 };
    state.filter = 'all';
    state.query = '';
    state.dialog = 'ready';
  });
}

async function pay() {
  const invoice = state.current;
  if (!invoice || model.invoiceStatus(invoice) !== 'open') return;
  await run(async () => {
    if (!state.account) { await connect(); return; }
    const payer = await chain.wallet();
    state.account = payer.address;
    const settled = await chain.payInvoice(invoice, payer.signer, notifyProgress);
    state.current = enrich(settled, [invoice.merchant, invoice.title]);
  });
}

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'invoice-search') {
    state.query = target.value;
    ui.refreshTable(state, state.live);
  }
  if (target.form?.id === 'invoice-form') state.draft[target.name] = target.name === 'due' ? Number(target.value) : target.value;
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'invoice-form') void createInvoice(form);
});

app.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, id, filter, url } = control.dataset;
  event.preventDefault();
  if (state.busy) return;

  switch (action) {
    case 'home':
      if (state.view === 'checkout') go(new URL('/', location.origin).href);
      else { state.view = 'invoices'; clearMessage(); render(); void loadList(); }
      break;
    case 'new': state.dialog = 'new'; clearMessage(); render(); break;
    case 'close': closeDialog(); break;
    case 'settings': settings(); break;
    case 'connect': void run(connect); break;
    case 'filter': state.filter = filter; render(); break;
    case 'refresh': void loadList(); break;
    case 'previous':
    case 'next':
      state.offset = Math.max(0, state.offset + (action === 'next' ? 10 : -10));
      void loadList();
      break;
    case 'open': openInvoice(state.live.find((invoice) => invoice.id === id)); break;
    case 'copy-ready': void copy(invoiceLink(state.ready)); break;
    case 'open-ready': openInvoice(state.ready); break;
    case 'copy-current': void copy(url); break;
    case 'reload-checkout': void loadRoute(); break;
    case 'pay': void pay(); break;
    case 'cancel-invoice':
      if (!window.confirm('Cancel this invoice? Your client will no longer be able to pay it.')) break;
      void run(async () => {
        const previous = state.current;
        const user = await chain.wallet();
        state.current = enrich(await chain.cancelInvoice(previous, user.signer, notifyProgress), [previous.merchant, previous.title]);
        notice('Invoice cancelled');
      });
      break;
  }
});

window.addEventListener('popstate', () => { void loadRoute(); });
window.ethereum?.on?.('accountsChanged', () => {
  issuingWallet = null;
  state.account = '';
  state.live = [];
  state.count = 0;
  state.offset = 0;
  if (!state.busy) { render(); void restoreWallet(); }
});
window.ethereum?.on?.('chainChanged', () => {
  issuingWallet = null;
  if (!state.busy) {
    state.account = '';
    state.live = [];
    state.count = 0;
    state.offset = 0;
    render();
    void restoreWallet();
  }
});

await loadRoute();
await restoreWallet();
