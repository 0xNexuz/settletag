import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestWallet, unlockTestWallet, savedWalletAddress, encryptedWalletBackup } from '../src/wallet.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('creates an encrypted wallet that unlocks with the password', async () => {
  const storage = memoryStorage();
  const { wallet, recoveryPhrase } = await createTestWallet('correct horse battery staple', storage);
  assert.equal(recoveryPhrase.split(' ').length, 12);
  assert.equal(savedWalletAddress(storage), wallet.address);
  assert.ok(!encryptedWalletBackup(storage).includes(recoveryPhrase));
  assert.equal((await unlockTestWallet('correct horse battery staple', storage)).address, wallet.address);
  await assert.rejects(unlockTestWallet('wrong password', storage));
  await assert.rejects(createTestWallet('another long password', storage));
});

test('rejects a short password before creating a wallet', async () => {
  const storage = memoryStorage();
  await assert.rejects(createTestWallet('short', storage));
  assert.equal(savedWalletAddress(storage), null);
});
