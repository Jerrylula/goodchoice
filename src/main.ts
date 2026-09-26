import './style.css';
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import artifact from '../generated/OreNine.json';

type Language = 'zh' | 'en';
type View = 'current' | 'result';
type Eip1193 = { request(args: { method: string; params?: unknown[] | object }): Promise<unknown>; on?: (event: string, callback: (...args: unknown[]) => void) => void };
type Wallet = { id: string; name: string; provider: Eip1193 };
type Round = { openedAt: bigint; closesAt: bigint; status: bigint; occupiedMask: bigint; occupiedCount: bigint; winner: bigint; requestId: bigint; oracleFee: bigint; gross: bigint; net: bigint; fees: bigint; claimed: bigint; losingRefund: bigint; bonus: bigint; participants: bigint; claims: bigint; cells: bigint[] };
declare global { interface Window { ethereum?: Eip1193 & { providers?: Eip1193[] } } }

const RPC = 'https://rpc.mainnet.arc.io';
const CHAIN = '0x13b2';
const ADDRESS = import.meta.env.VITE_GAME_ADDRESS?.trim() ?? '';
const ready = /^0x[0-9a-fA-F]{40}$/.test(ADDRESS);
const readProvider = new JsonRpcProvider(RPC, 5042);
const readGame = ready ? new Contract(ADDRESS, artifact.abi, readProvider) : null;
const app = document.querySelector<HTMLDivElement>('#app')!;
const copy = {
  zh: {
    game: '游戏', rules: '规则', records: '记录', connect: '连接钱包', disconnect: '断开连接', wallet: '选择钱包', noWallet: '未检测到 EVM 钱包。请安装 MetaMask、Binance Wallet 等浏览器钱包。',
    hero: '九格，等一个答案。', subtitle: '在九格中选择你的一格。只从有投入的格子中等概率开奖。', current: '当前轮次', result: '上一轮结果', round: '第', roundSuffix: '轮',
    open: '投入中', drawing: '等待开奖', settled: '已结算', cancelled: '已取消', closed: '已截止', loading: '读取中',
    tile: '格', winningTile: '本轮中奖格', noResult: '尚无上一轮结果', occupied: '参与格', pool: '总净投入', phase: '状态', countdown: '投入倒计时',
    stageStake: '投入', stageDraw: '开奖', stageSettle: '结算', stakeTitle: '本轮投入', amount: '投入金额', selectedTile: '选择格子', fee: '项目手续费 (0.5%)', net: '实际进入奖池', stake: '投入格',
    connectHint: '连接钱包后可以投入。', chainHint: '请切换到 Arc 主网。', closedHint: '本轮投入已截止，请等待结算或退款后开启下一轮。', openHint: '请在倒计时结束前完成钱包确认。',
    quote: 'D20DAO 预估开奖费', paid: '本轮实际支付', reserve: '运营金库余额', available: '项目方可提手续费', pendingQuote: '暂不可用',
    request: '发起开奖', finalize: '完成结算', cancel: '超时取消', actions: '链上推进', actionHelp: '自动开奖服务会尝试推进本轮；需要时也可手动操作并自付 Gas。',
    resultMine: '我的投入', positions: '我的近期记录', noPositions: '最近 10 轮没有投入记录。', connectPositions: '连接钱包后查看记录。', claim: '领取', claimed: '已领取', winning: '中签', losing: '未中签', refund: '全额退款', claimHelp: '结算后需由钱包领取；领取交易另付 Gas。',
    nextRound: '下一轮', viewCurrent: '查看当前轮次', history: '最近 10 轮', rulesTitle: '玩法规则', rulesText: '每轮投入 60 秒。至少两个不同格子参与时，D20DAO 在参与格中等概率选出一格。每次投入扣除 0.5% 项目手续费。未中签格的净投入返还 30%，其余 70% 分给中签格。参与格不足或超时取消时，退还包括手续费在内的全部投入；链上 Gas 不退。',
    ownerTitle: '项目方手续费', ownerHelp: '仅部署钱包可提取已结算且未用于开奖的手续费。', withdrawAmount: '提取金额 (USDC)', withdrawMax: '全部可提', withdraw: '提取手续费',
    notConfigured: '尚未配置游戏合约地址。请设置 VITE_GAME_ADDRESS 后重新构建。', readFailed: '读取链上数据失败', txSubmitted: '交易已提交，等待链上确认', txConfirmed: '交易已确认。', txBusy: '上一笔交易仍在处理中。', invalidAmount: '请输入大于零的投入金额。', invalidWithdraw: '金额必须大于零且不超过可提手续费。', footer: 'Arc 主网 · 原生 USDC · 每轮独立 · 钱包自付 Gas',
  },
  en: {
    game: 'Game', rules: 'Rules', records: 'History', connect: 'Connect wallet', disconnect: 'Disconnect', wallet: 'Choose wallet', noWallet: 'No EVM wallet found. Install MetaMask, Binance Wallet, or another browser wallet.',
    hero: 'Nine tiles. One answer.', subtitle: 'Choose one of nine tiles. Only occupied tiles have an equal chance to win.', current: 'Current round', result: 'Last result', round: 'Round ', roundSuffix: '',
    open: 'Open', drawing: 'Drawing', settled: 'Settled', cancelled: 'Cancelled', closed: 'Closed', loading: 'Loading',
    tile: 'Tile ', winningTile: 'Winning tile', noResult: 'No previous result yet', occupied: 'Occupied', pool: 'Net pool', phase: 'Status', countdown: 'Time to close',
    stageStake: 'Stake', stageDraw: 'Draw', stageSettle: 'Settle', stakeTitle: 'Place a stake', amount: 'Amount', selectedTile: 'Selected tile', fee: 'Project fee (0.5%)', net: 'Net stake', stake: 'Stake on tile ',
    connectHint: 'Connect a wallet to stake.', chainHint: 'Switch to Arc Mainnet.', closedHint: 'This round is closed. Wait for settlement or refund before the next round.', openHint: 'Confirm the transaction in your wallet before the countdown ends.',
    quote: 'Estimated D20DAO draw fee', paid: 'Draw fee paid', reserve: 'Operations reserve', available: 'Owner-withdrawable fees', pendingQuote: 'Unavailable',
    request: 'Request draw', finalize: 'Finalize', cancel: 'Cancel after timeout', actions: 'Advance round', actionHelp: 'The automatic keeper will try to advance this round. You may also submit a transaction and pay its gas.',
    resultMine: 'My stakes', positions: 'My recent rounds', noPositions: 'No stakes in the last 10 rounds.', connectPositions: 'Connect a wallet to see your rounds.', claim: 'Claim', claimed: 'Claimed', winning: 'Winner', losing: 'Not a winner', refund: 'Full refund', claimHelp: 'Claim after settlement or cancellation. Your wallet pays transaction gas.',
    nextRound: 'Next round', viewCurrent: 'View current round', history: 'Last 10 rounds', rulesTitle: 'How it works', rulesText: 'Each round accepts stakes for 60 seconds. With at least two occupied tiles, D20DAO chooses one occupied tile with equal probability. Each stake pays a 0.5% project fee. Losing tiles receive 30% of their net stakes back; the other 70% goes to the winning tile. If a round has too few occupied tiles or is cancelled after timeout, the full stake including the fee is refundable. Chain gas is not refundable.',
    ownerTitle: 'Owner fees', ownerHelp: 'Only the deployer can withdraw settled fees that have not been used for draws.', withdrawAmount: 'Withdraw amount (USDC)', withdrawMax: 'Maximum', withdraw: 'Withdraw fees',
    notConfigured: 'Game contract address is missing. Set VITE_GAME_ADDRESS and rebuild.', readFailed: 'Could not read on-chain data', txSubmitted: 'Transaction submitted; waiting for confirmation', txConfirmed: 'Transaction confirmed.', txBusy: 'The previous transaction is still pending.', invalidAmount: 'Enter a stake greater than zero.', invalidWithdraw: 'Amount must be greater than zero and no more than available fees.', footer: 'Arc Mainnet · Native USDC · Independent rounds · Wallet pays gas',
  },
} as const;
type Key = keyof typeof copy.zh;
let lang: Language = localStorage.getItem('nine-language') === 'en' ? 'en' : 'zh';
let view: View = 'current';
let selected = 4;
let wallets: Wallet[] = [];
let active: Wallet | null = null;
let account = '';
let walletOnArc = false;
let restoring = false;
let discoveryVersion = 0;
let busy = false;
let stakeAmount = '1';
let current = 1n;
let round: Round | null = null;
let lastRound: Round | null = null;
let lastStakes: bigint[] = Array(9).fill(0n);
let lastClaimed = false;
let owner = '';
let availableFees = 0n;
let reserve = 0n;
let quote: bigint | null = null;

const tr = (key: Key) => copy[lang][key];
const fmt = (value: bigint, decimals = 4) => Number(formatEther(value)).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: decimals });
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const roundLabel = (id: bigint) => `${tr('round')}${id}${tr('roundSuffix')}`;
const stateLabel = (state: number) => [tr('open'), tr('drawing'), tr('settled'), tr('cancelled')][state] ?? tr('loading');
const messageOf = (error: unknown) => error instanceof Error ? error.message.split(' (')[0] : String(error);
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function mount() {
  stakeAmount = document.querySelector<HTMLInputElement>('#amount')?.value ?? stakeAmount;
  const withdraw = document.querySelector<HTMLInputElement>('#withdraw-amount')?.value ?? '';
  document.documentElement.lang = lang;
  document.title = lang === 'zh' ? '九格 · Arc' : 'Nine / Arc';
  app.innerHTML = `<div class="shell"><header class="site-header"><a class="brand" href="#top" aria-label="Nine Arc home">NINE <span>/</span> ARC</a><nav aria-label="${tr('game')}"><a href="#top" aria-current="page">${tr('game')}</a><a href="#rules">${tr('rules')}</a><a href="#positions-card">${tr('records')}</a></nav><div class="header-actions"><span class="chain"><i></i>Arc Mainnet</span><button class="lang-switch" id="lang-btn" type="button" aria-label="Language">${lang === 'zh' ? 'EN' : '中文'}</button><button id="wallet-btn" type="button">${account ? short(account) : tr('connect')}</button><button id="disconnect-btn" type="button" ${account ? '' : 'hidden'}>${tr('disconnect')}</button></div></header>
  <main id="top"><section class="hero"><h1>${tr('hero')}</h1><p>${tr('subtitle')}</p></section><div id="notice" class="notice" role="status" hidden></div>
  <div class="view-switch" role="tablist" aria-label="${tr('current')}"><button id="current-tab" role="tab" type="button">${tr('current')}</button><button id="result-tab" role="tab" type="button">${tr('result')}</button></div>
  <div class="layout"><section class="board-section" aria-label="${tr('current')}"><div class="board-heading"><h2 id="board-title">${tr('loading')}</h2><a id="contract-link" class="contract-link" href="${ready ? `https://explorer.arc.io/address/${ADDRESS}` : '#'}" target="_blank" rel="noopener noreferrer" ${ready ? '' : 'hidden'}>${ready ? short(ADDRESS) : ''} ↗</a></div><div id="board" class="board"></div><p id="board-foot" class="board-foot"></p></section>
  <aside class="side" id="side"><div id="round-panel"></div><section id="positions-card" class="positions-section"><div class="minor-heading"><h2>${tr('positions')}</h2><span>${tr('history')}</span></div><div id="positions" class="positions"></div></section><section id="owner-card" class="owner-section" hidden><h2>${tr('ownerTitle')}</h2><p>${tr('ownerHelp')}</p><label for="withdraw-amount">${tr('withdrawAmount')}</label><input id="withdraw-amount" type="number" min="0" step="any" value="${withdraw}" placeholder="0.00"><div class="owner-actions"><button id="withdraw-max" type="button">${tr('withdrawMax')}</button><button id="withdraw-btn" type="button">${tr('withdraw')}</button></div></section></aside></div>
  <section class="rules" id="rules"><h2>${tr('rulesTitle')}</h2><p>${tr('rulesText')}</p></section></main><footer>${tr('footer')}</footer></div><div id="wallet-modal" class="modal" hidden><div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="wallet-title"><div class="modal-heading"><h2 id="wallet-title">${tr('wallet')}</h2><button id="close-modal" type="button" aria-label="Close">✕</button></div><div id="wallet-list"></div></div></div>`;
  byId('lang-btn').addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('nine-language', lang); mount(); void refresh(true); });
  byId('current-tab').addEventListener('click', () => { view = 'current'; render(); });
  byId('result-tab').addEventListener('click', () => { if (lastRound) { view = 'result'; render(); } });
  byId('wallet-btn').addEventListener('click', () => { if (active) { void switchToArc(active.provider).then(() => { if (walletOnArc) { clearNotice(); void refresh(); } }).catch(error => notice(messageOf(error), true)); } else openWalletModal(); });
  byId('disconnect-btn').addEventListener('click', () => { localStorage.removeItem('nine-wallet'); localStorage.removeItem('nine-account'); location.reload(); });
  byId('close-modal').addEventListener('click', () => { byId('wallet-modal').hidden = true; });
  byId('wallet-modal').addEventListener('click', event => { if (event.target === byId('wallet-modal')) byId('wallet-modal').hidden = true; });
  byId('withdraw-max').addEventListener('click', () => { byId<HTMLInputElement>('withdraw-amount').value = formatEther(availableFees); });
  byId('withdraw-btn').addEventListener('click', () => { try { const value = parseEther(byId<HTMLInputElement>('withdraw-amount').value); if (value <= 0n || value > availableFees) throw Error(tr('invalidWithdraw')); void write('withdrawFees', [value]); } catch (error) { notice(messageOf(error), true); } });
  render();
}

function notice(message: string, error = false) { const el = byId('notice'); el.textContent = message; el.className = `notice${error ? ' error' : ''}`; el.hidden = false; }
function clearNotice() { byId('notice').hidden = true; }
function openWalletModal() {
  const list = byId('wallet-list'); list.replaceChildren();
  if (!wallets.length) list.textContent = tr('noWallet');
  for (const wallet of wallets) { const button = document.createElement('button'); button.type = 'button'; button.className = 'wallet-option'; button.textContent = wallet.name; button.onclick = () => void connect(wallet); list.append(button); }
  byId('wallet-modal').hidden = false;
}
function addWallet(id: string, name: string, provider: Eip1193) {
  if (wallets.some(wallet => wallet.provider === provider)) return;
  wallets.push({ id, name, provider }); discoveryVersion++;
  void restoreWallet();
}
window.addEventListener('eip6963:announceProvider', ((event: Event) => {
  const detail = (event as CustomEvent<{ info: { rdns?: string; name: string }; provider: Eip1193 }>).detail;
  addWallet(`eip6963:${detail.info.rdns ?? detail.info.name}`, detail.info.name, detail.provider);
}) as EventListener);
window.dispatchEvent(new Event('eip6963:requestProvider'));
function discoverInjectedWallets() {
  if (window.ethereum?.providers?.length) window.ethereum.providers.forEach((provider, index) => addWallet(`injected-${index}`, `EVM wallet ${index + 1}`, provider));
  else if (window.ethereum) addWallet('injected', 'Browser wallet', window.ethereum);
}
let discoveryAttempts = 0;
const discoveryTimer = setInterval(() => { discoverInjectedWallets(); if (++discoveryAttempts >= 10) clearInterval(discoveryTimer); }, 500);

async function switchToArc(provider: Eip1193) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN, chainName: 'Arc Mainnet', rpcUrls: [RPC], nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, blockExplorerUrls: ['https://explorer.arc.io'] }] });
  }
  walletOnArc = (await provider.request({ method: 'eth_chainId' }) as string).toLowerCase() === CHAIN;
  render();
}
const boundWallets = new WeakSet<Eip1193>();
async function connect(wallet: Wallet, silent = false): Promise<boolean> {
  try {
    const accounts = await wallet.provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' }) as string[];
    const previous = localStorage.getItem('nine-account');
    if (!accounts.length || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0]) || (silent && previous && !accounts.some(address => address.toLowerCase() === previous.toLowerCase()))) return false;
    walletOnArc = ((await wallet.provider.request({ method: 'eth_chainId' })) as string).toLowerCase() === CHAIN;
    if (!walletOnArc && !silent) await switchToArc(wallet.provider);
    active = wallet; account = accounts[0];
    localStorage.setItem('nine-wallet', wallet.id); localStorage.setItem('nine-account', account);
    byId('wallet-modal').hidden = true;
    if (!boundWallets.has(wallet.provider)) {
      wallet.provider.on?.('accountsChanged', () => { if (active?.provider === wallet.provider) location.reload(); });
      wallet.provider.on?.('chainChanged', () => { if (active?.provider === wallet.provider) location.reload(); });
      boundWallets.add(wallet.provider);
    }
    mount(); await refresh(true);
    if (!walletOnArc) notice(tr('chainHint'), true);
    return true;
  } catch (error) { if (!silent) notice(messageOf(error), true); return false; }
}
async function restoreWallet() {
  if (restoring || active || !localStorage.getItem('nine-wallet')) return;
  restoring = true; const version = discoveryVersion;
  try {
    const remembered = localStorage.getItem('nine-wallet');
    const candidates = [...wallets].sort((a, b) => Number(b.id === remembered) - Number(a.id === remembered));
    for (const wallet of candidates) if (await connect(wallet, true)) break;
  } finally { restoring = false; if (!active && version !== discoveryVersion) void restoreWallet(); }
}

function renderBoard() {
  const displayed = view === 'result' ? lastRound : round;
  const board = byId('board'); board.replaceChildren();
  for (let index = 0; index < 9; index++) {
    const cell = document.createElement('button'); cell.type = 'button';
    const winner = view === 'result' && displayed?.status === 2n && Number(displayed.winner) === index;
    cell.className = `cell${winner ? ' winner' : ''}${view === 'current' && selected === index ? ' selected' : ''}`;
    cell.disabled = view === 'result';
    cell.setAttribute('aria-label', `${tr('tile')}${String(index + 1).padStart(2, '0')}, ${displayed ? fmt(displayed.cells[index]) : '0'} USDC${winner ? `, ${tr('winning')}` : ''}`);
    const number = document.createElement('span'); number.className = 'cell-number'; number.textContent = String(index + 1).padStart(2, '0');
    const middle = document.createElement('span'); middle.className = 'cell-middle'; middle.textContent = winner ? '✦' : '';
    const amount = document.createElement('span'); amount.className = 'cell-amount'; amount.textContent = `${displayed ? fmt(displayed.cells[index]) : '0'} USDC`;
    cell.append(number, middle, amount);
    if (view === 'current') cell.addEventListener('click', () => { selected = index; renderBoard(); renderStakeForm(); });
    board.append(cell);
  }
}

function renderStakeForm() {
  const button = document.querySelector<HTMLButtonElement>('#stake-btn');
  if (!button) return;
  button.textContent = `${tr('stake')}${String(selected + 1).padStart(2, '0')}`;
  byId('selected-value').textContent = String(selected + 1).padStart(2, '0');
  const value = byId<HTMLInputElement>('amount').value;
  try { const gross = parseEther(value); const fee = gross * 50n / 10000n; byId('fee-value').textContent = `${fmt(fee, 6)} USDC`; byId('net-value').textContent = `${fmt(gross - fee, 6)} USDC`; }
  catch { byId('fee-value').textContent = '—'; byId('net-value').textContent = '—'; }
  updateTime();
}

function renderCurrent() {
  const panel = byId('round-panel');
  panel.innerHTML = `<section class="round-section"><div class="minor-heading"><h2>${tr('current')}</h2><span id="round-state">${tr('loading')}</span></div><div class="round-stats"><div class="time-stat"><strong id="timer">--:--</strong><span>${tr('countdown')}</span></div><div><small>${tr('occupied')}</small><strong id="occupied">—</strong></div><div><small>${tr('pool')}</small><strong id="pool">—</strong><small>USDC</small></div></div><div class="timeline" aria-hidden="true"><span class="active">${tr('stageStake')}</span><span>${tr('stageDraw')}</span><span>${tr('stageSettle')}</span></div><p id="phase-note" class="phase-note"></p>
  <div class="stake-form"><div class="minor-heading"><h2>${tr('stakeTitle')}</h2><span>0.5%</span></div><div class="form-grid"><label>${tr('selectedTile')}<strong id="selected-value">${String(selected + 1).padStart(2, '0')}</strong></label><label for="amount">${tr('amount')}<div class="amount-field"><input id="amount" type="number" inputmode="decimal" min="0.00000000000001" step="any"><span>USDC</span></div></label></div><div class="fee-line"><span>${tr('fee')}</span><strong id="fee-value">—</strong></div><div class="fee-line net"><span>${tr('net')}</span><strong id="net-value">—</strong></div><button id="stake-btn" class="primary" type="button"></button><p id="stake-hint" class="hint"></p></div>
  <div id="last-result-strip"></div><details class="oracle"><summary>D20DAO / ${tr('quote')}</summary><dl><div><dt>${tr('quote')}</dt><dd id="quote">—</dd></div><div><dt>${tr('paid')}</dt><dd id="paid">—</dd></div><div><dt>${tr('reserve')}</dt><dd id="reserve">—</dd></div><div><dt>${tr('available')}</dt><dd id="available-fees">—</dd></div></dl></details><div class="manual-actions"><div class="minor-heading"><h2>${tr('actions')}</h2></div><p>${tr('actionHelp')}</p><div class="action-row"><button id="draw-btn" type="button">${tr('request')}</button><button id="finalize-btn" type="button">${tr('finalize')}</button><button id="cancel-btn" type="button">${tr('cancel')}</button></div></div></section>`;
  byId<HTMLInputElement>('amount').value = stakeAmount;
  byId<HTMLInputElement>('amount').addEventListener('input', () => { stakeAmount = byId<HTMLInputElement>('amount').value; renderStakeForm(); });
  byId('stake-btn').addEventListener('click', () => { try { const value = parseEther(byId<HTMLInputElement>('amount').value); if (value <= 0n) throw Error(tr('invalidAmount')); void write('stake', [selected], value); } catch (error) { notice(messageOf(error), true); } });
  byId('draw-btn').addEventListener('click', () => void write('requestDraw'));
  byId('finalize-btn').addEventListener('click', () => void write('finalize'));
  byId('cancel-btn').addEventListener('click', () => void write('cancelExpired'));
  byId('round-state').textContent = round ? stateLabel(Number(round.status)) : tr('loading');
  byId('occupied').textContent = round ? `${round.occupiedCount} / 9` : '—';
  byId('pool').textContent = round ? fmt(round.net) : '—';
  byId('quote').textContent = quote === null ? tr('pendingQuote') : `${fmt(quote, 6)} USDC`;
  byId('paid').textContent = round ? `${fmt(round.oracleFee, 6)} USDC` : '—';
  byId('reserve').textContent = `${fmt(reserve, 6)} USDC`;
  byId('available-fees').textContent = `${fmt(availableFees, 6)} USDC`;
  const strip = byId('last-result-strip');
  if (lastRound) {
    strip.className = 'last-result-strip';
    const label = document.createElement('span'); label.textContent = `${tr('result')} · ${roundLabel(current - 1n)}`;
    const tiles = document.createElement('span'); tiles.className = 'mini-tiles';
    for (let index = 0; index < 9; index++) { const tile = document.createElement('span'); tile.textContent = String(index + 1).padStart(2, '0'); if (lastRound.status === 2n && Number(lastRound.winner) === index) tile.className = 'mini-winner'; tiles.append(tile); }
    strip.append(label, tiles);
    strip.addEventListener('click', () => { view = 'result'; render(); });
    strip.setAttribute('role', 'button'); strip.setAttribute('tabindex', '0');
    strip.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); view = 'result'; render(); } });
  }
  renderStakeForm();
}

function renderResult() {
  const panel = byId('round-panel');
  if (!lastRound) { panel.textContent = tr('noResult'); return; }
  const result = lastRound;
  const settled = result.status === 2n;
  const winning = settled ? String(Number(result.winner) + 1).padStart(2, '0') : '—';
  panel.innerHTML = `<section class="result-section${settled ? '' : ' cancelled'}"><div class="minor-heading"><h2>${tr('result')}</h2><span>${stateLabel(Number(result.status))}</span></div><div class="result-stats"><div class="winning-stat"><strong>${winning}</strong><span>${settled ? tr('winningTile') : tr('cancelled')}</span></div><div><small>${tr('occupied')}</small><strong>${result.occupiedCount} / 9</strong></div><div><small>${tr('pool')}</small><strong>${fmt(result.net)}</strong><small>USDC</small></div><div><small>${tr('phase')}</small><strong>${stateLabel(Number(result.status))}</strong></div></div><div class="result-timeline"><span>${tr('stageStake')}</span><span>${tr('stageDraw')}</span><span>${tr('stageSettle')}</span></div><div class="result-my"><div class="minor-heading"><h2>${tr('resultMine')}</h2><span id="my-total">—</span></div><div id="result-stakes" class="result-stakes"></div><button id="claim-last" class="claim-primary" type="button" hidden>${result.status === 3n ? tr('refund') : tr('claim')}</button><p>${tr('claimHelp')}</p></div><button id="next-round-btn" class="next-round" type="button">${tr('nextRound')}: ${roundLabel(current)} <span>${tr('viewCurrent')} →</span></button></section>`;
  const list = byId('result-stakes'); list.replaceChildren();
  let total = 0n;
  lastStakes.forEach((value, index) => { if (!value) return; total += value; const row = document.createElement('div'); row.className = 'result-stake'; const name = document.createElement('strong'); name.textContent = `${tr('tile')}${String(index + 1).padStart(2, '0')}`; const amount = document.createElement('span'); amount.textContent = `${fmt(value)} USDC`; const badge = document.createElement('span'); badge.className = settled && Number(result.winner) === index ? 'won-badge' : 'lost-badge'; badge.textContent = result.status === 3n ? tr('refund') : settled && Number(result.winner) === index ? tr('winning') : tr('losing'); row.append(name, amount, badge); list.append(row); });
  byId('my-total').textContent = account ? `${fmt(total)} USDC` : tr('connectPositions');
  if (!list.children.length) list.textContent = account ? tr('noPositions') : tr('connectPositions');
  const claim = byId<HTMLButtonElement>('claim-last'); claim.hidden = !account || !total || lastClaimed;
  claim.addEventListener('click', () => void write('claim', [current - 1n]));
  if (lastClaimed && total) { claim.hidden = false; claim.disabled = true; claim.textContent = tr('claimed'); }
  byId('next-round-btn').addEventListener('click', () => { view = 'current'; render(); });
}

function render() {
  if (!document.getElementById('board')) return;
  if (view === 'result' && !lastRound) view = 'current';
  const currentTab = byId('current-tab'); const resultTab = byId<HTMLButtonElement>('result-tab');
  currentTab.setAttribute('aria-selected', String(view === 'current')); resultTab.setAttribute('aria-selected', String(view === 'result'));
  resultTab.disabled = !lastRound;
  const shown = view === 'result' ? current - 1n : current;
  byId('board-title').textContent = `${roundLabel(shown)} · ${view === 'result' ? stateLabel(Number(lastRound?.status ?? 0)) : round ? stateLabel(Number(round.status)) : tr('loading')}`;
  byId('board-foot').textContent = view === 'result' && lastRound?.status === 2n ? `${tr('winningTile')} ${String(Number(lastRound.winner) + 1).padStart(2, '0')}` : '';
  renderBoard();
  if (view === 'current') renderCurrent(); else renderResult();
  byId('owner-card').hidden = !account || owner.toLowerCase() !== account.toLowerCase();
  updateTime();
}

function updateTime() {
  if (!round || view !== 'current') return;
  const now = Math.floor(Date.now() / 1000); const close = Number(round.closesAt); const left = Math.max(0, close - now);
  const open = round.status === 0n && left > 0;
  byId('timer').textContent = open ? clock(left) : '00:00';
  byId('round-state').textContent = round.status === 0n && !open ? tr('closed') : stateLabel(Number(round.status));
  const progress = Math.max(0, Math.min(100, ((now - Number(round.openedAt)) / 60) * 100));
  byId('round-panel').style.setProperty('--progress', `${progress}%`);
  byId('phase-note').textContent = round.status === 1n ? tr('drawing') : open ? tr('openHint') : tr('closedHint');
  const stakeButton = byId<HTMLButtonElement>('stake-btn');
  stakeButton.disabled = !ready || !account || !walletOnArc || !open || busy;
  byId('stake-hint').textContent = !account ? tr('connectHint') : !walletOnArc ? tr('chainHint') : !open ? tr('closedHint') : tr('openHint');
  byId('draw-btn').hidden = round.status !== 0n || now < close;
  byId('finalize-btn').hidden = round.status !== 1n;
  byId('cancel-btn').hidden = (round.status !== 0n && round.status !== 1n) || now < close + 60;
}

async function write(method: string, args: unknown[] = [], value?: bigint) {
  if (!active) { notice(tr('connectHint'), true); return; }
  if (!readGame) { notice(tr('notConfigured'), true); return; }
  if (!walletOnArc) { notice(tr('chainHint'), true); return; }
  if (busy) { notice(tr('txBusy'), true); return; }
  if (method === 'stake' && (!round || round.status !== 0n || Date.now() / 1000 >= Number(round.closesAt))) { notice(tr('closedHint'), true); return; }
  busy = true; updateTime();
  try {
    const signer = await new BrowserProvider(active.provider).getSigner();
    const game = new Contract(ADDRESS, artifact.abi, signer);
    const tx = await game[method](...args, value === undefined ? {} : { value });
    notice(`${tr('txSubmitted')}: ${short(tx.hash)}`);
    await tx.wait(); notice(tr('txConfirmed')); await refresh(true);
  } catch (error) { notice(messageOf(error), true); } finally { busy = false; updateTime(); }
}

let refreshing = false;
let positionsLoadedFor = '';
async function refresh(forcePositions = false) {
  if (!readGame) { notice(tr('notConfigured'), true); return; }
  if (refreshing) return;
  refreshing = true;
  try {
    const nextCurrent = await readGame.currentRound() as bigint;
    const nextRound = await readGame.roundInfo(nextCurrent) as Round;
    const nextLast = nextCurrent > 1n ? await readGame.roundInfo(nextCurrent - 1n) as Round : null;
    const changed = round !== null && nextCurrent !== current;
    current = nextCurrent; round = nextRound; lastRound = nextLast;
    if (view === 'result' && !nextLast) view = 'current';
    if (changed && nextLast?.status === 2n) view = 'result';
    const [newReserve, newFees, newOwner] = await Promise.all([readGame.operationsReserve(), readGame.withdrawableFees(), readGame.owner()]);
    reserve = newReserve as bigint; availableFees = newFees as bigint; owner = newOwner as string;
    try { const oracleAddress = await readGame.oracle() as string; const oracle = new Contract(oracleAddress, ['function quoteFeeAt(uint32,uint256) view returns (uint256)'], readProvider); const base = (await readProvider.getBlock('latest'))?.baseFeePerGas ?? 0n; quote = await oracle.quoteFeeAt(100000, base * 12n / 10n) as bigint; } catch { quote = null; }
    if (account && nextLast) { [lastStakes, lastClaimed] = await Promise.all([readGame.myStakes(nextCurrent - 1n, account), readGame.claimed(nextCurrent - 1n, account)]) as [bigint[], boolean]; }
    else { lastStakes = Array(9).fill(0n); lastClaimed = false; }
    render();
    const positionKey = `${account.toLowerCase()}:${current}`;
    if (forcePositions || positionKey !== positionsLoadedFor) { await renderPositions(); positionsLoadedFor = positionKey; }
  } catch (error) { notice(`${tr('readFailed')}: ${messageOf(error)}`, true); }
  finally { refreshing = false; }
}

async function renderPositions() {
  const list = byId('positions'); list.replaceChildren();
  if (!account || !readGame) { list.textContent = tr('connectPositions'); return; }
  const first = current > 10n ? current - 9n : 1n;
  for (let id = current; id >= first; id--) {
    try {
      const gross = await readGame.grossStake(id, account) as bigint;
      if (gross) {
        const info = id === current ? round! : id === current - 1n ? lastRound! : await readGame.roundInfo(id) as Round;
        const done = await readGame.claimed(id, account) as boolean;
        const item = document.createElement('div'); item.className = 'position';
        const title = document.createElement('strong'); title.textContent = roundLabel(id);
        const amount = document.createElement('span'); amount.textContent = `${fmt(gross)} USDC`;
        const state = document.createElement('small'); state.textContent = `${stateLabel(Number(info.status))}${info.status === 2n ? ` · ${tr('winningTile')} ${String(Number(info.winner) + 1).padStart(2, '0')}` : ''}`;
        item.append(title, amount, state);
        if (info.status >= 2n && !done) { const button = document.createElement('button'); button.type = 'button'; button.textContent = tr('claim'); button.onclick = () => void write('claim', [id]); item.append(button); }
        if (done) { const received = document.createElement('span'); received.className = 'received'; received.textContent = tr('claimed'); item.append(received); }
        list.append(item);
      }
    } catch (error) { notice(`${tr('readFailed')}: ${messageOf(error)}`, true); break; }
    if (id === 1n) break;
  }
  if (!list.children.length) list.textContent = tr('noPositions');
}

mount();
setTimeout(() => void restoreWallet(), 700);
void refresh();
setInterval(updateTime, 1_000);
setInterval(() => void refresh(), 20_000);
