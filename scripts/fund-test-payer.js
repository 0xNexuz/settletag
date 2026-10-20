import { ethers } from 'ethers';
import { loadLocalTestWallet } from './local-test-wallet.js';
import { confirmed } from './confirmed.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const provider = new ethers.JsonRpcProvider('https://rpc.test.mezo.org');
if ((await provider.getNetwork()).chainId !== 31611n) throw new Error('Wrong network.');
const merchant = loadLocalTestWallet().connect(provider);
const payer = loadLocalTestWallet('mezo-test-payer').address;
const token = new ethers.Contract('0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', [
  'function balanceOf(address) view returns(uint256)',
  'function transfer(address,uint256) returns(bool)'
], merchant);
const btcTarget = ethers.parseEther('0.002');
const musdTarget = ethers.parseUnits('1', 18);
const btcBefore = await provider.getBalance(payer);
const musdBefore = await token.balanceOf(payer);
if (btcBefore < btcTarget) {
  const tx = await merchant.sendTransaction({ to: payer, value: btcTarget - btcBefore });
  console.log(JSON.stringify({ btcFundingSubmitted: tx.hash }));
  const receipt = await confirmed(provider, tx.hash);
  console.log(JSON.stringify({ btcFundingTx: tx.hash, block: receipt.blockNumber }));
}
if (musdBefore < musdTarget) {
  const tx = await token.transfer(payer, musdTarget - musdBefore);
  console.log(JSON.stringify({ musdFundingSubmitted: tx.hash }));
  const receipt = await confirmed(provider, tx.hash);
  console.log(JSON.stringify({ musdFundingTx: tx.hash, block: receipt.blockNumber }));
}
console.log(JSON.stringify({
  payer,
  payerBTC: ethers.formatEther(await provider.getBalance(payer)),
  payerMUSD: ethers.formatUnits(await token.balanceOf(payer), 18)
}));
