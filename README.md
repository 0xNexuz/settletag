# SettleTag

**MUSD invoices on Mezo that a payer can settle from their wallet, or by borrowing the MUSD against their BTC in the same transaction.**

SettleTag is a Mezo testnet product. A merchant creates a one-time invoice onchain and shares a link. The payer either pays from wallet MUSD, or signs one Mezo borrowing request and SettleTag draws the MUSD from the payer's own trove (or opens one), settles the merchant, and records a receipt. The contract does not hold funds between transactions.

**Try it:** [Open SettleTag](https://settletag.vercel.app/) · [Inspect the v2 trove-funded invoice](https://settletag.vercel.app/?invoice=0x509acee3658928085d319f7e03b50d734b0159963b57b961498720521dd830a5&contract=0x7eDcC1223154413E314DD071d6Fb0E0a42A71A17) · [See its Mezo transaction](https://explorer.test.mezo.org/tx/0x8b24fbca7a6649b95fe8c3b65cc53289bc56abb2a7a7979a02d4ba900896e3c9)

## What changed from Wave 1 to Wave 2

| | Wave 1: v1 | Wave 2: v2 |
|---|---|---|
| **Pay an invoice** | Pay with MUSD already in the wallet through ERC-20 approval and `transferFrom`. Borrowing first requires separate wallet transactions. | Sign a Mezo borrowing request; `payWithTroveDraw` draws from the payer's existing trove and settles the invoice in one transaction. `payByOpeningTrove` supports opening a trove while paying. |
| **Mezo integration in the app** | MUSD transfer and onchain receipt. | Mezo `BorrowerOperationsSignatures`, live trove health, borrowing capacity, Recovery Mode checks, and collateral and repayment controls. |
| **Merchant economics** | No settlement fee or paid plan. | 0.5% settlement fee, or 5 MUSD for 30 days of SettleTag Pro with 0% fees on new invoices. |
| **Live proof** | A wallet-funded 1 MUSD invoice settled on Mezo testnet. | A separate project test wallet created a 1 MUSD invoice; the payer settled it with a draw from an existing trove. The merchant received 0.995 MUSD and the treasury 0.005 MUSD in the same [transaction](https://explorer.test.mezo.org/tx/0x8b24fbca7a6649b95fe8c3b65cc53289bc56abb2a7a7979a02d4ba900896e3c9). |

Opening a new trove while paying, trove management transactions, and Pro purchase have been tested locally, not yet in a live testnet payment. Independent merchant and payer use has not been verified.

## Status

- **v1 contract** (`0x53eCBb8891Df17927d40E4FbF234a80cB82EC456`): deployed, source verified, with a real 1 MUSD wallet-funded settlement ([evidence](docs/TESTNET_EVIDENCE.md)).
- **v2 contract** (`0x7eDcC1223154413E314DD071d6Fb0E0a42A71A17`): deployed and source verified on Mezo testnet. A 1 MUSD invoice was paid by drawing from an existing Mezo trove in one transaction ([evidence](docs/TESTNET_EVIDENCE.md)). Opening a new trove and paying, trove management, and Pro purchase have only been tested locally.
- **Web app**: Trove sheet (health, add collateral, repay, open trove) and borrow-to-pay work with either contract. With v1, borrow-to-pay takes three wallet transactions; with v2, one signature and one transaction.
- Third-party audit: **not performed**. Testnet only; do not use with real funds.

## How SettleTag uses Mezo

| Flow | Mezo contract | What happens |
|---|---|---|
| Pay by drawing from an existing trove | `BorrowerOperationsSignatures.withdrawMUSDWithSignature` | The payer signs an EIP-712 `WithdrawMUSD` request naming SettleTag as recipient. `payWithTroveDraw` submits it, receives exactly the invoice amount, pays the merchant and the fee, and marks the invoice paid, atomically. |
| Pay by opening a trove | `BorrowerOperationsSignatures.openTroveWithSignature` | The payer attaches BTC collateral and signs an `OpenTrove` request. `payByOpeningTrove` opens the trove, settles the invoice, and returns the rest of the loan (Mezo's minimum is currently 1,800 MUSD) to the payer. |
| Trove health | `TroveManager`, `PriceFeed`, `BorrowerOperations` | Live collateral ratio, liquidation price, debt, borrowing capacity, interest rate, system TCR and Recovery Mode. |
| Manage the trove | `BorrowerOperations.addColl`, `repayMUSD`, `openTrove` | Payers strengthen their trove; merchants repay debt with MUSD that invoices bring in. |

The trove always belongs to the payer. SettleTag only offers borrow-to-pay when the trove would stay at or above 150% collateral and Mezo's system-wide ratio would too; it offers no draws in Recovery Mode, when Mezo refuses them. It reads the signing domain from Mezo before asking for a signature and simulates each transaction before sending it. Addresses and interfaces come from Mezo's own deployment records in [mezo-org/musd](https://github.com/mezo-org/musd/tree/main/solidity/artifacts/deployments/matsnet).

The existing-trove draw and settlement path has also completed one live Mezo testnet payment. The other new flows have been tested against local stand-ins that reproduce Mezo's signature scheme and zero-value BTC callback to the recipient. See the [Wave 2 technical status](docs/WAVE2.md).

## Business model

- **Settlement fee:** 0.5% of each invoice, deducted from what the merchant receives and sent to the SettleTag treasury. The rate is fixed on the invoice when it is created and capped in the contract at 1%.
- **SettleTag Pro:** merchants pay 5 MUSD per 30 days (stackable, up to 12 periods) for 0% fees on invoices created during the plan. Pro pays for itself above 1,000 MUSD of monthly invoicing.
- The contract tracks invoices, settled volume, trove-funded volume, fee and plan revenue, and distinct merchants and payers (a merchant counts once someone else pays them). The Overview sheet shows these live. They can be inflated with throwaway wallets, so adoption evidence should rest on explorer links to individual invoices.

## Why this product

Plain transfers carry no invoice reference, and matching by amount fails when two customers send the same sum. SettleTag binds an invoice ID to a merchant, exact amount, deadline and one-time settlement. It also lets a BTC holder pay a MUSD invoice without first acquiring MUSD: they borrow it from their own Mezo trove in the act of paying.

The first intended user is a small merchant or freelancer accepting MUSD, and customers who hold BTC on Mezo. This is a prototype use case; independent merchant demand has not been validated yet.

## Run locally

Requires Node.js 20+ and npm.

```sh
npm install
npm test          # contract tests (local EVM, Mezo signature mock) and app logic
npm run dev
```

Browser end-to-end run against a local Mezo simulator: see [test/e2e/README.md](test/e2e/README.md).

## Deploy and verify a contract

These commands are for a fresh deployment and will spend test BTC gas. V2 is already deployed; do not rerun the deployment command to use the existing address.

```sh
npm run deploy:saved:testnet   # deploys v2, writes src/deployment.json
npm run verify:testnet         # verifies v1 and v2 on explorer.test.mezo.org
```

`scripts/verify.js` first recompiles the source and checks it against the code on chain, then submits to the explorer API Mezo's own repositories use (`api.explorer.test.mezo.org`). `npm run verify:check` runs only the bytecode check. Optional deploy settings: `SETTLETAG_TREASURY`, `SETTLETAG_FEE_BPS` (default 50), `SETTLETAG_PRO_PRICE` (default 5 MUSD). The current v2 address and constructor arguments are in `src/deployment.json`; both versions have been verified on the explorer.

## Test wallet and faucet

The Wallet sheet can create a dedicated Mezo testnet wallet in your browser. Enter a unique password of at least 12 characters, save the recovery phrase shown once, and download the encrypted backup. The encrypted key stays in this browser's local storage; the password and phrase are never sent to SettleTag. You can also connect an existing browser wallet on Mezo testnet.

Request test BTC at the [official Mezo faucet](https://faucet.test.mezo.org/). With test BTC you can open a trove and borrow MUSD from the Trove sheet, or borrow while paying an invoice. For a small amount without a loan, swap test BTC for MUSD in [Mezo testnet](https://testnet.mezo.org/). Do not send mainnet funds to a test wallet.

The project's separate deployment wallet is `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`. Its signing key is encrypted for the project owner's Windows account in ignored `.secrets/` files; `npm run wallet:check` confirms it resolves to that address without printing the key.

## v1 testnet evidence

**Current Mezo testnet deployment:** [SettleTag v1](https://explorer.test.mezo.org/address/0x53eCBb8891Df17927d40E4FbF234a80cB82EC456). The [deployment](https://explorer.test.mezo.org/tx/0x04eceb20eac2bb22cb0503f217172bf762c9cc6c184e4e2dcaeab53b5926584c) and [1 MUSD invoice creation](https://explorer.test.mezo.org/tx/0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5) are confirmed. The [payment transaction](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4) settled exactly 1 MUSD directly to the merchant. To obtain that test MUSD, the deployer opened a Mezo trove with 0.04 test BTC collateral (initial debt 2001.8 MUSD), which remains open. Full proof: [testnet evidence](docs/TESTNET_EVIDENCE.md).

## Limits

- Unaudited and testnet only. No tax, fiat value, refunds or disputes.
- Invoice IDs in v2 are derived from the merchant and a random salt, and share links name the contract, so a copied ID on another contract cannot redirect a payer. Invoices expire within 90 days.
- Anyone who sees a payer's signed Mezo request before it is used can submit it straight to Mezo instead of through SettleTag. The borrowed MUSD then lands in the SettleTag contract and the payment does not complete; the payer keeps the debt, and the owner can return that MUSD with `returnStrandedMUSD`. Signatures expire after 20 minutes.
- Fees and the Pro plan are owner-configurable within the contract's caps.
