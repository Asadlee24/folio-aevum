import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserProvider, ContractFactory, keccak256, toUtf8Bytes } from 'ethers';
import ganache from 'ganache';
import { compile, compileFolio } from './compile.mjs';

const mockToken = `
pragma solidity 0.8.28;
contract TestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address owner, uint256 amount) external { balanceOf[owner] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transferFrom(address payer, address recipient, uint256 amount) external returns (bool) {
        if (allowance[payer][msg.sender] < amount || balanceOf[payer] < amount) return false;
        allowance[payer][msg.sender] -= amount;
        balanceOf[payer] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }
}
`;

test('Folio records one exact settlement, rejects invalid payments and preserves unpaid invoices after a failed transfer', async () => {
  const network = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } });
  try {
    const provider = new BrowserProvider(network, undefined, { cacheTimeout: -1 });
    const issuer = await provider.getSigner(0);
    const payer = await provider.getSigner(1);
    const other = await provider.getSigner(2);
    const artifact = await compileFolio();
    const mock = (await compile({ 'TestToken.sol': mockToken }))['TestToken.sol'].TestToken;
    const token = await (await new ContractFactory(mock.abi, '0x' + mock.evm.bytecode.object, issuer).deploy()).waitForDeployment();
    const folio = await (await new ContractFactory(artifact.abi, artifact.bytecode, issuer).deploy(await token.getAddress())).waitForDeployment();
    const address = await folio.getAddress();
    const issuerAddress = await issuer.getAddress();
    const payerAddress = await payer.getAddress();
    assert.equal(await provider.getCode(address), artifact.runtime);
    const now = (await provider.getBlock('latest')).timestamp;
    const amount = 10_500_001n;
    const memo = keccak256(toUtf8Bytes(JSON.stringify(['North Studio', 'Brand identity'])));
    const settle = async (tx) => (await tx).wait();
    await settle(token.mint(payerAddress, 3n * amount));
    await assert.rejects(folio.createInvoice.staticCall(0, now + 60, memo));
    await assert.rejects(folio.createInvoice.staticCall(amount, now - 1, memo));
    await settle(folio.createInvoice(amount, now + 60, memo));
    assert.equal((await folio.invoices(1)).memoHash, memo);
    assert.deepEqual(Array.from(await folio.invoiceIds(issuerAddress, 0, 10)), [1n]);
    assert.equal(await folio.invoiceCount(issuerAddress), 1n);
    await assert.rejects(folio.payInvoice.staticCall(1));
    await assert.rejects((await folio.connect(other).payInvoice(1, { gasLimit: 130_000 })).wait());
    assert.equal((await folio.invoices(1)).state, 1n);
    await settle(token.connect(payer).approve(address, amount));
    const payment = await settle(folio.connect(payer).payInvoice(1));
    const paid = await folio.invoices(1);
    assert.equal(paid.state, 2n);
    assert.equal(paid.payer, payerAddress);
    assert.equal(paid.paidBlock, BigInt(payment.blockNumber));
    assert.equal(await token.balanceOf(issuerAddress), amount);
    assert.equal(await token.balanceOf(payerAddress), 2n * amount);
    assert.equal(await token.allowance(payerAddress, address), 0n);
    const receipts = await folio.queryFilter(folio.filters.InvoicePaid(1), payment.blockNumber, payment.blockNumber);
    assert.equal(receipts[0].transactionHash, payment.hash);
    await assert.rejects(folio.connect(payer).payInvoice.staticCall(1));
    await assert.rejects(folio.cancelInvoice.staticCall(1));
    await settle(folio.createInvoice(amount, now + 60, memo));
    await assert.rejects(folio.connect(other).cancelInvoice.staticCall(2));
    await settle(folio.cancelInvoice(2));
    await assert.rejects(folio.connect(payer).payInvoice.staticCall(2));
    await settle(folio.createInvoice(amount, now + 60, memo));
    await network.request({ method: 'evm_increaseTime', params: [61] });
    await network.request({ method: 'evm_mine', params: [] });
    await settle(token.connect(payer).approve(address, amount));
    await assert.rejects(folio.connect(payer).payInvoice.staticCall(3));
    assert.deepEqual(Array.from(await folio.invoiceIds(issuerAddress, 1, 2)), [2n, 1n]);
  } finally {
    await network.disconnect();
  }
});
