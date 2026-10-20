import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ethers } from 'ethers';

const dir = join(process.cwd(), '.secrets');
const keyFile = join(dir, 'mezo-test-wallet.dpapi');
const addressFile = join(dir, 'mezo-test-wallet.address');
if (existsSync(keyFile) || existsSync(addressFile)) {
  throw new Error('A local test wallet already exists. Refusing to overwrite it.');
}
const wallet = ethers.Wallet.createRandom();
const encrypted = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  '$plain=[Console]::In.ReadToEnd().Trim(); $secure=ConvertTo-SecureString $plain -AsPlainText -Force; ConvertFrom-SecureString $secure'
], {
  input: wallet.privateKey, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules' }
});
if (encrypted.status !== 0 || !/^[0-9a-f]+$/i.test(encrypted.stdout.trim())) {
  throw new Error('Windows user encryption failed. Wallet was not saved.');
}
mkdirSync(dir, { recursive: true });
writeFileSync(keyFile, encrypted.stdout.trim() + '\n', { flag: 'wx', mode: 0o600 });
writeFileSync(addressFile, wallet.address + '\n', { flag: 'wx' });
console.log(wallet.address);
