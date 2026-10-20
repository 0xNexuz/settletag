import { ethers } from 'ethers';
import settleTag from './artifacts/SettleTag.json';
import { createTestWallet, unlockTestWallet, savedWalletAddress, encryptedWalletBackup } from './wallet.js';
import './style.css';

const CHAIN = 31611n;
const RPC = 'https://rpc.test.mezo.org';
const EXPLORER = 'https://explorer.test.mezo.org';
const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
const tokenAbi = ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)'];
const $ = (id) => document.getElementById(id);
const rpc = new ethers.JsonRpcProvider(RPC);
let signer, address, invoice, transfer;

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
function err(e) { return e?.code === 4001 || e?.code === 'ACTION_REJECTED' ? 'Wallet request cancelled.' : e?.shortMessage || e?.reason || e?.message || 'Request failed.'; }
function view(name) {
  document.querySelectorAll('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== name; });
  const currentMenu = { overview: 'Home', invoices: 'Invoices', wallet: 'Wallet', faucet: 'Faucet' }[name];
  document.querySelectorAll('.menu-tab').forEach(el => el.classList.toggle('active', el.textContent.trim() === currentMenu));
  document.querySelectorAll('.sheet-tab').forEach(el => el.classList.toggle('active', el.dataset.view === name));
  const formulas = {
    overview: '=SETTLEMENT_PROOF(invoice, payer, MUSD)',
    invoices: '=INVOICE(reference, amount, deadline)',
    wallet: '=TESTNET_BALANCE(address, BTC, MUSD)',
    faucet: '=FUND_TEST_WALLET(address, faucet)'
  };
  document.querySelector('.formula-text').textContent = formulas[name];
  document.querySelector('.name-box').firstChild.textContent = `ST · 0${{ overview: 1, invoices: 2, wallet: 3, faucet: 4 }[name]} `;
  $('config-note').hidden = name !== 'invoices' || Boolean(CONTRACT);
  $('footer-status').textContent = `${name.toUpperCase()} · MEZO TESTNET`;
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => view(el.dataset.view)));
const journey = document.createElement('div');
journey.className = 'journey';
journey.innerHTML = '<div class="journey-heading"><span>WORKBOOK FLOW</span><strong>From wallet to verifiable receipt</strong></div><div class="journey-steps"><button type="button" data-step="wallet"><b>01</b><span>Prepare wallet<small>Create or connect a testnet account</small></span><i>↗</i></button><button type="button" data-step="faucet"><b>02</b><span>Get test funds<small>Request BTC from Mezo’s faucet</small></span><i>↗</i></button><button type="button" data-step="invoices"><b>03</b><span>Settle an invoice<small>Pay MUSD, verify the receipt</small></span><i>↗</i></button></div>';
document.querySelector('[data-panel="overview"] .build-note').before(journey);
journey.querySelectorAll('[data-step]').forEach(el => el.addEventListener('click', () => view(el.dataset.step)));
function setAddress(value) {
  address = value;
  $('wallet-address').textContent = value || 'No wallet selected';
  $('faucet-address').textContent = value || 'Create or unlock a test wallet first.';
  $('create-wallet').hidden = Boolean(savedWalletAddress());
  $('unlock-wallet').hidden = !savedWalletAddress() || Boolean(signer);
}
setAddress(savedWalletAddress());
async function checkNetwork() { if ((await rpc.getNetwork()).chainId !== CHAIN) throw new Error('The RPC is not connected to Mezo testnet.'); }
async function balances() {
  if (!address) throw new Error('Create or connect a wallet first.');
  await checkNetwork();
  const [btc, musd] = await Promise.all([rpc.getBalance(address), new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address)]);
  $('btc-balance').textContent = `${ethers.formatEther(btc)} BTC`;
  $('musd-balance').textContent = `${ethers.formatUnits(musd, 18)} MUSD`;
}
function needSigner() { if (!signer) throw new Error('Create, unlock, or connect a wallet first.'); return signer; }
function needContract() { if (!CONTRACT || !ethers.isAddress(CONTRACT)) throw new Error('Live invoices need a deployed contract. Set VITE_CONTRACT_ADDRESS after testnet deployment.'); }
function contract(runner = rpc) { needContract(); return new ethers.Contract(CONTRACT, settleTag.abi, runner); }

$('create-wallet').addEventListener('click', async () => {
  const btn = $('create-wallet'); btn.disabled = true;
  try {
    const result = await createTestWallet($('wallet-password').value);
    signer = result.wallet.connect(rpc); $('wallet-password').value = '';
    setAddress(result.wallet.address);
    $('recovery-phrase').textContent = result.recoveryPhrase; $('recovery').hidden = false;
    notice('Test wallet created. Save the recovery phrase before funding it.');
    await balances();
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('unlock-wallet').addEventListener('click', async () => {
  const btn = $('unlock-wallet'); btn.disabled = true;
  try {
    const wallet = await unlockTestWallet($('wallet-password').value);
    signer = wallet.connect(rpc); $('wallet-password').value = ''; setAddress(wallet.address);
    notice('Local test wallet unlocked.'); await balances();
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('hide-recovery').addEventListener('click', () => { $('recovery-phrase').textContent = ''; $('recovery').hidden = true; });
$('connect-browser').addEventListener('click', async () => {
  try {
    if (!window.ethereum) throw new Error('Install an EVM browser wallet to use an extension account.');
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
    signer = await provider.getSigner(); setAddress(await signer.getAddress());
    await balances(); notice('Browser wallet connected to Mezo testnet.');
  } catch (e) { notice(err(e)); }
});
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
    needSigner();
    const token = $('send-token').value, to = $('send-to').value.trim(), raw = $('send-amount').value.trim();
    if (!ethers.isAddress(to)) throw new Error('Enter a valid 0x recipient address.');
    if (!/^\d+(\.\d{1,18})?$/.test(raw)) throw new Error('Enter a positive amount with at most 18 decimal places.');
    const amount = ethers.parseUnits(raw, 18);
    if (amount <= 0n) throw new Error('Enter a positive amount.');
    await balances();
    const available = token === 'BTC' ? await rpc.getBalance(address) : await new ethers.Contract(MUSD, tokenAbi, rpc).balanceOf(address);
    if (available < amount) throw new Error(`Insufficient test ${token} balance.`);
    transfer = { token, to, amount, from: address };
    $('send-summary').textContent = `Send ${raw} test ${token} from ${address} to ${to} on Mezo testnet (chain 31611). Network fees require test BTC.`;
    $('send-review').hidden = false;
  } catch (e) { transfer = null; $('send-review').hidden = true; notice(err(e)); }
});
$('cancel-send').addEventListener('click', () => { transfer = null; $('send-review').hidden = true; });
$('confirm-send').addEventListener('click', async () => {
  const btn = $('confirm-send'); btn.disabled = true;
  try {
    if (!transfer) throw new Error('Review a transfer first.');
    if ((await needSigner().getAddress()).toLowerCase() !== transfer.from.toLowerCase()) throw new Error('The active wallet changed. Review again.');
    await checkNetwork();
    const tx = transfer.token === 'BTC'
      ? await signer.sendTransaction({ to: transfer.to, value: transfer.amount })
      : await new ethers.Contract(MUSD, tokenAbi, signer).transfer(transfer.to, transfer.amount);
    notice('Transfer submitted. Waiting for confirmation…', tx.hash);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Transaction reverted. Check the explorer.');
    transfer = null; $('send-review').hidden = true; await balances();
    notice('Testnet transfer confirmed.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});

async function lookup() {
  const id = $('invoice-id').value.trim();
  if (!ethers.isHexString(id, 32)) throw new Error('Enter a 32-byte invoice reference beginning with 0x.');
  const data = await contract().invoices(id);
  if (data.status === 0n) throw new Error('Invoice not found on this contract.');
  invoice = { id, merchant: data.merchant, amount: data.amount, deadline: data.deadline, status: data.status, payer: data.payer };
  const status = ['Missing', 'Open', 'Paid', 'Cancelled'][Number(data.status)];
  $('detail-status').textContent = status === 'Open' && data.deadline < BigInt(Math.floor(Date.now() / 1000)) ? 'Expired' : status;
  $('detail-amount').textContent = `${ethers.formatUnits(data.amount, 18)} MUSD`;
  $('detail-merchant').textContent = data.merchant;
  $('detail-deadline').textContent = new Date(Number(data.deadline) * 1000).toLocaleString();
  $('detail-payer').textContent = data.payer === ethers.ZeroAddress ? '—' : data.payer;
  $('pay').hidden = !(data.status === 1n && data.deadline >= BigInt(Math.floor(Date.now() / 1000)));
  $('invoice-details').hidden = false;
}
$('create-form').addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  try {
    needContract(); needSigner(); await checkNetwork();
    const amount = ethers.parseUnits($('amount').value.trim(), 18);
    if (amount <= 0n || amount > 2n ** 128n - 1n) throw new Error('Enter a positive MUSD amount.');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number($('expiry').value) * 86400);
    const id = ethers.hexlify(ethers.randomBytes(32));
    const tx = await contract(signer).createInvoice(id, amount, deadline);
    notice('Waiting for invoice confirmation…', tx.hash); await tx.wait();
    const link = new URL(location.href); link.searchParams.set('invoice', id);
    $('share-link').value = link.href; $('created').hidden = false; $('invoice-id').value = id;
    await lookup(); notice('Invoice created onchain.', tx.hash);
  } catch (error) { notice(err(error)); } finally { btn.disabled = false; }
});
$('lookup').addEventListener('click', () => lookup().then(() => notice('Invoice loaded from Mezo testnet.')).catch(e => { $('invoice-details').hidden = true; notice(err(e)); }));
$('pay').addEventListener('click', async () => {
  const btn = $('pay'); btn.disabled = true;
  try {
    needContract(); needSigner(); await checkNetwork(); await lookup();
    if (invoice.status !== 1n) throw new Error('Invoice is no longer open.');
    const token = new ethers.Contract(MUSD, tokenAbi, signer);
    if (await token.allowance(await signer.getAddress(), CONTRACT) < invoice.amount) {
      const approval = await token.approve(CONTRACT, invoice.amount);
      notice('Waiting for MUSD approval…', approval.hash); await approval.wait();
    }
    const tx = await contract(signer).payInvoice(invoice.id);
    notice('Waiting for settlement…', tx.hash); await tx.wait();
    await lookup(); await balances(); notice('MUSD paid to the merchant. Receipt recorded.', tx.hash);
  } catch (e) { notice(err(e)); } finally { btn.disabled = false; }
});
$('copy-link').addEventListener('click', () => navigator.clipboard.writeText($('share-link').value).then(() => notice('Invoice link copied.')).catch(() => notice('Copy the link from the field above.')));
if (!CONTRACT) {
  $('config-note').textContent = 'Live invoices require a deployed SettleTag contract and VITE_CONTRACT_ADDRESS.';
}
const shared = new URLSearchParams(location.search).get('invoice');
if (shared) { view('invoices'); $('invoice-id').value = shared; if (CONTRACT) lookup().catch(e => notice(err(e))); }
else view('overview');
