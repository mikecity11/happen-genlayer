import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT = '0x3C503720453B8B91f527d7686E036C0d97044825';
const EXPLORER = 'https://explorer-studio.genlayer.com';
const publicClient = createClient({ chain: studionet });
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const safeURL = (value) => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; } };
const date = (unix) => new Date(Number(unix) * 1000).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
const gen = (wei) => (Number(wei || 0) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 3 });
const toast = (message, html = false) => { const el = $('#toast'); if (html) el.innerHTML = message; else el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 8500); };
let markets = [];
let wallet = null;
let selected = null;
let filter = 'all';
let pendingHash = sessionStorage.getItem('happen-pending-tx');
$('#contractLink').href = EXPLORER + '/address/' + CONTRACT;

async function connectWallet() {
  if (wallet) { wallet = null; $('#walletButton').textContent = 'Connect wallet ↗'; toast('Wallet disconnected from this page.'); return false; }
  if (!window.ethereum) { toast('Install a compatible browser wallet such as MetaMask, then connect to Studionet.'); return false; }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) return false;
  wallet = accounts[0];
  const client = createClient({ chain: studionet, account: wallet, provider: window.ethereum });
  await client.connect('studionet');
  $('#walletButton').textContent = wallet.slice(0,6) + '…' + wallet.slice(-4) + ' ⌄';
  toast('Wallet connected to GenLayer Studionet.');
  return true;
}
$('#walletButton').onclick = () => connectWallet().catch(error => toast(error.shortMessage || error.message || 'Wallet connection failed.'));
window.ethereum?.on?.('accountsChanged', () => { wallet = null; $('#walletButton').textContent = 'Connect wallet ↗'; });
window.ethereum?.on?.('chainChanged', () => { wallet = null; $('#walletButton').textContent = 'Connect wallet ↗'; });

function marketState(m) {
  if (Number(m.outcome) === 1) return 'YES resolved';
  if (Number(m.outcome) === 2) return 'NO resolved';
  if (Number(m.outcome) === 3) return 'Refund';
  return Date.now() >= Number(m.close_ts) * 1000 ? 'Closed' : 'Open';
}
function renderMarkets() {
  const visible = markets.filter(m => {
    const state = marketState(m);
    return filter === 'all' || (filter === 'open' && state === 'Open') || (filter === 'closed' && state === 'Closed') || (filter === 'resolved' && !['Open','Closed'].includes(state));
  });
  $('#marketCount').textContent = visible.length + ' market' + (visible.length === 1 ? '' : 's');
  $('#marketList').innerHTML = visible.length ? visible.map(m => {
    const state = marketState(m), open = state === 'Open';
    const afterDeadline = Date.now() > Number(m.deadline_ts) * 1000 + 86400000;
    const refundable = Date.now() > Number(m.deadline_ts) * 1000 + 7 * 86400000;
    const action = open ? `<button data-position="${Number(m.id)}">Take a side ↗</button>` :
      Number(m.outcome) !== 0 ? `<button data-write="claim" data-market="${Number(m.id)}">Claim / refund ↗</button>` :
      refundable ? `<button data-write="refund_unresolved" data-market="${Number(m.id)}">Unlock refunds ↗</button>` :
      afterDeadline ? `<button data-write="resolve" data-market="${Number(m.id)}">Check outcome ↗</button>` :
      '<button disabled>Awaiting event</button>';
    return `<article class="market-card"><div class="card-top"><span class="category">◈ ${escapeHTML(m.city)}</span><span class="market-status ${open ? '' : 'closed'}"><i></i> ${escapeHTML(state)}</span></div><h3>${escapeHTML(m.title)}</h3><p>YES if the event physically begins in ${escapeHTML(m.city)} by the deadline. GenLayer validators check the evidence afterward.</p><div class="source-links"><a href="${safeURL(m.source)}" target="_blank" rel="noopener noreferrer">Primary source ↗</a><a href="${safeURL(m.backup)}" target="_blank" rel="noopener noreferrer">Second source ↗</a></div><div class="card-metrics"><div class="metric yes"><b>${gen(m.yes_total)} GEN</b><small>YES pool</small></div><div class="metric no"><b>${gen(m.no_total)} GEN</b><small>NO pool</small></div></div><div class="card-footer"><span>MARKET #${Number(m.id)} · CLOSES ${escapeHTML(date(m.close_ts))}</span>${action}</div></article>`;
  }).join('') : `<div class="empty"><strong>${filter === 'all' ? 'No markets found yet.' : 'Nothing in this category yet.'}</strong>${filter === 'all' ? 'Be the first to create one on GenLayer.' : 'Try another filter.'}</div>`;
  document.querySelectorAll('[data-position]').forEach(button => button.onclick = () => {
    selected = markets.find(m => Number(m.id) === Number(button.dataset.position));
    $('#positionTitle').textContent = selected.title;
    $('#positionDialog').showModal();
  });
  document.querySelectorAll('[data-write]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await submitWrite(button.dataset.write, [Number(button.dataset.market)]); }
    catch (error) { toast(error.shortMessage || error.message || 'Transaction was not submitted.'); }
    finally { button.disabled = false; }
  });
}
async function loadMarkets() {
  try {
    const found = [];
    // IDs are assigned consecutively by the deployed contract. Stop at the first missing ID.
    for (let id = 1; id <= 100; id++) {
      try {
        let m = await publicClient.readContract({ address: CONTRACT, functionName: 'get_market', args: [id] });
        if (typeof m === 'string') m = JSON.parse(m);
        if (!m || typeof m !== 'object' || !m.title) break;
        found.push(m);
      } catch (error) {
        if (id === 1) throw error;
        break;
      }
    }
    markets = found;
    renderMarkets();
    $('#connectionStatus').textContent = '● Reading finalized Studionet contract state';
  } catch (error) {
    $('#marketList').innerHTML = '<div class="empty"><strong>Markets could not load.</strong>Studionet may be temporarily unavailable. Try refreshing this page.</div>';
    $('#marketCount').textContent = 'Network unavailable';
    $('#connectionStatus').textContent = '● Studionet read failed';
    console.error('GenLayer read failed', error);
  }
}
async function submitWrite(functionName, args, value = 0n) {
  if (!wallet && !await connectWallet()) throw new Error('Connect a wallet to continue.');
  const client = createClient({ chain: studionet, account: wallet, provider: window.ethereum });
  // genlayer-js 1.1.x on stable Studionet accepts a value field for all writes.
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, value });
  pendingHash = hash;
  sessionStorage.setItem('happen-pending-tx', hash);
  toast(`Transaction submitted. <a href="${EXPLORER}/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">Track on Explorer ↗</a>`, true);
  try {
    const tx = await client.waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 3000, retries: 120 });
    if (tx.txExecutionResultName && tx.txExecutionResultName !== 'FINISHED_WITH_RETURN') throw new Error('Contract execution failed: ' + tx.txExecutionResultName);
    sessionStorage.removeItem('happen-pending-tx');
    pendingHash = null;
    toast('Transaction finalized and accepted on Studionet.');
    await loadMarkets();
  } catch (error) {
    toast(`Check transaction status on <a href="${EXPLORER}/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">Explorer ↗</a> before trying again.`, true);
    console.error('Finalization tracking:', error);
  }
}
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button));
  renderMarkets();
});
$('#createButton').onclick = $('#heroCreate').onclick = () => $('#createDialog').showModal();
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('#createForm').onsubmit = async event => {
  event.preventDefault();
  const f = new FormData(event.target);
  const close = Math.floor(new Date(f.get('close')).getTime() / 1000);
  const deadline = Math.floor(new Date(f.get('deadline')).getTime() / 1000);
  if (!Number.isFinite(close) || close <= Date.now() / 1000 || deadline <= close) return toast('Choose a future position cutoff and a later event deadline.');
  if (f.get('source') === f.get('backup') || safeURL(f.get('source')) === '#' || safeURL(f.get('backup')) === '#') return toast('Provide two distinct HTTPS evidence URLs.');
  const button = event.target.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Opening wallet…';
  try {
    await submitWrite('create_market', [f.get('title').trim(), f.get('city').trim(), BigInt(close), BigInt(deadline), f.get('source'), f.get('backup')]);
    event.target.closest('dialog').close(); event.target.reset();
  } catch (error) { toast(error.shortMessage || error.message || 'Transaction was not submitted.'); }
  finally { button.disabled = false; button.textContent = 'Create on GenLayer ↗'; }
};
$('#positionForm').onsubmit = async event => {
  event.preventDefault();
  if (!selected || marketState(selected) !== 'Open') return toast('Positions are closed.');
  const f = new FormData(event.target), stake = String(f.get('stake'));
  if (!/^\d+(\.\d{1,18})?$/.test(stake) || Number(stake) < 0.001) return toast('Enter at least 0.001 test GEN.');
  const [whole, fraction = ''] = stake.split('.');
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  const button = event.target.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Opening wallet…';
  try {
    await submitWrite('take_position', [Number(selected.id), f.get('side') === 'yes'], wei);
    event.target.closest('dialog').close();
  } catch (error) { toast(error.shortMessage || error.message || 'Transaction was not submitted.'); }
  finally { button.disabled = false; button.textContent = 'Review in wallet ↗'; }
};
if (pendingHash) toast(`A transaction is still being tracked. <a href="${EXPLORER}/tx/${encodeURIComponent(pendingHash)}" target="_blank" rel="noopener noreferrer">View on Explorer ↗</a>`, true);
loadMarkets();
