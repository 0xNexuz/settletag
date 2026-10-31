import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { MCR, CCR, collateralRatio, liquidationPrice, healthLabel, projectDraw, projectOpen, minimumOpenBorrow, collateralFor, borrowingFee, percent, withdrawMUSDTypedData } from '../src/mezo.js';

const u = (v) => ethers.parseUnits(String(v), 18);
const price = u('100000'); // 100,000 USD per BTC
const rate = u('0.001'); // 0.1% borrowing fee, as on the testnet borrow recorded in docs/TESTNET_EVIDENCE.md

test('collateral ratio and liquidation price follow Mezo’s 110% line', () => {
  const coll = u('0.04');
  const debt = u('2001.8');
  const icr = collateralRatio(coll, debt, price);
  assert.equal(percent(icr), '199.82%');
  const atLiquidation = collateralRatio(coll, debt, liquidationPrice(coll, debt));
  assert.ok(atLiquidation <= MCR && MCR - atLiquidation < 10n ** 6n, 'ratio is 110% at the liquidation price');
  assert.equal(healthLabel(icr).label, 'Watch');
  assert.equal(healthLabel(u('2.5')).tone, 'good');
  assert.equal(healthLabel(u('1.4')).label, 'At risk');
  assert.equal(healthLabel(u('1.4'), true).label, 'Liquidatable', 'Recovery Mode liquidates below 150%');
  assert.equal(healthLabel(u('1.05')).label, 'Liquidatable');
});

test('borrow-to-pay is refused below 150% or above Mezo borrowing capacity', () => {
  const base = { coll: u('0.04'), debt: u('2001.8'), price, borrowingRate: rate, capacity: u('3636') };
  const ok = projectDraw({ ...base, amount: u('40') });
  assert.equal(ok.ok, true);
  assert.equal(ok.fee, u('0.04'));
  assert.equal(ok.newDebt, u('2041.84'));
  const risky = projectDraw({ ...base, amount: u('800') });
  assert.equal(risky.ok, false);
  assert.ok(risky.icr < CCR);
  const capped = projectDraw({ ...base, capacity: u('2010'), amount: u('20') });
  assert.equal(capped.ok, false);
  assert.match(capped.problems.join(' '), /capacity/);
  assert.equal(projectDraw({ ...base, amount: u('40'), recoveryMode: true }).fee, 0n, 'no borrowing fee in Recovery Mode');
});

test('opening a trove meets the minimum net debt and suggests enough collateral', () => {
  const minNetDebt = u('1800');
  const borrow = minimumOpenBorrow(minNetDebt, rate);
  assert.ok(borrow + borrowingFee(borrow, rate) >= minNetDebt);
  assert.ok(borrow - 1n + borrowingFee(borrow - 1n, rate) < minNetDebt, 'smallest such amount');
  const totalDebt = borrow + borrowingFee(borrow, rate) + u('200');
  const collateral = collateralFor(totalDebt, price, 2n * 10n ** 18n);
  const plan = projectOpen({ collateral, debtAmount: borrow, price, borrowingRate: rate, gasCompensation: u('200'), minNetDebt });
  assert.equal(plan.ok, true);
  assert.ok(plan.icr >= 2n * 10n ** 18n);
  assert.equal(projectOpen({ collateral: u('0.01'), debtAmount: borrow, price, borrowingRate: rate, gasCompensation: u('200'), minNetDebt }).ok, false);
  assert.equal(projectOpen({ collateral, debtAmount: u('100'), price, borrowingRate: rate, gasCompensation: u('200'), minNetDebt }).ok, false);
});

test('signature request matches Mezo’s WithdrawMUSD type and domain', () => {
  const typed = withdrawMUSDTypedData({ amount: 1n, borrower: ethers.ZeroAddress, recipient: ethers.ZeroAddress, nonce: 0n, deadline: 1n });
  assert.equal(ethers.TypedDataEncoder.from(typed.types).encodeType('WithdrawMUSD'),
    'WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)');
  assert.equal(typed.domain.name, 'BorrowerOperationsSignatures');
  assert.equal(typed.domain.version, '1');
  assert.equal(typed.domain.chainId, 31611n);
  assert.equal(typed.domain.verifyingContract, '0xD757e3646AF370b15f32EB557F0F8380Df7D639e');
});
