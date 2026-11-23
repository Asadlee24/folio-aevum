import {
  Contract, Interface, JsonRpcProvider, formatUnits,
  getAddress, isAddress, keccak256, parseUnits, toUtf8Bytes,
} from 'ethers';
import artifact from './contract.generated.json';
import { CHAIN_ID, RPC, EXPLORER, TOKEN } from './config.js';

const tokenAbi = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];
const states = ['missing', 'open', 'paid', 'cancelled'];
const rpc = new JsonRpcProvider(RPC, CHAIN_ID, { batchMaxCount: 1 });
const abi = new Interface(artifact.abi);
const checks = new Map();

export const hashMemo = (memo) => keccak256(toUtf8Bytes(JSON.stringify(memo)));
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
  const tx = await c.createInvoice(parseUnits(values.amount, 6), values.dueAt, hashMemo(values.memo));
  progress('Publishing invoice on Aevum…', tx.hash);
  const receipt = await confirmed(tx.hash);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    const parsed = abi.parseLog(log);
    if (parsed?.name === 'InvoiceCreated') return getInvoice(address, parsed.args.id);
  }
  throw new Error('Transaction confirmed, but its invoice event was missing.');
}

async function sendPaymentStep(signer, from, request, step, progress) {
  const stage = step === 'payment' ? 'payment' : 'approval';
  const tx = { ...request, from };
  let gasLimit;
  try {
    gasLimit = await rpc.estimateGas(tx);
  } catch (error) {
    if (error.code !== 'CALL_EXCEPTION') throw error;
    const reason = error.data?.length >= 10 ? abi.getError(error.data.slice(0, 10))?.name : null;
    const messages = {
      InvoiceClosed: 'This invoice is no longer open. Refresh the invoice to see its latest status.',
      InvoiceExpired: 'This invoice has expired. Ask the issuer for a new invoice.',
      SelfPayment: 'Use a different wallet to pay this invoice.',
      TransferFailed: 'The tUSD8 transfer failed its preflight check. Check your test token balance and allowance.',
    };
    throw new Error(messages[reason] ?? `Aevum could not simulate the ${step}. No transaction was sent.`, { cause: error });
  }

  if ((await signer.provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) {
    throw new Error('Switch your wallet to Aevum Testnet.');
  }
  progress(stage === 'payment' ? 'Confirm the payment in your wallet…' : 'Approve the exact invoice amount in your wallet…', '', stage);
  let hash;
  try {
    // The wallet still confirms and sends the exact request. Aevum supplies the gas estimate and receipt.
    hash = await signer.sendUncheckedTransaction({ ...tx, gasLimit });
  } catch (error) {
    if (error.code !== 'CALL_EXCEPTION' || (error.data && error.data !== '0x')) throw error;
    throw new Error(`Your wallet could not submit the ${step}. Review any security warning shown by the wallet.`, { cause: error });
  }
  progress(`Confirming ${step} on Aevum…`, hash, stage);
  await confirmed(hash);
  return hash;
}

export async function payInvoice(invoice, signer, progress) {
  const fresh = await getInvoice(invoice.contract, invoice.id);
  if (fresh.state !== 'open' || fresh.dueAt * 1000 <= Date.now()) throw new Error('The invoice is closed or expired.');
  const payer = await signer.getAddress();
  if (payer.toLowerCase() === fresh.issuer.toLowerCase()) throw new Error('Use a different wallet to pay this invoice.');
  const token = new Contract(TOKEN, tokenAbi, rpc);
  const [gasBalance, balance, allowance] = await Promise.all([
    rpc.getBalance(payer),
    token.balanceOf(payer),
    token.allowance(payer, fresh.contract),
  ]);
  if (gasBalance === 0n) throw new Error('Your wallet needs testnet tQDAY for gas. Open the QDay faucet and try again.');
  if (balance < fresh.raw) throw new Error('Insufficient test tUSD8. Claim more from the QDay faucet and try again.');
  if (allowance < fresh.raw) {
    const approval = await token.approve.populateTransaction(fresh.contract, fresh.raw);
    await sendPaymentStep(signer, payer, approval, 'tUSD8 approval', progress);
  }
  const c = await verifyContract(fresh.contract);
  const payment = await c.payInvoice.populateTransaction(fresh.id);
  const hash = await sendPaymentStep(signer, payer, payment, 'payment', progress);
  const settled = await getInvoice(fresh.contract, fresh.id);
  if (settled.state !== 'paid') throw new Error('The invoice has not been confirmed as paid.');
  return { ...settled, hash };
}

export async function cancelInvoice(invoice, signer, progress) {
  const c = (await verifyContract(invoice.contract)).connect(signer);
  progress('Confirm cancellation in your wallet…');
  const tx = await c.cancelInvoice(invoice.id);
  progress('Confirming cancellation on Aevum…', tx.hash);
  await confirmed(tx.hash);
  return getInvoice(invoice.contract, invoice.id);
}
