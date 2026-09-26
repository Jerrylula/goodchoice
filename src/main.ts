import './style.css';
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import artifact from '../generated/OreNine.json';

type Wallet = { id: string; name: string; provider: Eip1193 };
type Eip1193 = { request(args: { method: string; params?: unknown[] | object }): Promise<unknown>; on?: (event: string, callback: (...args: unknown[]) => void) => void };
type Round = { openedAt: bigint; closesAt: bigint; status: bigint; occupiedMask: bigint; occupiedCount: bigint; winner: bigint; requestId: bigint; oracleFee: bigint; gross: bigint; net: bigint; fees: bigint; claimed: bigint; losingRefund: bigint; bonus: bigint; participants: bigint; claims: bigint; cells: bigint[] };
declare global { interface Window { ethereum?: Eip1193 & { providers?: Eip1193[] } } }

const RPC = 'https://rpc.mainnet.arc.io';
const CHAIN = '0x13b2'; // 5042
const ADDRESS = import.meta.env.VITE_GAME_ADDRESS?.trim() ?? '';
const ready = /^0x[0-9a-fA-F]{40}$/.test(ADDRESS);
const readProvider = new JsonRpcProvider(RPC, 5042);
const readGame = ready ? new Contract(ADDRESS, artifact.abi, readProvider) : null;
const app = document.querySelector<HTMLDivElement>('#app')!;
let wallets: Wallet[] = [];
let active: Wallet | null = null;
let account = '';
let walletOnArc = false;
let restoring = false;
let walletDiscoveryVersion = 0;
let selected = 4;
let current = 1n;
let round: Round | null = null;
let busy = false;

const fmt = (n: bigint, decimals = 4) => Number(formatEther(n)).toLocaleString('zh-CN', { maximumFractionDigits: decimals });
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const status = ['投入中', '等待开奖', '已结算', '已取消'];
const msg = (e: unknown) => e instanceof Error ? e.message.split(' (')[0] : String(e);

app.innerHTML = `<main class="shell"><header><div class="brand">◈ NINE / ARC</div><div class="header-actions"><span class="chain">● ARC MAINNET</span><button id="wallet-btn">连接钱包</button><button id="disconnect-btn" hidden>断开</button></div></header><section class="hero"><p class="eyebrow">九格 · 每轮独立</p><h1>选一格，<em>等待命运。</em></h1><p>九格中仅从有投入的格子等概率开奖。每轮投入 60 秒，结算或取消后开启下一轮。</p></section><div id="notice" class="notice" hidden></div><section class="dashboard"><div class="card board-card"><div class="section-head"><div><span class="eyebrow">01 / BOARD</span><h2>选择格子</h2></div><span id="round-badge" class="badge">加载中</span></div><div id="board" class="board"></div><div class="stake-row"><label>本次投入（USDC）<input id="amount" type="number" min="0.00000000000001" step="any" placeholder="例如 1.00"></label><div class="fee-line"><span>项目手续费 0.5% · 仅在投入时收取</span><strong id="net">净投入 —</strong></div><button id="stake-btn" class="primary">投入选中格</button></div></div><div class="column"><div class="card"><div class="section-head"><div><span class="eyebrow">02 / ROUND</span><h2>本轮进度</h2></div><strong id="timer">—</strong></div><div class="metrics"><div><small>轮次</small><strong id="round-id">—</strong></div><div><small>参与格</small><strong id="occupied">—</strong></div><div><small>总净投入</small><strong id="pool">—</strong></div></div><p id="state-text" class="muted">正在读取链上数据…</p><div class="action-row"><button id="draw-btn">发起开奖</button><button id="finalize-btn">完成结算</button><button id="cancel-btn">超时取消</button></div><div class="oracle">D20DAO 预估开奖费 <b id="quote">—</b><br>本轮实际支付 <b id="paid">—</b><br>运营金库余额 <b id="reserve">—</b></div></div><div class="card"><span class="eyebrow">03 / MY POSITION</span><h2>我的投入与领取</h2><div id="positions" class="positions muted">连接钱包后查看。</div></div></div></section><footer>Arc 原生 USDC · 赢家获得输家净投入的 70%；输家返还 30% · 钱包另付链上 Gas<br><span>若仅一格参与或超时无有效随机结果，退还含手续费的全部本金。开奖结果来自 D20DAO。</span></footer></main><div id="wallet-modal" class="modal" hidden><div class="modal-panel"><div class="section-head"><h2>选择钱包</h2><button id="close-modal">✕</button></div><div id="wallet-list"></div></div></div>`;
document.querySelector('.oracle')!.insertAdjacentHTML('beforeend', '<br>项目方可提手续费 <b id="available-fees">—</b>');
document.querySelector('.column')!.insertAdjacentHTML('beforeend', '<div id="owner-card" class="card" hidden><span class="eyebrow">OWNER / FEES</span><h2>项目方手续费</h2><p class="muted">仅部署钱包可提取已结算且未用于开奖的手续费。提取后运营金库减少，可能影响后续开奖。</p><label>提取金额（USDC）<input id="withdraw-amount" type="number" min="0" step="any" placeholder="输入提取金额"></label><div class="action-row"><button id="withdraw-max">全部可提</button><button id="withdraw-btn">提取手续费</button></div></div>');
document.querySelector('#stake-btn')!.insertAdjacentHTML('afterend', '<p id="stake-hint" class="muted" aria-live="polite"></p>');
document.querySelector('#state-text')!.insertAdjacentHTML('afterend', '<div class="draw-timing" aria-live="polite"><span id="draw-label">距可发起开奖</span><strong id="draw-countdown">—</strong><small id="draw-explain">至少两个不同格子参与才会开奖。</small></div>');
let availableFees = 0n;

function notice(message: string, error = false) { const el = document.querySelector<HTMLDivElement>('#notice')!; el.textContent = message; el.className = `notice ${error ? 'error' : ''}`; el.hidden = false; }
function clearNotice() { document.querySelector<HTMLDivElement>('#notice')!.hidden = true; }
function addWallet(id: string, name: string, provider: Eip1193) {
  if (wallets.some(w => w.provider === provider)) return;
  wallets.push({ id, name, provider });
  walletDiscoveryVersion++;
  void restoreWallet();
}
window.addEventListener('eip6963:announceProvider', ((event: Event) => {
  const d = (event as CustomEvent<{ info: { rdns?: string; name: string }; provider: Eip1193 }>).detail;
  addWallet(`eip6963:${d.info.rdns ?? d.info.name}`, d.info.name, d.provider);
}) as EventListener);
window.dispatchEvent(new Event('eip6963:requestProvider'));
function discoverInjectedWallets() {
  if (window.ethereum?.providers?.length) window.ethereum.providers.forEach((p, i) => addWallet(`injected-${i}`, `EVM 钱包 ${i + 1}`, p));
  else if (window.ethereum) addWallet('injected', '浏览器钱包', window.ethereum);
}
let discoveryAttempts = 0;
const discoveryTimer = setInterval(() => { discoverInjectedWallets(); if (++discoveryAttempts >= 10) clearInterval(discoveryTimer); }, 500);

async function switchToArc(provider: Eip1193) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN }] }); }
  catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN, chainName: 'Arc Mainnet', rpcUrls: [RPC], nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, blockExplorerUrls: ['https://explorer.arc.io'] }] });
  }
  walletOnArc = (await provider.request({ method: 'eth_chainId' }) as string).toLowerCase() === CHAIN;
  updateTime();
}
async function connect(w: Wallet, silent = false): Promise<boolean> {
  try {
    const accounts = await w.provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' }) as string[];
    if (!accounts.length || (silent && localStorage.getItem('nine-account') && !accounts.some(a => a.toLowerCase() === localStorage.getItem('nine-account')!.toLowerCase()))) return false;
    const chain = await w.provider.request({ method: 'eth_chainId' }) as string;
    walletOnArc = chain.toLowerCase() === CHAIN;
    if (!walletOnArc && !silent) await switchToArc(w.provider);
    active = w; account = accounts[0]; localStorage.setItem('nine-wallet', w.id); localStorage.setItem('nine-account', account);
    document.querySelector<HTMLButtonElement>('#wallet-btn')!.textContent = short(account);
    document.querySelector<HTMLButtonElement>('#disconnect-btn')!.hidden = false;
    document.querySelector<HTMLDivElement>('#wallet-modal')!.hidden = true;
    clearNotice();
    if (!walletOnArc) notice('钱包已恢复连接。请点击顶部钱包地址切换到 Arc 主网。', true);
    w.provider.on?.('accountsChanged', () => { if (active === w) location.reload(); });
    w.provider.on?.('chainChanged', () => { if (active === w) location.reload(); });
    await refresh();
    return true;
  } catch (e) { if (!silent) notice(msg(e), true); return false; }
}
async function restoreWallet() {
  if (restoring || active || !localStorage.getItem('nine-wallet')) return;
  restoring = true;
  const version = walletDiscoveryVersion;
  try {
    const remembered = localStorage.getItem('nine-wallet');
    const candidates = [...wallets].sort((a, b) => Number(b.id === remembered) - Number(a.id === remembered));
    for (const wallet of candidates) if (await connect(wallet, true)) break;
  } finally {
    restoring = false;
    if (!active && version !== walletDiscoveryVersion) void restoreWallet();
  }
}

document.querySelector('#wallet-btn')!.addEventListener('click', () => {
  if (active) { void switchToArc(active.provider).then(() => { if (walletOnArc) { clearNotice(); void refresh(); } }).catch(e => notice(msg(e), true)); return; }
  const list = document.querySelector('#wallet-list')!; list.innerHTML = '';
  if (!wallets.length) { list.textContent = '未检测到 EVM 钱包。请安装 MetaMask、Binance Wallet 等浏览器钱包。'; }
  wallets.forEach(w => { const button = document.createElement('button'); button.className = 'wallet-option'; button.textContent = w.name; button.onclick = () => void connect(w); list.append(button); });
  document.querySelector<HTMLDivElement>('#wallet-modal')!.hidden = false;
});
document.querySelector('#close-modal')!.addEventListener('click', () => { document.querySelector<HTMLDivElement>('#wallet-modal')!.hidden = true; });
document.querySelector('#disconnect-btn')!.addEventListener('click', () => { localStorage.removeItem('nine-wallet'); localStorage.removeItem('nine-account'); active = null; account = ''; location.reload(); });

function renderBoard() {
  const board = document.querySelector('#board')!; board.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const button = document.createElement('button'); button.className = `cell ${selected === i ? 'selected' : ''}`;
    button.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span><strong>${round ? fmt(round.cells[i]) : '—'}</strong><small>USDC</small>`;
    button.onclick = () => { selected = i; renderBoard(); }; board.append(button);
  }
}
document.querySelector<HTMLInputElement>('#amount')!.addEventListener('input', () => {
  const value = document.querySelector<HTMLInputElement>('#amount')!.value;
  try { const gross = parseEther(value); const fee = gross * 50n / 10000n; document.querySelector('#net')!.textContent = `净投入 ${fmt(gross - fee)} USDC`; }
  catch { document.querySelector('#net')!.textContent = '净投入 —'; }
});

async function write(method: string, args: unknown[] = [], value?: bigint) {
  if (!active) { notice('请先连接钱包。', true); return; }
  if (!readGame) { notice('尚未配置游戏合约地址。', true); return; }
  if (!walletOnArc) { notice('请点击顶部钱包地址切换到 Arc 主网。', true); return; }
  if (busy) { notice('上一笔交易仍在处理中，请稍候。', true); return; }
  if (method === 'stake' && (!round || Number(round.status) !== 0 || Date.now() / 1000 >= Number(round.closesAt))) {
    notice('本轮投入已截止。请先完成开奖或取消，等待下一轮开始。', true); return;
  }
  busy = true;
  try {
    const browser = new BrowserProvider(active.provider);
    const signer = await browser.getSigner();
    const game = new Contract(ADDRESS, artifact.abi, signer);
    const tx = await game[method](...args, value === undefined ? {} : { value });
    notice(`交易已提交：${short(tx.hash)}。等待链上确认…`);
    await tx.wait(); notice('交易已确认。'); await refresh();
  } catch (e) { notice(msg(e), true); } finally { busy = false; }
}
document.querySelector('#stake-btn')!.addEventListener('click', () => { try { const value = parseEther(document.querySelector<HTMLInputElement>('#amount')!.value); if (value <= 0n) throw Error('请输入投入金额'); void write('stake', [selected], value); } catch (e) { notice(msg(e), true); } });
document.querySelector('#draw-btn')!.addEventListener('click', () => void write('requestDraw'));
document.querySelector('#finalize-btn')!.addEventListener('click', () => void write('finalize'));
document.querySelector('#cancel-btn')!.addEventListener('click', () => void write('cancelExpired'));
document.querySelector('#withdraw-max')!.addEventListener('click', () => { document.querySelector<HTMLInputElement>('#withdraw-amount')!.value = formatEther(availableFees); });
document.querySelector('#withdraw-btn')!.addEventListener('click', () => {
  try {
    const amount = parseEther(document.querySelector<HTMLInputElement>('#withdraw-amount')!.value);
    if (amount <= 0n || amount > availableFees) throw Error('金额必须大于零，且不能超过可提手续费');
    void write('withdrawFees', [amount]);
  } catch (e) { notice(msg(e), true); }
});

async function refresh() {
  if (!readGame) { notice('尚未配置游戏合约地址。部署合约后设置 VITE_GAME_ADDRESS 并重新构建。', true); renderBoard(); return; }
  try {
    current = await readGame.currentRound(); round = await readGame.roundInfo(current) as Round;
    document.querySelector('#round-id')!.textContent = `#${current}`;
    document.querySelector('#occupied')!.textContent = `${round.occupiedCount} / 9`;
    document.querySelector('#pool')!.textContent = `${fmt(round.net)} USDC`;
    document.querySelector('#paid')!.textContent = `${fmt(round.oracleFee)} USDC`;
    document.querySelector('#reserve')!.textContent = `${fmt(await readGame.operationsReserve())} USDC`;
    availableFees = await readGame.withdrawableFees() as bigint;
    document.querySelector('#available-fees')!.textContent = `${fmt(availableFees)} USDC`;
    const owner = await readGame.owner() as string;
    document.querySelector<HTMLDivElement>('#owner-card')!.hidden = !account || owner.toLowerCase() !== account.toLowerCase();
    try {
      const coordinator = await readGame.oracle() as string;
      const oracle = new Contract(coordinator, ['function quoteFeeAt(uint32,uint256) view returns (uint256)'], readProvider);
      const base = (await readProvider.getBlock('latest'))?.baseFeePerGas ?? 0n;
      const estimate = await oracle.quoteFeeAt(100000, base * 12n / 10n) as bigint;
      document.querySelector('#quote')!.textContent = `${fmt(estimate)} USDC（含 20% base fee 缓冲）`;
    } catch { document.querySelector('#quote')!.textContent = '暂不可用'; }
    renderBoard(); updateTime(); await renderPositions();
  } catch (e) { notice(`读取链上数据失败：${msg(e)}`, true); }
}

function updateTime() {
  if (!round) return;
  const now = Math.floor(Date.now() / 1000); const close = Number(round.closesAt); const left = Math.max(0, close - now);
  const graceLeft = Math.max(0, close + 60 - now);
  const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const drawLabel = document.querySelector('#draw-label')!;
  const drawCountdown = document.querySelector('#draw-countdown')!;
  const drawExplain = document.querySelector('#draw-explain')!;
  document.querySelector('#timer')!.textContent = left ? `${left}s` : '已截止';
  document.querySelector('#round-badge')!.textContent = Number(round.status) === 0 && now >= close ? '已截止' : status[Number(round.status)];
  if (Number(round.status) === 0 && now < close) {
    drawLabel.textContent = '距可发起开奖'; drawCountdown.textContent = clock(left);
    drawExplain.textContent = '截止后仅从至少两个已参与格子中开奖。';
  } else if (Number(round.status) === 0 && round.occupiedCount < 2n) {
    drawLabel.textContent = '参与格不足两格'; drawCountdown.textContent = '不开奖';
    drawExplain.textContent = '本轮将取消并全额退款，之后开启下一轮。';
  } else if (Number(round.status) === 0 && graceLeft > 0) {
    drawLabel.textContent = '开奖请求窗口剩余'; drawCountdown.textContent = clock(graceLeft);
    drawExplain.textContent = '需在窗口结束前请求 D20DAO 随机数。';
  } else if (Number(round.status) === 1 && graceLeft > 0) {
    drawLabel.textContent = '等待 D20DAO 随机结果'; drawCountdown.textContent = clock(graceLeft);
    drawExplain.textContent = '结果没有固定返回时间；倒计时是无结果时的可取消时间。';
  } else if (Number(round.status) === 1) {
    drawLabel.textContent = '等待结算或取消'; drawCountdown.textContent = '—';
    drawExplain.textContent = '有效结果仍应结算；无有效结果可取消并退款。';
  } else {
    drawLabel.textContent = '开奖窗口已过'; drawCountdown.textContent = '可取消';
    drawExplain.textContent = '本轮需取消并退款，随后开启下一轮。';
  }
  document.querySelector('#state-text')!.textContent = Number(round.status) === 1 ? '已发起开奖，等待随机结果与结算。' : now < close ? '投入阶段。只对有投入的格子开奖。' : graceLeft > 0 ? '投入已关闭。等待开奖或取消。' : '开奖窗口已到期；若无有效结果可取消退款。';
  const stakeButton = document.querySelector<HTMLButtonElement>('#stake-btn')!;
  stakeButton.disabled = !ready || !account || !walletOnArc || Number(round.status) !== 0 || now >= close;
  stakeButton.title = !account ? '请先连接钱包' : !walletOnArc ? '请切换到 Arc 主网' : now >= close ? '本轮已截止，请先开启下一轮' : '';
  document.querySelector('#stake-hint')!.textContent = !account ? '连接钱包后才可投入。' : !walletOnArc ? '点击顶部钱包地址切换到 Arc 主网。' : now >= close ? '本轮已截止。先处理本轮，开启下一轮后才能投入。' : '请在倒计时结束前完成钱包确认。';
  document.querySelector<HTMLButtonElement>('#draw-btn')!.hidden = Number(round.status) !== 0 || now < close;
  document.querySelector<HTMLButtonElement>('#finalize-btn')!.hidden = Number(round.status) !== 1;
  document.querySelector<HTMLButtonElement>('#cancel-btn')!.hidden = (Number(round.status) !== 0 && Number(round.status) !== 1) || now < close + 60;
}
async function renderPositions() {
  const el = document.querySelector('#positions')!;
  if (!account || !readGame) { el.textContent = '连接钱包后查看。'; return; }
  el.innerHTML = '';
  const first = current > 10n ? current - 10n : 1n;
  for (let id = current; id >= first; id--) {
    const gross = await readGame.grossStake(id, account) as bigint;
    if (!gross) { if (id === 1n) break; continue; }
    const info = id === current ? round! : await readGame.roundInfo(id) as Round;
    const done = await readGame.claimed(id, account) as boolean;
    const item = document.createElement('div'); item.className = 'position';
    item.innerHTML = `<div><strong>#${id}</strong> <span>${fmt(gross)} USDC</span><small>${status[Number(info.status)]}${Number(info.status) === 2 ? ` · 中签格 ${Number(info.winner) + 1}` : ''}</small></div>`;
    if (Number(info.status) >= 2 && !done) { const button = document.createElement('button'); button.textContent = '领取'; button.onclick = () => void write('claim', [id]); item.append(button); }
    else if (done) item.innerHTML += '<span class="received">已领取</span>';
    el.append(item); if (id === 1n) break;
  }
  if (!el.children.length) el.textContent = '最近 10 轮没有投入记录。';
}

renderBoard();
setTimeout(() => void restoreWallet(), 700);
void refresh();
setInterval(updateTime, 1_000);
setInterval(() => void refresh(), 15_000);
