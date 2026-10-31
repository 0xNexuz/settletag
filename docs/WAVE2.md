# Wave 2 technical status

SettleTag v2 adds an atomic path from a payer's Mezo BTC-backed trove to an invoice settlement. The payer signs a `WithdrawMUSD` request for Mezo's `BorrowerOperationsSignatures`; SettleTag submits it, forwards the borrowed MUSD to the merchant and treasury, and records the paid invoice in one transaction. The payer keeps ownership of the trove.

## Implemented

| Area | Behavior |
|---|---|
| Trove-funded payment | Draw from an existing trove or open one and settle an invoice through the v2 contract. The legacy v1 path requires three transactions. |
| Trove view | Live collateral, debt, collateral ratio, liquidation price, borrowing capacity, interest rate, system TCR, and Recovery Mode. |
| Trove management | Open a trove, add BTC collateral, and repay MUSD through the app. |
| Settlement terms | 0.5% fee fixed at invoice creation, capped at 1% by the contract; Pro costs 5 MUSD per 30 days and waives fees for invoices created while active. |
| Onchain ledger | Counts invoices, payments, volume, fees, and trove-funded settlements. These counters do not prove independent adoption. |

## Verification

- V1 and v2 source are verified on the [Mezo testnet explorer](https://explorer.test.mezo.org/). The verification script recompiles each source and checks it against the deployed code before publishing the source.
- Local EVM and app tests passed. The browser end-to-end suite passed against a local Mezo simulator; it does not substitute for live protocol proof.
- A distinct test merchant issued a 1 MUSD v2 invoice. The existing test borrower signed a Mezo trove draw and paid it atomically on testnet. The [transaction and state evidence](TESTNET_EVIDENCE.md) records the merchant amount, fee, events, and debt change.

The open-and-pay path, collateral additions, repayments, and Pro purchase have been exercised locally but not yet in a live browser on Mezo testnet. The contracts are unaudited. The existing test borrow position remains open. Independent merchant and payer use has not yet been established.
