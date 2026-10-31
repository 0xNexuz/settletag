import { ethers } from 'ethers';
import settleTag from './artifacts/SettleTag.json';
import deployment from './deployment.json';
import { LEGACY_ABI } from './legacy.js';
import { createTestWallet, unlockTestWallet, savedWalletAddress, encryptedWalletBackup, assertSignerMatches } from './wallet.js';
import {
  MEZO, ONE, TROVE_STATUS, mezoContracts, readTrove, insertHints, projectDraw, projectOpen, minimumOpenBorrow,
  collateralFor, withdrawMUSDTypedData, openTroveTypedData, readSignatureDomain, percent, money
} from './mezo.js';
import './style.css';

const CHAIN = MEZO.chainId;
// VITE_MEZO_RPC exists only for local end-to-end runs against a simulated chain.
const RPC = import.meta.env.VITE_MEZO_RPC?.trim() || 'https://rpc.test.mezo.org';
const EXPLORER = 'https://explorer.test.mezo.org';
const MUSD = MEZO.musd;
const LEGACY = deployment.legacy.address;
const CONFIGURED = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || deployment.settleTag?.address || '';
const SIGNATURE_WINDOW = 20 * 60; // seconds a Mezo signature request stays valid
const FUNDING = ['—', 'Wallet MUSD', 'Borrowed from Mezo trove', 'New Mezo trove'];
const tokenAbi = ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)'];
const $ = (id) => document.getElementById(id);
// No read cache: back-to-back transactions (approve, then pay) must each fetch a fresh nonce.
const rpc = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
let signer, address, invoice, transfer, browserWallet = false, watchedProvider, borrowPlan, v2 = null;
let linkContract = null; // contract named in a shared invoice link

// --- SettleTag contract versions ---
// v2 adds trove-funded settlement and fees. Until its address is configured, the app writes to v1.
const ready = (async () => {
  if (!ethers.isAddress(CONFIGURED) || CONFIGURED.toLowerCase() === LEGACY.toLowerCase()) return null;
  try {
    const c = new ethers.Contract(CONFIGURED, settleTag.abi, rpc);
    const [token, signatures] = await Promise.all([c.musd(), c.borrowerOperationsSignatures()]);
    if (token.toLowerCase() !== MUSD.toLowerCase() || signatures.toLowerCase() !== MEZO.borrowerOperationsSignatures.toLowerCase()) throw new Error('unexpected wiring');
    return ethers.getAddress(CONFIGURED);
  } catch {
    const note = $('config-note');
    note.textContent = `SettleTag v2 at ${CONFIGURED} could not be confirmed on Mezo testnet, so this page is using the v1 contract. Reload to try again.`;
    note.hidden = false;
    return null;
  }
})().then(found => { v2 = found; applyMode(); return found; });

const writeTarget = () => v2 ? { address: v2, abi: settleTag.abi, version: 2 } : { address: LEGACY, abi: LEGACY_ABI, version: 1 };
const lookupTargets = () => [...(v2 ? [{ address: v2, abi: settleTag.abi, version: 2 }] : []), { address: LEGACY, abi: LEGACY_ABI, version: 1 }];
const settle = (target, runner = rpc) => new ethers.Contract(target.address, target.abi, runner);

// --- UI helpers ---
function notice(value, hash) {
  const box = $('message');
  box.textContent = value;
  if (hash) {
    const a = document.createElement('a');
    a.href = `${EXPLORER}/tx/${hash}`; a.target = '_blank'; a.rel = 'noreferrer';
    a.textContent = ' View transaction ↗'; box.append(a);
  }
  box.hidden = false;
}
const CONTRACT_ERRORS = {
  NotOpen: 'This invoice is no longer open.', Expired: 'This invoice has expired.', SelfPayment: 'A merchant cannot pay their own invoice. Use a different wallet.',
  InvalidBorrow: 'The loan must cover the invoice and include BTC collateral.', BorrowMismatch: 'Mezo returned a different MUSD amount; nothing was paid.',
  InvalidInvoice: 'Enter a positive amount and a future expiry.', InvoiceExists: 'That reference is already used.', NotMerchant: 'Only the merchant can do that.',
  InvalidPeriods: 'Choose between 1 and 12 periods.', PlanDisabled: 'The Pro plan is not on sale right now.', TransferFailed: 'The MUSD transfer failed. Check balance and approval.'
};
function err(e) {
  if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') return 'Wallet request cancelled.';
  if (e?.revert?.name && CONTRACT_ERRORS[e.revert.name]) return CONTRACT_ERRORS[e.revert.name];
  return e?.reason || e?.info?.error?.message || e?.error?.message || e?.shortMessage || e?.message || 'Request failed.';
}
function rows(target, entries) {
  target.replaceChildren(...entries.map(([label, value, tone]) => {
    const row = document.createElement('div'); row.className = 'detail-row';
    const name = document.createElement('span'); name.textContent = label;
    const val = document.createElement('strong'); val.textContent = value; if (tone) val.className = `tone-${tone}`;
    row.append(name, val); return row;
  }));
}
function parseUnits(raw, label, decimals = 18) {
  const value = String(raw ?? '').trim();
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error(`Enter a valid ${label} amount.`);
  const parsed = ethers.parseUnits(value, decimals);
  if (parsed <= 0n) throw new Error(`Enter a positive ${label} amount.`);
  return parsed;
}
const btc = (value, digits = 6) => `${Number(ethers.formatEther(value)).toLocaleString('en-US', { maximumFractionDigits: digits })} BTC`;
const musd = (value) => `${money(value)} MUSD`;
const usd = (value) => `$${money(value)}`;
const shortAddress = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));
async function confirm(tx, waiting) {
  notice(waiting, tx.hash);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Transaction reverted. Check the explorer.');
  return receipt;
}

const VIEWS = {
  overview: { n: 1, menu: 'Home', formula: '=SETTLEMENT_PROOF(invoice, payer, MUSD)' },
  invoices: { n: 2, menu: 'Invoices', formula: '=INVOICE(reference, amount, deadline, fee)' },
  trove: { n: 3, menu: 'Trove', formula: '=TROVE_HEALTH(collateral_BTC, debt_MUSD, BTC_price)' },
  wallet: { n: 4, menu: 'Wallet', formula: '=TESTNET_BALANCE(address, BTC, MUSD)' },
  faucet: { n: 5, menu: 'Faucet', formula: '=FUND_TEST_WALLET(address, faucet)' }
};
function view(name) {
  document.querySelectorAll('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== name; });
  document.querySelectorAll('.menu-tab').forEach(el => el.classList.toggle('active', el.textContent.trim() === VIEWS[name].menu));
  document.querySelectorAll('.sheet-tab').forEach(el => el.classList.toggle('active', el.dataset.view === name));
  document.querySelector('.formula-text').textContent = VIEWS[name].formula;
  document.querySelector('.name-box').firstChild.textContent = `ST · 0${VIEWS[name].n} `;
  $('footer-status').textContent = `${name.toUpperCase()} · MEZO TESTNET`;
  if (name === 'trove' && (address || ethers.isAddress($('trove-address').value.trim()))) refreshTrove().catch(e => notice(err(e)));
  if (name === 'overview') loadLedger();
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => view(el.dataset.view)));
const journey = document.createElement('div');
journey.className = 'journey';
journey.innerHTML = '<div class="journey-heading"><span>WORKBOOK FLOW</span><strong>From BTC to verifiable receipt</strong></div><div class="journey-steps"><button type="button" data-step="wallet"><b>01</b><span>Prepare wallet<small>Create or connect a testnet account</small></span><i>↗</i></button><button type="button" data-step="trove"><b>02</b><span>Check your trove<small>Collateral ratio, liquidation price, capacity</small></span><i>↗</i></button><button type="button" data-step="invoices"><b>03</b><span>Settle an invoice<small>Pay MUSD or borrow it against BTC</small></span><i>↗</i></button></div>';
document.querySelector('[data-panel="overview"] .build-note').before(journey);
journey.querySelectorAll('[data-step]').forEach(el => el.addEventListener('click', () => view(el.dataset.step)));

function applyMode() {
  const target = writeTarget();
  const note = document.querySelector('.build-note span');
  note.textContent = v2
    ? 'SettleTag v2 on Mezo testnet: pay an invoice from wallet MUSD, or borrow the MUSD against BTC through your Mezo trove.'
    : 'SettleTag is live on Mezo testnet. A 1 MUSD invoice settled directly from payer to merchant, with an onchain receipt.';
  document.querySelector('.ribbon-note small').textContent = v2 ? 'Trove-funded settlement' : 'Live MUSD settlement verified';
  let link = document.querySelector('.build-note a');
  if (!link) { link = document.createElement('a'); link.target = '_blank'; link.rel = 'noreferrer'; document.querySelector('.build-note').append(link); }
  link.href = `${EXPLORER}/address/${target.address}`; link.textContent = 'View contract ↗';
  $('pro-card').hidden = !v2;
  $('borrow-subtitle').textContent = v2
    ? 'Sign once; SettleTag borrows from your trove and settles in one transaction.'
    : 'Borrow from your trove, approve, then pay: three wallet transactions on this contract.';
  loadLedger(); refreshMerchantTerms();
}

// --- Wallet ---
function setAddress(value) {
  address = value;
  $('wallet-address').textContent = value || 'No wallet selected';
  $('faucet-address').textContent = value || 'Connect a browser wallet or create a test wallet first.';
  $('create-wallet').hidden = Boolean(savedWalletAddress());
  $('unlock-wallet').hidden = !savedWalletAddress() || Boolean(signer);
  if (value && !$('trove-address').value.trim()) $('trove-address').placeholder = value;
  borrowPlan = null; $('borrow-plan').hidden = true;
  refreshMerchantTerms();
}
setAddress(savedWalletAddress());
async function checkNetwork() { if ((await rpc.getNetwork()).chainId !== CHAIN) throw new Error('The RPC is not connected to Mezo testnet.'); }
async function balances() {
  if (!address) throw new Error('Create or connect a wallet first.');
  await checkNetwork();
  const [btcBalance, musdBalance] = await Promise.all([rpc.getBalance(address), new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address)]);
  $('btc-balance').textContent = `${ethers.formatEther(btcBalance)} BTC`;
  $('musd-balance').textContent = `${ethers.formatUnits(musdBalance, 18)} MUSD`;
}
function needSigner() { if (!signer) throw new Error('Create, unlock, or connect a wallet first.'); return signer; }
async function readySigner() { return assertSignerMatches(needSigner(), address, CHAIN, browserWallet); }
function afterConnect() { if (!$('trove-address').value.trim() && !document.querySelector('[data-panel="trove"]').hidden) refreshTrove().catch(() => {}); }

$('create-wallet').addEventListener('click', async () => {
  const btn = $('create-wallet'); btn.disabled = true;
  try {
    const result = await createTestWallet($('wallet-password').value);
    signer = result.wallet.connect(rpc); browserWallet = false; $('wallet-password').value = '';
    setAddress(result.wallet.address);
    $('recovery-phrase').textContent = result.recoveryPhrase; $('recovery').hidden = false;
    notice('Test wallet created. Save the recovery phrase before funding it.');
    await balances(); afterConnect();
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('unlock-wallet').addEventListener('click', async () => {
  const btn = $('unlock-wallet'); btn.disabled = true;
  try {
    const wallet = await unlockTestWallet($('wallet-password').value);
    signer = wallet.connect(rpc); browserWallet = false; $('wallet-password').value = ''; setAddress(wallet.address);
    notice('Local test wallet unlocked.'); await balances(); afterConnect();
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('hide-recovery').addEventListener('click', () => { $('recovery-phrase').textContent = ''; $('recovery').hidden = true; });
$('connect-browser').addEventListener('click', async () => {
  try {
    if (!window.ethereum) throw new Error('Install an EVM browser wallet to use an extension account.');
    watchBrowserWallet();
    let provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    if ((await provider.getNetwork()).chainId !== CHAIN) {
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7b7b' }] }); }
      catch (e) {
        if (e.code !== 4902) throw e;
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7b7b', chainName: 'Mezo Testnet', rpcUrls: [RPC], blockExplorerUrls: [EXPLORER], nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 } }] });
      }
    }
    provider = new ethers.BrowserProvider(window.ethereum);
    if ((await provider.getNetwork()).chainId !== CHAIN) throw new Error('Switch the wallet to Mezo testnet.');
    signer = await provider.getSigner(); browserWallet = true; setAddress(await signer.getAddress());
    await balances(); notice('Browser wallet connected to Mezo testnet.'); afterConnect();
  } catch (e) { notice(err(e)); }
});
function watchBrowserWallet() {
  if (!window.ethereum?.on || watchedProvider === window.ethereum) return;
  watchedProvider = window.ethereum;
  for (const event of ['accountsChanged', 'chainChanged']) {
    window.ethereum.on(event, () => {
      if (!browserWallet) return;
      signer = null; browserWallet = false; transfer = null;
      $('btc-balance').textContent = '—'; $('musd-balance').textContent = '—';
      $('send-review').hidden = true; setAddress(null);
      notice('Browser wallet account or network changed. Reconnect it before signing.');
    });
  }
}
$('refresh-wallet').addEventListener('click', () => balances().then(() => notice('Balances refreshed.')).catch(e => notice(err(e))));
async function copyAddress() {
  if (!address) throw new Error('Create or connect a wallet first.');
  await navigator.clipboard.writeText(address); notice('Address copied.');
}
for (const id of ['copy-address', 'copy-faucet-address']) $(id).addEventListener('click', () => copyAddress().catch(e => notice(err(e))));
$('backup-wallet').addEventListener('click', () => {
  try {
    const url = URL.createObjectURL(new Blob([encryptedWalletBackup()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'settletag-wallet.encrypted.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Encrypted backup downloaded. Keep it with your password.');
  } catch (e) { notice(err(e)); }
});
$('send-tokens').addEventListener('click', async () => {
  try {
    await readySigner();
    const token = $('send-token').value, to = $('send-to').value.trim();
    if (!ethers.isAddress(to)) throw new Error('Enter a valid 0x recipient address.');
    const amount = parseUnits($('send-amount').value, token);
    await balances();
    const available = token === 'BTC' ? await rpc.getBalance(address) : await new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address);
    if (available < amount) throw new Error(`Insufficient test ${token} balance.`);
    transfer = { token, to, amount, from: address };
    $('send-summary').textContent = `Send ${ethers.formatUnits(amount, 18)} test ${token} from ${address} to ${to} on Mezo testnet (chain 31611). Network fees require test BTC.`;
    $('send-review').hidden = false;
  } catch (e) { transfer = null; $('send-review').hidden = true; notice(err(e)); }
});
$('cancel-send').addEventListener('click', () => { transfer = null; $('send-review').hidden = true; });
$('confirm-send').addEventListener('click', async () => {
  const btn = $('confirm-send'); btn.disabled = true;
  try {
    if (!transfer) throw new Error('Review a transfer first.');
    const activeSigner = await readySigner();
    if ((await activeSigner.getAddress()).toLowerCase() !== transfer.from.toLowerCase()) throw new Error('The active wallet changed. Review again.');
    await checkNetwork();
    const tx = transfer.token === 'BTC'
      ? await signer.sendTransaction({ to: transfer.to, value: transfer.amount })
      : await new ethers.Contract(MUSD, tokenAbi, signer).transfer(transfer.to, transfer.amount);
    await confirm(tx, 'Transfer submitted. Waiting for confirmation…');
    transfer = null; $('send-review').hidden = true; await balances();
    notice('Testnet transfer confirmed.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});

// --- Invoices ---
async function lookup() {
  await ready;
  const id = $('invoice-id').value.trim();
  if (!ethers.isHexString(id, 32)) throw new Error('Enter a 32-byte invoice reference beginning with 0x.');
  let targets = lookupTargets();
  if (linkContract) {
    targets = targets.filter(t => t.address.toLowerCase() === linkContract.toLowerCase());
    if (!targets.length) throw new Error('The invoice link names a contract this app does not recognise. Ask the merchant for a new link.');
  }
  const found = [];
  for (const target of targets) {
    const data = await settle(target).invoices(id);
    if (data.status !== 0n) found.push({ target, data });
  }
  if (!found.length) throw new Error('Invoice not found on SettleTag contracts.');
  // Only v1 accepts arbitrary IDs, so a v1 invoice could copy a v2 ID. Never guess which one is meant.
  if (found.length > 1) throw new Error('This reference exists on both SettleTag contracts. Open the merchant’s invoice link, which names the contract.');
  const { target, data } = found[0];
  const feeBps = target.version === 2 ? data.feeBps : 0n;
  const fee = data.amount * feeBps / 10_000n;
  invoice = { id, target, merchant: data.merchant, amount: data.amount, deadline: data.deadline, status: data.status, payer: data.payer, feeBps, fee, funding: target.version === 2 ? Number(data.funding) : 0 };
  const expired = data.deadline < nowSeconds();
  const status = ['Missing', 'Open', 'Paid', 'Cancelled'][Number(data.status)];
  $('detail-status').textContent = status === 'Open' && expired ? 'Expired' : status;
  $('detail-amount').textContent = musd(data.amount);
  $('row-fee').hidden = $('row-net').hidden = target.version !== 2;
  $('detail-fee').textContent = feeBps === 0n ? '0% (Pro merchant)' : `${musd(fee)} (${Number(feeBps) / 100}%)`;
  $('detail-net').textContent = musd(data.amount - fee);
  $('detail-merchant').textContent = data.merchant;
  $('detail-deadline').textContent = new Date(Number(data.deadline) * 1000).toLocaleString();
  $('detail-payer').textContent = data.payer === ethers.ZeroAddress ? '—' : data.payer;
  $('row-funding').hidden = !(target.version === 2 && data.status === 2n);
  $('detail-funding').textContent = FUNDING[invoice.funding] ?? '—';
  $('detail-contract').textContent = `${shortAddress(target.address)} · v${target.version}`;
  $('pay-options').hidden = !(data.status === 1n && !expired);
  borrowPlan = null; $('borrow-plan').hidden = true;
  $('invoice-details').hidden = false;
}
async function refreshMerchantTerms() {
  const note = $('fee-note');
  if (!v2) { note.hidden = true; return; }
  try {
    const c = settle(writeTarget());
    const [standard, price] = await Promise.all([c.feeBps(), c.proPlanPrice()]);
    $('pro-standard-fee').textContent = `${Number(standard) / 100}%`;
    $('pro-price').textContent = musd(price);
    let rate = standard, until = 0n;
    if (address) [rate, until] = await Promise.all([c.effectiveFeeBps(address), c.proUntil(address)]);
    const raw = $('amount').value.trim();
    const amount = /^\d+(\.\d{1,18})?$/.test(raw) ? ethers.parseUnits(raw, 18) : 0n;
    const fee = amount * rate / 10_000n;
    note.textContent = rate === 0n
      ? `Pro plan active: no SettleTag fee on this invoice${amount ? `; you receive the full ${musd(amount)}` : ''}.`
      : `SettleTag fee ${Number(rate) / 100}%, fixed when the invoice is created${amount ? `: customer pays ${musd(amount)}, you receive ${musd(amount - fee)}` : ''}.`;
    note.hidden = false;
    $('pro-status').textContent = !address ? 'Connect a wallet to see your plan.'
      : until > nowSeconds() ? `Pro active until ${new Date(Number(until) * 1000).toLocaleDateString()}. Buying more extends it.` : 'No active Pro plan on this wallet.';
  } catch { note.hidden = true; }
}
$('amount').addEventListener('input', () => refreshMerchantTerms());
$('create-form').addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  try {
    await ready; await readySigner(); await checkNetwork();
    const amount = parseUnits($('amount').value, 'MUSD');
    if (amount > 2n ** 128n - 1n) throw new Error('Amount is too large.');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number($('expiry').value) * 86400);
    const target = writeTarget();
    // v2 derives the invoice ID from the merchant and a random salt; v1 takes the random value as the ID.
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const id = target.version === 2 ? ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [address, salt])) : salt;
    const tx = await settle(target, signer).createInvoice(salt, amount, deadline);
    await confirm(tx, 'Waiting for invoice confirmation…');
    const link = new URL(location.href); link.search = '';
    link.searchParams.set('invoice', id); link.searchParams.set('contract', target.address);
    $('share-link').value = link.href; $('created').hidden = false; $('invoice-id').value = id; linkContract = target.address;
    await lookup(); notice('Invoice created onchain.', tx.hash);
  } catch (error) { notice(err(error)); } finally { btn.disabled = false; }
});
$('invoice-id').addEventListener('input', () => { linkContract = null; });
$('lookup').addEventListener('click', () => lookup().then(() => notice('Invoice loaded from Mezo testnet.')).catch(e => { $('invoice-details').hidden = true; notice(err(e)); }));
async function approveIfNeeded(spender, amount) {
  const token = new ethers.Contract(MUSD, tokenAbi, signer);
  if (await token.allowance(await signer.getAddress(), spender) >= amount) return;
  await confirm(await token.approve(spender, amount), 'Waiting for MUSD approval…');
  await readySigner();
}
function payable() {
  if (!invoice || invoice.status !== 1n) throw new Error('Load an open invoice first.');
  if (address?.toLowerCase() === invoice.merchant.toLowerCase()) throw new Error('A merchant cannot pay their own invoice. Use a different wallet.');
}
$('pay').addEventListener('click', async () => {
  const btn = $('pay'); btn.disabled = true;
  try {
    await readySigner(); await checkNetwork(); await lookup(); payable();
    const balance = await new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address);
    if (balance < invoice.amount) throw new Error(`This wallet has ${musd(balance)}. Borrow against BTC instead (option B), or fund the wallet first.`);
    await approveIfNeeded(invoice.target.address, invoice.amount);
    const tx = await settle(invoice.target, signer).payInvoice(invoice.id);
    await confirm(tx, 'Waiting for settlement…');
    await lookup(); await balances(); notice('MUSD paid to the merchant. Receipt recorded.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});

// --- Borrow-to-pay through Mezo ---
async function buildBorrowPlan() {
  await readySigner(); payable();
  const trove = await readTrove(rpc, address);
  const amount = invoice.amount;
  if (trove.active) {
    const plan = projectDraw({ coll: trove.coll, debt: trove.debt, price: trove.price, borrowingRate: trove.borrowingRate, amount, capacity: trove.capacity, recoveryMode: trove.recoveryMode, systemColl: trove.systemColl, systemDebt: trove.systemDebt });
    return { kind: 'draw', trove, amount, ...plan };
  }
  const minimum = minimumOpenBorrow(trove.minNetDebt, trove.effectiveRate);
  const debtAmount = amount > minimum ? amount : minimum;
  const raw = $('borrow-collateral').value.trim();
  const fee = debtAmount * trove.effectiveRate / ONE;
  const suggested = collateralFor(debtAmount + fee + trove.gasCompensation, trove.price, 2n * ONE);
  if (!raw) $('borrow-collateral').value = ethers.formatEther(suggested);
  const collateral = parseUnits($('borrow-collateral').value, 'BTC collateral');
  const plan = projectOpen({ collateral, debtAmount, price: trove.price, borrowingRate: trove.borrowingRate, gasCompensation: trove.gasCompensation, minNetDebt: trove.minNetDebt, recoveryMode: trove.recoveryMode, systemColl: trove.systemColl, systemDebt: trove.systemDebt });
  const btcBalance = await rpc.getBalance(address);
  if (btcBalance < collateral + ethers.parseEther('0.0005')) plan.problems.push(`This wallet has ${btc(btcBalance)}; keep some BTC for network fees after locking collateral.`);
  plan.ok = plan.problems.length === 0;
  return { kind: 'open', trove, amount, collateral, debtAmount, suggested, ...plan };
}
function renderBorrowPlan(plan) {
  const { trove } = plan;
  const steps = v2 && invoice.target.version === 2 ? '1 signature + 1 transaction' : '3 transactions: borrow, approve, pay';
  $('borrow-open-fields').hidden = plan.kind !== 'open';
  if (plan.kind === 'draw') {
    rows($('borrow-summary'), [
      ['Draw from your trove', musd(plan.amount)],
      ['Mezo borrowing fee', `${musd(plan.fee)} (added to debt)`],
      ['Trove debt', `${musd(trove.debt)} → ${musd(plan.newDebt)}`],
      ['Collateral ratio', `${percent(trove.icr)} → ${percent(plan.icr)}`, plan.ok ? 'good' : 'danger'],
      ['Liquidation price', `${usd(trove.liquidationPrice)} → ${usd(plan.liquidationPrice)}`],
      ['BTC price now', usd(trove.price)],
      ['Steps', steps]
    ]);
  } else {
    rows($('borrow-summary'), [
      ['No active trove', 'A new one will be opened'],
      ['Borrow (Mezo’s current minimum applies)', musd(plan.debtAmount)],
      ['To merchant via invoice', musd(plan.amount)],
      ['Returned to your wallet', musd(plan.debtAmount - plan.amount)],
      ['Fee + gas reserve', `${musd(plan.fee)} + ${musd(trove.gasCompensation)}`],
      ['Total trove debt', musd(plan.totalDebt)],
      ['Collateral ratio', percent(plan.icr), plan.ok ? 'good' : 'danger'],
      ['Liquidation price', usd(plan.liquidationPrice)],
      ['Suggested collateral (200%)', btc(plan.suggested)],
      ['Steps', steps]
    ]);
  }
  $('borrow-problems').textContent = plan.problems.join(' ');
  $('borrow-problems').hidden = plan.ok;
  $('borrow-pay').hidden = !plan.ok;
  $('borrow-pay').textContent = plan.kind === 'draw' ? 'Sign and borrow-to-pay ↗' : 'Open trove and pay ↗';
  $('borrow-plan').hidden = false;
}
async function checkBorrow() {
  const btn = $('borrow-check'); btn.disabled = true;
  try { await lookup(); borrowPlan = await buildBorrowPlan(); renderBorrowPlan(borrowPlan); }
  catch (e) { borrowPlan = null; notice(err(e)); } finally { btn.disabled = false; }
}
$('borrow-check').addEventListener('click', checkBorrow);
$('borrow-collateral').addEventListener('change', () => { if (borrowPlan?.kind === 'open') checkBorrow(); });
async function signMezo(build) {
  const typed = build(await readSignatureDomain(rpc));
  notice('Review the Mezo borrowing request in your wallet. It names SettleTag as the recipient of the borrowed MUSD.');
  return signer.signTypedData(typed.domain, typed.types, typed.value);
}
$('borrow-pay').addEventListener('click', async () => {
  const btn = $('borrow-pay'); btn.disabled = true;
  try {
    await checkNetwork(); await lookup();
    const plan = await buildBorrowPlan();
    if (!plan.ok) { renderBorrowPlan(plan); throw new Error(plan.problems.join(' ')); }
    const mezo = mezoContracts(signer);
    const atomic = invoice.target.version === 2;
    let tx;
    if (plan.kind === 'draw') {
      const hints = await insertHints(rpc, plan.trove.coll, plan.trove.principal + plan.amount + plan.fee);
      if (atomic) {
        const deadline = nowSeconds() + BigInt(SIGNATURE_WINDOW);
        const nonce = await mezoContracts(rpc).signatures.getNonce(address);
        const signature = await signMezo(domain => withdrawMUSDTypedData({ domain, amount: plan.amount, borrower: address, recipient: invoice.target.address, nonce, deadline }));
        await readySigner();
        const c = settle(invoice.target, signer);
        await c.payWithTroveDraw.staticCall(invoice.id, hints.upper, hints.lower, signature, deadline);
        tx = await c.payWithTroveDraw(invoice.id, hints.upper, hints.lower, signature, deadline);
      } else {
        await mezo.borrowerOperations.withdrawMUSD.staticCall(plan.amount, hints.upper, hints.lower);
        await confirm(await mezo.borrowerOperations.withdrawMUSD(plan.amount, hints.upper, hints.lower), 'Borrowing MUSD from your Mezo trove…');
      }
    } else {
      const hints = await insertHints(rpc, plan.collateral, plan.totalDebt);
      if (atomic) {
        const deadline = nowSeconds() + BigInt(SIGNATURE_WINDOW);
        const nonce = await mezoContracts(rpc).signatures.getNonce(address);
        const signature = await signMezo(domain => openTroveTypedData({ domain, assetAmount: plan.collateral, debtAmount: plan.debtAmount, borrower: address, recipient: invoice.target.address, nonce, deadline }));
        await readySigner();
        const c = settle(invoice.target, signer);
        const args = [invoice.id, plan.debtAmount, hints.upper, hints.lower, signature, deadline, { value: plan.collateral }];
        await c.payByOpeningTrove.staticCall(...args);
        tx = await c.payByOpeningTrove(...args);
      } else {
        await mezo.borrowerOperations.openTrove.staticCall(plan.debtAmount, hints.upper, hints.lower, { value: plan.collateral });
        await confirm(await mezo.borrowerOperations.openTrove(plan.debtAmount, hints.upper, hints.lower, { value: plan.collateral }), 'Opening your Mezo trove…');
      }
    }
    if (!atomic) {
      await readySigner();
      await approveIfNeeded(invoice.target.address, invoice.amount);
      tx = await settle(invoice.target, signer).payInvoice(invoice.id);
    }
    await confirm(tx, 'Waiting for settlement…');
    await lookup(); await balances().catch(() => {});
    notice(atomic ? 'Borrowed against BTC and paid the merchant in one transaction. Receipt recorded.' : 'Borrowed against BTC and paid the merchant. Receipt recorded.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('copy-link').addEventListener('click', () => navigator.clipboard.writeText($('share-link').value).then(() => notice('Invoice link copied.')).catch(() => notice('Copy the link from the field above.')));

// --- Pro plan ---
$('buy-pro').addEventListener('click', async () => {
  const btn = $('buy-pro'); btn.disabled = true;
  try {
    await ready; if (!v2) throw new Error('The Pro plan needs the v2 contract.');
    await readySigner(); await checkNetwork();
    const c = settle(writeTarget(), signer);
    const periods = BigInt($('pro-periods').value);
    const cost = (await c.proPlanPrice()) * periods;
    const balance = await new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address);
    if (balance < cost) throw new Error(`Pro costs ${musd(cost)}; this wallet has ${musd(balance)}.`);
    await approveIfNeeded(v2, cost);
    const tx = await c.buyProPlan(periods);
    await confirm(tx, 'Activating SettleTag Pro…');
    await refreshMerchantTerms(); notice('SettleTag Pro active. New invoices carry no SettleTag fee.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});

// --- Trove sheet ---
let troveView;
function troveOwner() {
  const typed = $('trove-address').value.trim();
  if (typed) { if (!ethers.isAddress(typed)) throw new Error('Enter a valid 0x address.'); return ethers.getAddress(typed); }
  if (!address) throw new Error('Connect a wallet or enter an address to read a trove.');
  return address;
}
async function refreshTrove() {
  const owner = troveOwner();
  await checkNetwork();
  const t = await readTrove(rpc, owner);
  troveView = t;
  $('trove-price').textContent = usd(t.price);
  $('trove-tcr').textContent = percent(t.tcr);
  $('trove-mode').textContent = t.recoveryMode ? 'Recovery Mode' : 'Normal';
  $('trove-mode').className = t.recoveryMode ? 'tone-danger' : '';
  $('open-min').textContent = musd(t.minNetDebt);
  const tag = $('trove-tag');
  if (t.active) {
    $('trove-icr').textContent = percent(t.icr);
    tag.textContent = t.health.label; tag.className = `health-tag tone-bg-${t.health.tone}`;
    $('trove-fill').style.width = `${Math.min(100, Number(t.icr / 10n ** 14n) / 300)}%`;
    $('trove-fill').className = `health-fill tone-bg-${t.health.tone}`;
    $('trove-liq').textContent = usd(t.liquidationPrice);
    $('trove-coll').textContent = btc(t.coll);
    $('trove-debt').textContent = musd(t.debt);
    $('trove-capacity').textContent = musd(t.capacityLeft);
    $('trove-rate').textContent = `${(t.interestRateBps / 100).toFixed(2)}% fixed`;
  } else {
    $('trove-icr').textContent = '—';
    tag.textContent = t.status === 0 ? 'No trove' : `Trove ${TROVE_STATUS[t.status].toLowerCase()}`; tag.className = 'health-tag';
    $('trove-fill').style.width = '0';
    for (const id of ['trove-liq', 'trove-coll', 'trove-debt', 'trove-capacity', 'trove-rate']) $(id).textContent = '—';
  }
  const own = address && owner.toLowerCase() === address.toLowerCase();
  $('trove-manage').hidden = !(t.active && own);
  $('trove-open').hidden = t.active || !own;
  if (!$('trove-open').hidden && !$('open-debt').value) { $('open-debt').value = ethers.formatUnits(minimumOpenBorrow(t.minNetDebt, t.effectiveRate), 18); previewOpen(); }
  return t;
}
$('trove-refresh').addEventListener('click', () => refreshTrove().then(t => notice(t.active ? `Trove read from Mezo: ${t.health.label.toLowerCase()} at ${percent(t.icr)}.` : 'No active trove for this address.')).catch(e => notice(err(e))));
function ownTrove() {
  if (!troveView || !address || troveView.address.toLowerCase() !== address.toLowerCase()) throw new Error('Read your own trove first: connect the trove owner’s wallet.');
}
function previewOpen() {
  try {
    if (!troveView) return null;
    const collateral = parseUnits($('open-coll').value || '0.000000000000000001', 'BTC');
    const debtAmount = parseUnits($('open-debt').value, 'MUSD');
    const t = troveView;
    const plan = projectOpen({ collateral, debtAmount, price: t.price, borrowingRate: t.borrowingRate, gasCompensation: t.gasCompensation, minNetDebt: t.minNetDebt, recoveryMode: t.recoveryMode, systemColl: t.systemColl, systemDebt: t.systemDebt });
    if (!$('open-coll').value) $('open-coll').placeholder = ethers.formatEther(collateralFor(plan.totalDebt, t.price, 2n * ONE));
    rows($('open-summary'), [
      ['Borrowing fee', musd(plan.fee)], ['Gas reserve', musd(t.gasCompensation)], ['Total debt', musd(plan.totalDebt)],
      ['Collateral ratio', $('open-coll').value ? percent(plan.icr) : '—', plan.ok ? 'good' : 'danger'],
      ['Liquidation price', $('open-coll').value ? usd(plan.liquidationPrice) : '—'],
      ['Collateral for 200%', btc(collateralFor(plan.totalDebt, t.price, 2n * ONE))]
    ]);
    $('open-problems').textContent = $('open-coll').value ? plan.problems.join(' ') : '';
    $('open-problems').hidden = !$('open-coll').value || plan.ok;
    return { ...plan, collateral, debtAmount };
  } catch (e) { $('open-problems').textContent = err(e); $('open-problems').hidden = false; return null; }
}
for (const id of ['open-coll', 'open-debt']) $(id).addEventListener('input', previewOpen);
$('open-btn').addEventListener('click', async () => {
  const btn = $('open-btn'); btn.disabled = true;
  try {
    await readySigner(); await refreshTrove(); ownTrove();
    if (troveView.active) throw new Error('This wallet already has an active trove.');
    const plan = previewOpen();
    if (!plan?.ok) throw new Error(plan?.problems.join(' ') || 'Check the collateral and borrow amounts.');
    if (await rpc.getBalance(address) < plan.collateral + ethers.parseEther('0.0005')) throw new Error('Keep some test BTC for network fees after locking collateral.');
    const hints = await insertHints(rpc, plan.collateral, plan.totalDebt);
    const bo = mezoContracts(signer).borrowerOperations;
    await bo.openTrove.staticCall(plan.debtAmount, hints.upper, hints.lower, { value: plan.collateral });
    const tx = await bo.openTrove(plan.debtAmount, hints.upper, hints.lower, { value: plan.collateral });
    await confirm(tx, 'Opening your Mezo trove…');
    await refreshTrove(); await balances().catch(() => {}); notice(`Trove opened. ${musd(plan.debtAmount)} minted to your wallet.`, tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('add-coll-btn').addEventListener('click', async () => {
  const btn = $('add-coll-btn'); btn.disabled = true;
  try {
    await readySigner(); await refreshTrove(); ownTrove();
    if (!troveView.active) throw new Error('Open a trove first.');
    const amount = parseUnits($('add-coll').value, 'BTC');
    if (await rpc.getBalance(address) < amount + ethers.parseEther('0.0005')) throw new Error('Keep some test BTC for network fees.');
    const hints = await insertHints(rpc, troveView.coll + amount, troveView.principal);
    const bo = mezoContracts(signer).borrowerOperations;
    await bo.addColl.staticCall(hints.upper, hints.lower, { value: amount });
    const tx = await bo.addColl(hints.upper, hints.lower, { value: amount });
    await confirm(tx, 'Adding BTC collateral…');
    const t = await refreshTrove(); await balances().catch(() => {}); notice(`Collateral added. Ratio now ${percent(t.icr)}.`, tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('repay-btn').addEventListener('click', async () => {
  const btn = $('repay-btn'); btn.disabled = true;
  try {
    await readySigner(); await refreshTrove(); ownTrove();
    if (!troveView.active) throw new Error('No active trove to repay.');
    const amount = parseUnits($('repay-amount').value, 'MUSD');
    const max = troveView.debt - troveView.gasCompensation - troveView.minNetDebt;
    if (amount > max) throw new Error(`Mezo keeps a minimum net debt of ${musd(troveView.minNetDebt)}. You can repay up to ${musd(max > 0n ? max : 0n)} without closing the trove.`);
    const balance = await new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address);
    if (balance < amount) throw new Error(`This wallet has ${musd(balance)}.`);
    const toPrincipal = amount > troveView.interest ? amount - troveView.interest : 0n; // Mezo pays interest first
    const principalAfter = troveView.principal > toPrincipal ? troveView.principal - toPrincipal : 1n;
    const hints = await insertHints(rpc, troveView.coll, principalAfter);
    const bo = mezoContracts(signer).borrowerOperations;
    await bo.repayMUSD.staticCall(amount, hints.upper, hints.lower);
    const tx = await bo.repayMUSD(amount, hints.upper, hints.lower);
    await confirm(tx, 'Repaying trove debt…');
    const t = await refreshTrove(); await balances().catch(() => {}); notice(`Repaid ${musd(amount)}. Ratio now ${percent(t.icr)}.`, tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});

// --- Live ledger ---
async function loadLedger() {
  $('ledger').hidden = !v2;
  $('value-grid').hidden = Boolean(v2);
  if (!v2) return;
  try {
    const s = await settle(writeTarget()).stats();
    $('ledger-link').href = `${EXPLORER}/address/${v2}`;
    $('stat-invoices').textContent = s.invoices_.toString();
    $('stat-paid').textContent = `${s.paid} paid`;
    $('stat-volume').textContent = money(s.volume);
    $('stat-fees').textContent = `${money(s.fees)} MUSD in fees`;
    $('stat-trove').textContent = money(s.troveVolume);
    $('stat-trove-count').textContent = `${s.troveFunded} invoices funded by troves`;
    $('stat-merchants').textContent = s.merchants.toString();
    $('stat-payers').textContent = s.payers.toString();
    $('stat-plans').textContent = money(s.plans);
  } catch { /* the ledger is informational; keep the last values */ }
}

const params = new URLSearchParams(location.search);
const shared = params.get('invoice');
if (ethers.isAddress(params.get('contract') ?? '')) linkContract = ethers.getAddress(params.get('contract'));
if (shared) { view('invoices'); $('invoice-id').value = shared; lookup().catch(e => notice(err(e))); }
else view('overview');
