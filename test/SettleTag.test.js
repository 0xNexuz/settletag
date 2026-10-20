import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import mockMUSD from '../src/artifacts/MockMUSD.json' with { type: 'json' };

async function setup() {
  const chain = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'london' } });
  const provider = new ethers.BrowserProvider(chain);
  const merchant = await provider.getSigner(0);
  const payer = await provider.getSigner(1);
  const other = await provider.getSigner(2);
  const token = await new ethers.ContractFactory(mockMUSD.abi, mockMUSD.bytecode, merchant).deploy();
  await token.waitForDeployment();
  const invoices = await new ethers.ContractFactory(settleTag.abi, settleTag.bytecode, merchant).deploy(await token.getAddress());
  await invoices.waitForDeployment();
  const deadline = BigInt((await provider.getBlock('latest')).timestamp + 3600);
  return { chain, provider, merchant, payer, other, token, invoices, deadline };
}

test('pays the exact amount directly to merchant and records payer once', async () => {
  const { merchant, payer, token, invoices, deadline } = await setup();
  const id = ethers.hexlify(ethers.randomBytes(32));
  const amount = ethers.parseUnits('12.5', 18);
  await (await invoices.createInvoice(id, amount, deadline)).wait();
  await (await token.mint(await payer.getAddress(), amount)).wait();
  await (await token.connect(payer).approve(await invoices.getAddress(), amount)).wait();
  await (await invoices.connect(payer).payInvoice(id)).wait();
  assert.equal(await token.balanceOf(await merchant.getAddress()), amount);
  assert.equal(await token.balanceOf(await invoices.getAddress()), 0n);
  const invoice = await invoices.invoices(id);
  assert.equal(invoice.status, 2n);
  assert.equal(invoice.payer, await payer.getAddress());
  await assert.rejects(invoices.connect(payer).payInvoice(id));
});

test('rejects missing, duplicate, cancelled, expired and unfunded invoices', async () => {
  const { chain, merchant, payer, other, token, invoices, deadline } = await setup();
  const id = ethers.hexlify(ethers.randomBytes(32));
  await assert.rejects(invoices.createInvoice(ethers.ZeroHash, 1n, deadline));
  await assert.rejects(invoices.createInvoice(id, 0n, deadline));
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  await (await invoices.createInvoice(id, 1n, deadline)).wait();
  await assert.rejects(invoices.createInvoice(id, 1n, deadline));
  await assert.rejects(invoices.connect(other).cancelInvoice(id));
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  assert.equal((await invoices.invoices(id)).status, 1n, 'failed transfer rolls status back');
  await (await invoices.cancelInvoice(id)).wait();
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  const second = ethers.hexlify(ethers.randomBytes(32));
  await (await invoices.createInvoice(second, 1n, deadline)).wait();
  await (await token.mint(await payer.getAddress(), 1n)).wait();
  await (await token.connect(payer).approve(await invoices.getAddress(), 1n)).wait();
  await chain.request({ method: 'evm_increaseTime', params: [4000] });
  await chain.request({ method: 'evm_mine', params: [] });
  await assert.rejects(invoices.connect(payer).payInvoice(second));
  assert.equal((await invoices.invoices(second)).status, 1n);
});
