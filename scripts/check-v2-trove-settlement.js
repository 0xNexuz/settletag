// Real Mezo testnet integration check. Preview is read-only; --execute signs two testnet transactions.
import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import deployment from '../src/deployment.json' with { type: 'json' };
import { loadLocalTestWallet } from './local-test-wallet.js';
import { confirmed } from './confirmed.js';
import { MEZO, ONE, insertHints, mezoContracts, projectDraw, readSignatureDomain, readTrove, withdrawMUSDTypedData } from '../src/mezo.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const execute = process.argv.includes('--execute');
const rpc = new ethers.JsonRpcProvider('https://rpc.test.mezo.org');
if ((await rpc.getNetwork()).chainId !== MEZO.chainId) throw new Error('Wrong chain.');
const deployed = deployment.settleTag;
if (!deployed?.address || await rpc.getCode(deployed.address) === '0x') throw new Error('No live v2 deployment.');

const borrower = loadLocalTestWallet().connect(rpc);
const merchant = loadLocalTestWallet('mezo-test-payer').connect(rpc);
if (borrower.address === merchant.address) throw new Error('Distinct wallets required.');
const contract = new ethers.Contract(deployed.address, settleTag.abi, rpc);
const token = new ethers.Contract(MEZO.musd, ['function balanceOf(address) view returns (uint256)'], rpc);
if ((await contract.owner()) !== borrower.address || (await contract.treasury()) !== borrower.address ||
    (await contract.musd()) !== MEZO.musd || (await contract.feeBps()) !== 50n ||
    (await contract.proPlanPrice()) !== ethers.parseUnits('5', 18)) {
  throw new Error('Deployment settings differ from approved test settings.');
}

const amount = ethers.parseUnits('1', 18);
const before = await readTrove(rpc, borrower.address);
if (!before.active) throw new Error('Borrower has no active Mezo trove.');
const plan = projectDraw({
  coll: before.coll, debt: before.debt, price: before.price,
  borrowingRate: before.borrowingRate, amount, capacity: before.capacity,
  recoveryMode: before.recoveryMode, systemColl: before.systemColl, systemDebt: before.systemDebt
});
if (!plan.ok) throw new Error(`Borrow preview failed: ${plan.problems.join(' ')}`);
console.log(JSON.stringify({
  preview: true, contract: deployed.address, merchant: merchant.address,
  borrower: borrower.address, amountMUSD: '1',
  debtBefore: ethers.formatUnits(before.debt, 18),
  debtAfterProjected: ethers.formatUnits(plan.newDebt, 18),
  ratioBefore: Number(before.icr) / Number(ONE),
  ratioAfterProjected: Number(plan.icr) / Number(ONE),
  execute
}));
if (!execute) process.exit(0);

const salt = ethers.hexlify(ethers.randomBytes(32));
const id = await contract.invoiceId(merchant.address, salt);
const latest = await rpc.getBlock('latest');
const invoiceDeadline = BigInt(latest.timestamp + 86400);
const createTx = await contract.connect(merchant).createInvoice(salt, amount, invoiceDeadline);
console.log(JSON.stringify({ invoiceSubmitted: createTx.hash, invoiceId: id }));
await confirmed(rpc, createTx.hash);
const open = await contract.invoices(id);
if (open.status !== 1n || open.merchant !== merchant.address || open.amount !== amount || open.feeBps !== 50n) {
  throw new Error('Created invoice state mismatch.');
}

const merchantBefore = await token.balanceOf(merchant.address);
const treasuryBefore = await token.balanceOf(borrower.address);
const hints = await insertHints(rpc, before.coll, before.principal + amount + plan.fee);
const signatureDeadline = BigInt((await rpc.getBlock('latest')).timestamp + 1200);
const signatures = mezoContracts(rpc).signatures;
const nonceBefore = await signatures.getNonce(borrower.address);
const typed = withdrawMUSDTypedData({
  domain: await readSignatureDomain(rpc), amount, borrower: borrower.address,
  recipient: deployed.address, nonce: nonceBefore, deadline: signatureDeadline
});
const signature = await borrower.signTypedData(typed.domain, typed.types, typed.value);
const payable = contract.connect(borrower);
await payable.payWithTroveDraw.staticCall(id, hints.upper, hints.lower, signature, signatureDeadline);
const payTx = await payable.payWithTroveDraw(id, hints.upper, hints.lower, signature, signatureDeadline);
console.log(JSON.stringify({ paymentSubmitted: payTx.hash, invoiceId: id }));
const payReceipt = await confirmed(rpc, payTx.hash);

const [paid, merchantAfter, treasuryAfter, after, nonceAfter, contractBalance] = await Promise.all([
  contract.invoices(id), token.balanceOf(merchant.address), token.balanceOf(borrower.address),
  readTrove(rpc, borrower.address), signatures.getNonce(borrower.address), token.balanceOf(deployed.address)
]);
const expectedFee = amount * 50n / 10_000n;
if (paid.status !== 2n || paid.payer !== borrower.address || paid.funding !== 2n ||
    merchantAfter - merchantBefore !== amount - expectedFee ||
    treasuryAfter - treasuryBefore !== expectedFee ||
    nonceAfter !== nonceBefore + 1n || contractBalance !== 0n || after.debt <= before.debt ||
    after.coll !== before.coll) {
  throw new Error('Live trove-funded settlement did not match invoice, token, nonce, and debt evidence.');
}
const fullReceipt = await rpc.getTransactionReceipt(payTx.hash);
const events = fullReceipt.logs.map(log => { try { return contract.interface.parseLog(log); } catch { return null; } });
if (!events.some(event => event?.name === 'TroveBorrowed' && event.args.id === id) ||
    !events.some(event => event?.name === 'InvoicePaid' && event.args.id === id)) {
  throw new Error('Missing trove-funded settlement events.');
}
console.log(JSON.stringify({
  verified: true, invoiceId: id, createTx: createTx.hash, payTx: payTx.hash, payBlock: payReceipt.blockNumber,
  merchant: merchant.address, payer: borrower.address,
  merchantReceivedMUSD: ethers.formatUnits(merchantAfter - merchantBefore, 18),
  treasuryFeeMUSD: ethers.formatUnits(treasuryAfter - treasuryBefore, 18),
  debtBeforeMUSD: ethers.formatUnits(before.debt, 18),
  debtAfterMUSD: ethers.formatUnits(after.debt, 18)
}));
