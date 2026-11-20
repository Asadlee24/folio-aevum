# Folio

Folio is a testnet invoice workspace for freelancers and small studios. A merchant enters a description and amount, then shares a payment link. The customer can confirm the recipient and pay in tUSD8. Folio turns the invoice into a verifiable receipt after the payment confirms.

Built for the Invoice Payments track of the QDay Aevum Builder Challenge.

[Open Folio on Vercel](https://folio-aevum.vercel.app/)

## Run locally

Use Node.js 22 or newer.

```sh
npm install
npm run build
npm test
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Folio runs on Aevum Testnet. Connect a wallet to issue invoices. Existing invoice and receipt links can be opened without a wallet.

## Run on Aevum Testnet

1. In **Setup & help**, connect an EIP-1193 browser wallet and approve switching to Aevum Testnet if prompted. On a phone, open Folio in MetaMask.
2. Get testnet tQDAY for gas and tUSD8 from the [QDay faucet](https://faucet.qday.info). The QDay challenge page also documents the Discord faucet for verified members.
3. Create an invoice and open the share link from a second funded test wallet. Confirm a token approval if prompted, then confirm the payment.
4. Open the receipt and select **Verify on Aevum Explorer**. Check the invoice ID, payer, issuer and transfer amount.

Folio uses the deployed contract below. To publish a separate instance, deploy from a dedicated test wallet using `npm run deploy:aevum` with `FOLIO_TESTNET_PRIVATE_KEY` set in your shell. Set `FOLIO_AEVUM_CONTRACT` to the returned contract address in your Vercel project environment (or your local shell), then rebuild and deploy. Keep private keys out of the repository. Each invoice link retains the contract address used to create it.

## Aevum deployment

- [Folio contract](https://explorer-test.qday.info/address/0x2FFB3C0976cdE95a54EE95a6b0914A3a843258D3)
- [Invoice creation transaction](https://explorer-test.qday.info/tx/0xd717bb29db89f83362b9e11f8c5c6916254156ada6e1a14000ad0f68e5598be4)

## How settlement works

- Aevum testnet chain ID is 44005. The app checks the complete contract runtime bytecode and the configured tUSD8 token before it requests a payment.
- `FolioInvoices.sol` records the issuer, amount, deadline and a hash of the human-readable invoice description. The browser keeps the description in the share link fragment. Checkout shows it only if it matches the on-chain hash. Link recipients can read it, so avoid sensitive client information.
- A successful payment transfers the exact amount directly from the payer to the issuer. The contract closes the invoice in the same transaction and records the payer, settlement time and receipt event. An issuer can cancel an unpaid invoice. Duplicate, expired, cancelled and self-payments revert.
- The static frontend talks to Aevum using ethers. An injected wallet signs each write. The app does not store wallet credentials or hold user funds.
- The local EVM test uses a mock token to verify the contract's lifecycle, balances, allowance, failed transfer rollback and payment event.

## Project links

- [Challenge rules](https://qday.io/builder-challenge)
- [Aevum explorer](https://explorer-test.qday.info)

## Licenses

Folio is MIT licensed. Font files and icons keep their original licenses in [assets/licenses](assets/licenses).

| Dependency | Use | License |
| --- | --- | --- |
| ethers | Browser wallet and Aevum RPC | MIT |
| Lucide | Interface icons | ISC and MIT notices |
| DM Sans and Manrope | Self-hosted fonts | OFL-1.1 |
| esbuild | Browser bundle | MIT |
| solc | Contract compilation | MIT |
| Ganache | Local contract tests | MIT |
