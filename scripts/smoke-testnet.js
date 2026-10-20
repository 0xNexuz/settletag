import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import { loadLocalTestWallet } from './local-test-wallet.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const address = process.env.CONTRACT_ADDRESS;
if (!address || !ethers.isAddress(address)) throw new Error('Set CONTRACT_ADDRESS to the deployed SettleTag contract.');
const provider = new ethers.JsonRpcProvider('https://rpc.test.mezo.org');
if ((await provider.getNetwork()).chainId !== 31611n) throw new Error('Wrong network.');
if (await provider.getCode(address) === '0x') throw new Error('SettleTag contract code missing.');
const contract = new ethers.Contract(address, settleTag.abi, loadLocalTestWallet().connect(provider));
const musd = await contract.musd();
if (musd.toLowerCase() !== '0x118917a40faf1cd7a13db0ef56c86de7973ac503') throw new Error('Unexpected MUSD token.');
const id = ethers.hexlify(ethers.randomBytes(32));
const amount = ethers.parseUnits('1', 18);
const latest = await provider.getBlock('latest');
const deadline = BigInt(latest.timestamp + 7 * 24 * 60 * 60);
const tx = await contract.createInvoice(id, amount, deadline);
const receipt = await tx.wait();
if (receipt.status !== 1) throw new Error('Invoice creation reverted.');
const invoice = await contract.invoices(id);
if (invoice.merchant.toLowerCase() !== (await contract.runner.getAddress()).toLowerCase() || invoice.amount !== amount || invoice.status !== 1n) {
  throw new Error('Onchain invoice state did not match the transaction.');
}
console.log(JSON.stringify({ contract: address, invoiceId: id, amountMUSD: '1', merchant: invoice.merchant, createTx: tx.hash, block: receipt.blockNumber }));
