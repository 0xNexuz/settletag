import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import mockMUSD from '../src/artifacts/MockMUSD.json' with { type: 'json' };
import mockSignatures from '../src/artifacts/MockBorrowerOperationsSignatures.json' with { type: 'json' };
import { withdrawMUSDTypedData, openTroveTypedData } from '../src/mezo.js';

const FEE_BPS = 50; // 0.5%
const PRO_PRICE = ethers.parseUnits('5', 18);
const units = (value) => ethers.parseUnits(String(value), 18);
const randomId = () => ethers.hexlify(ethers.randomBytes(32));

// Fixed local-only keys so signatures come from ethers Wallets, as in the app's embedded wallet.
const KEYS = ['merchant', 'payer', 'other', 'treasury', 'owner'].map((_, i) => ethers.zeroPadValue(ethers.toBeHex(i + 101), 32));

async function setup() {
  const chain = ganache.provider({
    logging: { quiet: true },
    // Report reverted transactions as RPC errors on every platform.
    chain: { hardfork: 'london', vmErrorsOnRPCResponse: true },
    wallet: { accounts: KEYS.map(secretKey => ({ secretKey, balance: ethers.toQuantity(units(100)) })) }
  });
  // No request caching, so back-to-back reads always see the latest block.
  const provider = new ethers.BrowserProvider(chain, undefined, { cacheTimeout: -1 });
  // Transactions go through ganache's unlocked accounts (ganache assigns nonces);
  // EIP-712 signatures come from offline Wallets holding the same keys.
  const [merchant, payer, other, treasury, owner] = await Promise.all(KEYS.map(key => provider.getSigner(new ethers.Wallet(key).address)));
  const wallets = { merchant: new ethers.Wallet(KEYS[0]), payer: new ethers.Wallet(KEYS[1]), other: new ethers.Wallet(KEYS[2]) };
  const token = await new ethers.ContractFactory(mockMUSD.abi, mockMUSD.bytecode, owner).deploy();
  await token.waitForDeployment();
  const signatures = await new ethers.ContractFactory(mockSignatures.abi, mockSignatures.bytecode, owner).deploy(await token.getAddress());
  await signatures.waitForDeployment();
  const invoices = await new ethers.ContractFactory(settleTag.abi, settleTag.bytecode, owner)
    .deploy(await token.getAddress(), await signatures.getAddress(), await treasury.getAddress(), FEE_BPS, PRO_PRICE);
  await invoices.waitForDeployment();
  const chainId = (await provider.getNetwork()).chainId;
  const now = async () => BigInt((await provider.getBlock('latest')).timestamp);
  const advance = async (seconds) => {
    await chain.request({ method: 'evm_increaseTime', params: [seconds] });
    await chain.request({ method: 'evm_mine', params: [] });
  };
  const balance = async (who) => token.balanceOf(typeof who === 'string' ? who : await who.getAddress());
  const create = async (amount, signer = merchant) => {
    const salt = randomId();
    await (await invoices.connect(signer).createInvoice(salt, amount, (await now()) + 3600n)).wait();
    return invoices.invoiceId(await signer.getAddress(), salt);
  };
  const sign = async (wallet, typed) => wallet.signTypedData(typed.domain, typed.types, typed.value);
  const drawSignature = async (wallet, { amount, recipient, deadline }) => sign(wallet, withdrawMUSDTypedData({
    chainId, verifyingContract: await signatures.getAddress(), amount, borrower: wallet.address,
    recipient: recipient ?? await invoices.getAddress(), nonce: await signatures.getNonce(wallet.address),
    deadline: deadline ?? (await now()) + 600n
  }));
  const openSignature = async (wallet, { assetAmount, debtAmount, recipient, deadline }) => sign(wallet, openTroveTypedData({
    chainId, verifyingContract: await signatures.getAddress(), assetAmount, debtAmount, borrower: wallet.address,
    recipient: recipient ?? await invoices.getAddress(), nonce: await signatures.getNonce(wallet.address),
    deadline: deadline ?? (await now()) + 600n
  }));
  const openTroveFor = async (signer, wallet, assetAmount, debtAmount) => {
    const signature = await openSignature(wallet, { assetAmount, debtAmount, recipient: wallet.address });
    await (await signatures.connect(signer).openTroveWithSignature(debtAmount, ethers.ZeroAddress, ethers.ZeroAddress, wallet.address, wallet.address, signature, (await now()) + 600n, { value: assetAmount })).wait();
  };
  return { chain, provider, merchant, payer, other, treasury, owner, wallets, token, signatures, invoices, now, advance, balance, create, drawSignature, openSignature, openTroveFor };
}

test('wallet payment splits the 0.5% fee and records the payer once', async () => {
  const { merchant, payer, treasury, token, invoices, balance, create } = await setup();
  const amount = units('200');
  const id = await create(amount);
  await (await token.mint(await payer.getAddress(), amount)).wait();
  await (await token.connect(payer).approve(await invoices.getAddress(), amount)).wait();
  await (await invoices.connect(payer).payInvoice(id)).wait();
  assert.equal(await balance(merchant), units('199'));
  assert.equal(await balance(treasury), units('1'));
  assert.equal(await balance(await invoices.getAddress()), 0n);
  const invoice = await invoices.invoices(id);
  assert.equal(invoice.status, 2n);
  assert.equal(invoice.funding, 1n, 'funded from wallet');
  assert.equal(invoice.feeBps, 50n);
  assert.equal(invoice.payer, await payer.getAddress());
  const quote = await invoices.quote(id);
  assert.deepEqual([quote.amount, quote.fee, quote.merchantReceives], [amount, units('1'), units('199')]);
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  const stats = await invoices.stats();
  assert.deepEqual([stats.invoices_, stats.paid, stats.volume, stats.fees, stats.merchants, stats.payers], [1n, 1n, amount, units('1'), 1n, 1n]);
});

test('merchants count once paid, not when they create invoices', async () => {
  const { other, invoices, create } = await setup();
  await create(units('1'), other);
  assert.equal((await invoices.stats()).merchants, 0n);
});

test('accepts Mezo’s zero-value collateral callback but rejects BTC', async () => {
  const { payer, invoices, token } = await setup();
  const to = await invoices.getAddress();
  await (await payer.sendTransaction({ to, value: 0n })).wait();
  await assert.rejects(payer.sendTransaction({ to, value: 1n }));
  await assert.rejects(invoices.setTreasury(await token.getAddress()), 'treasury cannot be the MUSD token');
  await assert.rejects(invoices.setTreasury(to), 'treasury cannot be SettleTag');
});

test('rejects missing, duplicate, cancelled, expired, unfunded and self-paid invoices', async () => {
  const { merchant, payer, other, token, invoices, now, advance, create } = await setup();
  const deadline = (await now()) + 3600n;
  await assert.rejects(invoices.connect(merchant).createInvoice(randomId(), 0n, deadline));
  await assert.rejects(invoices.connect(merchant).createInvoice(randomId(), 1n, await now()));
  await assert.rejects(invoices.connect(merchant).createInvoice(randomId(), 1n, (await now()) + 91n * 86400n), 'deadline over 90 days');
  const salt = randomId();
  const id = await invoices.invoiceId(await merchant.getAddress(), salt);
  assert.equal(id, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [await merchant.getAddress(), salt])), 'ID matches the app’s derivation');
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  await (await invoices.connect(merchant).createInvoice(salt, 1000n, deadline)).wait();
  await assert.rejects(invoices.connect(merchant).createInvoice(salt, 1000n, deadline), 'duplicate salt');
  await (await invoices.connect(other).createInvoice(salt, 1000n, deadline)).wait();
  assert.equal((await invoices.invoices(id)).merchant, await merchant.getAddress(), 'same salt from another account cannot claim this ID');
  await assert.rejects(invoices.connect(other).cancelInvoice(id));
  await assert.rejects(invoices.connect(payer).payInvoice(id), 'payer has no MUSD');
  assert.equal((await invoices.invoices(id)).status, 1n, 'failed transfer rolls status back');
  await (await token.mint(await merchant.getAddress(), 1000n)).wait();
  await (await token.connect(merchant).approve(await invoices.getAddress(), 1000n)).wait();
  await assert.rejects(invoices.connect(merchant).payInvoice(id), 'merchant cannot pay own invoice');
  await (await invoices.connect(merchant).cancelInvoice(id)).wait();
  await assert.rejects(invoices.connect(payer).payInvoice(id));
  const second = await create(1000n);
  await (await token.mint(await payer.getAddress(), 1000n)).wait();
  await (await token.connect(payer).approve(await invoices.getAddress(), 1000n)).wait();
  await advance(4000);
  await assert.rejects(invoices.connect(payer).payInvoice(second));
  assert.equal((await invoices.invoices(second)).status, 1n);
});

test('Pro plan waives fees on invoices created during the plan and stacks periods', async () => {
  const { merchant, payer, treasury, token, invoices, advance, balance, create } = await setup();
  const before = await create(units('100'));
  await assert.rejects(invoices.connect(merchant).buyProPlan(0));
  await assert.rejects(invoices.connect(merchant).buyProPlan(13));
  await (await token.mint(await merchant.getAddress(), units('15'))).wait();
  await (await token.connect(merchant).approve(await invoices.getAddress(), units('15'))).wait();
  await (await invoices.connect(merchant).buyProPlan(2)).wait();
  assert.equal(await balance(treasury), units('10'));
  assert.equal(await invoices.isPro(await merchant.getAddress()), true);
  const firstUntil = await invoices.proUntil(await merchant.getAddress());
  await (await invoices.connect(merchant).buyProPlan(1)).wait();
  assert.equal(await invoices.proUntil(await merchant.getAddress()), firstUntil + 30n * 86400n, 'stacks on the active plan');
  assert.equal((await invoices.stats()).plans, units('15'));
  const during = await create(units('100'));
  assert.equal((await invoices.invoices(during)).feeBps, 0n);
  assert.equal((await invoices.invoices(before)).feeBps, 50n, 'earlier invoice keeps its terms');
  await (await token.mint(await payer.getAddress(), units('100'))).wait();
  await (await token.connect(payer).approve(await invoices.getAddress(), units('100'))).wait();
  await (await invoices.connect(payer).payInvoice(during)).wait();
  assert.equal(await balance(merchant), units('100'));
  await advance(91 * 86400);
  assert.equal(await invoices.isPro(await merchant.getAddress()), false);
  const after = await create(units('100'));
  assert.equal((await invoices.invoices(after)).feeBps, 50n);
  await (await invoices.setProPlanPrice(0)).wait();
  await assert.rejects(invoices.connect(merchant).buyProPlan(1), 'disabled plan');
});

test('payer borrows from an existing Mezo trove and settles in one transaction', async () => {
  const s = await setup();
  const { merchant, payer, other, treasury, wallets, invoices, signatures, balance, create, drawSignature, openTroveFor, now } = s;
  await openTroveFor(payer, wallets.payer, units('0.05'), units('1800'));
  const id = await create(units('40'));
  const zero = ethers.ZeroAddress;
  const deadline = (await now()) + 600n;

  const forged = await drawSignature(wallets.other, { amount: units('40'), deadline });
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, zero, zero, forged, deadline), 'signature from someone else');
  const toPayer = await drawSignature(wallets.payer, { amount: units('40'), recipient: wallets.payer.address, deadline });
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, zero, zero, toPayer, deadline), 'signature names a different recipient');
  const wrongAmount = await drawSignature(wallets.payer, { amount: units('39'), deadline });
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, zero, zero, wrongAmount, deadline), 'signature for a different amount');
  const stale = await drawSignature(wallets.payer, { amount: units('40'), deadline: (await now()) - 1n });
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, zero, zero, stale, (await now()) - 1n), 'expired signature');
  assert.equal((await invoices.invoices(id)).status, 1n);

  const signature = await drawSignature(wallets.payer, { amount: units('40'), deadline });
  const debtBefore = await signatures.troveDebt(wallets.payer.address);
  const payerBefore = await balance(payer);
  await assert.rejects(invoices.connect(other).payWithTroveDraw(id, zero, zero, signature, deadline), 'another account cannot use the signature');
  await (await invoices.connect(payer).payWithTroveDraw(id, zero, zero, signature, deadline)).wait();
  assert.equal(await balance(merchant), units('39.8'));
  assert.equal(await balance(treasury), units('0.2'));
  assert.equal(await balance(await invoices.getAddress()), 0n);
  assert.equal(await balance(payer), payerBefore, 'wallet MUSD untouched');
  assert.equal(await signatures.troveDebt(wallets.payer.address), debtBefore + units('40'));
  const invoice = await invoices.invoices(id);
  assert.equal(invoice.funding, 2n, 'funded by trove draw');
  assert.equal(invoice.payer, wallets.payer.address);
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, zero, zero, signature, deadline), 'cannot pay twice or replay');
  const stats = await invoices.stats();
  assert.equal(stats.troveFunded, 1n);
  assert.equal(stats.troveVolume, units('40'));
});

test('payer opens a trove, settles the invoice and receives the rest of the loan', async () => {
  const { merchant, payer, treasury, wallets, invoices, signatures, balance, create, openSignature, now } = await setup();
  const id = await create(units('25'));
  const zero = ethers.ZeroAddress;
  const deadline = (await now()) + 600n;
  const assetAmount = units('0.05');
  const debtAmount = units('1800');
  const short = await openSignature(wallets.payer, { assetAmount, debtAmount: units('20'), deadline });
  await assert.rejects(invoices.connect(payer).payByOpeningTrove(id, units('20'), zero, zero, short, deadline, { value: assetAmount }), 'loan smaller than invoice');
  const signature = await openSignature(wallets.payer, { assetAmount, debtAmount, deadline });
  await assert.rejects(invoices.connect(payer).payByOpeningTrove(id, debtAmount, zero, zero, signature, deadline, { value: units('0.04') }), 'collateral differs from signed amount');
  await assert.rejects(invoices.connect(payer).payByOpeningTrove(id, debtAmount, zero, zero, signature, deadline), 'no collateral');
  await (await invoices.connect(payer).payByOpeningTrove(id, debtAmount, zero, zero, signature, deadline, { value: assetAmount })).wait();
  assert.equal(await balance(merchant), units('24.875'));
  assert.equal(await balance(treasury), units('0.125'));
  assert.equal(await balance(payer), units('1775'), 'remainder of the loan returned to payer');
  assert.equal(await balance(await invoices.getAddress()), 0n);
  assert.equal(await signatures.troveActive(wallets.payer.address), true);
  assert.equal(await signatures.troveColl(wallets.payer.address), assetAmount);
  assert.equal((await invoices.invoices(id)).funding, 3n, 'funded by new trove');
});

test('reverts if Mezo delivers a different MUSD amount, leaving the invoice open', async () => {
  const { payer, wallets, invoices, signatures, create, drawSignature, openTroveFor, now } = await setup();
  await openTroveFor(payer, wallets.payer, units('0.05'), units('1800'));
  const id = await create(units('10'));
  await (await signatures.setMintShortfall(1n)).wait();
  const deadline = (await now()) + 600n;
  const signature = await drawSignature(wallets.payer, { amount: units('10'), deadline });
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, ethers.ZeroAddress, ethers.ZeroAddress, signature, deadline));
  assert.equal((await invoices.invoices(id)).status, 1n);
});

test('owner can return MUSD stranded by a signature submitted outside SettleTag', async () => {
  const { payer, other, wallets, invoices, signatures, balance, create, drawSignature, openTroveFor, now } = await setup();
  await openTroveFor(payer, wallets.payer, units('0.05'), units('1800'));
  const id = await create(units('10'));
  const deadline = (await now()) + 600n;
  const signature = await drawSignature(wallets.payer, { amount: units('10'), deadline });
  const contract = await invoices.getAddress();
  await (await signatures.connect(other).withdrawMUSDWithSignature(units('10'), ethers.ZeroAddress, ethers.ZeroAddress, wallets.payer.address, contract, signature, deadline)).wait();
  assert.equal(await balance(contract), units('10'));
  await assert.rejects(invoices.connect(payer).payWithTroveDraw(id, ethers.ZeroAddress, ethers.ZeroAddress, signature, deadline), 'nonce already used');
  await assert.rejects(invoices.connect(other).returnStrandedMUSD(wallets.payer.address, units('10')), 'only owner');
  const payerBefore = await balance(payer);
  await (await invoices.returnStrandedMUSD(wallets.payer.address, units('10'))).wait();
  assert.equal(await balance(payer), payerBefore + units('10'));
  assert.equal(await balance(contract), 0n);
  const fresh = await drawSignature(wallets.payer, { amount: units('10'), deadline });
  await (await invoices.connect(payer).payWithTroveDraw(id, ethers.ZeroAddress, ethers.ZeroAddress, fresh, deadline)).wait();
  assert.equal((await invoices.invoices(id)).status, 2n);
});

test('fee changes are capped, owner-only and never touch open invoices', async () => {
  const { merchant, other, invoices, create } = await setup();
  const id = await create(units('100'));
  await assert.rejects(invoices.setFeeBps(101));
  await assert.rejects(invoices.connect(other).setFeeBps(10));
  await assert.rejects(invoices.setTreasury(ethers.ZeroAddress));
  await assert.rejects(invoices.connect(merchant).transferOwnership(await merchant.getAddress()));
  await (await invoices.setFeeBps(100)).wait();
  assert.equal((await invoices.invoices(id)).feeBps, 50n);
  assert.equal(await invoices.effectiveFeeBps(await merchant.getAddress()), 100n);
});
