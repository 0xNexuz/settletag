import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { root, standardInput } from './solc-input.js';

const input = standardInput(['SettleTag.sol', 'MockMUSD.sol', 'MockBorrowerOperationsSignatures.sol']);
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
