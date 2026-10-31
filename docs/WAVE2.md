# Wave 2: response to Wave 1 feedback

Wave 1 feedback (civ_defi_mezo, 2026-10-30): SettleTag used MUSD only through ERC-20 `transferFrom`, so it sat at integration level 2. Suggested: Mezo-specific behaviour in the live product (borrow MUSD against BTC through BorrowerOperations to fund an invoice, or show trove health) inside the app flow, a verified contract, real third-party merchants and payers, and a stated business model.

## What changed

| Feedback | Change | Where |
|---|---|---|
| Borrow MUSD against BTC through BorrowerOperations to fund an invoice, in the app | Payers can pay an invoice by drawing MUSD from their trove or by opening one. With v2 this is one EIP-712 signature to Mezo's `BorrowerOperationsSignatures` plus one SettleTag transaction that borrows, settles and records the receipt atomically. With v1 the app calls `BorrowerOperations.withdrawMUSD` or `openTrove`, then approves and pays. Tested against local stand-ins for Mezo only. | `contracts/SettleTag.sol` (`payWithTroveDraw`, `payByOpeningTrove`), Invoices sheet option B |
| Show trove health | Trove sheet: collateral ratio with 110% / 150% / 200% bands, liquidation price, BTC price, collateral, debt, remaining borrowing capacity, interest rate, system TCR and Recovery Mode. The borrow preview shows the ratio and liquidation price before and after. | Trove sheet, `src/mezo.js` |
| "Not just in your operator script" | Opening a trove, adding collateral and repaying debt now happen in the app through `BorrowerOperations` (exercised against the local simulator). The operator script is no longer needed to source MUSD. | Trove sheet |
| Verify the contract on the Mezo explorer | `scripts/verify.js` checks the source against on-chain bytecode, then submits standard-JSON verification to `api.explorer.test.mezo.org` for v1 and v2. The v1 input reproduces the deployment artifact and the recorded 1964-byte code size. Not yet submitted: the explorer was unreachable from the build environment. | `npm run verify:testnet`, `verification/` |
| Stated business model | 0.5% settlement fee (contract cap 1%), fixed per invoice; SettleTag Pro at 5 MUSD per 30 days for 0% fees. Fee and plan revenue are tracked onchain. | Contract, Invoices sheet, Overview ledger |
| Real third-party merchants and payers | Distinct merchants, payers, invoices, volume and trove-funded volume are counted onchain and shown on the Overview sheet. Self-payment is rejected and merchants count only once someone else pays them, but throwaway wallets can still inflate the numbers, so evidence should be explorer links per pilot invoice. Recruiting merchants is a team task (below). | Overview ledger |

## Still to do before submitting

1. Deploy v2 from the deployment wallet: `npm run deploy:saved:testnet`. This writes the address to `src/deployment.json`.
2. Verify both contracts: `npm run verify:testnet`. Confirm the explorer shows the source.
3. Commit `src/deployment.json` and redeploy the web app.
4. Run one trove-funded payment on testnet with two separate wallets (draw from an existing trove; optionally also open-and-pay) and record the transactions in `docs/TESTNET_EVIDENCE.md`. Local tests use stand-ins for Mezo; only a live payment proves the signature path against Mezo's real contracts.
5. Recruit merchants and payers (below).

## Merchant pilot

Goal: at least five merchants not on the team, each issuing an invoice that a different person pays, with at least two paid by borrowing against BTC.

- **Who:** freelancers and small sellers already in Bitcoin or Mezo communities (Mezo Discord and builder channels, local Bitcoin meetups, crypto freelancers who bill clients).
- **Ask:** "Bill one real or test job through SettleTag on Mezo testnet; we will walk your customer through paying."
- **Setup per merchant:** a SettleTag wallet, test BTC from the faucet, one invoice link sent to their customer.
- **Measure:** the Overview ledger (merchants, payers, trove-funded invoices), plus three questions afterwards: did the invoice reference help reconciliation, would they pay 0.5% or 5 MUSD a month, and what was confusing.
- **Evidence for judges:** explorer links to each pilot invoice, the ledger counts, and short written feedback. Count only merchants and payers outside the team.
