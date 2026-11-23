import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, connectorsForWallets, darkTheme, useAccountModal, useChainModal, useConnectModal } from '@rainbow-me/rainbowkit';
import { bitgetWallet, injectedWallet, metaMaskWallet, okxWallet, rabbyWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, createConfig, createConnector, http } from 'wagmi';
import { getAccount, switchChain, watchAccount } from 'wagmi/actions';
import { injected } from 'wagmi/connectors';
import { BrowserProvider } from 'ethers';
import { CHAIN_ID, EXPLORER, RPC } from './config.js';
import '@rainbow-me/rainbowkit/styles.css';

const aevum = {
  id: CHAIN_ID,
  name: 'QDay Aevum Testnet',
  nativeCurrency: { name: 'QDay Test Token', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Aevum Explorer', url: EXPLORER } },
  iconUrl: '/assets/folio-mark.png',
  iconBackground: '#201a36',
  testnet: true,
};

const projectId = __FOLIO_WALLETCONNECT_PROJECT_ID__;

const legacyMetaMask = () => ({
  id: 'metaMask',
  rdns: 'io.metamask',
  name: 'MetaMask',
  iconUrl: '/assets/folio-mark.png',
  iconBackground: '#201a36',
  installed: (window.ethereum?.providers ?? [window.ethereum]).some((provider) =>
    provider?.isMetaMask && !provider.isRabby && !provider.isBitKeep && !provider.isOkxWallet && !provider.isOKExWallet),
  downloadUrls: { browserExtension: 'https://metamask.io/download/' },
  createConnector: (details) => createConnector((config) => ({
    ...injected({ target: 'metaMask' })(config),
    ...details,
  })),
});

const wallets = projectId
  ? [rainbowWallet, metaMaskWallet, rabbyWallet, okxWallet, bitgetWallet, injectedWallet, walletConnectWallet]
  : [
    legacyMetaMask,
    rabbyWallet,
    ...((window.ethereum?.providers ?? [window.ethereum]).some((provider) => provider?.isRainbow) ? [rainbowWallet] : []),
    ...(window.okxwallet ? [okxWallet] : []),
    ...(window.bitkeep?.ethereum || (window.ethereum?.providers ?? [window.ethereum]).some((provider) => provider?.isBitKeep) ? [bitgetWallet] : []),
    ...(window.ethereum ? [injectedWallet] : []),
  ];

const config = createConfig({
  chains: [aevum],
  transports: { [CHAIN_ID]: http(RPC) },
  connectors: connectorsForWallets([{ groupName: 'Browser wallets', wallets }], {
    appName: 'Folio',
    appDescription: 'Share invoices and verify receipts on Aevum Testnet.',
    appUrl: window.location.origin,
    appIcon: new URL('/assets/folio-mark.png', window.location.origin).href,
    projectId,
  }),
});

const queryClient = new QueryClient();
const theme = darkTheme({
  accentColor: '#c9b6ff',
  accentColorForeground: '#21143b',
  borderRadius: 'large',
  overlayBlur: 'small',
  fontStack: 'system',
});
theme.colors.modalBackground = '#171727';
theme.colors.modalBorder = '#36304b';
theme.colors.modalTextSecondary = '#b9b4ce';

let openModal;

function WalletModals({ onModalChange }) {
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const { openAccountModal, accountModalOpen } = useAccountModal();
  const { openChainModal, chainModalOpen } = useChainModal();

  useLayoutEffect(() => {
    openModal = openAccountModal ?? openChainModal ?? openConnectModal;
  }, [openAccountModal, openChainModal, openConnectModal]);

  const visible = connectModalOpen || accountModalOpen || chainModalOpen;
  useLayoutEffect(() => {
    onModalChange(visible);
  }, [visible, onModalChange]);
  return null;
}

export function mountWallet(onAccountChange, onModalChange) {
  watchAccount(config, { onChange: onAccountChange });
  const root = createRoot(document.getElementById('wallet-root'));
  flushSync(() => {
    root.render(
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={theme} initialChain={aevum} modalSize="compact">
            <WalletModals onModalChange={onModalChange} />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>,
    );
  });
}

export function showWalletModal() {
  if (!openModal) return false;
  openModal();
  return true;
}

export async function wallet() {
  const { address, connector, chainId } = getAccount(config);
  if (!address || !connector) throw new Error('Connect a wallet to continue.');
  if (chainId !== CHAIN_ID) await switchChain(config, { chainId: CHAIN_ID, connector });

  const account = getAccount(config);
  if (account.address !== address || account.connector !== connector) {
    throw new Error('Your wallet changed. Try again with your active account.');
  }
  const provider = new BrowserProvider(await connector.getProvider({ chainId: CHAIN_ID }));
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) {
    throw new Error('Switch your wallet to Aevum Testnet.');
  }
  return { address, signer: await provider.getSigner(address) };
}
