export const price = 580,
  premium = 12,
  day = 86400000;
export const defaultThreshold = 10;
export const minimumQuantity = .001;
export function defaultQuantity(asset) {
  return asset.price > 50000 ? minimumQuantity : .01;
}
export function totalCents(quantity, unitPrice) {
  // Convert to thousandths before pricing so half-cent orders round consistently.
  return Math.max(1, Math.round(Math.round(quantity * 1000) * unitPrice / 1000));
}
export function thresholdFor(order) {
  const value = order.threshold;
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 50;
}
export function week(t) {
  return Math.floor((t + 3 * day) / (7 * day));
}
export function refresh(s, t) {
  if (s.week !== week(t)) {
    s.week = week(t);
    s.used = 0;
  }
  return s;
}
export function currentQuote(market, time) {
  return Boolean(market?.contracts?.length &&
    Math.abs(time - Date.parse(market.observed)) <= 120000 && Date.parse(market.expiry) > time);
}
export function midpointPercent(contract) {
  return Number(((contract.bid + contract.ask) * 50).toFixed(8));
}
export function evaluate(s, m, t, marketTime = t) {
  const o = s.order,
    price = o.asset?.price ?? 580,
    premium = o.asset?.premium ?? 12,
    total = totalCents(o.qty, price);
  const block = (reason, fix = "edit") => ({ kind: "Blocked", reason, fix });
  if (s.paused) return block("Your purchasing allowance is paused.", "budget");
  if (o.cap < price)
    return block("The supplier quote exceeds your unit-price limit.");
  if (o.qty > 500) return block("The supplier has only 500 units available.");
  const funds = Math.max(0, Math.min(s.balance, s.limit - s.used));
  if (total > funds)
    return block("This order costs $" + (total / 100).toFixed(2) + ". You have $" +
      (funds / 100).toFixed(2) + " available to order. Reduce the quantity or review your demo budget.", "budget");
  const cutoff = o.due - day;
  if (t > cutoff + 60000)
    return block("The supplier can no longer meet your delivery deadline.");
  if (t >= cutoff)
    return {
      kind: "Buy",
      reason: "The supplier needs 24 hours to deliver. It’s time to order, and the offer meets your terms.",
    };
  const sameMarket = (m?.series ?? "COPPER") === (o.asset?.series ?? "COPPER");
  const c = (sameMarket ? m : null)?.contracts
    .filter((c) => c.strike * 100 + premium > price)
    .sort((a, b) => a.strike - b.strike)[0];
  if (!c || !currentQuote(m, marketTime))
    return { kind: "Wait", reason: "There’s no qualifying forecast for this material to compare with your threshold yet." };
  if (Date.parse(m.expiry) - marketTime > cutoff - t)
    return { kind: "Wait", reason: "This forecast resolves after you need to order. I’m watching for one that resolves sooner." };
  const probability = midpointPercent(c);
  const threshold = thresholdFor(o);
  const qualifies = probability >= threshold;
  return {
    kind: qualifies ? "Buy" : "Wait",
    reason:
      "The market implies " +
      probability +
      "% for " +
      (o.asset?.name ?? "Copper") +
      " at or above $" +
      c.strike.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }) +
      (qualifies ? ". This meets" : ". This is below") + " your " + threshold + "% early-order threshold.",
    contract: c,
  };
}
