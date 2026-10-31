# SettleTag

**MUSD invoices on Mezo that a payer can settle from their wallet, or by borrowing the MUSD against their BTC in the same transaction.**

SettleTag is a Mezo testnet product. A merchant creates a one-time invoice onchain and shares a link. The payer either pays from wallet MUSD, or signs one Mezo borrowing request and SettleTag draws the MUSD from the payer's own trove (or opens one), settles the merchant, and records a receipt. The contract never keeps funds.

**Try it:** [Open SettleTag](https://settletag.vercel.app/) · [Inspect a paid 1 MUSD invoice](https://settletag.vercel.app/?invoice=0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f) · [See the payment on Mezo testnet](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4)

## Status

- **v1 contract** (`0x53eCBb8891Df17927d40E4FbF234a80cB82EC456`): deployed on Mezo testnet; a real 1 MUSD invoice settled onchain ([evidence](docs/TESTNET_EVIDENCE.md)). Its exact source and compiler input are in `verification/`, ready for explorer verification.
- **v2 contract** (`contracts/SettleTag.sol`): trove-funded settlement, settlement fee and Pro merchant plan. Passes local tests against a Mezo signature mock and a browser end-to-end run against a local Mezo simulator. **Not yet deployed to Mezo testnet.** The app switches to v2 automatically once `src/deployment.json` holds its address.
- **Web app**: Trove sheet (health, add collateral, repay, open trove) and borrow-to-pay work with either contract. With v1, borrow-to-pay takes three wallet transactions; with v2, one signature and one transaction.
- Third-party audit: **not performed**. Testnet only; do not use with real funds.

## How SettleTag uses Mezo

| Flow | Mezo contract | What happens |
|---|---|---|
| Pay by drawing from an existing trove | `BorrowerOperationsSignatures.withdrawMUSDWithSignature` | The payer signs an EIP-712 `WithdrawMUSD` request naming SettleTag as recipient. `payWithTroveDraw` submits it, receives exactly the invoice amount, pays the merchant and the fee, and marks the invoice paid, atomically. |
| Pay by opening a trove | `BorrowerOperationsSignatures.openTroveWithSignature` | The payer attaches BTC collateral and signs an `OpenTrove` request. `payByOpeningTrove` opens the trove, settles the invoice, and returns the rest of the loan (Mezo's minimum is 1,800 MUSD) to the payer. |
| Trove health | `TroveManager`, `PriceFeed`, `BorrowerOperations` | Live collateral ratio, liquidation price, debt, borrowing capacity, interest rate, system TCR and Recovery Mode. |
| Manage the trove | `BorrowerOperations.addColl`, `repayMUSD`, `openTrove` | Payers strengthen their trove; merchants repay debt with MUSD that invoices bring in. |

The trove always belongs to the payer. SettleTag only offers borrow-to-pay when the trove would stay at or above 150% collateral, the level Mezo itself enforces in Recovery Mode, and it simulates every Mezo call before asking for a signature. Addresses come from Mezo's own deployment records in [mezo-org/musd](https://github.com/mezo-org/musd/tree/main/solidity/artifacts/deployments/matsnet).

## Business model

- **Settlement fee:** 0.5% of each invoice, deducted from what the merchant receives and sent to the SettleTag treasury. The rate is fixed on the invoice when it is created and capped in the contract at 1%.
- **SettleTag Pro:** merchants pay 5 MUSD per 30 days (stackable, up to 12 periods) for 0% fees on invoices created during the plan. Pro pays for itself above 1,000 MUSD of monthly invoicing.
- The contract tracks invoices, settled volume, trove-funded volume, fee and plan revenue, and distinct merchants and payers. The Overview sheet shows these live, so adoption claims can be checked onchain.

## Why this product

Plain transfers carry no invoice reference, and matching by amount fails when two customers send the same sum. SettleTag binds an invoice ID to a merchant, exact amount, deadline and one-time settlement. It also lets a BTC holder pay a MUSD invoice without first acquiring MUSD: they borrow it from their own Mezo trove in the act of paying.

The first intended user is a small merchant or freelancer accepting MUSD, and customers who hold BTC on Mezo. This is a prototype use case; merchant demand has not been validated yet (see [Wave 2 notes](docs/WAVE2.md)).

## Run locally

Requires Node.js 20+ and npm.

```sh
npm install
npm test          # contract tests (local EVM, Mezo signature mock) and app logic
npm run dev
```

Browser end-to-end run against a local Mezo simulator: see [test/e2e/README.md](test/e2e/README.md).

## Deploy and verify v2

These steps sign transactions on Mezo testnet with the project's deployment wallet; run them on the machine that holds it.

```sh
npm run deploy:saved:testnet   # deploys v2, writes src/deployment.json
npm run verify:testnet         # verifies v1 and v2 on explorer.test.mezo.org
```

`scripts/verify.js` first recompiles the source and checks it against the code on chain, then submits to the explorer API Mezo's own repositories use (`api.explorer.test.mezo.org`). `npm run verify:check` runs only the bytecode check. Optional deploy settings: `SETTLETAG_TREASURY`, `SETTLETAG_FEE_BPS` (default 50), `SETTLETAG_PRO_PRICE` (default 5 MUSD). Commit the updated `src/deployment.json` and redeploy the web app.

## Test wallet and faucet

The Wallet sheet can create a dedicated Mezo testnet wallet in your browser. Enter a unique password of at least 12 characters, save the recovery phrase shown once, and download the encrypted backup. The encrypted key stays in this browser's local storage; the password and phrase are never sent to SettleTag. You can also connect an existing browser wallet on Mezo testnet.

Request test BTC at the [official Mezo faucet](https://faucet.test.mezo.org/). With test BTC you can open a trove and borrow MUSD from the Trove sheet, or borrow while paying an invoice. For a small amount without a loan, swap test BTC for MUSD in [Mezo testnet](https://testnet.mezo.org/). Do not send mainnet funds to a test wallet.

The project's separate deployment wallet is `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`. Its signing key is encrypted for the project owner's Windows account in ignored `.secrets/` files; `npm run wallet:check` confirms it resolves to that address without printing the key.

## v1 testnet evidence

**Current Mezo testnet deployment:** [SettleTag v1](https://explorer.test.mezo.org/address/0x53eCBb8891Df17927d40E4FbF234a80cB82EC456). The [deployment](https://explorer.test.mezo.org/tx/0x04eceb20eac2bb22cb0503f217172bf762c9cc6c184e4e2dcaeab53b5926584c) and [1 MUSD invoice creation](https://explorer.test.mezo.org/tx/0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5) are confirmed. The [payment transaction](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4) settled exactly 1 MUSD directly to the merchant. To obtain that test MUSD, the deployer opened a Mezo trove with 0.04 test BTC collateral (initial debt 2001.8 MUSD), which remains open. Full proof: [testnet evidence](docs/TESTNET_EVIDENCE.md).

## Limits

- Unaudited and testnet only. No tax, fiat value, refunds or disputes.
- If someone submits a payer's signed Mezo request straight to Mezo instead of through SettleTag, the borrowed MUSD lands in the SettleTag contract and the payment does not complete. The payer keeps the debt; the owner can return that MUSD with `returnStrandedMUSD`. Signatures expire after 20 minutes.
- Fees and the Pro plan are owner-configurable within the contract's caps.
