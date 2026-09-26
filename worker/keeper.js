import { DurableObject } from 'cloudflare:workers';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const RETRY_MS = 5_000;
const GAME_ABI = [
  'function currentRound() view returns (uint256)',
  'function roundInfo(uint256) view returns (tuple(uint64 openedAt,uint64 closesAt,uint8 status,uint16 occupiedMask,uint8 occupiedCount,uint8 winner,uint256 requestId,uint256 oracleFee,uint256 gross,uint256 net,uint256 fees,uint256 claimed,uint256 losingRefund,uint256 bonus,uint256 participants,uint256 claims,uint256[9] cells))',
  'function operationsReserve() view returns (uint256)',
  'function oracle() view returns (address)',
  'function requestDraw()', 'function finalize()', 'function cancelExpired()'
];

function nextAlarm(round) {
  if (round.status === 0n) return Math.max(Date.now() + 1_000, Number(round.closesAt) * 1_000 + 1_000);
  return Date.now() + RETRY_MS;
}

async function advance(env) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.GAME_ADDRESS ?? '')) throw Error('GAME_ADDRESS is not configured');
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.KEEPER_PRIVATE_KEY ?? '')) throw Error('KEEPER_PRIVATE_KEY is not configured');
  const provider = new JsonRpcProvider(env.ARC_RPC || 'https://rpc.mainnet.arc.io', 5042);
  if ((await provider.getNetwork()).chainId !== 5042n) throw Error('Wrong Arc chain');
  const wallet = new Wallet(env.KEEPER_PRIVATE_KEY, provider);
  const game = new Contract(env.GAME_ADDRESS, GAME_ABI, wallet);
  const id = await game.currentRound();
  const round = await game.roundInfo(id);
  const now = BigInt((await provider.getBlock('latest')).timestamp);
  let tx;

  if (round.status === 0n) {
    if (now < round.closesAt) return nextAlarm(round);
    if (round.occupiedCount >= 2n && now < round.closesAt + 60n) {
      const oracle = new Contract(await game.oracle(), ['function quoteFeeAt(uint32,uint256) view returns (uint256)'], provider);
      const base = (await provider.getBlock('latest')).baseFeePerGas ?? 0n;
      const [reserve, quote] = await Promise.all([game.operationsReserve(), oracle.quoteFeeAt(100000, base * 12n / 10n)]);
      if (reserve < quote) {
        console.error(`Round ${id}: operating reserve is below the current oracle quote`);
        return Date.now() + RETRY_MS;
      }
    }
    // The contract cancels rounds with fewer than two occupied cells, or after the draw deadline.
    tx = await game.requestDraw();
  } else if (round.status === 1n) {
    try {
      await game.finalize.staticCall();
      tx = await game.finalize();
    } catch (error) {
      if (now < round.closesAt + 60n) {
        console.log(`Round ${id}: waiting for D20DAO result`);
        return Date.now() + RETRY_MS;
      }
      // A fulfilled result cannot be cancelled; in that case retry finalization.
      tx = await game.cancelExpired();
    }
  } else {
    return Date.now() + RETRY_MS;
  }

  console.log(`Round ${id}: submitted ${tx.hash}`);
  await tx.wait();
  const nextId = await game.currentRound();
  const next = await game.roundInfo(nextId);
  return nextAlarm(next);
}

export class GameKeeper extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.running = null;
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    await this.run();
    return new Response('Keeper checked');
  }

  async alarm() { await this.run(); }

  async run() {
    if (this.running) return this.running;
    this.running = this.process();
    try { await this.running; } finally { this.running = null; }
  }

  async process() {
    try {
      await this.ctx.storage.setAlarm(await advance(this.env));
    } catch (error) {
      console.error('Keeper attempt failed:', error);
      await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
    }
  }
}

export default {
  async scheduled(_event, env, ctx) {
    const id = env.KEEPER_COORDINATOR.idFromName('main');
    const stub = env.KEEPER_COORDINATOR.get(id);
    ctx.waitUntil(stub.fetch('https://keeper.internal/tick', { method: 'POST' }));
  }
};
