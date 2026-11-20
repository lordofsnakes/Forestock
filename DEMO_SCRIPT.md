# Forestock demo

**Read the six paragraphs under Voiceover.** Aim for about 2 minutes 40 seconds. Allow a beat for the bird’s flight into Review and for the final receipt. Say USDC as “U-S-D-C” and CCTP as “C-C-T-P.”

## Voiceover

Imagine running a cable factory in a developing country. Your copper supplier needs an answer by noon. The latest market report you can get is yesterday’s. How much do you order?

I open Forestock and connect with a passkey. Sparrow can buy oil, natural gas, gold, silver, or copper. For Friday’s cable run, I tell it how much copper I need and what I can spend. In Review, I compare Arc and Base supplier quotes, including forwarding. I check the price cap, choose my weekly limit, and approve with my passkey. Now Sparrow can buy in portions while I’m away.

In Orders, I can see what Sparrow is watching and ask why it’s waiting. This is how Forestock uses prediction markets as information markets when reporting is delayed or restricted. Take this November nineteenth Gemini copper contract. A sixty-eight-cent bid and a seventy-two-cent ask imply a seventy percent chance of copper finishing at five dollars seventy a pound or higher. With thresholds of fifty, sixty-seven, and eighty-four percent, two portions qualify early. The third waits.

Next I open Outlook to look beyond copper prices. I can pick a tech or politics market, see which outcome traders are pricing, and read Sparrow’s take. An election forecast, for example, raises a practical question for my factory. If import rules change, will my supplier still honor today’s copper quote? If there’s a material worth investigating, one tap starts a new draft with that reasoning attached. I decide whether to approve extra stock.

In Budget, I can see what’s in escrow and pause new purchases by setting my weekly cap to zero and signing the change. When an order qualifies, Sparrow checks the supplier’s price and sends the hold to Arc. The contract enforces my limits. USDC covers the order and the network fee.

Finally, here’s Activity. On November twentieth, a live Gemini forecast triggered a separate test purchase. Sparrow reserved fifty-two cents on Arc. When the test supplier accepted, Circle’s CCTP delivered forty-six cents on Base Sepolia. Six cents covered forwarding. The copper delivery was simulated. I can open the receipt on my phone and see who actually got paid.

## Portrait edit

Use the phone UI at 9:16. Each row follows the previous tap. Keep the selected order and the bottom navigation visible when changing tabs. The times are targets for the first edit; cut to the actual voice recording.

| Time | Phone action and animation cue |
| --- | --- |
| 0:00–0:14 | Open on **Let’s plan a purchase**, with the sparrow above the passkey button. Briefly overlay “Copper order due by noon” as the buyer’s scenario. Leave the dashboard reveal for after onboarding. |
| 0:14–0:44 | Follow the passkey into chat. Type the Friday cable-run request, supply **0.03 lb** and **1 USDC/week**, then tap **Review order**. Let the bird fly into Review. Expand **Compare supplier offers**, then **Buying rules**. Show the unit price cap, enable portions and set the starting threshold to **50%**. End on **Authorize with passkey** and transition into Orders using an authorized example or a clearly labeled walkthrough. |
| 0:44–1:20 | In **Orders**, filter to copper. Show its grouped portions. Tap **Ask about this order**, then **Back to Orders**. Expand **When will this buy?** and **Market prices and odds**. Insert the **November 19 recorded Gemini quote** as a dated close-up. Bring 68¢ and 72¢ together at 70%. Highlight the 50% and 67% portions as eligible, with 84% still watching. Preserve the distinction between eligibility and a completed hold. |
| 1:20–1:53 | Tap **Outlook** in the bottom bar. Show **Tech**, then tap **Politics** to reveal a different event. Hold on one named outcome, expiry, odds and **Sparrow’s take** long enough to read the implication. Use a genuine card that offered **Plan a [material] purchase** to show the optional path into chat. If filming this branch, show the event carried into chat, then tap **Arc orders** to return. If the live take suggests monitoring, show it and use a separately labeled recorded example for the optional draft path. |
| 1:53–2:16 | Tap **Budget**. Frame the escrow balance and amount committed this week. Move the weekly-cap slider to zero as a preview, then restore it. The buyer would tap **Save with passkey** to apply it. On “sends the hold,” bring up the confirmed Arc hold as a brief overlay. |
| 2:16–2:40 | Tap **Activity**. Label this **Completed testnet purchase · November 20 · 0.1 lb copper**. Follow the Arc hold and burn to the Base supplier receipt. Time the highlights on 0.52, 0.46 and 0.06 to the voice. End on the actual transfer, then fade in the Forestock URL. |

The November 19 snapshot illustrates the three-portion rule. The November 20 receipt belongs to a separate single-shipment rehearsal. Keep both dates visible and use the existing receipts for the payment shot.

## What the judges can verify

| Devpost selection | Evidence in the film |
| --- | --- |
| **Agentic Payments and AI** — main track | Show the AI drafting the need, the buyer signing the terms, and the worker reading the escrow balance and submitting a hold when the buying rule qualifies. End on the supplier receipt. The README documents the decision loop, onchain limits and separate approval for extra stock. |
| **Best use of Arc** — chain award | The buyer funds escrow on Arc Testnet. USDC is also Arc’s native gas token. Show that as a small caption beside the Arc hold. Circle passkey wallets and CCTP connect the purchase authorization to the supplier’s Base Sepolia receipt. |
| **Gemini Prediction Markets** — bounty | Show a named contract, expiry and two-sided quote from the market data API. Show how the 70% midpoint qualifies two signed portions under the example buying rule. The November 20 receipt provides separate evidence of a forecast-triggered testnet payment. |

[Open Forestock](https://forestock-brown.vercel.app) · [November 19 source snapshot](public/commodities.json) · [Deployed Arc contracts](public/arc-network.json)

[November 20 Arc hold](https://testnet.arcscan.app/tx/0x71e604abd5936474b0cf99cf24130542fcb6e86e5eb6f2105034c7675cc2882b) · [Arc burn](https://testnet.arcscan.app/tx/0xd670a6b93fbb20ff4843f047c76b1d4d8d48dcb511ab6cc0187d652cb96e34c2) · [Base supplier receipt](https://sepolia.basescan.org/tx/0x8fa73ba6bb24ad357333f631d58c0c21670ebedabc69c0b92b697caaddc965ab)
