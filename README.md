# SettleTag

**MUSD invoice references with direct settlement and verifiable receipts on Mezo testnet.**

SettleTag is a Mezo testnet prototype. A merchant creates a one-time invoice onchain. A payer approves the exact MUSD amount and pays; MUSD goes directly from payer to merchant while the contract records the payer and emits an `InvoicePaid` event. The contract never holds funds.

## Status

- Contract and web client: implemented locally; the contract is deployed on Mezo testnet.
- Contract behavior: covered by local EVM tests using mock MUSD.
- Real testnet MUSD payment: **confirmed onchain**; see [testnet evidence](docs/TESTNET_EVIDENCE.md).
- Third-party audit: **not performed**. Do not use with real funds.

## Why this product

Simple transfers do not carry a stable invoice reference. Amount matching is ambiguous when multiple customers send the same amount. SettleTag binds an invoice ID to a merchant, exact amount, deadline and one-time settlement state, giving both parties the same onchain receipt. This is intended as a reusable payment reference layer for merchants and integrators, rather than a consumer wallet.

## Run locally

Requires Node.js 20+ and npm.

```sh
npm install
npm test
npm run dev
```

The app defaults to the deployed Mezo testnet contract. To point a local build at another deployment, copy `.env.example` into `.env`, change `VITE_CONTRACT_ADDRESS`, and restart Vite. Do not paste a private key into `.env` because Vite exposes variables prefixed with `VITE_` to the browser.

## Test wallet and faucet

The Wallet sheet can create a dedicated Mezo testnet EVM wallet in your browser. Enter a unique password of at least 12 characters, save the recovery phrase shown once, and download the encrypted JSON backup. The encrypted key is stored in this browser's local storage; clearing site data removes it. The password and phrase are not sent to SettleTag. You can also connect an existing browser wallet on Mezo testnet.

Copy the wallet's public address from the Wallet or Faucet sheet, then request test BTC at the [official Mezo faucet](https://faucet.test.mezo.org/). Complete its CAPTCHA yourself. The faucet also offers test MEZO; it does not dispense MUSD. To acquire test MUSD, use the [Mezo testnet borrow app](https://testnet.mezo.org/feature/borrow) with test BTC collateral and a compatible browser wallet. The embedded wallet can send test BTC and MUSD to another Mezo testnet address, with a review step before signing. No tokens are requested automatically, and the app does not claim a funded balance until the RPC confirms it.

Do not send mainnet funds to a test wallet. Do not share the password or recovery phrase.

The project also has a separate deployment wallet. Its public Mezo testnet address is `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`. Its signing key is encrypted for this Windows user in ignored local `.secrets/` files. `npm run wallet:check` verifies that the encrypted key resolves to the public address without printing the key. This deployment wallet is separate from any wallet created inside the web app. The local encrypted file is bound to this Windows account and is not a portable backup.

`npm run deploy:saved:testnet` loads the local encrypted key in process and calls the deployment script. The current contract has already been deployed; running the command again creates a new contract.

## Testnet deployment

`scripts/deploy.js` checks Mezo testnet chain ID `31611` and the official testnet MUSD token at `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`. It reads `DEPLOYER_PRIVATE_KEY` from the local shell. The saved-wallet wrapper uses the encrypted local key.

```sh
npm run deploy:testnet
```

For a fresh deployment, copy the printed contract address into `VITE_CONTRACT_ADDRESS` in a local `.env` and restart Vite. Mezo's [testnet guide](https://mezo.org/docs/developers/getting-started/) explains network setup and MUSD minting.

**Current Mezo testnet deployment:** [SettleTag contract](https://explorer.test.mezo.org/address/0x53eCBb8891Df17927d40E4FbF234a80cB82EC456). The [deployment](https://explorer.test.mezo.org/tx/0x04eceb20eac2bb22cb0503f217172bf762c9cc6c184e4e2dcaeab53b5926584c) and [1 MUSD invoice creation](https://explorer.test.mezo.org/tx/0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5) are confirmed. Invoice ID: `0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f`. The [payment transaction](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4) settled exactly 1 MUSD directly to the merchant; invoice state reads Paid. The full proof is in [testnet evidence](docs/TESTNET_EVIDENCE.md).

To obtain the test MUSD, the deployer opened a Mezo testnet borrow position using 0.04 test BTC collateral. Its initial debt was 2001.8 test MUSD (1800 borrowed MUSD, 1.8 borrowing fee, 200 gas compensation). That testnet position remains open and the collateral remains locked.

## Architecture and flow

1. Merchant generates a random `bytes32` invoice reference in the browser and calls `createInvoice(id, amount, deadline)`.
2. The share URL carries only the invoice ID. Anyone can look up terms from the contract using the Mezo testnet RPC.
3. Payer approves the exact MUSD amount to SettleTag, then calls `payInvoice(id)`.
4. SettleTag marks the invoice paid before its external token call, uses `transferFrom(payer, merchant, amount)`, and emits `InvoicePaid`. A failed transfer reverts the state change.
5. The payer, merchant, or judge can inspect the contract state and transaction in the [testnet explorer](https://explorer.test.mezo.org/).

The merchant can cancel an open invoice. An expired invoice cannot be paid. Duplicate invoice IDs and second payments are rejected. The app uses no backend, custody account, or mock chain data in its live interface.

## Limits and next milestones

- **Current milestone:** deployed contract, real 1 MUSD payment, onchain receipt, local tests, spreadsheet-inspired interface, encrypted browser test wallet, and faucet handoff.
- **Next:** browser verification and user testing with a merchant.
- **Later:** clearer invoice descriptions stored offchain with their content hash.
- This prototype is unaudited and not ready for mainnet. It does not calculate tax, fiat value, refunds, or disputes.
