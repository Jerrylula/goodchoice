import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';

const ore = JSON.parse(fs.readFileSync(new URL('../generated-test/OreNine.json', import.meta.url)));
const mock = JSON.parse(fs.readFileSync(new URL('../generated-test/MockD20.json', import.meta.url)));

async function setup() {
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' }, wallet: { totalAccounts: 5 } });
  const provider = new BrowserProvider(rpc);
  const [deployer, alice, bob] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));
  const oracle = await new ContractFactory(mock.abi, mock.bytecode, deployer).deploy();
  await oracle.waitForDeployment();
  const game = await new ContractFactory(ore.abi, ore.bytecode, deployer).deploy(await oracle.getAddress());
  await game.waitForDeployment();
  const travel = async seconds => { await rpc.request({ method: 'evm_increaseTime', params: [seconds] }); await rpc.request({ method: 'evm_mine', params: [] }); };
  return { provider, deployer, alice, bob, oracle, game, travel };
}

test('two occupied cells settle: 0.5% fee, 30% loser refund, 70% winner bonus', async () => {
  const { game, oracle, alice, bob, travel } = await setup();
  await (await game.fundOperations({ value: parseEther('0.02') })).wait();
  await (await game.connect(alice).stake(0, { value: parseEther('100') })).wait();
  await (await game.connect(bob).stake(1, { value: parseEther('100') })).wait();
  await travel(61);
  await (await game.requestDraw()).wait();
  assert.equal((await game.roundInfo(1)).oracleFee, parseEther('0.02'));
  await (await oracle.fulfill(1, 0, false)).wait(); // callback failed, same mapped result remains recoverable
  await (await game.finalize()).wait();
  const r = await game.roundInfo(1);
  assert.equal(r.winner, 0n);
  assert.equal(r.bonus, parseEther('69.65'));
  assert.equal(await game.currentRound(), 2n);
  await (await game.connect(alice).claim(1)).wait();
  await (await game.connect(bob).claim(1)).wait();
  assert.equal((await game.roundInfo(1)).claimed, parseEther('199'));
  assert.equal(await game.operationsReserve(), parseEther('1'));
  assert.equal(await game.withdrawableFees(), parseEther('1'));
});

test('one occupied cell and expired draw return full gross stake and open next round', async () => {
  const { game, alice, bob, travel } = await setup();
  await (await game.connect(alice).stake(4, { value: parseEther('3') })).wait();
  await travel(60);
  await (await game.requestDraw()).wait();
  assert.equal((await game.roundInfo(1)).status, 3n);
  await (await game.connect(alice).claim(1)).wait();
  assert.equal((await game.roundInfo(1)).claimed, parseEther('3'));
  await (await game.connect(bob).stake(1, { value: parseEther('2') })).wait();
  await (await game.connect(alice).stake(2, { value: parseEther('2') })).wait();
  await travel(121);
  await (await game.cancelExpired()).wait();
  await (await game.connect(bob).claim(2)).wait();
  await (await game.connect(alice).claim(2)).wait();
  assert.equal((await game.roundInfo(2)).claimed, parseEther('4'));
  assert.equal(await game.currentRound(), 3n);
});

test('fulfilled oracle result cannot be cancelled after timeout', async () => {
  const { game, oracle, alice, bob, travel } = await setup();
  await (await game.fundOperations({ value: parseEther('0.02') })).wait();
  await (await game.connect(alice).stake(1, { value: parseEther('1') })).wait();
  await (await game.connect(bob).stake(8, { value: parseEther('1') })).wait();
  await travel(61);
  await (await game.requestDraw()).wait();
  await (await oracle.fulfill(1, 1, false)).wait();
  await travel(61);
  await assert.rejects(game.cancelExpired());
  await (await game.finalize()).wait();
  assert.equal((await game.roundInfo(1)).winner, 8n);
});

test('multiple winners share the bonus in proportion to net stake', async () => {
  const { game, oracle, deployer, alice, bob, travel } = await setup();
  await (await game.fundOperations({ value: parseEther('0.02') })).wait();
  await (await game.connect(alice).stake(3, { value: parseEther('100') })).wait();
  await (await game.connect(bob).stake(3, { value: parseEther('200') })).wait();
  await (await game.connect(deployer).stake(7, { value: parseEther('100') })).wait();
  await travel(61);
  await (await game.requestDraw()).wait();
  await (await oracle.fulfill(1, 0, true)).wait();
  await (await game.finalize()).wait();
  assert.equal((await game.roundInfo(1)).bonus, parseEther('69.65'));
  await (await game.connect(alice).claim(1)).wait();
  const aliceClaim = (await game.roundInfo(1)).claimed;
  assert.ok(aliceClaim > parseEther('122.71') && aliceClaim < parseEther('122.72'));
  await (await game.connect(bob).claim(1)).wait();
  await (await game.connect(deployer).claim(1)).wait();
  assert.equal((await game.roundInfo(1)).claimed, parseEther('398'));
});

test('only deployer can withdraw settled, unspent fees; player payouts remain intact', async () => {
  const { game, oracle, deployer, alice, bob, travel, provider } = await setup();
  assert.equal(await game.owner(), await deployer.getAddress());
  await (await game.fundOperations({ value: parseEther('0.02') })).wait();
  await (await game.connect(alice).stake(0, { value: parseEther('100') })).wait();
  await (await game.connect(bob).stake(1, { value: parseEther('100') })).wait();
  await assert.rejects(game.withdrawFees(parseEther('0.01'))); // pending fee is refundable
  await travel(61);
  await (await game.requestDraw()).wait();
  await (await oracle.fulfill(1, 0, true)).wait();
  await (await game.finalize()).wait();
  await assert.rejects(game.connect(alice).withdrawFees(parseEther('0.01')));
  await assert.rejects(game.withdrawFees(parseEther('1.01')));
  await (await game.withdrawFees(parseEther('1'))).wait();
  assert.equal(await game.withdrawableFees(), 0n);
  assert.equal(await game.operationsReserve(), 0n);
  assert.equal(await provider.getBalance(await game.getAddress()), parseEther('199'));
  await (await game.connect(alice).claim(1)).wait();
  await (await game.connect(bob).claim(1)).wait();
  assert.equal(await provider.getBalance(await game.getAddress()), 0n);
});

test('sponsor funds cannot be withdrawn; spent fees are excluded and later cancellation remains fully funded', async () => {
  const { game, oracle, alice, bob, travel, provider } = await setup();
  await (await game.fundOperations({ value: parseEther('0.02') })).wait();
  await assert.rejects(game.withdrawFees(parseEther('0.01')));
  await (await game.connect(alice).stake(0, { value: parseEther('100') })).wait();
  await (await game.connect(bob).stake(1, { value: parseEther('100') })).wait();
  await travel(61); await (await game.requestDraw()).wait();
  await (await oracle.fulfill(1, 0, true)).wait(); await (await game.finalize()).wait();
  assert.equal(await game.operationsReserve(), parseEther('1'));
  assert.equal(await game.withdrawableFees(), parseEther('1'));
  await (await game.connect(alice).stake(0, { value: parseEther('1') })).wait();
  await (await game.connect(bob).stake(1, { value: parseEther('1') })).wait();
  await travel(61); await (await game.requestDraw()).wait();
  assert.equal(await game.operationsReserve(), parseEther('0.98'));
  assert.equal(await game.withdrawableFees(), parseEther('0.98'));
  await assert.rejects(game.withdrawFees(parseEther('0.99')));
  await (await game.withdrawFees(parseEther('0.98'))).wait();
  assert.equal(await game.operationsReserve(), 0n);
  assert.equal(await game.withdrawableFees(), 0n);
  await travel(61); await (await game.cancelExpired()).wait();
  await (await game.connect(alice).claim(2)).wait();
  await (await game.connect(bob).claim(2)).wait();
  assert.equal((await game.roundInfo(2)).claimed, parseEther('2'));
  await (await game.connect(alice).claim(1)).wait();
  await (await game.connect(bob).claim(1)).wait();
  assert.equal(await provider.getBalance(await game.getAddress()), 0n);
});
