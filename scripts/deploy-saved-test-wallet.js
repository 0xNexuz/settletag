import { loadLocalTestWallet } from './local-test-wallet.js';

process.env.DEPLOYER_PRIVATE_KEY = loadLocalTestWallet().privateKey;
try {
  await import('./deploy.js');
} finally {
  delete process.env.DEPLOYER_PRIVATE_KEY;
}
