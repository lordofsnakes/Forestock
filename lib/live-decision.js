import { day, evaluate, currentQuote, totalCents } from "../public/decision.js";

// Both the worker and the buyer's preview use the same terms and supplier quote.
export function liveDecision(order, funds, asset, liveMarket, recording, time) {
  const replay =
    !currentQuote(liveMarket, time) &&
    order.allowRecording &&
    Boolean(recording?.contracts?.length);
  const market = replay ? recording : liveMarket;
  const cutoff = Number(order.orderBy) * 1000;
  if (time > cutoff)
    return {
      kind: "Blocked",
      reason: "The supplier’s order deadline has passed.",
    };
  if (!asset)
    return {
      kind: "Wait",
      reason: "Waiting for a supplier quote for this material.",
    };
  // Leave a short inclusion window before the last safe ordering time.
  const atDeadline = cutoff - time <= 30000;
  const decision = evaluate(
    {
      balance: Number(funds.free / 10n ** 16n),
      limit: Number(funds.limit / 10n ** 16n),
      used: Number(funds.spent / 10n ** 16n),
      order: {
        qty: order.quantityMilli / 1000,
        cap: order.capCents,
        asset,
        due: cutoff + day,
        threshold: order.threshold,
      },
    },
    market,
    atDeadline ? cutoff : time,
    replay ? Date.parse(recording.observed) : time,
  );
  return {
    ...decision,
    reason: decision.reason.replace("demo budget", "escrow balance"),
    recorded: Boolean(replay && decision.contract),
    observed: decision.contract && market?.observed,
    total: totalCents(order.quantityMilli / 1000, asset.price),
  };
}
