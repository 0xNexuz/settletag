import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root = path.resolve(import.meta.dirname, '..');
const sources = Object.fromEntries(
  ['SettleTag.sol', 'MockMUSD.sol'].map((name) => [name, {
    content: fs.readFileSync(path.join(root, 'contracts', name), 'utf8')
  }])
);
const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'london',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};
const result = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = result.errors?.filter((item) => item.severity === 'error') ?? [];
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}
const outDir = path.join(root, 'src', 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
for (const [source, contracts] of Object.entries(result.contracts)) {
  for (const [name, artifact] of Object.entries(contracts)) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({
      source,
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`
    }, null, 2));
  }
}
console.log(`Compiled ${Object.values(result.contracts).flatMap(Object.keys).join(', ')}`);
