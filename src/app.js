import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import { CHAIN_ID, CONTRACT, FEATURED_INVOICE } from './config.js';
import * as chain from './chain.js';
import * as model from './model.js';
import * as ui from './ui.js';
import { mountWallet, showWalletModal, wallet } from './wallet.jsx';

const app = document.querySelector('#app');
const savedContract = model.readLocal('folio.contract', null);
const workspaceContract = chain.addressOK(savedContract) ? savedContract : CONTRACT;
const recordingKey = 'folio.recordingInvoices:' + workspaceContract.toLowerCase();
let recordedIds = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(recordingKey));
  if (Array.isArray(saved)) recordedIds = saved.filter((id) => typeof id === 'string' && /^[1-9]\d{0,77}$/.test(id));
} catch { /* Keep the current recording in memory if session storage is unavailable. */ }

const state = {
  view: 'invoices',
  recording: false,
  preview: 'invoice',
  account: '',
  walletChain: undefined,
  query: '', filter: 'all', offset: 0, count: 0, live: [],
  summary: null, summaryFailed: false,
  loading: false, busy: false, error: '', progress: '', tx: '', paymentStep: '',
  draft: { merchant: model.readLocal('folio.merchant', ''), title: '', amount: '', due: 7, items: [] },
  dialog: '', ready: null, current: null, featured: null,
};
let routeVersion = 0;
let listVersion = 0;
let toastTimer;
let receiptTimer;
let confirmationStarted;
const confirmationMotionMs = 1000;
const paymentStatus = document.querySelector('#payment-status');
let latestWallet;
let walletModalVisible = false;
let heroStarted;
let downloadingReceipt = false;

function saveRecordedIds(ids) {
  recordedIds = ids;
  try { sessionStorage.setItem(recordingKey, JSON.stringify(ids)); }
  catch { /* The current recording still works in memory. */ }
}

function invoiceLink(invoice) {
  const url = new URL('/', location.origin);
  url.searchParams.set('invoice', invoice.id);
  url.searchParams.set('contract', invoice.contract);
  if (invoice.memo) url.hash = model.pack(invoice.memo);
  return url.href;
}

function metadataValid(value) {
  if (!Array.isArray(value) || ![2, 3].includes(value.length)) return false;
  const [merchant, title, items] = value;
  if (typeof merchant !== 'string' || !merchant.trim() || merchant.length > 60 ||
      typeof title !== 'string' || !title.trim() || title.length > 100) return false;
  return value.length === 2 || Array.isArray(items) && items.length > 0 && items.length <= model.MAX_LINE_ITEMS &&
    items.every((item) => Array.isArray(item) && item.length === 2 &&
      typeof item[0] === 'string' && item[0].trim() && item[0].length <= model.ITEM_LABEL_LIMIT && model.amountValid(item[1]));
}

function enrich(invoice, memo) {
  if (!metadataValid(memo) || chain.hashMemo(memo) !== invoice.memoHash) return invoice;
  const [merchant, title, items] = memo;
  if (items && model.sumItems(items) !== invoice.amount) return invoice;
  return { ...invoice, merchant, title, items, memo, memoVerified: true };
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
  const scene = app.querySelector('.preview-scene');
  if (scene) {
    heroStarted ??= performance.now();
    const elapsed = performance.now() - heroStarted;
    if (elapsed < 750) {
      const hero = scene.closest('.folio-hero');
      hero.style.setProperty('--hero-offset', `-${elapsed}ms`);
      hero.classList.add('hero-first-entry');
    }
  }
  enablePreviewTilt(scene);

  if (confirmationStarted !== undefined) {
    const elapsed = performance.now() - confirmationStarted;
    const confirmation = app.querySelector('.payment-confirmation');
    // Continue the same animation if wallet or transaction details cause a render.
    if (confirmation && elapsed < confirmationMotionMs) {
      confirmation.style.setProperty('--confirmation-offset', `-${elapsed}ms`);
      confirmation.classList.add('is-animating');
    }
  }

  const element = app.querySelector('dialog');
  if (element && !walletModalVisible) {
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

function enablePreviewTilt(scene) {
  if (!scene || !matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;

  let pointer;
  let frame = 0;
  scene.addEventListener('pointermove', (event) => {
    pointer = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!scene.isConnected) return;
      const rect = scene.getBoundingClientRect();
      const x = (pointer.clientX - rect.left) / rect.width - .5;
      const y = (pointer.clientY - rect.top) / rect.height - .5;
      scene.style.setProperty('--tilt-x', `${-y * 11}deg`);
      scene.style.setProperty('--tilt-y', `${x * 15}deg`);
    });
  });
  scene.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    scene.style.removeProperty('--tilt-x');
    scene.style.removeProperty('--tilt-y');
  });
}

function selectPreview(control) {
  state.preview = control.dataset.id;
  const stage = control.closest('.glass-stage');
  stage.querySelector('.preview-scene').dataset.preview = state.preview;
  for (const button of stage.querySelectorAll('[data-action="preview"]')) {
    button.setAttribute('aria-pressed', String(button === control));
  }
  for (const face of stage.querySelectorAll('.document-face')) {
    const hidden = !face.classList.contains(`document-${state.preview}`);
    face.inert = hidden;
    face.setAttribute('aria-hidden', String(hidden));
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
  state.error = state.progress = state.tx = state.paymentStep = '';
}

function notifyProgress(text, hash = '', step = '') {
  state.progress = text;
  state.tx = hash;
  if (step) {
    state.paymentStep = step;
    paymentStatus.textContent = text;
  }
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
    state.paymentStep = '';
  } finally {
    state.busy = false;
    render();
    syncWallet();
    if (state.error && state.view === 'invoices' && !state.dialog) notice(state.error);
  }
}

function closeDialog() {
  state.dialog = '';
  clearMessage();
  render();
  app.querySelector('[data-action="new"]')?.focus();
}

async function copyLink(control) {
  const share = control.closest('[data-link-share]');
  const field = share.querySelector('[data-share-url]');
  const status = share.querySelector('[data-copy-status]');
  status.textContent = '';

  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = 'Link copied.';
    return;
  } catch { /* Try copying the selected link in browsers that block the Clipboard API. */ }

  if (!field.isConnected) return;
  const wasHidden = field.hidden;
  field.hidden = false;
  field.focus({ preventScroll: !wasHidden });
  field.select();
  field.setSelectionRange(0, field.value.length);
  try {
    if (document.execCommand('copy')) {
      field.hidden = wasHidden;
      control.focus({ preventScroll: true });
      status.textContent = 'Link copied.';
      return;
    }
  } catch { /* Keep the link selected for manual copying. */ }
  status.textContent = 'Automatic copy is unavailable. Press and hold the link or use your keyboard to copy it.';
}

async function downloadReceipt(control) {
  const invoice = state.current;
  if (invoice?.state !== 'paid' || downloadingReceipt) return;
  downloadingReceipt = true;
  control.setAttribute('aria-busy', 'true');
  try {
    const { saveReceipt } = await import('./receipt.js');
    await saveReceipt(invoice, invoiceLink(invoice));
  } catch {
    notice('Could not download the receipt. Please try again.');
  } finally {
    downloadingReceipt = false;
    control.removeAttribute('aria-busy');
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

async function invoicePage(offset) {
  if (!state.recording) return chain.listInvoices(workspaceContract, state.account, offset);
  return {
    invoices: await Promise.all(recordedIds.slice(offset, offset + 10).map((id) => chain.getInvoice(workspaceContract, id))),
    count: recordedIds.length,
  };
}

async function loadList(refreshSummary = true) {
  const version = ++listVersion;
  if (state.view !== 'invoices' || (state.recording ? !recordedIds.length : !state.account)) return;
  refreshSummary ||= !state.summary && !state.summaryFailed;
  if (refreshSummary) state.summaryFailed = false;
  state.loading = true;
  render();
  const offset = state.offset;
  let page;
  try {
    page = await invoicePage(offset);
    if (version !== listVersion) return;
    state.live = page.invoices.map((invoice) => enrich(invoice, model.getMemo(invoice)));
    state.count = page.count;
  } catch (error) {
    if (version !== listVersion) return;
    if (refreshSummary) state.summaryFailed = true;
    notice(friendly(error));
  } finally {
    if (version === listVersion && state.view === 'invoices') {
      state.loading = false;
      render();
    }
  }
  if (!page || !refreshSummary) return;

  try {
    const invoices = new Map(page.invoices.map((invoice) => [invoice.id, invoice]));
    for (let start = 0; start < page.count; start += 10) {
      if (version !== listVersion || state.view !== 'invoices') return;
      if (start === offset) continue;
      const next = await invoicePage(start);
      if (next.count !== page.count) throw new Error('Invoice count changed during refresh.');
      for (const invoice of next.invoices) invoices.set(invoice.id, invoice);
    }
    if (version !== listVersion || state.view !== 'invoices') return;
    if (invoices.size !== page.count) throw new Error('Some invoices changed during refresh.');
    state.summary = [...invoices.values()];
  } catch {
    if (version !== listVersion || state.view !== 'invoices') return;
    state.summaryFailed = true;
  }
  ui.refreshTotals(state);
}

function syncWallet() {
  if (state.busy || !latestWallet || ['connecting', 'reconnecting'].includes(latestWallet.status)) return;
  const { address = '', chainId } = latestWallet;
  const changedAccount = state.account.toLowerCase() !== address.toLowerCase();
  if (!changedAccount && state.walletChain === chainId) return;
  state.account = address;
  state.walletChain = chainId;
  if (changedAccount && !state.recording) {
    ++listVersion;
    state.live = [];
    state.count = 0;
    state.offset = 0;
    state.summary = null;
    state.summaryFailed = false;
    if (state.view === 'invoices') state.loading = false;
  }
  render();
  if (changedAccount && state.view === 'invoices') void loadList();
}

function loadHash(invoice, version) {
  if (invoice.state !== 'paid' || !invoice.contract) return;
  chain.receiptHash(invoice).then((hash) => {
    if (hash && version === routeVersion && state.current?.id === invoice.id && !state.current.hash) {
      state.current = { ...state.current, hash };
      render();
    }
  }).catch(() => {});
}

function updateCheckout(invoice) {
  if (invoice.state === 'paid' && state.current?.state === 'open') {
    confirmationStarted = performance.now();
    paymentStatus.textContent = 'Payment confirmed. Your receipt is ready.';
  }
  state.current = invoice;
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
  const recording = params.get('record') === '1';
  const freshRecording = recording && !liveId && params.get('fresh') === '1';
  if (freshRecording) saveRecordedIds([]);
  if (state.recording !== recording || freshRecording) {
    state.live = [];
    state.count = 0;
    state.offset = 0;
    state.summary = null;
    state.summaryFailed = false;
    state.query = '';
    state.filter = 'all';
    state.featured = null;
  }
  state.recording = recording;
  state.dialog = '';
  state.ready = null;
  state.current = null;
  confirmationStarted = undefined;
  paymentStatus.textContent = '';
  state.loading = false;
  clearMessage();
  clearInterval(receiptTimer);
  if (!liveId) {
    state.view = 'invoices';
    const openComposer = params.get('new') === '1';
    if (openComposer) state.dialog = 'new';
    if (openComposer || freshRecording) {
      params.delete('new');
      if (freshRecording) params.delete('fresh');
      const url = new URL(location.href);
      url.search = params.toString();
      history.replaceState(history.state, '', url.href);
    }
    if (!state.recording) void loadFeatured(version);
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
            updateCheckout(enrich(fresh, memo ?? model.getMemo(fresh)));
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
  const destination = new URL(url);
  if (state.recording) destination.searchParams.set('record', '1');
  if (destination.href !== location.href) history.pushState({}, '', destination.href);
  window.scrollTo(0, 0);
  void loadRoute();
}

function openInvoice(invoice) {
  if (invoice) go(invoiceLink(invoice));
}

function connect() {
  if (!showWalletModal()) {
    notice('Wallet is still loading. Try again in a moment.');
    return;
  }
  walletModalVisible = true;
  app.querySelector('dialog[open]')?.close();
}

async function createInvoice(form) {
  const values = new FormData(form);
  const itemAmounts = values.getAll('item-amount');
  const items = values.getAll('item-label').map((label, index) => [label.trim(), itemAmounts[index].trim()]);
  state.draft = {
    merchant: String(values.get('merchant')).trim(), title: String(values.get('title')).trim(),
    amount: items.length ? state.draft.amount : String(values.get('amount')).trim(),
    due: Number(values.get('due')), items,
  };
  if (!state.account || state.walletChain !== CHAIN_ID) { connect(); return; }
  await run(async () => {
    const memo = [state.draft.merchant, state.draft.title];
    if (!metadataValid(memo)) throw new Error('Enter your business name and an invoice description.');
    if (items.length) memo.push(items);
    const amount = items.length ? model.sumItems(items) : state.draft.amount;
    if (!metadataValid(memo) || (!items.length && !model.amountValid(amount))) {
      throw new Error(items.length ? 'Give each item a description and a positive amount with up to six decimal places.' :
        'Enter a positive amount with up to six decimal places, for example 10.00.');
    }
    if (![1, 7, 14, 30].includes(state.draft.due)) throw new Error('Select a payment window.');
    const details = { memo, amount, dueAt: model.now() + state.draft.due * model.DAY };
    const { signer } = await wallet();
    const invoice = await chain.issueInvoice(workspaceContract, signer, details, notifyProgress);
    model.saveMemo(invoice, memo);
    state.ready = enrich(invoice, memo);
    if (state.recording) saveRecordedIds([invoice.id, ...recordedIds.filter((id) => id !== invoice.id)]);
    ++listVersion;
    state.loading = false;
    state.live = state.offset === 0 ? [state.ready, ...state.live.filter((item) => item.id !== state.ready.id)].slice(0, 10) : [state.ready];
    state.offset = 0;
    state.count = state.recording ? recordedIds.length : state.count + 1;
    if (state.summary) state.summary = [state.ready, ...state.summary.filter((item) => item.id !== state.ready.id)];
    model.writeLocal('folio.merchant', memo[0]);
    state.draft = { merchant: memo[0], title: '', amount: '', due: 7, items: [] };
    state.filter = 'all';
    state.query = '';
    state.dialog = 'ready';
  });
  if (state.dialog === 'ready' && state.view === 'invoices') void loadList();
}

async function pay() {
  const invoice = state.current;
  const version = routeVersion;
  if (!invoice || model.invoiceStatus(invoice) !== 'open') return;
  if (!state.account || state.walletChain !== CHAIN_ID) { connect(); return; }
  await run(async () => {
    notifyProgress('Checking wallet balance and tUSD8 approval…', '', 'checking');
    const payer = await wallet();
    const settled = await chain.payInvoice(invoice, payer.signer, (text, hash, step) => {
      if (version === routeVersion) notifyProgress(text, hash, step);
    });
    if (version !== routeVersion) return;
    clearInterval(receiptTimer);
    updateCheckout(enrich(settled, invoice.memo));
  });
}

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'invoice-search') {
    state.query = target.value;
    ui.refreshTable(state, state.live);
  }
  if (target.form?.id !== 'invoice-form') return;
  const row = target.closest('[data-item-row]');
  if (row) {
    state.draft.items[Number(row.dataset.itemRow)][target.name === 'item-label' ? 0 : 1] = target.value;
    target.form.elements.amount.value = model.sumItems(state.draft.items.map(([label, amount]) => [label, amount.trim()]));
  } else if (['due', 'merchant', 'title', 'amount'].includes(target.name)) {
    state.draft[target.name] = target.name === 'due' ? Number(target.value) : target.value;
  }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'invoice-form') void createInvoice(form);
});

app.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, id, filter } = control.dataset;
  event.preventDefault();
  if (state.busy) return;

  switch (action) {
    case 'home':
      if (state.view === 'checkout') go(new URL('/', location.origin).href);
      else { state.view = 'invoices'; clearMessage(); render(); void loadList(); }
      break;
    case 'preview': selectPreview(control); break;
    case 'new': state.dialog = 'new'; clearMessage(); render(); break;
    case 'add-item':
      if (state.draft.items.length >= model.MAX_LINE_ITEMS) break;
      state.draft.items.push(['', '']);
      render();
      app.querySelector('#item-label-' + (state.draft.items.length - 1))?.focus();
      break;
    case 'remove-item':
      state.draft.items.splice(Number(id), 1);
      render();
      (app.querySelector('#item-label-' + Math.min(Number(id), state.draft.items.length - 1)) ||
        app.querySelector('[data-action="add-item"]'))?.focus();
      break;
    case 'close': closeDialog(); break;
    case 'settings': settings(); break;
    case 'connect': connect(); break;
    case 'filter': state.filter = filter; render(); break;
    case 'refresh': void loadList(); break;
    case 'previous':
    case 'next':
      state.offset = Math.max(0, state.offset + (action === 'next' ? 10 : -10));
      void loadList(false);
      break;
    case 'open': openInvoice(state.live.find((invoice) => invoice.id === id)); break;
    case 'copy-link': void copyLink(control); break;
    case 'download-receipt': void downloadReceipt(control); break;
    case 'open-ready': openInvoice(state.ready); break;
    case 'reload-checkout': void loadRoute(); break;
    case 'pay': void pay(); break;
    case 'cancel-invoice':
      if (!window.confirm('Cancel this invoice? Your client will no longer be able to pay it.')) break;
      void run(async () => {
        const previous = state.current;
        const user = await wallet();
        state.current = enrich(await chain.cancelInvoice(previous, user.signer, notifyProgress), previous.memo);
        notice('Invoice cancelled');
      });
      break;
  }
});

window.addEventListener('popstate', () => { void loadRoute(); });
void loadRoute();
mountWallet((account) => {
  latestWallet = account;
  syncWallet();
}, (visible) => {
  if (walletModalVisible && !visible) {
    walletModalVisible = false;
    if (state.dialog) render();
  }
});
