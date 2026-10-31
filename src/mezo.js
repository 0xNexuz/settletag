import { ethers } from 'ethers';

// Mezo testnet (chain 31611) addresses, from mezo-org/musd solidity/artifacts/deployments/matsnet.
export const MEZO = {
  chainId: 31611n,
  musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
  borrowerOperations: '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
  borrowerOperationsSignatures: '0xD757e3646AF370b15f32EB557F0F8380Df7D639e',
  troveManager: '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  hintHelpers: '0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6',
  sortedTroves: '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA',
  priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366'
};

export const ABI = {
  borrowerOperations: [
    'function openTrove(uint256 debtAmount, address upperHint, address lowerHint) payable',
    'function addColl(address upperHint, address lowerHint) payable',
    'function repayMUSD(uint256 amount, address upperHint, address lowerHint)',
    'function withdrawMUSD(uint256 amount, address upperHint, address lowerHint)',
    'function borrowingRate() view returns (uint256)',
    'function minNetDebt() view returns (uint256)',
    'function getBorrowingFee(uint256 debt) view returns (uint256)',
    'function getEntireSystemColl() view returns (uint256)',
    'function getEntireSystemDebt() view returns (uint256)'
  ],
  borrowerOperationsSignatures: [
    'function getNonce(address user) view returns (uint256)',
    'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)'
  ],
  troveManager: [
    'function getTroveStatus(address borrower) view returns (uint8)',
    'function getEntireDebtAndColl(address borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)',
    'function getCurrentICR(address borrower, uint256 price) view returns (uint256)',
    'function getTroveMaxBorrowingCapacity(address borrower) view returns (uint256)',
    'function getTroveInterestRate(address borrower) view returns (uint16)',
    'function getTCR(uint256 price) view returns (uint256)',
    'function checkRecoveryMode(uint256 price) view returns (bool)',
    'function MUSD_GAS_COMPENSATION() view returns (uint256)'
  ],
  hintHelpers: ['function getApproxHint(uint256 cr, uint256 numTrials, uint256 inputRandomSeed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)'],
  sortedTroves: [
    'function getSize() view returns (uint256)',
    'function findInsertPosition(uint256 nicr, address prevId, address nextId) view returns (address, address)'
  ],
  priceFeed: ['function fetchPrice() view returns (uint256)']
};

export const ONE = 10n ** 18n;
export const MCR = 11n * 10n ** 17n; // 110%: Mezo liquidates troves below this
export const CCR = 15n * 10n ** 17n; // 150%: system-wide floor; below it Mezo enters Recovery Mode
export const SAFE_ICR = CCR; // SettleTag will not offer a borrow that leaves a trove below 150%
export const TROVE_STATUS = ['None', 'Active', 'Closed', 'Liquidated', 'Redeemed'];

const SIGNATURE_DOMAIN = { name: 'BorrowerOperationsSignatures', version: '1' };

/** Reads the signing domain from Mezo and checks it is the contract and chain SettleTag expects. */
export async function readSignatureDomain(provider) {
  const d = await mezoContracts(provider).signatures.eip712Domain();
  const domain = { name: d.name, version: d.version, chainId: d.chainId, verifyingContract: ethers.getAddress(d.verifyingContract) };
  if (domain.chainId !== MEZO.chainId || domain.verifyingContract !== ethers.getAddress(MEZO.borrowerOperationsSignatures)) {
    throw new Error('Mezo’s signing contract reported an unexpected domain. Nothing was signed.');
  }
  return domain;
}

/** EIP-712 request letting SettleTag receive `amount` MUSD drawn from the borrower's trove. */
export function withdrawMUSDTypedData({ chainId = MEZO.chainId, verifyingContract = MEZO.borrowerOperationsSignatures, domain, amount, borrower, recipient, nonce, deadline }) {
  return {
    domain: domain ?? { ...SIGNATURE_DOMAIN, chainId, verifyingContract },
    types: {
      WithdrawMUSD: [
        { name: 'amount', type: 'uint256' },
        { name: 'borrower', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    },
    value: { amount, borrower, recipient, nonce, deadline }
  };
}

/** EIP-712 request opening a trove for the borrower with `assetAmount` BTC and sending `debtAmount` MUSD to SettleTag. */
export function openTroveTypedData({ chainId = MEZO.chainId, verifyingContract = MEZO.borrowerOperationsSignatures, domain, assetAmount, debtAmount, borrower, recipient, nonce, deadline }) {
  return {
    domain: domain ?? { ...SIGNATURE_DOMAIN, chainId, verifyingContract },
    types: {
      OpenTrove: [
        { name: 'assetAmount', type: 'uint256' },
        { name: 'debtAmount', type: 'uint256' },
        { name: 'borrower', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    },
    value: { assetAmount, debtAmount, borrower, recipient, nonce, deadline }
  };
}

/** Collateral ratio as an 18-decimal fraction (1.5e18 = 150%). */
export function collateralRatio(coll, debt, price) {
  return debt === 0n ? ethers.MaxUint256 : coll * price / debt;
}

/** BTC price (18 decimals) at which the trove reaches the 110% liquidation line. */
export function liquidationPrice(coll, debt) {
  return coll === 0n ? 0n : debt * MCR / coll;
}

export function healthLabel(icr) {
  if (icr < MCR) return { tone: 'danger', label: 'Liquidatable' };
  if (icr < CCR) return { tone: 'danger', label: 'At risk' };
  if (icr < 2n * ONE) return { tone: 'warn', label: 'Watch' };
  return { tone: 'good', label: 'Healthy' };
}

export function borrowingFee(amount, borrowingRate) {
  return amount * borrowingRate / ONE;
}

/** Effect of drawing `amount` more MUSD from an existing trove. */
export function projectDraw({ coll, debt, price, borrowingRate, amount, capacity, recoveryMode = false, systemColl, systemDebt }) {
  const fee = recoveryMode ? 0n : borrowingFee(amount, borrowingRate);
  const newDebt = debt + amount + fee;
  const icr = collateralRatio(coll, newDebt, price);
  const problems = [];
  // In Recovery Mode Mezo only allows more debt if the same step raises the trove's ratio, which a draw cannot.
  if (recoveryMode) problems.push('Mezo is in Recovery Mode, so it does not allow borrowing more from an existing trove right now. Pay from wallet MUSD instead.');
  else if (icr < SAFE_ICR) problems.push('It would leave your trove below 150% collateral. Add BTC collateral first.');
  if (!recoveryMode && systemColl !== undefined && collateralRatio(systemColl, systemDebt + amount + fee, price) < CCR) {
    problems.push('Mezo would refuse it: the whole system would fall below 150% collateral.');
  }
  if (capacity !== undefined && newDebt > capacity) problems.push('It exceeds this trove’s Mezo borrowing capacity. Repay or refinance first.');
  return { fee, newDebt, icr, liquidationPrice: liquidationPrice(coll, newDebt), ok: problems.length === 0, problems };
}

/** Smallest borrow that meets Mezo's minimum net debt (borrow plus fee) when opening a trove. */
export function minimumOpenBorrow(minNetDebt, borrowingRate) {
  let amount = minNetDebt * ONE / (ONE + borrowingRate);
  while (amount + borrowingFee(amount, borrowingRate) < minNetDebt) amount++;
  return amount;
}

/** Effect of opening a trove with `collateral` BTC that borrows `debtAmount` MUSD. */
export function projectOpen({ collateral, debtAmount, price, borrowingRate, gasCompensation, minNetDebt, recoveryMode = false, systemColl, systemDebt }) {
  const fee = recoveryMode ? 0n : borrowingFee(debtAmount, borrowingRate);
  const totalDebt = debtAmount + fee + gasCompensation;
  const icr = collateralRatio(collateral, totalDebt, price);
  const problems = [];
  if (debtAmount + fee < minNetDebt) problems.push(`Mezo’s minimum loan is currently ${ethers.formatUnits(minNetDebt, 18)} MUSD including the borrowing fee.`);
  if (icr < SAFE_ICR) problems.push('Add more BTC collateral: the new trove must start at 150% or higher.');
  if (!recoveryMode && systemColl !== undefined && collateralRatio(systemColl + collateral, systemDebt + totalDebt, price) < CCR) {
    problems.push('Mezo would refuse it: the whole system would fall below 150% collateral.');
  }
  return { fee, totalDebt, icr, liquidationPrice: liquidationPrice(collateral, totalDebt), ok: problems.length === 0, problems };
}

/** BTC collateral needed for `totalDebt` at the target collateral ratio, rounded up to 1e12 wei. */
export function collateralFor(totalDebt, price, targetIcr) {
  const exact = (totalDebt * targetIcr + price - 1n) / price;
  const step = 10n ** 12n;
  return (exact + step - 1n) / step * step;
}

export function mezoContracts(runner) {
  return {
    borrowerOperations: new ethers.Contract(MEZO.borrowerOperations, ABI.borrowerOperations, runner),
    signatures: new ethers.Contract(MEZO.borrowerOperationsSignatures, ABI.borrowerOperationsSignatures, runner),
    troveManager: new ethers.Contract(MEZO.troveManager, ABI.troveManager, runner),
    hintHelpers: new ethers.Contract(MEZO.hintHelpers, ABI.hintHelpers, runner),
    sortedTroves: new ethers.Contract(MEZO.sortedTroves, ABI.sortedTroves, runner),
    priceFeed: new ethers.Contract(MEZO.priceFeed, ABI.priceFeed, runner)
  };
}

/** Live trove and system state for one address. */
export async function readTrove(provider, address) {
  const c = mezoContracts(provider);
  const price = await c.priceFeed.fetchPrice();
  const [status, amounts, capacity, rate, tcr, recoveryMode, borrowingRate, minNetDebt, gasCompensation, systemColl, systemDebt] = await Promise.all([
    c.troveManager.getTroveStatus(address),
    c.troveManager.getEntireDebtAndColl(address),
    c.troveManager.getTroveMaxBorrowingCapacity(address),
    c.troveManager.getTroveInterestRate(address),
    c.troveManager.getTCR(price),
    c.troveManager.checkRecoveryMode(price),
    c.borrowerOperations.borrowingRate(),
    c.borrowerOperations.minNetDebt(),
    c.troveManager.MUSD_GAS_COMPENSATION(),
    c.borrowerOperations.getEntireSystemColl(),
    c.borrowerOperations.getEntireSystemDebt()
  ]);
  const active = Number(status) === 1;
  const coll = amounts.coll;
  const debt = amounts.principal + amounts.interest;
  const icr = active ? collateralRatio(coll, debt, price) : 0n;
  return {
    address, price, status: Number(status), active, coll, debt,
    principal: amounts.principal, interest: amounts.interest,
    icr, liquidationPrice: active ? liquidationPrice(coll, debt) : 0n,
    capacity, capacityLeft: capacity > debt ? capacity - debt : 0n,
    interestRateBps: Number(rate), tcr, recoveryMode, borrowingRate, minNetDebt, gasCompensation, systemColl, systemDebt,
    // Mezo charges no borrowing fee in Recovery Mode.
    effectiveRate: recoveryMode ? 0n : borrowingRate,
    health: active ? healthLabel(icr) : null
  };
}

/** Neighbour hints for inserting or moving a trove in Mezo's sorted list at this nominal ratio. */
export async function insertHints(provider, coll, principal) {
  const c = mezoContracts(provider);
  const nicr = coll * 10n ** 20n / principal;
  const size = await c.sortedTroves.getSize();
  const trials = BigInt(Math.max(15, Math.ceil(Math.sqrt(Number(size))) * 15));
  const [approx] = await c.hintHelpers.getApproxHint(nicr, trials, BigInt(Math.floor(Math.random() * 1e9)));
  const [upper, lower] = await c.sortedTroves.findInsertPosition(nicr, approx, approx);
  return { upper, lower };
}

export function percent(value) {
  if (value === ethers.MaxUint256) return '∞';
  return `${(Number(value / 10n ** 14n) / 100).toFixed(2)}%`;
}

export function money(value, digits = 2) {
  const n = Number(ethers.formatUnits(value, 18));
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
