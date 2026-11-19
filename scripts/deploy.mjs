import { ContractFactory, JsonRpcProvider, Wallet } from 'ethers';
import { CHAIN_ID, RPC, TOKEN } from '../src/config.js';
import { compileFolio } from './compile.mjs';

const key = process.env.FOLIO_TESTNET_PRIVATE_KEY;
if (!key) throw new Error('Set FOLIO_TESTNET_PRIVATE_KEY to a dedicated Aevum test wallet key.');
const provider = new JsonRpcProvider(RPC);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(CHAIN_ID)) throw new Error('RPC returned an unexpected chain ID.');
const artifact = await compileFolio();
const wallet = new Wallet(key, provider);
const deployment = await new ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(TOKEN);
const receipt = await deployment.deploymentTransaction().wait();
console.log(JSON.stringify({ contract: await deployment.getAddress(), transaction: receipt.hash, block: receipt.blockNumber }));
