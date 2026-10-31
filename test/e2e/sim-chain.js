// Starts a local chain (ID 31611) with the Mezo simulator at the real Mezo testnet addresses,
// SettleTag v1 at its live address and a fresh SettleTag v2. Used only for local browser tests.
import fs from 'node:fs';
import path from 'node:path';
import ganache from 'ganache';
import solc from 'solc';
import { ethers } from 'ethers';
import settleTag from '../../src/artifacts/SettleTag.json' with { type: 'json' };
import deployment from '../../src/deployment.json' with { type: 'json' };
import { MEZO } from '../../src/mezo.js';

const here = import.meta.dirname;
const port = Number(process.env.SIM_PORT || 8545);
const OPERATOR_KEY = '0x' + '11'.repeat(32);
const TREASURY_KEY = '0x' + '22'.repeat(32);

function compile(sources) {
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'london', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } }
  })));
  const errors = out.errors?.filter(e => e.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return out.contracts;
}

const sim = compile({
  'MezoSim.sol': { content: fs.readFileSync(path.join(here, 'MezoSim.sol'), 'utf8') },
  'MockMUSD.sol': { content: fs.readFileSync(path.join(here, '../../contracts/MockMUSD.sol'), 'utf8') }
});
const v1Input = JSON.parse(fs.readFileSync(path.join(here, '../../verification/SettleTag-v1.input.json'), 'utf8'));
const v1 = compile(v1Input.sources)['SettleTag.sol'].SettleTag;

const server = ganache.server({
  logging: { quiet: true },
  chain: { chainId: 31611, hardfork: 'london', vmErrorsOnRPCResponse: true },
  wallet: { accounts: [OPERATOR_KEY, TREASURY_KEY].map(secretKey => ({ secretKey, balance: ethers.toQuantity(ethers.parseEther('1000')) })) }
});
await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', e => e ? reject(e) : resolve()));
const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`, undefined, { cacheTimeout: -1 });
const operator = await provider.getSigner(new ethers.Wallet(OPERATOR_KEY).address);
const setCode = (address, code) => provider.send('evm_setAccountCode', [address, code.startsWith('0x') ? code : `0x${code}`]);

const runtime = (file, name) => sim[file][name].evm.deployedBytecode.object;
await setCode(MEZO.musd, runtime('MockMUSD.sol', 'MockMUSD'));
await setCode(MEZO.troveManager, runtime('MezoSim.sol', 'MezoSimCore'));
await setCode(MEZO.borrowerOperations, runtime('MezoSim.sol', 'MezoSimBorrowerOperations'));
await setCode(MEZO.borrowerOperationsSignatures, runtime('MezoSim.sol', 'MezoSimSignatures'));
await setCode(MEZO.priceFeed, runtime('MezoSim.sol', 'MezoSimPriceFeed'));
await setCode(MEZO.hintHelpers, runtime('MezoSim.sol', 'MezoSimHints'));
await setCode(MEZO.sortedTroves, runtime('MezoSim.sol', 'MezoSimHints'));

// v1 at its live address: deploy normally (to set its MUSD immutable), then copy the runtime code.
const v1Deployed = await new ethers.ContractFactory(v1.abi, `0x${v1.evm.bytecode.object}`, operator).deploy(MEZO.musd);
await v1Deployed.waitForDeployment();
await setCode(deployment.legacy.address, await provider.getCode(await v1Deployed.getAddress()));

const treasury = new ethers.Wallet(TREASURY_KEY).address;
const v2 = await new ethers.ContractFactory(settleTag.abi, settleTag.bytecode, operator)
  .deploy(MEZO.musd, MEZO.borrowerOperationsSignatures, treasury, 50, ethers.parseUnits('5', 18));
await v2.waitForDeployment();

const info = { rpc: `http://127.0.0.1:${port}`, v2: await v2.getAddress(), legacy: deployment.legacy.address, treasury, operator: await operator.getAddress(), musd: MEZO.musd };
fs.writeFileSync(path.join(here, '.sim.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info));
