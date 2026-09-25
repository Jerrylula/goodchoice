import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const GAME_ABI = [
  'function currentRound() view returns (uint256)',
  'function roundInfo(uint256) view returns (tuple(uint64 openedAt,uint64 closesAt,uint8 status,uint16 occupiedMask,uint8 occupiedCount,uint8 winner,uint256 requestId,uint256 oracleFee,uint256 gross,uint256 net,uint256 fees,uint256 claimed,uint256 losingRefund,uint256 bonus,uint256 participants,uint256 claims,uint256[9] cells))',
  'function operationsReserve() view returns (uint256)',
  'function oracle() view returns (address)',
  'function requestDraw()', 'function finalize()', 'function cancelExpired()',
  'function refundExpiredOracleRequest(uint256)'
];

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(tick(env)); }
};

async function tick(env) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.GAME_ADDRESS ?? '')) throw Error('GAME_ADDRESS is not configured');
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.KEEPER_PRIVATE_KEY ?? '')) throw Error('KEEPER_PRIVATE_KEY is not configured');
  const provider = new JsonRpcProvider(env.ARC_RPC || 'https://rpc.mainnet.arc.io', 5042);
  const network = await provider.getNetwork();
  if (network.chainId !== 5042n) throw Error('Wrong Arc chain');
  const wallet = new Wallet(env.KEEPER_PRIVATE_KEY, provider);
  const game = new Contract(env.GAME_ADDRESS, GAME_ABI, wallet);
  const id = await game.currentRound();
  const r = await game.roundInfo(id);
  const now = BigInt((await provider.getBlock('latest')).timestamp);
  let tx;
  if (r.status === 0n && now >= r.closesAt) {
    if (r.occupiedCount >= 2n && now < r.closesAt + 60n) {
      const oracle = new Contract(await game.oracle(), ['function quoteFeeAt(uint32,uint256) view returns (uint256)'], provider);
      const base = (await provider.getBlock('latest')).baseFeePerGas ?? 0n;
      const [reserve, quote] = await Promise.all([game.operationsReserve(), oracle.quoteFeeAt(100000, base * 12n / 10n)]);
      if (reserve < quote) { console.error(`Round ${id}: operations reserve below oracle quote`); return; }
    }
    tx = await game.requestDraw();
  } else if (r.status === 1n) {
    try { await game.finalize.staticCall(); tx = await game.finalize(); }
    catch (error) {
      if (now < r.closesAt + 60n) { console.log(`Round ${id}: waiting for D20 result`); return; }
      tx = await game.cancelExpired();
    }
  } else return;
  console.log(`Round ${id}: ${tx.hash}`);
  await tx.wait();
}
