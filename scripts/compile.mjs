import { readFile } from 'node:fs/promises';
import solc from 'solc';

export async function compile(sources) {
  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(Object.entries(sources).map(([name, content]) => [name, { content }])),
    settings: {
      evmVersion: 'paris',
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const result = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (result.errors ?? []).filter((issue) => issue.severity === 'error');
  if (errors.length) throw new Error(errors.map((issue) => issue.formattedMessage).join('\n'));
  return result.contracts;
}

export async function compileFolio() {
  const name = 'FolioInvoices.sol';
  const source = await readFile(new URL('../contracts/FolioInvoices.sol', import.meta.url), 'utf8');
  const compiled = (await compile({ [name]: source }))[name].FolioInvoices;
  return { abi: compiled.abi, bytecode: '0x' + compiled.evm.bytecode.object, runtime: '0x' + compiled.evm.deployedBytecode.object };
}
