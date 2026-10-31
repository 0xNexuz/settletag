import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };
import { MEZO } from '../src/mezo.js';
import { root } from './solc-input.js';

const rpc = process.env.MEZO_RPC || 'https://rpc.test.mezo.org';
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your shell for an authorized testnet deployment.');
const feeBps = Number(process.env.SETTLETAG_FEE_BPS ?? 50);
const proPlanPrice = ethers.parseUnits(process.env.SETTLETAG_PRO_PRICE ?? '5', 18);

const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
if (network.chainId !== MEZO.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
for (const [name, address] of [['MUSD', MEZO.musd], ['BorrowerOperationsSignatures', MEZO.borrowerOperationsSignatures]]) {
  if ((await provider.getCode(address)) === '0x') throw new Error(`${name} contract missing on testnet`);
}
const signatures = new ethers.Contract(MEZO.borrowerOperationsSignatures, ['function borrowerOperations() view returns (address)', 'function getNonce(address) view returns (uint256)'], provider);
if ((await signatures.borrowerOperations()).toLowerCase() !== MEZO.borrowerOperations.toLowerCase()) {
  throw new Error('BorrowerOperationsSignatures is not wired to the expected BorrowerOperations.');
}
const wallet = new ethers.Wallet(key, provider);
const treasury = process.env.SETTLETAG_TREASURY || wallet.address;
const args = [MEZO.musd, MEZO.borrowerOperationsSignatures, treasury, feeBps, proPlanPrice];
const contract = await new ethers.ContractFactory(settleTag.abi, settleTag.bytecode, wallet).deploy(...args);
const tx = contract.deploymentTransaction();
console.log(JSON.stringify({ deploySubmitted: tx.hash }));
const receipt = await tx.wait();
if (receipt.status !== 1) throw new Error('Deployment reverted.');
const address = await contract.getAddress();
const live = new ethers.Contract(address, settleTag.abi, provider);
const [musd, sig, fee] = await Promise.all([live.musd(), live.borrowerOperationsSignatures(), live.feeBps()]);
if (musd !== MEZO.musd || sig !== MEZO.borrowerOperationsSignatures || fee !== BigInt(feeBps)) throw new Error('Deployed state does not match constructor arguments.');

const file = path.join(root, 'src', 'deployment.json');
const record = JSON.parse(fs.readFileSync(file, 'utf8'));
record.settleTag = {
  address, deployTx: tx.hash, block: receipt.blockNumber, owner: wallet.address,
  constructorArgs: { musd: MEZO.musd, borrowerOperationsSignatures: MEZO.borrowerOperationsSignatures, treasury, feeBps, proPlanPrice: proPlanPrice.toString() }
};
fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ settleTag: address, block: receipt.blockNumber, treasury, feeBps, proPlanPriceMUSD: ethers.formatUnits(proPlanPrice, 18) }));
console.log(`Explorer: https://explorer.test.mezo.org/address/${address}`);
console.log('Saved to src/deployment.json. Next: npm run verify:testnet');
