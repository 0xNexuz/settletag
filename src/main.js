import { ethers } from 'ethers';
import settleTag from './artifacts/SettleTag.json';
import './style.css';

const CHAIN_ID = 31611n;
const RPC = 'https://rpc.test.mezo.org';
const EXPLORER = 'https://explorer.test.mezo.org';
const TOKEN = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
const erc20Abi = ['function allowance(address owner,address spender) view returns (uint256)', 'function approve(address spender,uint256 amount) returns (bool)'];
const $ = (id) => document.getElementById(id);
let walletProvider;
let signer;
let currentInvoice;

function message(text, txHash) {
  const box = $('message');
  box.textContent = text;
  if (txHash) {
    const link = document.createElement('a');
    link.href = `${EXPLORER}/tx/${txHash}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = ' View transaction ↗';
    box.append(link);
  }
  box.hidden = false;
}

function errorText(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') return 'Wallet request cancelled.';
  return error?.shortMessage || error?.reason || error?.message || 'The request failed.';
}

function assertConfigured() {
  if (!CONTRACT || !ethers.isAddress(CONTRACT)) throw new Error('Set VITE_CONTRACT_ADDRESS to a deployed SettleTag contract.');
}

async function ensureWallet() {
  assertConfigured();
  if (!window.ethereum) throw new Error('Install an EVM browser wallet to sign transactions.');
  walletProvider = new ethers.BrowserProvider(window.ethereum);
  await walletProvider.send('eth_requestAccounts', []);
  const network = await walletProvider.getNetwork();
  if (network.chainId !== CHAIN_ID) {
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7b7b' }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7b7b', chainName: 'Mezo Testnet', rpcUrls: [RPC], blockExplorerUrls: [EXPLORER], nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 } }] });
    }
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    if ((await walletProvider.getNetwork()).chainId !== CHAIN_ID) throw new Error('Switch your wallet to Mezo testnet.');
  }
  signer = await walletProvider.getSigner();
  const address = await signer.getAddress();
  $('connect').textContent = `${address.slice(0, 6)}…${address.slice(-4)}`;
  $('wallet-status').textContent = `Connected · ${address.slice(0, 6)}…${address.slice(-4)}`;
  return signer;
}

function readContract() {
  assertConfigured();
  return new ethers.Contract(CONTRACT, settleTag.abi, new ethers.JsonRpcProvider(RPC));
}

async function lookup() {
  const id = $('invoice-id').value.trim();
  if (!ethers.isHexString(id, 32)) throw new Error('Enter a 32-byte invoice reference beginning with 0x.');
  const invoice = await readContract().invoices(id);
  if (invoice.status === 0n) throw new Error('Invoice not found on this contract.');
  currentInvoice = {
    id,
    merchant: invoice.merchant,
    amount: invoice.amount,
    deadline: invoice.deadline,
    status: invoice.status,
    payer: invoice.payer
  };
  const status = ['Missing', 'Open', 'Paid', 'Cancelled'][Number(invoice.status)];
  $('detail-status').textContent = status === 'Open' && invoice.deadline < BigInt(Math.floor(Date.now() / 1000)) ? 'Expired' : status;
  $('detail-amount').textContent = `${ethers.formatUnits(invoice.amount, 18)} MUSD`;
  $('detail-merchant').textContent = invoice.merchant;
  $('detail-deadline').textContent = new Date(Number(invoice.deadline) * 1000).toLocaleString();
  $('detail-payer').textContent = invoice.payer === ethers.ZeroAddress ? '—' : invoice.payer;
  $('pay').hidden = !(invoice.status === 1n && invoice.deadline >= BigInt(Math.floor(Date.now() / 1000)));
  $('invoice-details').hidden = false;
}

$('connect').addEventListener('click', async () => {
  try { await ensureWallet(); message('Wallet connected to Mezo testnet.'); }
  catch (error) { message(errorText(error)); }
});

$('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await ensureWallet();
    const amount = ethers.parseUnits($('amount').value.trim(), 18);
    if (amount <= 0n || amount > (2n ** 128n - 1n)) throw new Error('Enter a positive MUSD amount.');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number($('expiry').value) * 86400);
    const id = ethers.hexlify(ethers.randomBytes(32));
    const contract = new ethers.Contract(CONTRACT, settleTag.abi, signer);
    message('Confirm invoice creation in your wallet.');
    const tx = await contract.createInvoice(id, amount, deadline);
    message('Waiting for invoice transaction to confirm…', tx.hash);
    await tx.wait();
    const link = new URL(window.location.href);
    link.searchParams.set('invoice', id);
    $('share-link').value = link.href;
    $('created').hidden = false;
    $('invoice-id').value = id;
    await lookup();
    message('Invoice created and visible onchain.', tx.hash);
  } catch (error) { message(errorText(error)); }
  finally { button.disabled = false; }
});

$('lookup').addEventListener('click', async () => {
  try { await lookup(); message('Invoice loaded from Mezo testnet.'); }
  catch (error) { $('invoice-details').hidden = true; message(errorText(error)); }
});

$('pay').addEventListener('click', async () => {
  const button = $('pay');
  button.disabled = true;
  try {
    await ensureWallet();
    await lookup();
    if (!currentInvoice || currentInvoice.status !== 1n) throw new Error('Invoice is no longer open.');
    const token = new ethers.Contract(TOKEN, erc20Abi, signer);
    const allowance = await token.allowance(await signer.getAddress(), CONTRACT);
    if (allowance < currentInvoice.amount) {
      message('Approve the exact MUSD amount in your wallet.');
      const approval = await token.approve(CONTRACT, currentInvoice.amount);
      message('Waiting for MUSD approval…', approval.hash);
      await approval.wait();
    }
    const contract = new ethers.Contract(CONTRACT, settleTag.abi, signer);
    message('Confirm payment in your wallet.');
    const tx = await contract.payInvoice(currentInvoice.id);
    message('Waiting for MUSD settlement…', tx.hash);
    await tx.wait();
    await lookup();
    message('MUSD paid directly to the merchant. Receipt recorded.', tx.hash);
  } catch (error) { message(errorText(error)); }
  finally { button.disabled = false; }
});

$('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('share-link').value); message('Invoice link copied.'); }
  catch { message('Copy the link from the field above.'); }
});

if (!CONTRACT) {
  $('setup-note').textContent = 'Contract deployment pending. Configure VITE_CONTRACT_ADDRESS after an authorized Mezo testnet deployment to enable live invoices.';
  $('setup-note').hidden = false;
}
const sharedId = new URLSearchParams(window.location.search).get('invoice');
if (sharedId) {
  $('invoice-id').value = sharedId;
  if (CONTRACT) lookup().catch((error) => message(errorText(error)));
}
window.ethereum?.on?.('accountsChanged', () => window.location.reload());
window.ethereum?.on?.('chainChanged', () => window.location.reload());
