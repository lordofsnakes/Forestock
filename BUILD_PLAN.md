# Forestock build plan

Build one complete purchase from a manufacturer’s phone. The first milestone is an understandable buying decision. The final milestone is a supplier receipt backed by an Arc testnet payout. Use the [PRD](PRD.md) for product rules and the [approved sparrow artwork](design/sparrow-reference.png) for visual direction.

## Phase 1 · Establish a reproducible order

Fetch a Gemini copper contract, verify its benchmark, units and settlement time, and save a timestamped observation with its bid and ask. Capture a replay while data is available. Set up a sample supplier offer with stock, delivered unit price, destination, lead time, quote expiry and acceptance deadline. Calculate the last safe order time from the buyer’s arrival deadline. Confirm access to funded Arc testnet accounts for buyer, agent and simulated supplier early.

Use one consistent sample across screens. An illustrative 100 lb order at $5.80/lb costs $580 delivered. With 1,000 test USDC deposited and a 600 weekly allowance, that leaves 20 available this week and 580 held until supplier acceptance. Replace the illustrative inputs together if the actual market requires different numbers.

**Exit check.** Someone can reproduce the total, deadline and remaining allowance by hand and identify which observation came from Gemini.

## Phase 2 · Prototype the buyer journey on a phone

Build Orders, Budget and Activity against the sample order. Start at the next material deadline. Let the buyer enter pounds, needed-by time, supplier and maximum price, review the readback and save the need. Show the standing allowance and next reset. On the receipt, give the supplier name, amount paid and order reference priority over the transaction hash.

| Sparrow-inspired color | Proposed value | UI use |
|---|---|---|
| Paper ivory | `#FAF1DF` | Page background and space around the bird |
| Cream | `#FFF9EF` | Order sheets and receipt surfaces |
| Charcoal plumage | `#382F29` | Text, amounts, navigation and chart labels |
| Copper wing | `#B76532` | Chart line, selected indicators and small illustrations |
| Deep copper | `#85401F` | Primary button with cream text and links on ivory |

Use a quiet wallet layout with tabular amounts, generous spacing and one main action per screen. Keep the bird beside the order explanation. Use its receipt pose only after supplier acceptance. Pair spending states with words and icons. Check normal text at 4.5:1 contrast and meaningful chart marks against their background at 3:1. Verify large text and thumb reach on a 360 px viewport.

**Exit check.** A new reader can answer “When must I order?”, “How much can the agent spend?” and “Has the supplier been paid?” from the phone screens.

## Phase 3 · Make Gemini guide the buying decision

Connect server-side market discovery and the simulated quote endpoint to the preview. Define and document a reproducible early-buy rule. A demo default could buy early when a sufficiently fresh, two-sided market implies a chosen likelihood of tomorrow’s benchmark exceeding today’s delivered quote after adjusting for the supplier premium. Record the threshold, spread limit and freshness limit used. Enforce stock, delivery, maximum price, allowance and available funds for every purchase. At cutoff, buy an eligible order even when the forecast favors waiting.

**Exit check.** Show four outcomes for the same buying need: buy early, wait on weak or missing data, buy at cutoff, or flag a binding limit. Each outcome explains the relevant price, deadline or constraint. Replays display their original timestamp.

## Phase 4 · Enforce payment rules on Arc

Implement deposit, weekly spending permission, pause, withdrawal of free funds and one escrow per order. Lock the delivered total before checkout. Bind the supplier’s signed acceptance to this contract, network, order, amount, payee and deadline. Allow payout exactly once. An authenticated decline or an expired acceptance window permits a refund. Attribute a refund to the original allowance period. Document contract addresses and the weekly reset convention.

**Exit check.** Demonstrate a confirmed hold, payout and separate refund on testnet. Test competing orders against one allowance, duplicate acceptance and a refund across the weekly reset. Pausing blocks new holds while existing ones can settle.

## Phase 5 · Complete one purchase with the phone closed

Persist the agent decision and order ID. After the hold confirms, submit the order to the simulated external checkout using that ID for retries. Run the decision and settlement workers on the server. Reconcile merchant and chain status after a timeout before taking another action. Reopen the order from Activity and show held, accepted, paid or refunded in plain language. Give the public QR audience preview access and the presenter the funded buyer session.

**Exit check.** Close the phone during checkout, interrupt one response, and reopen to one supplier order, one payout and the correct balance. Demonstrate a declined checkout returning funds.

## Phase 6 · Verify the mobile demo and submit

Open the HTTPS site in Safari, add it through Share → Add to Home Screen, then launch into Orders from the sparrow icon. Check the same link in Chrome, including keyboard, safe areas, refresh during confirmation and return after connectivity loss. Rehearse the four-minute demo from the PRD. Lead with the manufacturer’s deadline, reveal the Gemini evidence, then show funds held and the receipt on acceptance. Keep a dated market replay and an actual prior testnet receipt ready for a connectivity issue.

**Exit check.** Record the phone walkthrough and document the live app, Gemini instrument, Arc testnet addresses, transaction evidence, simulated merchant and setup instructions. Select DeFi and Onchain Applications, Best use of Arc and Gemini Prediction Markets on submission.
