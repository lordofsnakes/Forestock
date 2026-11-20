# Forestock

[Open the mobile prototype](https://forestock-brown.vercel.app). A manufacturer enters a commodity requirement and standing weekly allowance. Gemini copper contracts inform purchase timing. The order deadline takes precedence if the supplier can still fulfill the need within the buyer's limits.

## Buy on Arc Testnet

Connect a Circle passkey on the home screen, plan a need with the sparrow, and review the amount, delivery cutoff, price cap and weekly spending limit. The authorization batches the deposit, limit and order terms into one smart-account operation. Native Arc test USDC in the buyer wallet pays for the deposit and network fees. A weekly limit is a ceiling, not a deposit.

With **Let Sparrow buy in portions** enabled, the buyer approves a maximum quantity. Sparrow splits it into up to three purchases when unit and price rounding allow. At a starting threshold of 10%, the portions qualify at 10%, 40% and 70%. In the final 30 seconds before the order cutoff the worker may buy any remaining approved portions, subject to the supplier offer, escrow balance and weekly limit. Each portion can settle once.

A qualifying live forecast of at least 70% can prompt one stock-up suggestion per original need. The suggested extra is up to 25% of the original quantity and must fit the remaining weekly budget after open needs. **Review extra stock** shows the terms. Approving with a passkey creates the additional order. Viewing or dismissing it spends nothing.

The agent watches signed needs, checks Gemini and the supplier quote, and places a hold against that buyer’s escrow. Live forecasts are the default. Buyers can explicitly allow a dated recording when a live quote is unavailable. The test supplier automatically accepts holds. Orders and Activity link to the confirmed hold and settlement for each need. In Budget buyers can change the cap, set it to zero to pause new holds, and withdraw uncommitted funds. Expired holds can be refunded onchain by anyone after one hour.

The website is deployed on Vercel. The testnet worker runs on the presenter’s Mac under the launchd label `app.forestock.arc-testnet-agent`. It must be online for automatic purchases and settlement. It resumes from its local block checkpoint. To run it manually on an alternate host, use `node scripts/live-agent.js` from this checkout with the deployed contract’s matching testnet agent and supplier keys provisioned in `~/.config/forestock-testnet`. Run one worker at a time. The chain, escrow address and deployment receipt are in [the public network configuration](public/arc-network.json).

## Browser-only practice

The isolated [practice workspace](https://forestock-brown.vercel.app/?practice=1) is available through Manual setup for an unfunded walkthrough.

Open Orders, select a listed commodity, then edit its quantity, price cap, notes and arrival time. Orders shows whether the market and supplier terms qualify for a demo purchase. The copper example offers $5.80/lb delivered with a 24-hour lead time and up to 500 lb. The example starts with $1,000 in demo funds and a $600 weekly limit. For a repeatable forecast-driven purchase, choose **Copper**, **0.01 lb** and **600 USDC**. In Orders select **Use recorded forecast** if a live quote is showing. The November 19 recording gives a 70% probability, above the default 10% threshold. Select **Place demo order · $0.06** and **Accept order** to see the supplier receipt and the $0.06 commitment in Budget and Activity. On iPhone, open Safari’s Share menu and use Add to Home Screen.

On Orders, tap a speech bubble beside the sparrow to discuss that timestamped market update and the selected order. **Back to Orders** returns to the same need. The editable public workspace saves to this browser. Demo quantities support thousandths of a unit and order totals settle in whole cents (one-cent minimum). Use **Budget → Reset demo workspace** or **Manual setup → Reset demo workspace** to clear saved needs and restore the starting demo funds. Its controls simulate settlement. Activity also includes a separately executed Arc testnet purchase with independently verifiable receipts. Phone edits do not authorize the funded testnet signer.

## Market data and rule

The buyer can select any series discovered in Gemini’s active Commodities category. Orders retain their material, unit and simulated supplier quote after a refresh. Non-copper demo quotes use the middle listed strike plus a sample premium.

The server queries active commodity events from Gemini's public events API. For copper, the linked contract terms specify the KK_RFR_COPPERUSDC index. Broker fees, physical delivery and a $0.12/lb supplier premium are represented by an illustrative delivered quote. Early buying requires a valid order, a two-sided quote with spread at most 10 cents, a snapshot fetched within two minutes and an event resolving by the order cutoff. Use the lowest quoted strike where strike plus premium exceeds today's supplier price. The early-order threshold starts at 10% for each demo need. In Orders, tap **Change** beside the threshold to set any whole percentage from 1 to 100 for the selected need. When the midpoint reaches that level, the order becomes ready. **Place demo order** reserves funds. The midpoint estimates market expectations. A fetch timestamp measures snapshot age and cannot establish when traders last updated the book.

The preview falls back to the selected commodity’s recorded snapshot when its live quote is missing, stale or expired. Replay evaluates time to expiry at capture against the time remaining in the buyer’s order window. For a second replay example, select Silver and set its threshold to 5%. Its recorded 5.5% midpoint qualifies if the order fits the remaining budget and delivery window. The separate Arc command-line rehearsal uses its original 65% rule and live quotes. Both paths enforce unit price, delivery, stock and budget at cutoff.

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

Every visit opens the purchasing desk. Create a passkey, continue with a saved account, or open **Manual setup** to reconnect a passkey or use the demo balance. In chat, the sparrow speaks as its replies appear. The buyer can open **Your draft** to check the materials and allowance, then review the order to follow the sparrow to the dashboard. The header reopens wallet settings later. In Circle Console, create a testnet Modular Wallets web Client Key bound to `forestock-brown.vercel.app`, and register the same passkey domain. Set `CIRCLE_WALLET_CLIENT_KEY` on Vercel and redeploy. For local development configure a key and passkey domain for localhost and set the variable before `npm run dev`. The build publishes the browser client key. Keep server API keys separate.

A buyer taps Create passkey wallet and approves their device prompt. The SDK obtains the smart-account address on Arc Testnet. Use existing passkey restores access. Only the public address is cached on this device. Wallet creation neither funds the escrow nor grants agent spending authority. The onchain account can deploy with its first user operation.

### Cross-chain supplier payments

Choose **Compare Arc and Base suppliers** on Arc order review. This opens a separate buyer-funded escrow with its own weekly cap. Forestock compares its illustrative Arc quote with the project supplier’s signed, expiring Base Sepolia quote sheet and Circle’s current forwarding fee. Both offers model a 24-hour delivery. The passkey batch binds the selected Base offer and maximum fee to the order. For a single-shipment comparison, turn off buying in portions and choose 0.1 lb of copper. At a 0.053 USDC forwarding fee the Base offer costs 0.52 test USDC delivered, versus 0.58 on Arc. At 0.01 lb Arc wins. Suppliers and physical deliveries are simulated.

The new-order forecast threshold is 10%. For a time-bounded rehearsal, open **Buying rules** and select **Order within two minutes for this demo** before signing. The worker may hold in the final 30 seconds under the deadline rule, subject to stock, price and available allowance. A longer cutoff lets the forecast itself trigger the order. The threshold is per order and can be edited with the buyer’s passkey while watching.

For a Base order, the worker checks the signed supplier price and refreshes the Circle fee before reserving funds and before acceptance. On acceptance the escrow calls Circle’s TokenMessengerV2 on Arc (domain 26) with Base Sepolia (domain 6) and the forwarding hook. Circle relays the mint. Activity displays the Arc transaction immediately and the Base receipt once the destination transfer to the supplier is verified. If a held order cannot be dispatched within an hour, the worker refunds it. After a successful burn, destination confirmation can take longer than the live presentation.

In the November 20 project-funded rehearsal, the 10% rule qualified on a live copper forecast. The agent held 0.52 test USDC, the escrow burned it on Arc, and the Base Sepolia supplier received 0.46. The forwarding fee was 0.06. Funding confirmation to destination mint took 30 seconds. [Arc hold](https://testnet.arcscan.app/tx/0x71e604abd5936474b0cf99cf24130542fcb6e86e5eb6f2105034c7675cc2882b) · [Arc burn](https://testnet.arcscan.app/tx/0xd670a6b93fbb20ff4843f047c76b1d4d8d48dcb511ab6cc0187d652cb96e34c2) · [Base supplier receipt](https://sepolia.basescan.org/tx/0x8fa73ba6bb24ad357333f631d58c0c21670ebedabc69c0b92b697caaddc965ab).

The project supplier can refresh its 30-day quote sheet using `node scripts/publish-offers.js`. Publish the resulting signed file and restart the worker. The original Arc escrow, its funds and orders remain accessible through **Return to Arc-only orders**.
