# Mezo testnet evidence

SettleTag settled a wallet-funded v1 invoice and a Mezo trove-funded v2 invoice on testnet. Both used distinct payer and merchant addresses controlled by the project; independent user adoption has not been demonstrated. Chain ID: `31611`. Official testnet MUSD: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.

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

## V2: one-transaction trove-funded settlement

V2 was [deployed](https://explorer.test.mezo.org/tx/0x041bfd8e7973e45a4d0886bacb00a6802023ec9a1e4f8e1c1af9d939ab0b25a6) at [`0x7eDcC1223154413E314DD071d6Fb0E0a42A71A17`](https://explorer.test.mezo.org/address/0x7eDcC1223154413E314DD071d6Fb0E0a42A71A17?tab=contract) in block `16491131`. Its owner and treasury are `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c`, the settlement fee is 50 basis points, and the Pro price is 5 MUSD. The onchain code matched the locally compiled source. The explorer accepted source verification for both v1 and v2.

The distinct test merchant `0x4aB359d5459E62D6a7912C5709c83d9E77255621` [created](https://explorer.test.mezo.org/tx/0xd1fe929aa3610f3894f63ec1f4d8b3e8cb2cfec7cd346da1bff34640a8b0cefa) a 1 MUSD invoice with ID `0x509acee3658928085d319f7e03b50d734b0159963b57b961498720521dd830a5`. The payer `0x7FF7007f9330E140fC6d7A0c65d2b71d6ed8b24c` signed a Mezo `WithdrawMUSD` request naming v2 as recipient and called `payWithTroveDraw` in [transaction `0x8b24fbca…896e3c9`](https://explorer.test.mezo.org/tx/0x8b24fbca7a6649b95fe8c3b65cc53289bc56abb2a7a7979a02d4ba900896e3c9), block `16491268`.

The payment transaction succeeded and emitted both `TroveBorrowed` and `InvoicePaid`. Invoice state is Paid (`2`) with funding type TroveDraw (`2`) and the expected payer. MUSD transfer logs show exactly 1 MUSD reaching SettleTag from Mezo, 0.995 MUSD reaching the merchant, and 0.005 MUSD reaching the treasury. SettleTag retained 0 MUSD. Mezo's signature nonce advanced by one. The payer's trove retained 0.04 BTC collateral; total debt rose from about 2002.4145 MUSD before the draw to about 2003.4156 MUSD afterward, including the 1 MUSD draw, borrowing fee, and accrued interest. The position remains open.
