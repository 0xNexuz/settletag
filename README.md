# SettleTag

**MUSD invoice references with direct settlement and verifiable receipts on Mezo testnet.**

SettleTag is a Track 2 (access and distribution) prototype for the October–November 2026 Mezo Buildathon. A merchant creates a one-time invoice onchain. A payer approves the exact MUSD amount and pays; MUSD goes directly from payer to merchant while the contract records the payer and emits an `InvoicePaid` event. The contract never holds funds.

## Status

- Contract and web client: implemented locally.
- Contract behavior: covered by local EVM tests using mock MUSD.
- Mezo testnet deployment and real MUSD payment: **not yet performed**.
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

The interface opens locally, but live invoice actions need a deployed contract. Set `VITE_CONTRACT_ADDRESS` in `.env` to an authorized Mezo testnet deployment address, then restart Vite. Do not paste a private key into `.env` because Vite exposes variables prefixed with `VITE_` to the browser.

## Testnet deployment (requires separate authorization and a testnet wallet)

`scripts/deploy.js` checks Mezo testnet chain ID `31611` and the official testnet MUSD token at `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`. It reads `DEPLOYER_PRIVATE_KEY` from the local shell and never writes it to a file. Do not run deployment until authorized.

```sh
npm run deploy:testnet
```

After deployment, copy the printed contract address into `VITE_CONTRACT_ADDRESS` in a local `.env`, run `npm run dev`, and fund a payer wallet with testnet MUSD. Mezo's [testnet guide](https://mezo.org/docs/developers/getting-started/) explains network setup and MUSD minting.

## Architecture and flow

1. Merchant generates a random `bytes32` invoice reference in the browser and calls `createInvoice(id, amount, deadline)`.
2. The share URL carries only the invoice ID. Anyone can look up terms from the contract using the Mezo testnet RPC.
3. Payer approves the exact MUSD amount to SettleTag, then calls `payInvoice(id)`.
4. SettleTag marks the invoice paid before its external token call, uses `transferFrom(payer, merchant, amount)`, and emits `InvoicePaid`. A failed transfer reverts the state change.
5. The payer, merchant, or judge can inspect the contract state and transaction in the [testnet explorer](https://explorer.test.mezo.org/).

The merchant can cancel an open invoice. An expired invoice cannot be paid. Duplicate invoice IDs and second payments are rejected. The app uses no backend, custody account, or mock chain data in its live interface.

## Limits and next milestones

- **Current milestone:** local contract, tests, and wallet interface.
- **Next:** authorized testnet deployment, real MUSD funding and payment, explorer receipt, and end-to-end browser verification.
- **Then:** user testing with a merchant, clearer invoice descriptions stored offchain with their content hash, and submission materials (deck, two-minute video, public repo).
- This prototype is unaudited and not ready for mainnet. It does not calculate tax, fiat value, refunds, or disputes.

## Buildathon evidence

The [AKINDO Mezo Buildathon](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10) requires MUSD or MEZO integration, a working supported-chain deployment, public GitHub repository, deck and two-minute pitch video. The current local milestone does **not** meet all submission requirements yet.
