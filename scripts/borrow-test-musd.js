import { ethers } from 'ethers';
import { loadLocalTestWallet } from './local-test-wallet.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const RPC = 'https://rpc.test.mezo.org';
const BORROWER = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5';
const TROVE = '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0';
const HINTS = '0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6';
const SORTED = '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA';
const PRICE = '0x86bCF0841622a5dAC14A313a15f96A95421b9366';
const debt = ethers.parseUnits('1800', 18);
const collateral = ethers.parseEther('0.04');
const provider = new ethers.JsonRpcProvider(RPC);
if ((await provider.getNetwork()).chainId !== 31611n) throw new Error('Wrong network.');
const wallet = loadLocalTestWallet().connect(provider);
const borrower = new ethers.Contract(BORROWER, [
  'function openTrove(uint256,address,address) payable',
  'function minNetDebt() view returns(uint256)',
  'function getBorrowingFee(uint256) view returns(uint256)'
], wallet);
const trove = new ethers.Contract(TROVE, [
  'function MUSD_GAS_COMPENSATION() view returns(uint256)',
  'function getTroveStatus(address) view returns(uint256)'
], provider);
const priceFeed = new ethers.Contract(PRICE, ['function fetchPrice() view returns(uint256)'], provider);
const hints = new ethers.Contract(HINTS, ['function getApproxHint(uint256,uint256,uint256) view returns(address,uint256,uint256)'], provider);
const sorted = new ethers.Contract(SORTED, [
  'function getSize() view returns(uint256)',
  'function findInsertPosition(uint256,address,address) view returns(address,address)'
], provider);
const [balance, price, minDebt, fee, gasComp, status, size] = await Promise.all([
  provider.getBalance(wallet.address), priceFeed.fetchPrice(), borrower.minNetDebt(),
  borrower.getBorrowingFee(debt), trove.MUSD_GAS_COMPENSATION(),
  trove.getTroveStatus(wallet.address), sorted.getSize()
]);
if (status !== 0n) throw new Error('Deployment wallet already has a trove.');
if (debt < minDebt) throw new Error('Borrow amount is below the protocol minimum.');
if (balance < collateral + ethers.parseEther('0.002')) throw new Error('Insufficient test BTC after reserving gas.');
const totalDebt = debt + fee + gasComp;
const ratio = collateral * price * 100n / totalDebt;
if (ratio < ethers.parseUnits('150', 18)) throw new Error('Collateral ratio would be below 150%.');
const nicr = collateral * 10n ** 20n / totalDebt;
const trials = BigInt(Math.max(15, Math.ceil(Math.sqrt(Number(size))) * 15));
const [approx] = await hints.getApproxHint(nicr, trials, 47291);
const [upper, lower] = await sorted.findInsertPosition(nicr, approx, approx);
await borrower.openTrove.staticCall(debt, upper, lower, { value: collateral });
const gas = await borrower.openTrove.estimateGas(debt, upper, lower, { value: collateral });
console.log(JSON.stringify({
  mode: process.argv.includes('--execute') ? 'execute' : 'preview',
  borrower: wallet.address,
  priceUSD: ethers.formatUnits(price, 18),
  collateralBTC: ethers.formatEther(collateral),
  principalMUSD: ethers.formatUnits(debt, 18),
  feeMUSD: ethers.formatUnits(fee, 18),
  startingDebtMUSD: ethers.formatUnits(totalDebt, 18),
  collateralRatioPercent: ethers.formatUnits(ratio, 18),
  estimatedGas: gas.toString(),
  troveCount: size.toString()
}));
if (process.argv.includes('--execute')) {
  const tx = await borrower.openTrove(debt, upper, lower, { value: collateral, gasLimit: gas * 12n / 10n });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Borrow transaction reverted.');
  const musd = new ethers.Contract('0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', ['function balanceOf(address) view returns(uint256)'], provider);
  console.log(JSON.stringify({ borrowTx: tx.hash, block: receipt.blockNumber, musdBalance: ethers.formatUnits(await musd.balanceOf(wallet.address), 18) }));
}
