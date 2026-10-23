import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestWallet, unlockTestWallet, savedWalletAddress, encryptedWalletBackup, assertSignerMatches } from '../src/wallet.js';

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

test('blocks signing after chain or browser account changes', async () => {
  const address = '0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c';
  let chain = '0x7b7b';
  let accounts = [address];
  const signer = {
    getAddress: async () => address,
    provider: { send: async method => method === 'eth_chainId' ? chain : accounts }
  };
  assert.equal(await assertSignerMatches(signer, address, 31611n, true), signer);
  chain = '0x1';
  await assert.rejects(assertSignerMatches(signer, address, 31611n, true), /Mezo testnet/);
  chain = '0x7b7b';
  accounts = [];
  await assert.rejects(assertSignerMatches(signer, address, 31611n, true), /account changed/);
  accounts = ['0x4aB359d5459E62D6a7912C5709c83d9E77255621', address];
  await assert.rejects(assertSignerMatches(signer, address, 31611n, true), /account changed/);
  accounts = [address];
  await assert.rejects(assertSignerMatches(signer, '0x4aB359d5459E62D6a7912C5709c83d9E77255621', 31611n, true), /active wallet changed/);
});
