import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ethers } from 'ethers';

export function loadLocalTestWallet() {
  const dir = join(process.cwd(), '.secrets');
  const encrypted = readFileSync(join(dir, 'mezo-test-wallet.dpapi'), 'utf8').trim();
  const expected = readFileSync(join(dir, 'mezo-test-wallet.address'), 'utf8').trim();
  const decrypted = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    '$secure=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }'
  ], {
    input: encrypted, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules' }
  });
  if (decrypted.status !== 0) throw new Error('Unable to unlock the local wallet for this Windows user.');
  const wallet = new ethers.Wallet(decrypted.stdout.trim());
  if (wallet.address !== ethers.getAddress(expected)) throw new Error('Encrypted wallet does not match its saved address.');
  return wallet;
}
