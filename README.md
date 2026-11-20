# Forestock

[Open the mobile prototype](https://forestock-brown.vercel.app). A manufacturer enters a commodity requirement and standing weekly allowance. Gemini copper contracts inform purchase timing. The order deadline takes precedence if the supplier can still fulfill the need within the buyer's limits.

## Try the demo

Open Orders, select a listed commodity, then edit its quantity, price cap, notes and arrival time, then run the decision. The copper example offers $5.80/lb delivered with a 24-hour lead time and up to 500 lb. The example starts with $1,000 in demo funds and a $600 weekly limit. Try the cutoff scenario to hold funds, then accept or decline the order and inspect Budget and Activity. On iPhone, open Safari’s Share menu and use Add to Home Screen.

The editable public workspace saves to this browser. Its controls simulate settlement. Activity also includes a separately executed Arc testnet purchase with independently verifiable receipts. Phone edits do not authorize the funded testnet signer.

## Market data and rule

The buyer can select any series discovered in Gemini’s active Commodities category. Orders retain their material, unit and simulated supplier quote after a refresh. Non-copper demo quotes use the middle listed strike plus a sample premium.

The server queries active commodity events from Gemini's public events API. For copper, the linked contract terms specify the KK_RFR_COPPERUSDC index. Broker fees, physical delivery and a $0.12/lb supplier premium are represented by an illustrative delivered quote. Early buying requires a valid order, a two-sided quote with spread at most 10 cents, a snapshot fetched within two minutes and an event resolving by the order cutoff. Use the lowest quoted strike where strike plus premium exceeds today's supplier price. A midpoint of at least 65% triggers an early purchase. The midpoint estimates market expectations. A fetch timestamp measures snapshot age and cannot establish when traders last updated the book.

The preview labels the dated fallback when Gemini is unavailable. The command-line agent never spends against replay data. Both paths enforce unit price, delivery, stock and budget at cutoff.

## Arc testnet and merchant settlement

Deployed vault: [0xc766185247a5030046f02a1c41dc8b3e5acc35b5](https://testnet.arcscan.app/address/0xc766185247a5030046f02a1c41dc8b3e5acc35b5).

- [5.80 test USDC held for one pound](https://testnet.arcscan.app/tx/0xafa53f0c08a315097e58bcc6653a4e7e13917e5b5dead0a12a4d08c102e16ae5)
- [Supplier acceptance and payout](https://testnet.arcscan.app/tx/0x9360fef60eaa513b590608280bc53fb81ad1289e49d8c8019c9d0fa430918da1)

- [Declined order and refund](https://testnet.arcscan.app/tx/0x734668b9fc0016ea9ffca774db2855a8894ae5d517d75d9952bccf8f84046c94)

The manufacturer role deposits native test USDC (18 decimals), authorizes a specific need and sets the weekly cap. The agent chooses timing and holds an amount against those terms. The simulated merchant accepts by signing an Arc transaction. A decline or timeout returns funds and adjusts the originating period. Weeks reset Monday at 00:00 UTC. Pause prevents new holds. Availability of physical stock, delivery terms and market checks depend on the offchain agent. The contract enforces the total, deadline, weekly budget, allowed signer and one settlement per order.

## Run and verify

Use Node 22+, npm and Foundry. Run `npm ci`, `npm test`, `forge test` and `npm run dev`. Open localhost:3000. For a separate local blockchain rehearsal run `anvil` in another terminal then `node scripts/escrow-demo.js --local`. The worker authorizes and settles one preconfigured need independently of any phone and records state under the user's configuration directory. Keep Anvil running between restarts of the worker.

To run on Arc, compile with `forge build` and run `node scripts/escrow-demo.js`. It creates dedicated local demo accounts with owner-only file permissions and reports the public address to fund when required. Eight test USDC covers the initial one-pound rehearsal, role funding and gas. A separate `--refund-demo` run uses additional test funds to exercise a merchant decline. The process must remain running for an outstanding order to reach cutoff. Re-running reconciles its saved order. Use dedicated test accounts only.

Vercel deploys static assets from public/ and the public Gemini endpoint from api/. No private keys or Gemini API key belong in the web deployment. Use the production alias above or the repository's linked Vercel project. Integration targets are the DeFi and Onchain Applications track, Best use of Arc and Gemini Prediction Markets.

## Feature tests

Run `npm ci` and `npm run test:all` with Chrome, Node 22+ and Foundry on the machine. This runs the decision and Gemini API tests, Solidity vault tests, mobile browser flows and an isolated purchasing-worker rehearsal. The browser suite starts its own server on port 3271 with controlled market responses. The worker suite starts Anvil on port 18546 with disposable accounts and a temporary order directory. Both ports must be available. To smoke-test the public preview, run `APP_URL=https://forestock-brown.vercel.app node scripts/mobile-check.js`.

### AI purchasing chat

Typed messages go to the server-side `/api/chat` endpoint, which uses Google Gemini 2.5 Flash-Lite through Vercel AI Gateway. The model receives recent conversation turns, the material catalog and the current draft. Buyers can ask questions or revise terms before selecting **Review order**. Tap suggestions also work during an AI outage. The separate Gemini Prediction Markets feed supplies the purchasing signal.

On Vercel the function uses deployment OIDC. For local development, set `AI_GATEWAY_API_KEY` in the server environment before running `npm run dev`. Optionally set `AI_GATEWAY_MODEL` to a Gateway model supporting JSON output.

### Buyer dashboard and passkey wallet

Orders lists all watching and held needs. Select a row to view its forecast, edit its terms, or settle that need. **Add need** creates another order under the same weekly allowance. Completed needs retain their receipts. Existing single-order browser workspaces migrate on their next visit.

Every visit opens the purchasing desk. Create a passkey, continue with a saved account, or open **Manual setup** to reconnect a passkey or use the demo balance. In chat, the purchase request fills in as the buyer answers. Reviewing it sends the sparrow and receipt to the orders screen. The header reopens wallet settings later. In Circle Console, create a testnet Modular Wallets web Client Key bound to `forestock-brown.vercel.app`, and register the same passkey domain. Set `CIRCLE_WALLET_CLIENT_KEY` on Vercel and redeploy. For local development configure a key and passkey domain for localhost and set the variable before `npm run dev`. The build publishes the browser client key. Keep server API keys separate.

A buyer taps Create passkey wallet and approves their device prompt. The SDK obtains the smart-account address on Arc Testnet. Use existing passkey restores access. Only the public address is cached on this device. Wallet creation neither funds the escrow nor grants agent spending authority. The onchain account can deploy with its first user operation.

CCTP can fund a buyer's Arc Testnet wallet from a supported source such as Base Sepolia. A funding flow would burn test USDC on the source chain, obtain Circle's attestation, mint on Arc to the buyer's address, and verify the receipt. Depositing into Forestock escrow and authorizing a need are subsequent actions. Bridging is outside the current implementation.
