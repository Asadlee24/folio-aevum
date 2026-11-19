import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import { CONTRACT } from './config.js';
import * as chain from './chain.js';
import * as model from './model.js';
import * as ui from './ui.js';

const app = document.querySelector('#app');
const state = {
  mode: model.readLocal('folio.mode', 'demo'), view: 'invoices',
  contract: model.readLocal('folio.contract', CONTRACT), account: '',
  query: '', filter: 'all', offset: 0, count: 0, live: [],
  loading: false, busy: false, error: '', progress: '', tx: '',
  draft: { merchant: model.readLocal('folio.merchant', ''), title: '', amount: '', due: 7 },
  dialog: '', ready: null, current: null,
};
let routeVersion = 0;
let listVersion = 0;
let toastTimer;
let receiptTimer;
let issuingWallet = null;

function invoiceLink(invoice) {
  const url = new URL('/', location.origin);
  if (invoice.contract) {
    url.searchParams.set('invoice', invoice.id);
    url.searchParams.set('contract', invoice.contract);
    if (invoice.merchant && invoice.title) url.hash = model.pack([invoice.merchant, invoice.title]);
  } else {
    url.searchParams.set('demo', invoice.id);
    url.hash = model.pack([invoice.merchant, invoice.title, invoice.amount, invoice.dueAt, invoice.state, invoice.paidAt ?? 0]);
  }
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

function collection() {
  return state.mode === 'demo' ? model.demoInvoices : state.live;
}

function render() {
  const dialog = state.dialog === 'new' ? ui.createDialog(state) :
    state.dialog === 'ready' ? ui.readyDialog(state.ready, invoiceLink(state.ready)) : '';
  app.innerHTML = (state.view === 'checkout' ? ui.checkout(state, state.current, state.current ? invoiceLink(state.current) : location.href) :
    state.view === 'settings' ? ui.settings(state) : ui.workspace(state, collection())) + dialog;

  const element = app.querySelector('dialog');
  if (element) {
    element.showModal();
    element.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!state.busy) closeDialog();
    });
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

function changeMode(mode) {
  state.mode = mode;
  model.writeLocal('folio.mode', mode);
  state.filter = 'all';
  state.query = '';
  state.offset = 0;
}

function settings(mode) {
  if (mode) changeMode(mode);
  state.view = 'settings';
  state.dialog = '';
  clearMessage();
  render();
}

async function loadList() {
  const version = ++listVersion;
  if (state.mode !== 'live' || !state.account || !state.contract || state.view !== 'invoices') return;
  state.loading = true;
  render();
  try {
    const { invoices, count } = await chain.listInvoices(state.contract, state.account, state.offset);
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
  if (!window.ethereum || state.mode !== 'live') return;
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

async function loadRoute() {
  const version = ++routeVersion;
  ++listVersion;
  const params = new URL(location.href).searchParams;
  const demoId = params.get('demo');
  const liveId = params.get('invoice');
  const contract = params.get('contract');
  state.dialog = '';
  state.ready = null;
  state.current = null;
  state.loading = false;
  clearMessage();
  clearInterval(receiptTimer);
  if (!demoId && !liveId) {
    state.mode = model.readLocal('folio.mode', 'demo');
    state.view = 'invoices';
    render();
    await loadList();
    return;
  }
  state.view = 'checkout';
  state.mode = demoId ? 'demo' : 'live';
  if (demoId) {
    const details = model.unpack(location.hash.slice(1));
    const existing = model.demoInvoices.find((invoice) => invoice.id === demoId);
    if (/^[1-9]\d{0,12}$/.test(demoId) && metadataValid(details) && amountValid(details[2]) &&
        Number.isSafeInteger(details[3]) && details[3] > 0 && details[3] < 5_000_000_000 &&
        ['open', 'paid'].includes(details[4]) && (details[4] === 'open' || (Number.isSafeInteger(details[5]) && details[5] > 0 && details[5] <= details[3]))) {
      const local = existing && existing.title === details[1] && existing.merchant === details[0] &&
        existing.amount === details[2] && existing.dueAt === details[3];
      state.current = local ? existing : { id: demoId, merchant: details[0], title: details[1], amount: details[2],
        dueAt: details[3], state: details[4], issuer: model.sampleIssuer, paidAt: details[5] };
    } else if (existing && !location.hash) state.current = existing;
    if (!state.current) state.error = 'This demo link is incomplete.';
    render();
    return;
  }

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
  if (state.view === 'invoices') {
    changeMode('live');
    if (state.contract) await loadList();
    else settings();
  }
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
    if (state.mode === 'live') {
      try { issuingWallet = await chain.wallet({ request: false }); }
      catch { issuingWallet = await chain.wallet(); }
      state.account = issuingWallet.address;
      const invoice = await chain.issueInvoice(state.contract, issuingWallet.signer, details, notifyProgress);
      model.saveMemo(invoice, details.merchant, details.title);
      state.ready = enrich(invoice, [details.merchant, details.title]);
      state.live = [state.ready, ...state.live.filter((item) => item.id !== state.ready.id)].slice(0, 10);
      state.count++;
    } else {
      const nextId = Math.max(Date.now(), ...model.demoInvoices.map((item) => Number(item.id) + 1));
      state.ready = model.storeDemo({ ...details, id: String(nextId), state: 'open', issuer: model.sampleIssuer });
    }
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
  if (!invoice.contract) {
    const paid = model.storeDemo({ ...invoice, state: 'paid', paidAt: model.now() });
    const url = invoiceLink(paid);
    history.replaceState({}, '', url);
    state.current = paid;
    render();
    notice('Practice payment complete');
    return;
  }
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
    ui.refreshTable(state, collection());
  }
  if (target.form?.id === 'invoice-form') state.draft[target.name] = target.name === 'due' ? Number(target.value) : target.value;
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'invoice-form') void createInvoice(form);
  else if (form.id === 'contract-form') {
    const input = String(new FormData(form).get('contract')).trim();
    void run(async () => {
      const deployment = await chain.verifyContract(input);
      state.contract = await deployment.getAddress();
      model.writeLocal('folio.contract', state.contract);
      changeMode('live');
      notice('Folio contract verified');
    });
  }
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
    case 'new':
      if (state.mode === 'live' && (!state.account || !state.contract)) {
        settings();
        notice(!state.account ? 'Connect a wallet to create an invoice.' : 'Set up a Folio contract first.');
      } else { state.dialog = 'new'; clearMessage(); render(); }
      break;
    case 'close': closeDialog(); break;
    case 'settings':
    case 'switch-mode': settings(); break;
    case 'demo-mode':
    case 'live-mode':
      changeMode(action === 'live-mode' ? 'live' : 'demo');
      state.view = 'invoices';
      if (state.mode === 'live' && !state.contract) { settings(); break; }
      render();
      void loadList();
      break;
    case 'connect': void run(connect); break;
    case 'deploy':
      void run(async () => {
        const user = await chain.wallet();
        state.account = user.address;
        state.contract = await chain.deployFolio(user.signer, notifyProgress);
        model.writeLocal('folio.contract', state.contract);
        changeMode('live');
        notice('Folio deployed on Aevum');
      });
      break;
    case 'filter': state.filter = filter; render(); break;
    case 'refresh': void loadList(); break;
    case 'previous':
    case 'next':
      state.offset = Math.max(0, state.offset + (action === 'next' ? 10 : -10));
      void loadList();
      break;
    case 'open': openInvoice(collection().find((invoice) => invoice.id === id)); break;
    case 'sample':
      openInvoice(model.demoInvoices.find((invoice) => model.invoiceStatus(invoice) === 'open') ?? model.demoInvoices[0]);
      break;
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
