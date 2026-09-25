import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = Object.fromEntries(['OreNine.sol', 'MockD20.sol'].map(name => [
  `contracts/${name}`, { content: fs.readFileSync(path.join(root, 'contracts', name), 'utf8') }
]));
const input = {
  language: 'Solidity', sources,
  settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: process.env.TEST_EVM === 'shanghai' ? 'shanghai' : 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
  }
};
function findImports(name) {
  const file = path.resolve(root, 'node_modules', name);
  return fs.existsSync(file) ? { contents: fs.readFileSync(file, 'utf8') } : { error: `Missing ${name}` };
}
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some(error => error.severity === 'error')) process.exit(1);
const target = path.join(root, process.env.TEST_EVM === 'shanghai' ? 'generated-test' : 'generated');
fs.mkdirSync(target, { recursive: true });
for (const name of ['OreNine', 'MockD20']) {
  const contract = output.contracts[`contracts/${name}.sol`][name];
  fs.writeFileSync(path.join(target, `${name}.json`), JSON.stringify({
    abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`
  }, null, 2));
}
console.log(`Compiled with solc ${solc.version()} (${process.env.TEST_EVM ?? 'cancun'}).`);
