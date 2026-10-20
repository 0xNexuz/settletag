# Project Context

## Project Identity

- **Name:** SettleTag
- **Location:** `outputs/settletag` in this task workspace
- **Purpose:** One-time MUSD invoices with direct merchant settlement and onchain receipts.
- **Current stage:** LIVE TESTNET VERIFICATION / PUBLIC WEB RELEASE
- **Status:** Contract settlement, public web release, paid-invoice display, Wallet/Faucet navigation, and 390 px mobile layout VERIFIED; new merchant signing flow unverified
- **Last updated:** 2026-10-20

## Git State

- **Branch:** `master` (local repository).
- **HEAD:** Local live-testnet milestone committed; check `git log -1` for the current hash.
- **Working tree:** Clean after the milestone commit; recheck on continuation. Local secrets and `.env.local` are ignored.
- **Remote:** Public GitHub repository `https://github.com/0xNexuz/settletag`; `master` pushed and remote HEAD matched local at release check.
- **Web:** Vercel project `xreyys-projects/settletag`; production alias `https://settletag.vercel.app`, deployment `dpl_GBQfBS4VCwS6T5mU3KoUx1RQ6KVg` Ready at release check.
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

## Progress

- **Verified locally:** 2 local EVM tests passed with mock MUSD, 2 encrypted-wallet tests passed, Vite production build passed. Dedicated deployment wallet's Windows user-encrypted key unlocks to `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`.
- **Verified live:** 0.05 test BTC reached deployer by block 16263757. SettleTag deployed at `0x53eCBb8891Df17927d40E4FbF234a80cB82EC456` in block 16263763; 1964 bytes of code found and `musd()` equals official testnet MUSD. A 1 MUSD invoice was created in block 16263784. The deployer borrowed 1800 test MUSD against 0.04 test BTC collateral, then sent 1 MUSD and 0.002 test BTC to a distinct payer. The payer approved and paid the invoice in block 16266460. Invoice state is Paid; merchant balance increased by exactly 1 MUSD; `InvoicePaid` and MUSD `Transfer` logs match the transaction.
- **Implemented, unverified live:** Browser wallet create/unlock/send flow and browser payment interaction have not been exercised in the UI.
- **Pending:** Merchant user testing. The Mezo testnet borrow position remains open with 0.04 test BTC collateral locked and an initial 2001.8 test MUSD debt.

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

## Next Action

1. Have a merchant test invoice creation, link sharing, and reconciliation with a separate testnet account; collect feedback before claiming demand.
2. Keep the testnet borrow position open for further testing; verify its live state again before any future repayment or withdrawal.
