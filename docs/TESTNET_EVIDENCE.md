# Mezo testnet evidence

SettleTag settled one real testnet MUSD invoice from a distinct payer to its merchant. Chain ID: `31611`. Official testnet MUSD: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.

| Item | Value | Explorer proof |
|---|---|---|
| Contract | `0x53eCBb8891Df17927d40E4FbF234a80cB82EC456` | [Deployment transaction](https://explorer.test.mezo.org/tx/0x04eceb20eac2bb22cb0503f217172bf762c9cc6c184e4e2dcaeab53b5926584c) |
| Invoice ID | `0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f` | [Creation transaction](https://explorer.test.mezo.org/tx/0xa10cf87356d8ff039a7604d63dc7da6ccdedb1b886fe298f301b27cabfa666e5) |
| Merchant | `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c` | [Address](https://explorer.test.mezo.org/address/0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c) |
| Payer | `0x4aB359d5459E62D6a7912C5709c83d9E77255621` | [Address](https://explorer.test.mezo.org/address/0x4aB359d5459E62D6a7912C5709c83d9E77255621) |
| Amount | 1 MUSD | [Payment transaction](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4) |

## Transaction sequence

1. The contract was deployed in block `16263763`; onchain code length was 1964 bytes and `musd()` returned the official MUSD address.
2. The merchant created the 1 MUSD invoice in block `16263784`. Contract state and `InvoiceCreated` matched the ID, amount, and merchant.
3. To source test MUSD, the merchant [opened a Mezo borrow position](https://explorer.test.mezo.org/tx/0x350b8265c66775863dd6ee2b669fa3d4f833beb9145e5fc0154953fa3ab74e2b) in block `16263869`: 0.04 test BTC collateral, 1800 test MUSD borrowed, initial 2001.8 MUSD total debt including borrowing fee and gas compensation.
4. The merchant [sent 1 MUSD](https://explorer.test.mezo.org/tx/0x5ccaa6f6ec5aaaff74582194004a0945a4c6564dfa5d568d77c4b0c9428789e0) and 0.002 test BTC for gas to the distinct payer. Payer balances were confirmed onchain.
5. The payer [approved exactly 1 MUSD](https://explorer.test.mezo.org/tx/0xf9920fef601c08fe20a480214eacc52fe4bcde3c63f243433741693063225bae) for the SettleTag contract.
6. The payer [paid the invoice](https://explorer.test.mezo.org/tx/0xf2a79f2a848b643889db43321ca36f268233898de5a4f4c6fc26af814ef162e4) in block `16266460`. The merchant's MUSD balance increased by exactly 1 MUSD; the invoice's status became Paid (`2`) with the expected payer; and independently read logs contained one matching `InvoicePaid` and one 1 MUSD MUSD `Transfer` from payer to merchant in that transaction.

The [public app opens this invoice](https://settletag.vercel.app/?invoice=0x7d8aec69ac6d214cde80139bffe33989e6dd58006e561c6942964059e190516f). On 2026-10-20, an in-app browser displayed its Paid status, 1.0 MUSD amount, expected merchant and payer; the Wallet and Faucet sheets also opened. The invoice and wallet screens were visually checked at a 390 px mobile viewport without horizontal page overflow. A new merchant's signing flow has not been independently user tested. The onchain transaction proof and local contract tests are separate from this UI check.

The borrow position remains open; 0.04 test BTC collateral is still locked. No mainnet funds were used. This prototype has not received a third-party audit.
