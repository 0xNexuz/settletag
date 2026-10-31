// Verifies SettleTag source on the Mezo testnet explorer (Blockscout, Etherscan-compatible API).
// Usage: node --use-system-ca scripts/verify.js [v1|v2|all] [--dry-run]
// Before submitting, it recompiles the source and checks it against the bytecode deployed on chain.
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';
import deployment from '../src/deployment.json' with { type: 'json' };
import { MEZO } from '../src/mezo.js';
import { root, standardInput } from './solc-input.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
// Same verification endpoint Mezo's own MUSD repository configures for chain 31611.
const API = process.env.MEZO_EXPLORER_API || 'https://api.explorer.test.mezo.org/api';
const EXPLORER = 'https://explorer.test.mezo.org';
const RPC = process.env.MEZO_RPC || 'https://rpc.test.mezo.org';
const COMPILER = 'v0.8.28+commit.7893614a';
const which = process.argv.find(a => ['v1', 'v2', 'all'].includes(a)) || 'all';
const dryRun = process.argv.includes('--dry-run');

if (!solc.version().startsWith(COMPILER.slice(1))) throw new Error(`Expected solc ${COMPILER}, found ${solc.version()}`);
const provider = new ethers.JsonRpcProvider(RPC);
if ((await provider.getNetwork()).chainId !== MEZO.chainId) throw new Error('RPC is not Mezo testnet (31611).');

function compile(input) {
  const withRefs = { ...input, settings: { ...input.settings, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(withRefs)));
  const errors = out.errors?.filter(e => e.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return out.contracts['SettleTag.sol'].SettleTag;
}

/** Runtime bytecode with immutable slots blanked, so compiled and deployed code can be compared. */
function masked(hex, refs) {
  const bytes = ethers.getBytes(hex);
  for (const ranges of Object.values(refs ?? {})) for (const { start, length } of ranges) bytes.fill(0, start, start + length);
  return ethers.hexlify(bytes);
}

async function explorer(params, method = 'GET') {
  const body = new URLSearchParams({ apikey: 'empty', ...params });
  const res = method === 'GET' ? await fetch(`${API}?${body}`) : await fetch(API, { method, body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`Explorer API HTTP ${res.status}`);
  return res.json();
}

async function verify({ label, address, input, args }) {
  if (!ethers.isAddress(address)) { console.log(`${label}: no deployment recorded, skipped.`); return; }
  const artifact = compile(input);
  const onchain = await provider.getCode(address);
  if (onchain === '0x') throw new Error(`${label}: no code at ${address}`);
  const refs = artifact.evm.deployedBytecode.immutableReferences;
  if (masked(onchain, refs) !== masked(`0x${artifact.evm.deployedBytecode.object}`, refs)) {
    throw new Error(`${label}: compiled source does not match the code at ${address}. Check the source and compiler settings.`);
  }
  const constructorArguments = ethers.AbiCoder.defaultAbiCoder().encode(args.types, args.values).slice(2);
  console.log(`${label}: source matches on-chain bytecode at ${address} (${(onchain.length - 2) / 2} bytes).`);
  if (dryRun) { console.log(`${label}: dry run, not submitted. Constructor args: 0x${constructorArguments}`); return; }

  const existing = await explorer({ module: 'contract', action: 'getsourcecode', address });
  if (existing.result?.[0]?.SourceCode) { console.log(`${label}: already verified → ${EXPLORER}/address/${address}?tab=contract`); return; }
  const submitted = await explorer({
    module: 'contract', action: 'verifysourcecode', contractaddress: address,
    sourceCode: JSON.stringify(input), codeformat: 'solidity-standard-json-input',
    contractname: 'SettleTag.sol:SettleTag', compilerversion: COMPILER,
    // Etherscan's misspelled key plus the spelling Blockscout reads, as Foundry sends for Blockscout.
    constructorArguements: constructorArguments, constructorArguments, licenseType: '3'
  }, 'POST');
  if (submitted.status !== '1') throw new Error(`${label}: explorer rejected submission: ${submitted.result || submitted.message}`);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const status = await explorer({ module: 'contract', action: 'checkverifystatus', guid: submitted.result });
    if (/pass/i.test(status.result) || /already verified/i.test(status.result)) { console.log(`${label}: verified → ${EXPLORER}/address/${address}?tab=contract`); return; }
    if (!/pending|queue|in progress/i.test(status.result)) throw new Error(`${label}: verification failed: ${status.result}`);
  }
  throw new Error(`${label}: verification still pending; check ${EXPLORER}/address/${address}`);
}

const jobs = [];
if (which !== 'v2') {
  const input = JSON.parse(fs.readFileSync(path.join(root, 'verification', 'SettleTag-v1.input.json'), 'utf8'));
  jobs.push({ label: 'SettleTag v1', address: deployment.legacy.address, input, args: { types: ['address'], values: [MEZO.musd] } });
}
if (which !== 'v1') {
  const address = process.env.SETTLETAG_V2 || deployment.settleTag?.address;
  let c = deployment.settleTag?.constructorArgs;
  if (!c && ethers.isAddress(address)) {
    // No deployment record (e.g. a local check): read the values back from the contract.
    const live = new ethers.Contract(address, ['function musd() view returns (address)', 'function borrowerOperationsSignatures() view returns (address)', 'function treasury() view returns (address)', 'function feeBps() view returns (uint16)', 'function proPlanPrice() view returns (uint128)'], provider);
    c = { musd: await live.musd(), borrowerOperationsSignatures: await live.borrowerOperationsSignatures(), treasury: await live.treasury(), feeBps: await live.feeBps(), proPlanPrice: await live.proPlanPrice() };
    console.log('SettleTag v2: no deployment record; constructor arguments read from current contract state.');
  }
  jobs.push({
    label: 'SettleTag v2', address, input: standardInput(['SettleTag.sol']),
    args: { types: ['address', 'address', 'address', 'uint16', 'uint128'], values: c ? [c.musd, c.borrowerOperationsSignatures, c.treasury, c.feeBps, c.proPlanPrice] : [] }
  });
}
for (const job of jobs) await verify(job);
