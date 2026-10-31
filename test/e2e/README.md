# Browser end-to-end run (local Mezo simulator)

Runs the real app in Chromium against a local chain (ID 31611). `MezoSim.sol` stands in for Mezo's contracts at their testnet addresses, with a fixed $100,000 BTC price, a 0.1% borrowing fee, a 1,800 MUSD minimum and 200 MUSD gas reserve. Its signature checks copy Mezo's `BorrowerOperationsSignatures`. SettleTag v1 is placed at its live address and a fresh v2 is deployed. Nothing touches a public network.

```sh
npm run e2e:chain                     # terminal 1: writes test/e2e/.sim.json
V2=$(node -p "require('./test/e2e/.sim.json').v2")
VITE_MEZO_RPC=http://127.0.0.1:8545 VITE_CONTRACT_ADDRESS=$V2 npx vite --port 5173   # terminal 2: v2 mode
VITE_MEZO_RPC=http://127.0.0.1:8545 VITE_CONTRACT_ADDRESS= npx vite --port 5174      # terminal 3: v1 mode
pip install playwright && python3 test/e2e/app_flow.py screenshots/
```

Restart the chain before each run; the checks expect fresh state. The flow covers wallet creation, invoice fees, open-trove-and-pay, draw-and-pay, wallet payment, trove health, adding collateral, repaying, the Pro plan, ledger counts, self-payment refusal, both v1 borrow paths, v1 receipts read from the v2 app, and layout at 390 px.
