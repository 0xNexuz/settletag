import { loadLocalTestWallet } from './local-test-wallet.js';
console.log(loadLocalTestWallet(process.argv[2] === 'payer' ? 'mezo-test-payer' : 'mezo-test-wallet').address);
