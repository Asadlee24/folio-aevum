export const CHAIN_ID = 44005;
export const RPC = 'https://rpc-test.qday.info';
export const EXPLORER = 'https://explorer-test.qday.info';
export const FAUCET = 'https://faucet.qday.info';
export const TOKEN = '0x456569838f1d43009A91ebA4263147Afd7233483'.toLowerCase();
const publishedContract = '0x2FFB3C0976cdE95a54EE95a6b0914A3a843258D3';
const configuredContract = typeof __FOLIO_DEFAULT_CONTRACT__ === 'string' ? __FOLIO_DEFAULT_CONTRACT__ : '';
export const CONTRACT = configuredContract || publishedContract;
export const FEATURED_INVOICE = { contract: publishedContract, id: '1', merchant: 'Folio Studio', title: 'Aevum checkout demonstration' };
