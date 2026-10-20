# Project Context

## Project Identity

- **Name:** SettleTag
- **Location:** `outputs/settletag` in this task workspace
- **Purpose:** One-time MUSD invoices with direct merchant settlement and onchain receipts.
- **Current stage:** DEVELOPMENT / VERIFICATION
- **Status:** Local contract and web build VERIFIED; real Mezo integration UNVERIFIED
- **Last updated:** 2026-10-20

## Git State

- **Branch:** `master` (local repository).
- **HEAD:** Local prototype commit `ddc2d6a`; check `git log -1` after later context updates.
- **Working tree:** Clean immediately after the prototype commit; recheck on continuation.
- **Remote:** None. No push has been authorized.
- **Last verified milestone:** Contract and encrypted-wallet tests (4 total) and production web build passed locally on 2026-10-20.

## Hackathon Context

- **Event:** [Mezo Buildathon on AKINDO](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10)
- **Track:** Access and Distribution for MUSD/MEZO (Track 2)
- **Waves:** October 16–26, 2026 ($2,000 MEZO); November 2–15, 2026 ($5,000 MEZO).
- **Submission bar:** Real MUSD or MEZO integration, working deployment on supported chain (Mezo testnet accepted), public GitHub repo, project deck, two-minute pitch video.
- **Organizer:** AKINDO; evaluated by the Mezo core team.

## Approved Scope and Decisions

- User explicitly authorized beginning a build without an existing idea or repository.
- Selected a narrow invoice reference and settlement product after comparing the event requirements and prior Mezo winners.
- Use Mezo testnet chain ID 31611 and official testnet MUSD address `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, from [Mezo documentation](https://mezo.org/docs/users/resources/contracts-reference).
- No custody: the contract uses `transferFrom(payer, merchant, amount)` and records a one-time receipt.
- Local mock-token testing comes before any external deployment. Testnet deployment needs separate approval.
- User requested the frontend combine a pixel-art statue and Excel-like spreadsheet reference, with SettleTag copy, plus a test-token wallet and official faucet path.

## Progress

- **Verified locally:** Solidity invoice contract compiled, 2 local EVM tests passed with mock MUSD, 2 encrypted-wallet tests passed, Vite production build passed.
- **Implemented, unverified live:** Spreadsheet frontend using the supplied pixel art, local encrypted browser wallet with recovery phrase and backup, test BTC/MUSD balance reads and send flow, browser wallet option, official faucet and MUSD borrow links, invoice interface, deployment script.
- **Pending:** Live browser visual check (computer-use URL policy blocked observation), user-created wallet/address, faucet CAPTCHA and actual token receipt, authorized deployment and real MUSD settlement, final submission assets.
- **Blocker:** No authorization or credentials for testnet deployment. No live-chain receipt exists yet.

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

## Decision Log

### 2026-10-19 — Build SettleTag

- **Decision:** Build a one-time MUSD invoice and receipt layer for Track 2.
- **Reason:** MUSD is load-bearing, the payment can be proven onchain, and a direct transfer plus reference reduces ambiguous merchant reconciliation.
- **Alternatives:** Generic wallet/payment requests are crowded by prior Mezo winners; automated lending/looping needs substantially more risk and engineering work; x402 paywall alone is covered by Mezo's own quickstart.
- **Evidence:** [Mezo prior winners](https://mezo.org/blog/announcing-mezo-hackathon-2-winners/), [Mezo x402 quickstart](https://testnet.mezo.org/docs/developers/getting-started/musd-payments-x402/x402-quickstart/), event page.
- **Status:** APPROVED within user's open-ended build request; subject to change if verification shows the mechanism is inadequate.

## Next Action

1. User creates/unlocks the test wallet in the local app, backs up its recovery phrase, and completes the official faucet CAPTCHA. Verify the funded balance.
2. Review the live interface visually when browser access is available; address any issues.
3. Request authorization only when ready for Mezo testnet deployment; no keys are stored in the project.
