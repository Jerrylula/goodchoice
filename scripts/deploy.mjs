import fs from 'node:fs';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, getAddress, keccak256 } from 'ethers';

const rpc = process.env.ARC_RPC || 'https://rpc.mainnet.arc.io';
const coordinator = '0xd20da057469C45928912d983F45790C41e290571';
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw Error('Set DEPLOYER_PRIVATE_KEY in your shell, never in source files');
const provider = new JsonRpcProvider(rpc, 5042);
if ((await provider.getNetwork()).chainId !== 5042n) throw Error('Not Arc Mainnet');
const manifest = await fetch('https://d20dao.org/deployments/arc-mainnet.json').then(r => {
  if (!r.ok) throw Error('Cannot load official D20 deployment manifest');
  return r.json();
});
if (manifest.chainId !== 5042 || getAddress(manifest.coordinator) !== getAddress(coordinator)) throw Error('D20 proxy mismatch');
const proxyCode = await provider.getCode(coordinator);
if (proxyCode === '0x' || keccak256(proxyCode).toLowerCase() !== manifest.coordinatorCodeHash.toLowerCase()) throw Error('D20 proxy code hash mismatch');
const eip1967Slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const word = await provider.getStorage(coordinator, eip1967Slot);
const implementation = getAddress(`0x${word.slice(-40)}`);
if (implementation !== getAddress(manifest.coordinatorImplementation)) throw Error('D20 implementation differs from current manifest');
if (keccak256(await provider.getCode(implementation)).toLowerCase() !== manifest.coordinatorImplementationCodeHash.toLowerCase()) throw Error('D20 implementation code hash mismatch');
const artifact = JSON.parse(fs.readFileSync(new URL('../generated/OreNine.json', import.meta.url)));
const wallet = new Wallet(key, provider);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const request = await factory.getDeployTransaction(coordinator);
const [gasLimit, feeData, balance] = await Promise.all([
  provider.estimateGas({ ...request, from: wallet.address }),
  provider.getFeeData(),
  provider.getBalance(wallet.address)
]);
const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
if (!gasPrice) throw Error('Cannot estimate Arc deployment gas price');
const estimatedCost = gasLimit * gasPrice;
console.log('Deployer address:', wallet.address);
console.log('Native USDC balance:', formatEther(balance));
console.log('Estimated deployment gas:', gasLimit.toString());
console.log('Estimated maximum gas cost in native USDC:', formatEther(estimatedCost));
if (balance < estimatedCost) throw Error('Deployer wallet has insufficient native USDC for estimated gas');
if (process.env.DEPLOY_DRY_RUN === '1') {
  console.log('Dry run only; no transaction was sent.');
  process.exit(0);
}
const contract = await factory.deploy(coordinator);
console.log('Deployment transaction:', contract.deploymentTransaction().hash);
await contract.waitForDeployment();
console.log('Game address:', await contract.getAddress());
console.log('D20 coordinator:', coordinator);
console.log('Owner:', await contract.owner());
console.log('Current round:', (await contract.currentRound()).toString());
