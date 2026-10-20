import { ethers } from 'ethers';

export const WALLET_STORAGE_KEY = 'settletag.mezo-testnet.wallet.v1';

export function savedWalletAddress(storage = localStorage) {
  const encrypted = storage.getItem(WALLET_STORAGE_KEY);
  if (!encrypted) return null;
  try { return ethers.getAddress(JSON.parse(encrypted).address); }
  catch { return null; }
}

export async function createTestWallet(password, storage = localStorage) {
  if (storage.getItem(WALLET_STORAGE_KEY)) throw new Error('A local test wallet already exists. Unlock it instead.');
  if (typeof password !== 'string' || password.length < 12) throw new Error('Use a wallet password of at least 12 characters.');
  const wallet = ethers.Wallet.createRandom();
  const recoveryPhrase = wallet.mnemonic?.phrase;
  if (!recoveryPhrase) throw new Error('Wallet recovery phrase was not generated.');
  const encrypted = await wallet.encrypt(password);
  storage.setItem(WALLET_STORAGE_KEY, encrypted);
  return { wallet, recoveryPhrase };
}

export async function unlockTestWallet(password, storage = localStorage) {
  const encrypted = storage.getItem(WALLET_STORAGE_KEY);
  if (!encrypted) throw new Error('No local test wallet found. Create one first.');
  return ethers.Wallet.fromEncryptedJson(encrypted, password);
}

export function encryptedWalletBackup(storage = localStorage) {
  const encrypted = storage.getItem(WALLET_STORAGE_KEY);
  if (!encrypted) throw new Error('No local test wallet found.');
  return encrypted;
}
