import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');

// Mezo's developer guide uses solc 0.8.28, optimizer 200 runs, and the london EVM target.
// Deployment, local tests and explorer verification all build from these settings.
export const SETTINGS = { optimizer: { enabled: true, runs: 200 }, evmVersion: 'london' };

export function standardInput(files, outputSelection = { '*': { '*': ['abi', 'evm.bytecode.object'] } }) {
  return {
    language: 'Solidity',
    sources: Object.fromEntries(files.map(name => [name, {
      content: fs.readFileSync(path.join(root, 'contracts', name), 'utf8')
    }])),
    settings: { ...SETTINGS, outputSelection }
  };
}
