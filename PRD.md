# Forestock

Draft product requirements for the UBC hackathon in Austin.

## Product and buyer

Forestock is a purchasing agent for small manufacturers. The buyer tells Forestock what material the factory needs and gives it a standing budget. The agent watches Gemini prediction markets, compares the forecast with offers from existing suppliers, and makes authorized purchasing decisions while the buyer is away. The manufacturer comes back to see what the agent decided, what it spent and what still needs attention.

Let the buyer enter an order for any commodity listed in Gemini’s active Commodities category. Keep copper as the worked example and the recorded Arc rehearsal. Use one simulated external merchant in the demo. The merchant can sell through its own website or ordering API. The Forestock experience centers on the buyer. The agent places the actual material order. The forecast informs when it buys and how much of the approved quantity it buys early.

## Competition targets

| Entry | Proposed use and judging evidence |
|---|---|
| **Agentic Payments and AI** · primary track | Demonstrate per-order escrow under a recurring procurement allowance. Show how a delegated agent spends against a buyer's mandate, how the contract enforces the remaining limit, and how the buyer revokes access. Document the autonomous decision loop and distinguish the AI draft, buyer authorization, worker transaction and supplier settlement. |
| **Best use of Arc** · chain award | Hold test USDC on Arc testnet and demonstrate both supplier payout and buyer refund. Trace an authorized expense from the budget to a confirmed transaction and an external order receipt. |
| **Gemini Prediction Markets** · sponsor bounty | Use commodity threshold contracts as information about possible future input costs. Show the exact contract, observed quote, relevant purchasing deadline and decision it influenced. |
| **Official UBC Hackathon Winner** | Automatic overall consideration. Show one forecast-driven purchase from the manufacturer's phone. |

[UBC bounty guide](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit)

## Decision and spending rules

The standing budget grants continuing permission across eligible purchases. The buyer should be able to see its scope, pause future spending, and review individual orders without approving each checkout. The budget controls money. A separate purchase need controls quantity so a persistent signal cannot repeatedly buy the same material. The buyer taps **Add material need** and completes a short brief. Ask “What do you need?”, “How much?” and “When must it arrive?” Collect the unit alongside the quantity. Let the buyer select an approved supplier, set a maximum price and add context in their own words, such as “We need this for Friday’s cable run. Receiving closes at noon.” Show a plain-language readback with the destination, arrival time, limits and applicable standing budget before saving. If a note changes a critical term, reflect it in the structured brief for review. Saving the need should never raise the spending limit.

For a new Arc need, the buyer can authorize up to three purchases against one total quantity. Show the quantity and forecast trigger for each portion before signing. A stronger signal can qualify additional portions. A persistent signal can never repurchase a filled portion. If a fresh forecast suggests stocking up beyond the approved total, show the extra quantity, estimated cost and reason. Only a separate passkey approval can authorize the extra stock, within the existing weekly allowance.

Work backward from required arrival using the supplier’s confirmed lead time, cutoff and receiving hours. Show the resulting **Order by** time beside **Needed by**. Before that cutoff, the purchasing agent weighs Gemini’s forecast alongside the supplier’s delivered price, lead time and the buyer’s limits. Store the observation and the reason for buying early or waiting. The buyer authorizes the order through their purchasing terms and standing allowance. At the last safe ordering time, buy the outstanding quantity if the offer still meets the buyer’s terms and the budget is available, even when the signal favors waiting or usable forecast data is missing. If price, stock, delivery or budget prevents a valid order, alert the buyer and identify the constraint.

Use a benchmark-linked sample merchant quote and disclose the unit, premium and fees. A Gemini contract on tomorrow’s copper benchmark can inform a purchase due tomorrow. For 10,000 lb, a four-cent rise per pound would add $400 under the sample formula. Display that as a scenario. Observed market prices, their timestamps and the quote range should remain inspectable. Before the order-by time, thin, stale or mismatched data should yield a visible reason to wait.

## Recurring allowance and order escrow

The buyer deposits test USDC and gives the agent a recurring spending allowance. For the demo, use a buyer-set weekly allowance with a displayed reset date. Unused spending permission expires at reset. Unspent deposited funds carry forward. The buyer can pause new commitments and withdraw uncommitted funds. Renewal restores spending permission only. Funds already held for orders stay locked across resets. Show **Available to order** as the lower of the unused allowance and the uncommitted balance.

For example, with 1,000 USDC deposited and a 600 USDC weekly allowance, the agent can commit 600 USDC. After it locks 250 USDC for an order, the buyer sees **350 available this week** and **250 held for the order**. Paying the supplier from that escrow consumes the existing commitment once.

1. **Hold funds.** When the purchasing rule triggers, bind the delivered price, supplier payout address, quote expiry and unique order ID to a hold. Enforce funds, allowance and order limits together before submitting the external order.
2. **Confirm the order.** Submit the same order ID to an escrow-compatible merchant checkout. The supplier can use its own site. The simulated external merchant issues a signed acceptance tied to the order terms. The hold, supplier payout and refund use real transactions in test USDC on Arc testnet. Label the checkout as simulated and link the transactions in the receipt. A card-only checkout would require a separate payment adapter.
3. **Release or refund.** Anyone can submit the approved supplier’s valid acceptance before the acceptance deadline to release the held amount to that supplier. If the supplier declines or the deadline passes without acceptance, return funds to the buyer’s available balance. Restore allowance only in the original period if it is still current. A late acceptance cannot collect a refunded order.
4. **Recover safely.** Keep external checkout status and escrow status visible independently. If the response is lost, reconcile the original order before retrying. Payment and refund are mutually exclusive final outcomes. Pausing the agent stops new holds while existing ones follow their agreed terms.

Supplier acceptance proves agreement to fulfill an order. Delivery remains a separate business obligation.

The [phased build plan](BUILD_PLAN.md) gives the implementation order, milestone checks and UI palette.

## Build sequence

1. **Specify the buying decision.** Work through one need from entry to delivery deadline. Use the same order to test buying early on a qualifying signal, waiting while there is time, buying at cutoff despite a weak signal, and escalating when the delivered price exceeds the limit.
2. **Design the mobile buyer journey.** Orders shows the next material need, supplier quote and deadline. Budget shows the standing authorization, amount spent and amount available, with a clear pause control. Activity opens a readable explanation and receipt for each decision. Use large labeled amounts, one primary action per screen and restrained color inspired by banking wallets. During review, ask a first-time tester how much the agent may spend and what it has already committed.
3. **Prepare an external offer and Gemini feed.** Retrieve copper market metadata and two-sided quotes. Match benchmark, units and expiry to the merchant offer. Capture a dated observation for a labeled replay. Validate the price calculation and refresh the merchant's stock, terms and total before checkout. [Gemini events API](https://developer.gemini.com/rest-api/prediction-markets/events/list-events)
4. **Implement the decision preview.** Run the same rule on a populated buyer order and on changed quantities and prices. Explain the choice in purchasing language. A useful Activity entry includes the material, quantity, observed signal, merchant price and reason for acting or waiting.
5. **Implement the allowance and escrow on Arc.** Exercise the full hold, payout and refund paths on testnet. Test concurrent holds against the same budget, replayed acceptances, expiry, pause and a refund after the weekly reset.
6. **Connect one external checkout.** Run the agent on the server while the phone is closed. Persist the order before contacting the merchant. Reconcile its reference and onchain hold after interruption. While acceptance is pending, show “Funds held · waiting for supplier.” Label simulated checkout and fulfillment explicitly.
7. **Verify the phone experience.** Open the HTTPS site in Safari, use Share → Add to Home Screen, and tap its icon to return directly to Orders in a standalone view. Include an Apple touch icon and respect the bottom safe area. Check the same site via QR code in Chrome. Test relaunch during checkout, a paused or exhausted budget, stale quotes and duplicate attempts. The public demo link can offer an editable preview while the presenter uses a funded demo buyer.

## The sparrow mascot and UI colors

Carry the [approved bird’s colors](design/sparrow-reference.png) throughout the phone experience. Use ivory for the page, cream for receipts, charcoal for amounts and copper for the forecast and primary action. Use the deeper copper shade for button contrast. The exact proposed colors and usage are in the [build plan](BUILD_PLAN.md#phase-2--prototype-the-buyer-journey-on-a-phone).

The mascot is a shop sparrow with one copper-colored wing. Use its silhouette for the home-screen icon and a small illustration beside the active order. Pair it with concise copy about the buyer’s actual situation. After funds are held, the agent can say “I’ve set aside 250 USDC for this order. The supplier has until 3 pm to accept.” After payout, show the supplier receipt and remaining allowance.

## Four-minute demo

Open Forestock from the manufacturer's home screen. Show the factory's outstanding copper need and existing budget. Inspect one forecast and the external supplier offer it applies to. Show the agent's decision, return to the phone, and open Activity to see the held amount, supplier acceptance, payout receipt and remaining allowance. Demonstrate how the same rule handles a second eligible order when funds are insufficient. Keep the supplier experience offstage.
