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

export async function assertSignerMatches(signer, expectedAddress, expectedChain, browserWallet = false) {
  if (!signer) throw new Error('Create, unlock, or connect a wallet first.');
  const chain = BigInt(await signer.provider.send('eth_chainId', []));
  if (chain !== expectedChain) throw new Error('Switch your wallet to Mezo testnet before signing.');
  const activeAddress = await signer.getAddress();
  if (!expectedAddress || activeAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('The active wallet changed. Reconnect it and review the transaction again.');
  }
  if (browserWallet) {
    const accounts = await signer.provider.send('eth_accounts', []);
    if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== activeAddress.toLowerCase()) {
      throw new Error('The browser wallet account changed. Reconnect it and review the transaction again.');
    }
  }
  return signer;
}
