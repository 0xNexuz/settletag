import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import { loadLocalTestWallet } from './local-test-wallet.js';
import { confirmed } from './confirmed.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const CONTRACT = '0x53eCBb8891Df17927d40E4FbF234a80cB82EC456';
const ID = '0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f';
const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const provider = new ethers.JsonRpcProvider('https://rpc.test.mezo.org');
if ((await provider.getNetwork()).chainId !== 31611n) throw new Error('Wrong network.');
const payer = loadLocalTestWallet('mezo-test-payer').connect(provider);
const contract = new ethers.Contract(CONTRACT, settleTag.abi, payer);
const token = new ethers.Contract(MUSD, [
  'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)'
], payer);
const before = await contract.invoices(ID);
if (before.status !== 1n || before.payer !== ethers.ZeroAddress) throw new Error('Invoice is not open.');
if (before.merchant.toLowerCase() === payer.address.toLowerCase()) throw new Error('Payer and merchant must differ.');
if (before.deadline < BigInt(Math.floor(Date.now() / 1000))) throw new Error('Invoice expired.');
if (await token.balanceOf(payer.address) < before.amount) throw new Error('Payer lacks MUSD.');
const merchantBefore = await token.balanceOf(before.merchant);
if (await token.allowance(payer.address, CONTRACT) < before.amount) {
  const tx = await token.approve(CONTRACT, before.amount);
  console.log(JSON.stringify({ approveSubmitted: tx.hash }));
  const receipt = await confirmed(provider, tx.hash);
  console.log(JSON.stringify({ approveTx: tx.hash, block: receipt.blockNumber }));
}
const tx = await contract.payInvoice(ID);
console.log(JSON.stringify({ paymentSubmitted: tx.hash }));
const receipt = await confirmed(provider, tx.hash);
const after = await contract.invoices(ID);
const merchantAfter = await token.balanceOf(before.merchant);
if (after.status !== 2n || after.payer.toLowerCase() !== payer.address.toLowerCase()) throw new Error('Receipt state mismatch.');
if (merchantAfter - merchantBefore !== before.amount) throw new Error('Merchant did not receive the exact MUSD amount.');
const fullReceipt = await provider.getTransactionReceipt(tx.hash);
const paidEvent = fullReceipt.logs.map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
  .find(event => event?.name === 'InvoicePaid');
const transferEvent = fullReceipt.logs.map(log => { try { return token.interface.parseLog(log); } catch { return null; } })
  .find(event => event?.name === 'Transfer' && event.args.from.toLowerCase() === payer.address.toLowerCase() && event.args.to.toLowerCase() === before.merchant.toLowerCase());
if (!paidEvent || paidEvent.args.id !== ID || !transferEvent || transferEvent.args.value !== before.amount) throw new Error('Payment events mismatch.');
console.log(JSON.stringify({
  payTx: tx.hash, block: receipt.blockNumber, invoiceId: ID,
  payer: payer.address, merchant: before.merchant,
  amountMUSD: ethers.formatUnits(before.amount, 18),
  merchantMUSDIncrease: ethers.formatUnits(merchantAfter - merchantBefore, 18)
}));
