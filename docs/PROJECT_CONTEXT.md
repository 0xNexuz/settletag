# Project Context

## Project Identity

- **Name:** SettleTag
- **Location:** `outputs/settletag` in this task workspace
- **Purpose:** One-time MUSD invoices with direct merchant settlement and onchain receipts.
- **Current stage:** WAVE 2 BUILD (v2 contract and Mezo-native app flows implemented; v2 not yet deployed)
- **Status:** v1 remains live on Mezo testnet. v2 adds trove-funded settlement through Mezo `BorrowerOperationsSignatures`, a settlement fee and Pro plan, and onchain adoption counters. The app gained a Trove sheet and borrow-to-pay that work with v1 now and switch to v2 once deployed. Verified locally only (unit tests and a browser run against a local Mezo simulator); no v2 testnet transaction yet.
- **Last updated:** 2026-10-31

## Git State

- **Branch:** `master` (local repository).
- **HEAD:** Local live-testnet milestone committed; check `git log -1` for the current hash.
- **Working tree:** Recheck on continuation. Local secrets and `.env.local` are ignored.
- **Remote:** Public GitHub repository `https://github.com/0xNexuz/settletag`; `master` pushed at commit `afa9336` for the logo and funding release.
- **Web:** Vercel project `xreyys-projects/settletag`; production alias `https://settletag.vercel.app`, deployment `dpl_HfkV5EC8uccz5pQVPjoZLZGYcKHH` Ready at release check.
- **Last verified milestone:** Public Vercel build succeeded. The production alias returned HTTP 200 with the app HTML, JS, CSS, and pixel artwork; the bundle contains the deployed contract and MUSD addresses. The Mezo RPC returned chain ID 31611 and `Access-Control-Allow-Origin: *` for the production origin. The public paid-invoice URL subsequently loaded in the in-app browser and showed Paid, 1.0 MUSD, and the expected merchant and payer. Wallet and Faucet navigation also worked. Invoice and wallet screens were visually checked at 390 px width with no horizontal page overflow. New merchant signing flow remains unverified.

## Approved Scope and Decisions

- User explicitly authorized beginning a build without an existing idea or repository.
- Selected a narrow invoice reference and settlement product after comparing the event requirements and prior Mezo winners.
- Use Mezo testnet chain ID 31611 and official testnet MUSD address `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, from [Mezo documentation](https://mezo.org/docs/users/resources/contracts-reference).
- No custody: the contract uses `transferFrom(payer, merchant, amount)` and records a one-time receipt.
- Local mock-token testing preceded external deployment.
- User requested the frontend combine a pixel-art statue and Excel-like spreadsheet reference, with SettleTag copy, plus a test-token wallet and official faucet path.
- User authorized creating a wallet, sharing its public address for faucet funding, and deploying the contract after confirming it was funded. Deployment completed.
- User explicitly authorized using the funded test BTC to borrow MUSD for the payment test. A 0.04 test BTC collateral position was opened, 1800 test MUSD was minted, and a separate payer received 1 MUSD and 0.002 test BTC for gas. The 1 MUSD invoice was paid.
- User authorized publishing the tested project to GitHub and Vercel. Public repository content should stay focused on the product, implementation, and technical evidence.
- 2026-10-31: Team shared Mezo Wave 1 judge feedback (integration level 2: plain `transferFrom`) and asked for it to be fixed in this repository: Mezo-specific borrowing or trove health inside the app, explorer verification, third-party usage, and a business model. Pushing to the repository is authorized by that request; deploying, verifying on the explorer and spending testnet funds remain with the team's deployment wallet.
- User requested an easier way to obtain test MUSD and another production readiness check. The supported small-amount path is Mezo Swap using faucet test BTC; borrowing remains available for users who want a loan position. The embedded SettleTag wallet cannot connect to Mezo Swap directly.

## Progress

- **Verified locally:** 2 local EVM tests passed with mock MUSD, 2 encrypted-wallet tests passed, Vite production build passed. Dedicated deployment wallet's Windows user-encrypted key unlocks to `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`.
- **Verified live:** 0.05 test BTC reached deployer by block 16263757. SettleTag deployed at `0x53eCBb8891Df17927d40E4FbF234a80cB82EC456` in block 16263763; 1964 bytes of code found and `musd()` equals official testnet MUSD. A 1 MUSD invoice was created in block 16263784. The deployer borrowed 1800 test MUSD against 0.04 test BTC collateral, then sent 1 MUSD and 0.002 test BTC to a distinct payer. The payer approved and paid the invoice in block 16266460. Invoice state is Paid; merchant balance increased by exactly 1 MUSD; `InvoicePaid` and MUSD `Transfer` logs match the transaction.
- **Implemented, unverified live:** Browser wallet create/unlock/send flow and browser payment interaction have not been exercised in the UI.
- **Pending:** Merchant user testing. The Mezo testnet borrow position remains open with 0.04 test BTC collateral locked and an initial 2001.8 test MUSD debt.
- **Release hardening in progress:** The funding sheet now presents a small BTC-to-MUSD swap before the 1800 MUSD minimum borrow option. Signer chain/account matching is checked before create, send, approval, and payment actions; browser wallet account or chain changes clear its active signer. Response security headers are configured. No in-app swap transaction is claimed: the Mezo testnet pool had liquidity and a router quote succeeded, but a direct router swap static call reverted, so the app links to Mezo Swap instead.
- **Wave 2 (local, unverified on testnet):** `contracts/SettleTag.sol` v2 adds `payWithTroveDraw` (Mezo `withdrawMUSDWithSignature`) and `payByOpeningTrove` (Mezo `openTroveWithSignature`, loan remainder refunded to payer), a 0.5% fee fixed per invoice (cap 1%), SettleTag Pro (5 MUSD per 30 days, 0% fee), self-payment rejection, `stats()` counters, and owner `returnStrandedMUSD` for signatures submitted outside SettleTag. App: Trove sheet (ratio, liquidation price, capacity, TCR, Recovery Mode; add collateral, repay, open trove), borrow-to-pay on invoices (v2 atomic; v1 three transactions), fee preview, Pro purchase, live ledger, and v1 receipt fallback. Mezo testnet addresses and ABIs taken from `mezo-org/musd` matsnet deployment artifacts (commit `da7888a`).
- **Published brand asset:** A transparent navy and orange receipt/check logo was generated, saved as `public/settletag-logo.png`, and referenced by the app header, favicon, and touch icon. Vercel CLI returned HTTP 200 with `Content-Type: image/png` and the expected 544483-byte length for the deployment asset.

## Verification Log

| Date | Check | Result |
|---|---|---|
| 2026-10-19 | `npm install --no-audit --no-fund --fetch-retries=0` | Failed: npm registry `ECONNRESET` fetching `@noble/curves` |
| 2026-10-20 | `npm install --no-audit --no-fund --fetch-retries=4 --fetch-timeout=60000` | PASS; 370 packages added |
| 2026-10-20 | `npm test` | PASS; compiled both contracts; 2 local EVM tests passed with mock MUSD |
| 2026-10-20 | `npm run build` | PASS; Vite production bundle built |
| 2026-10-20 | `npm test` after wallet/frontend changes | PASS; 4 tests: 2 contract, 2 wallet |
| 2026-10-20 | `npm run build` after redesign | PASS; Vite production bundle built |
| 2026-10-20 | In-app browser visual inspection | Blocked by browser URL policy; no visual sign-off claimed |
| 2026-10-20 | `npm run wallet:create` | PASS; generated the dedicated testnet deployment address; secret saved locally encrypted to current Windows user and ignored by Git |
| 2026-10-20 | `npm run wallet:check` | PASS; decrypted key resolves to `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`; secret was not printed |
| 2026-10-20 | `npm test` after UI polish | PASS; 4 tests |
| 2026-10-20 | `npm run build` after UI polish | PASS; Vite production bundle built |
| 2026-10-20 | Mezo RPC `eth_getBalance` for deployer | 0 BTC at block 16263615, including pending state; chain ID 31611 |
| 2026-10-20 | Mezo testnet MUSD `balanceOf` for deployer | 0 MUSD; testnet token contract code present |
| 2026-10-20 | Node RPC TLS verification | PASS with `--use-system-ca` and certificate verification enabled; the saved-wallet deploy command now requires this path |
| 2026-10-20 | Deployer balance check | 0.05 test BTC at block 16263757 |
| 2026-10-20 | `npm run deploy:saved:testnet` | PASS; contract `0x53eCBb8891Df17927d40E4FbF234a80cB82EC456`; tx `0x04eceb20eac2bb22cb0503f217172bf762c9cc6c184e4e2dcaeab53b5926584c`; block 16263763 |
| 2026-10-20 | Onchain contract read | PASS; 1964 bytes of code, expected MUSD token address, chain ID 31611 |
| 2026-10-20 | `npm run smoke:testnet` | PASS; 1 MUSD invoice `0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f` created; tx `0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5`; block 16263784; state and event verified |
| 2026-10-20 | `npm run build` with deployed contract configured | PASS; Vite production bundle built |
| 2026-10-20 | Independent receipt log read | PASS; `InvoiceCreated` event in transaction `0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5` matches ID, merchant and 1 MUSD amount |
| 2026-10-20 | `npm test` after live-app configuration | PASS; 4 tests |
| 2026-10-20 | `npm run build` after live-app configuration | PASS; contract address included in Vite build |
| 2026-10-20 | `npm run borrow:preview` | PASS; collateral and initial debt ratio checked before transaction submission; `openTrove` static call and gas estimate succeeded |
| 2026-10-20 | `npm run borrow:testnet` | PASS; tx `0x350b8265c66775863dd6ee2b669fa3d4f833beb9145e5fc0154953fa3ab74e2b`, block 16263869; 1800 test MUSD minted against 0.04 test BTC collateral; initial debt 2001.8 MUSD |
| 2026-10-20 | Separate payer creation and funding | PASS; payer `0x4aB359d5459E62D6a7912C5709c83d9E77255621`, local key encrypted and ignored; 0.002 test BTC and 1 MUSD confirmed; MUSD transfer tx `0x5ccaa6f6ec5aaaff74582194004a0945a4c6564dfa5d568d77c4b0c9428789e0` |
| 2026-10-20 | Payer MUSD approval | PASS; tx `0xf9920fef601c08fe20a480214eacc52fe4bcde3c63f243433741693063225bae`; 1 MUSD allowance confirmed |
| 2026-10-20 | `npm run payer:pay` | PASS; tx `0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4`, block 16266460; exact 1 MUSD merchant balance gain and `InvoicePaid` receipt verified |
| 2026-10-20 | Independent onchain state and log read | PASS; invoice status Paid (`2`), expected merchant/payer/amount, and matching `InvoicePaid` and MUSD `Transfer` logs in payment tx |
| 2026-10-20 | Final `npm test` | PASS; 4 tests: 2 contract, 2 wallet |
| 2026-10-20 | Final `npm run build` | PASS; Vite production bundle built |
| 2026-10-20 | `git diff --check` | PASS; line-ending conversion warnings only |
| 2026-10-20 | Release `npm test` | PASS; 4 tests: 2 contract, 2 wallet |
| 2026-10-20 | Release `npm run build` | PASS; Vite production bundle built with the deployed contract as the default |
| 2026-10-20 | Publication content check | PASS; no pitch or submission plan in README or technical evidence; `.secrets/`, `.env.local`, and `dist/` ignored by Git |
| 2026-10-20 | GitHub repository and remote | PASS; public `0xNexuz/settletag` created, `master` pushed, `git ls-remote` matched local HEAD |
| 2026-10-20 | Vercel build and deployment | PASS; project `xreyys-projects/settletag`, Vite build succeeded, production deployment `dpl_GBQfBS4VCwS6T5mU3KoUx1RQ6KVg` Ready and aliased to `settletag.vercel.app` |
| 2026-10-20 | Production HTTP smoke | PASS; `/`, JS, CSS, and pixel artwork returned 200; built JS contains expected SettleTag and MUSD addresses |
| 2026-10-20 | Production-origin Mezo RPC check | PASS; `eth_chainId` returned `0x7b7b` and CORS allowed `*` for `https://settletag.vercel.app` |
| 2026-10-20 | In-app browser public URL check | UNVERIFIED; navigation timed out twice despite production HTTP and Vercel Ready checks |
| 2026-10-20 | Public paid-invoice browser check | PASS; production invoice URL loaded, displayed Paid, 1.0 MUSD, expected merchant and payer. Manual Look up invoice returned “Invoice loaded from Mezo testnet.” Wallet and Faucet sheets opened. No fresh wallet creation, signing, or mobile viewport test performed. |
| 2026-10-20 | Documentation refresh `npm test` | PASS; 4 tests: 2 contract, 2 wallet. Ganache used its Node.js fallback because a native uWS binary was unavailable. |
| 2026-10-20 | Documentation refresh `npm run build` | PASS; Vite production bundle built. |
| 2026-10-20 | 390 px mobile browser check | PASS; invoice and wallet forms stacked readably, paid receipt details remained visible, no horizontal page overflow. Browser viewport restored after the check. |
| 2026-10-21 | Mezo testnet MUSD funding review | Official Mezo docs describe MUSD as minted via borrowing, with a 1800 MUSD minimum loan, and Mezo Swap supports BTC/MUSD. Testnet BTC/MUSD pool reserves were readable; a 0.0001 BTC router quote returned about 7.87 MUSD. A direct router swap static call reverted, so no direct swap was implemented or claimed. |
| 2026-10-21 | `npm test` after funding and signer changes | PASS; 5 tests: 2 contract, 3 wallet. |
| 2026-10-21 | Focused `node --test test/Wallet.test.js` after account-order check | PASS; 3 wallet tests. |
| 2026-10-23 | Logo and release hardening `npm run build` | PASS; Vite bundle built, and `dist/index.html` references `settletag-logo.png` as favicon and header image. |
| 2026-10-23 | Logo and release hardening `npm test` | PASS; 5 tests: 2 contract, 3 wallet. Ganache used its Node.js fallback. |
| 2026-10-23 | Logo asset alpha inspection | PASS; 1254 px RGBA PNG with transparent corner pixel. |
| 2026-10-23 | GitHub push for logo and funding release | PASS; public `master` advanced from `522113b` to `afa9336`. |
| 2026-10-23 | Vercel production deployment | PASS; deployment `dpl_HfkV5EC8uccz5pQVPjoZLZGYcKHH` Ready and aliased to `settletag.vercel.app`. |
| 2026-10-31 | Baseline `npm test` on Linux (before changes) | 2 contract tests failed: ganache returned reverted transactions without an RPC error, so expected rejections were missed. Tests now set `vmErrorsOnRPCResponse`; baseline passed with it. |
| 2026-10-31 | v1 standard-JSON recompile | PASS; creation bytecode identical to the deployment artifact; runtime 1964 bytes, matching the recorded on-chain code size. Saved as `verification/SettleTag-v1.input.json`. |
| 2026-10-31 | `npm test` | PASS; 15 tests: 8 contract (v2 with a mock reproducing Mezo's EIP-712 domain, type strings and nonces), 4 Mezo math/typed-data, 3 wallet. |
| 2026-10-31 | `npm run build` | PASS; Vite production bundle built. |
| 2026-10-31 | Browser end-to-end (`test/e2e/app_flow.py`, local chain 31611 with Mezo simulator at real addresses) | PASS; 26/26 checks: v2 fee preview, open-trove-and-pay, draw-and-pay, wallet pay, trove sheet, add collateral, repay, Pro plan, ledger counts, self-pay refusal, v1 open-and-pay and draw-and-pay, v1 receipt fallback, 390 px layout, no page errors. Found and fixed a stale-nonce bug: the app's provider cached `eth_getTransactionCount` for 250 ms, so an embedded-wallet payment sent right after its approval could reuse the approval nonce. |
| 2026-10-31 | Independent review (separate agent, against mezo-org/musd source) | Found a critical bug: Mezo's ActivePool makes a zero-value BTC call to the MUSD recipient after every draw, and SettleTag had no `receive`, so `payWithTroveDraw` would always revert on real Mezo. The mocks had skipped that call. Also: v1 IDs could be copied onto v2 to hijack links; draws are refused by Mezo in Recovery Mode; Mezo also enforces a system ratio of 150%; Mezo liquidates only below 110%; counters are gameable; docs overclaimed. All addressed in the follow-up commit. |
| 2026-10-31 | Regression check for the zero-value callback | With the mock now making Mezo's callback, the trove-draw tests fail without `receive()` and pass with it. |
| 2026-10-31 | `npm test` after review fixes | PASS; 17 tests (10 contract, 4 Mezo helpers, 3 wallet). |
| 2026-10-31 | Browser end-to-end after review fixes | PASS; 29/29 checks, adding contract-named share links and refusal of an ID copied onto v1. The simulator now makes the zero-value callback and serves `eip712Domain`. |
| 2026-10-31 | `scripts/deploy.js` and `scripts/verify.js --dry-run` on the local simulator | PASS; deployment record written and restored; recompiled v1 and v2 matched on-chain runtime bytecode with immutables masked. Explorer submission not run: Mezo hosts are unreachable from the build environment. |
| 2026-10-23 | Production favicon request via `vercel curl` | PASS; HTTP 200, `image/png`, 544483 bytes, security headers present. Direct local curl was blocked by Avast WebShield, so no direct-browser visual sign-off is claimed. |

## Decision Log

### 2026-10-19 — Build SettleTag

- **Decision:** Build a one-time MUSD invoice and receipt layer for Track 2.
- **Reason:** MUSD is load-bearing, the payment can be proven onchain, and a direct transfer plus reference reduces ambiguous merchant reconciliation.
- **Alternatives:** Generic wallet/payment requests are crowded by prior Mezo winners; automated lending/looping needs substantially more risk and engineering work; x402 paywall alone is covered by Mezo's own quickstart.
- **Evidence:** [Mezo prior winners](https://mezo.org/blog/announcing-mezo-hackathon-2-winners/), [Mezo x402 quickstart](https://testnet.mezo.org/docs/developers/getting-started/musd-payments-x402/x402-quickstart/), event page.
- **Status:** APPROVED within user's open-ended build request; subject to change if verification shows the mechanism is inadequate.

### 2026-10-20 — Dedicated funded deployment wallet

- **Decision:** Use a separate locally generated testnet wallet for deployment, with the private key encrypted to the current Windows user and excluded from Git. Share only the public address for faucet funding.
- **Reason:** The browser-created payer wallet is separate from the deployment signer. This lets the user fund one stable deployer address while keeping signing material out of chat and the repository.
- **Status:** Wallet funded; deployment and live MUSD payment verified.

### 2026-10-20 — Testnet borrow and distinct payer

- **Decision:** Use the user-authorized test BTC to mint test MUSD, then settle through a separate payer wallet.
- **Reason:** This exercises a real MUSD approval and direct payer-to-merchant transfer, with distinct signer addresses and an independently readable receipt.
- **Status:** Completed on Mezo testnet. The borrow position remains open; initial debt was 2001.8 test MUSD with 0.04 test BTC collateral.

### 2026-10-20 — Retain the testnet borrow position

- **Decision:** Keep the testnet position open for further product testing. Do not repay or withdraw collateral as part of the web release.
- **Reason:** Initial total debt was 2001.8 MUSD, including 200 MUSD gas compensation. Under the [Mezo MUSD protocol documentation](https://github.com/mezo-org/musd/blob/main/docs/README.md), the GasPool supplies that compensation when a trove closes; the borrower must repay the debt excluding gas compensation, initially 1801.8 MUSD, plus accrued interest. The merchant held 1800 MUSD after the test payment, so the opening shortfall was 1.8 MUSD plus any accrued interest. Verify the live repayment quote before attempting closure. The position uses testnet assets only.
- **Status:** Open; 0.04 test BTC collateral remains locked.

### 2026-10-21 — Easier test MUSD and signer checks

- **Decision:** Present Mezo Swap as the small-amount test MUSD route, with borrowing as an alternative. Recheck chain and selected account before browser wallet transactions and reset the signer on wallet account or network changes.
- **Reason:** Mezo's faucet dispenses test BTC, not MUSD; borrowing requires a 1800 MUSD minimum loan. The documented testnet BTC/MUSD pool provides a smaller exchange route. The SettleTag embedded wallet cannot connect to Mezo Swap, so the UI explains a transfer through a browser extension. Direct swap integration was not verified, and wallet changes must not silently sign on another chain or account.
- **Status:** Published on the public testnet app; build and local tests passed. Independent end-user swap and signing remain unverified.

### 2026-10-31 — Mezo-native settlement for Wave 2

- **Decision:** Fund invoices from the payer's own Mezo trove through `BorrowerOperationsSignatures`, so borrowing and settlement happen in one SettleTag transaction; add trove health and management to the app; charge a 0.5% settlement fee with a Pro plan alternative.
- **Reason:** Wave 1 judges rated plain `transferFrom` as integration level 2 and asked for BorrowerOperations borrowing or trove health inside the app, verification, third-party usage and a business model.
- **Alternatives:** App-only `withdrawMUSD` then pay (kept as the v1 path, three transactions); SettleTag holding troves for users (rejected: custodial).
- **Risk accepted:** Anyone who sees a payer's signed request before it is used can submit it directly to Mezo (for gas only), leaving the borrowed MUSD in SettleTag and the invoice unpaid; the owner returns it with `returnStrandedMUSD`. Signatures expire after 20 minutes.
- **Hardening after review:** `receive()` accepting only zero-value calls (Mezo's ActivePool callback); invoice IDs derived from merchant and salt; share links carry the contract address and ambiguous lookups are refused; 90-day invoice cap; treasury cannot be MUSD or SettleTag; merchants counted on first payment by someone else; app blocks draws in Recovery Mode, checks the system ratio, reads Mezo's signing domain before signing, and warns instead of silently falling back to v1.
- **Status:** Implemented and tested locally; awaiting v2 deployment, explorer verification and a live trove-funded payment.

## Next Action

1. Deploy v2 with `npm run deploy:saved:testnet`, then `npm run verify:testnet` for v1 and v2; commit `src/deployment.json` and redeploy the web app.
2. Run one live trove-funded payment with two separate wallets; add it to `docs/TESTNET_EVIDENCE.md`.
3. Run the merchant pilot in `docs/WAVE2.md`; count only merchants and payers outside the team.
4. Keep the original testnet borrow position open; verify its live state before any repayment or withdrawal.
