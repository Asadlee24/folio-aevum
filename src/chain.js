import {
  BrowserProvider, Contract, Interface, JsonRpcProvider, formatUnits,
  getAddress, isAddress, keccak256, parseUnits, toUtf8Bytes,
} from 'ethers';
import artifact from './contract.generated.json';
import { CHAIN_ID, RPC, EXPLORER, TOKEN } from './config.js';

const NETWORK = '0x' + CHAIN_ID.toString(16);
const tokenAbi = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];
const states = ['missing', 'open', 'paid', 'cancelled'];
const rpc = new JsonRpcProvider(RPC, CHAIN_ID, { batchMaxCount: 1 });
const abi = new Interface(artifact.abi);
const checks = new Map();

export const hashMemo = (merchant, title) => keccak256(toUtf8Bytes(JSON.stringify([merchant, title])));
export const addressOK = (value) => typeof value === 'string' && isAddress(value);
export const shortAddress = (value) => value ? value.slice(0, 6) + '…' + value.slice(-4) : '';
export const txURL = (hash) => EXPLORER + '/tx/' + hash;
export const addressURL = (value) => EXPLORER + '/address/' + value;

async function confirmed(hash) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const receipt = await rpc.getTransactionReceipt(hash);
    if (receipt) {
      if (receipt.status !== 1) throw new Error('The transaction reverted. Check the invoice status and try again.');
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  const error = new Error('Confirmation is taking longer than expected. Check the transaction before trying again.');
  error.hash = hash;
  throw error;
}

export async function verifyContract(address) {
  if (!addressOK(address)) throw new Error('Enter a valid Folio contract address.');
  const normalized = getAddress(address);
  if (!checks.has(normalized)) {
    const check = (async () => {
      const contract = new Contract(normalized, artifact.abi, rpc);
      const code = await rpc.getCode(normalized);
      if (code.toLowerCase() !== artifact.runtime.toLowerCase()) throw new Error('This address does not match the published Folio contract.');
      if ((await contract.token()).toLowerCase() !== TOKEN) throw new Error('This Folio contract uses a different settlement token.');
      return contract;
    })();
    checks.set(normalized, check);
    check.catch(() => checks.delete(normalized));
  }
  return checks.get(normalized);
}

export async function wallet({ request = true } = {}) {
  const injected = window.ethereum?.providers?.find((p) => p.isMetaMask) ?? window.ethereum;
  if (!injected) throw new Error('Open Folio in a wallet browser such as MetaMask, or install a browser wallet.');
  async function ask(method, params) {
    return injected.request({ method, ...(params ? { params } : {}) });
  }
  const accounts = await ask(request ? 'eth_requestAccounts' : 'eth_accounts');
  if (!accounts?.length) throw new Error('Connect a wallet to continue.');
  if ((await ask('eth_chainId')).toLowerCase() !== NETWORK) {
    if (!request) throw new Error('Switch your wallet to Aevum Testnet.');
    try {
      await ask('wallet_switchEthereumChain', [{ chainId: NETWORK }]);
    } catch (error) {
      if (error.code !== 4902 && error.data?.originalError?.code !== 4902) throw error;
      await ask('wallet_addEthereumChain', [{
        chainId: NETWORK, chainName: 'QDay Aevum Testnet',
        nativeCurrency: { name: 'QDay Test Token', symbol: 'tQDAY', decimals: 18 },
        rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
      }]);
      if ((await ask('eth_chainId')).toLowerCase() !== NETWORK) {
        await ask('wallet_switchEthereumChain', [{ chainId: NETWORK }]);
      }
    }
  }
  if ((await ask('eth_chainId')).toLowerCase() !== NETWORK) throw new Error('Switch your wallet to Aevum Testnet.');
  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  return { signer, address: await signer.getAddress() };
}

export async function getInvoice(address, id) {
  const c = await verifyContract(address);
  const result = await c.invoices(id);
  const state = states[Number(result.state)];
  if (state === 'missing') throw new Error('This invoice was not found on Aevum.');
  return {
    id: String(id), contract: await c.getAddress(), issuer: result.issuer,
    state, amount: formatUnits(result.amount, 6), raw: result.amount,
    dueAt: Number(result.dueAt), payer: result.payer, paidAt: Number(result.paidAt),
    paidBlock: Number(result.paidBlock), memoHash: result.memoHash,
  };
}

export async function listInvoices(address, issuer, offset = 0) {
  const c = await verifyContract(address);
  const [ids, count] = await Promise.all([c.invoiceIds(issuer, offset, 10), c.invoiceCount(issuer)]);
  return { invoices: await Promise.all(ids.map((id) => getInvoice(address, id))), count: Number(count) };
}

export async function receiptHash(invoice) {
  if (invoice.state !== 'paid') return '';
  const c = await verifyContract(invoice.contract);
  const events = await c.queryFilter(c.filters.InvoicePaid(invoice.id), invoice.paidBlock, invoice.paidBlock);
  return events[0]?.transactionHash ?? '';
}

export async function issueInvoice(address, signer, values, progress) {
  const c = (await verifyContract(address)).connect(signer);
  progress('Confirm the invoice in your wallet…');
  const tx = await c.createInvoice(parseUnits(values.amount, 6), values.dueAt, hashMemo(values.merchant, values.title));
  progress('Publishing invoice on Aevum…', tx.hash);
  const receipt = await confirmed(tx.hash);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    const parsed = abi.parseLog(log);
    if (parsed?.name === 'InvoiceCreated') return getInvoice(address, parsed.args.id);
  }
  throw new Error('Transaction confirmed, but its invoice event was missing.');
}

export async function payInvoice(invoice, signer, progress) {
  const fresh = await getInvoice(invoice.contract, invoice.id);
  if (fresh.state !== 'open' || fresh.dueAt * 1000 <= Date.now()) throw new Error('The invoice is closed or expired.');
  const payer = await signer.getAddress();
  if (payer.toLowerCase() === fresh.issuer.toLowerCase()) throw new Error('Use a different wallet to pay this invoice.');
  const token = new Contract(TOKEN, tokenAbi, signer);
  const [balance, allowance] = await Promise.all([token.balanceOf(payer), token.allowance(payer, fresh.contract)]);
  if (balance < fresh.raw) throw new Error('Insufficient test tUSD8. Claim more from the QDay faucet and try again.');
  if (allowance < fresh.raw) {
    progress('Approve the exact invoice amount in your wallet…');
    const approval = await token.approve(fresh.contract, fresh.raw);
    progress('Confirming token approval…', approval.hash);
    await confirmed(approval.hash);
  }
  const c = (await verifyContract(fresh.contract)).connect(signer);
  progress('Confirm the payment in your wallet…');
  const tx = await c.payInvoice(fresh.id);
  progress('Confirming payment on Aevum…', tx.hash);
  await confirmed(tx.hash);
  const settled = await getInvoice(fresh.contract, fresh.id);
  if (settled.state !== 'paid') throw new Error('The invoice has not been confirmed as paid.');
  return { ...settled, hash: tx.hash };
}

export async function cancelInvoice(invoice, signer, progress) {
  const c = (await verifyContract(invoice.contract)).connect(signer);
  progress('Confirm cancellation in your wallet…');
  const tx = await c.cancelInvoice(invoice.id);
  progress('Confirming cancellation on Aevum…', tx.hash);
  await confirmed(tx.hash);
  return getInvoice(invoice.contract, invoice.id);
}
