# Folio

Folio is a testnet invoice workspace for freelancers and small studios. A merchant enters a description and amount, then shares a payment link. The customer can confirm the recipient and pay in tUSD8. Folio turns the invoice into a verifiable receipt after the payment confirms.

Built for the Invoice Payments track of the QDay Aevum Builder Challenge.

## Run locally

Use Node.js 22 or newer.

```sh
npm install
npm run build
npm test
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. **Try sample checkout** exercises the checkout and receipt without a wallet. Demo payments stay in the browser and never produce an on-chain receipt.

## Run on Aevum Testnet

1. In **Setup & help**, choose **Aevum Testnet** and connect an EIP-1193 browser wallet. On a phone, open the app inside the wallet's browser.
2. Get testnet tQDAY for gas and tUSD8 from the [QDay faucet](https://faucet.qday.info). Check current faucet eligibility before the demo.
3. Select **Deploy contract**, or paste an existing Folio contract address and select **Use contract**.
4. Create an invoice and open the share link from a second funded test wallet. Confirm a token approval if prompted, then confirm the payment.
5. Open the receipt and select **Verify on Aevum Explorer**. Check the invoice ID, payer, issuer and transfer amount.

To publish a site with a default deployment, deploy from a dedicated test wallet using `npm run deploy:aevum` with `FOLIO_TESTNET_PRIVATE_KEY` set in your shell. Set `FOLIO_AEVUM_CONTRACT` to the returned contract address in your Vercel project environment (or your local shell), then rebuild and deploy. Keep private keys out of the repository. For an app-managed deployment, the contract address is stored locally and included in every invoice link.

## How settlement works

- Aevum testnet chain ID is 44005. The app checks the complete contract runtime bytecode and the configured tUSD8 token before it requests a payment.
- `FolioInvoices.sol` records the issuer, amount, deadline and a hash of the human-readable invoice description. The browser keeps the description in the share link fragment. Checkout shows it only if it matches the on-chain hash. Link recipients can read it, so avoid sensitive client information.
- A successful payment transfers the exact amount directly from the payer to the issuer. The contract closes the invoice in the same transaction and records the payer, settlement time and receipt event. An issuer can cancel an unpaid invoice. Duplicate, expired, cancelled and self-payments revert.
- The static frontend talks to Aevum using ethers. An injected wallet signs each write. The app does not store wallet credentials or hold user funds.
- The local EVM test uses a mock token to verify the contract's lifecycle, balances, allowance, failed transfer rollback and payment event.

## Project links

- [Challenge rules](https://qday.io/builder-challenge)
- [Aevum explorer](https://explorer-test.qday.info)

Folio source is published under the MIT License. The interface uses DM Sans, Manrope and Lucide icons under their respective upstream licenses.
