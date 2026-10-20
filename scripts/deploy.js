import { ethers } from 'ethers';
import settleTag from '../src/artifacts/SettleTag.json' with { type: 'json' };

const rpc = 'https://rpc.test.mezo.org';
const musd = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your shell for an authorized testnet deployment.');
const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
if (network.chainId !== 31611n) throw new Error(`Wrong chain: ${network.chainId}`);
if ((await provider.getCode(musd)) === '0x') throw new Error('MUSD contract missing on testnet');
const wallet = new ethers.Wallet(key, provider);
const factory = new ethers.ContractFactory(settleTag.abi, settleTag.bytecode, wallet);
const contract = await factory.deploy(musd);
await contract.waitForDeployment();
console.log(`SettleTag deployed: ${await contract.getAddress()}`);
console.log(`Explorer: https://explorer.test.mezo.org/address/${await contract.getAddress()}`);
