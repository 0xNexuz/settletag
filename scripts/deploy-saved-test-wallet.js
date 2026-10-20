import { loadLocalTestWallet } from './local-test-wallet.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
process.env.DEPLOYER_PRIVATE_KEY = loadLocalTestWallet().privateKey;
try {
  await import('./deploy.js');
} finally {
  delete process.env.DEPLOYER_PRIVATE_KEY;
}
