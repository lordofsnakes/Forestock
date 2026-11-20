export const price = 580,
  premium = 12,
  day = 86400000;
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
export function evaluate(s, m, t, marketTime = t) {
  const o = s.order,
    price = o.asset?.price ?? 580,
    premium = o.asset?.premium ?? 12,
    total = o.qty * price;
  const block = (reason, fix = "edit") => ({ kind: "Blocked", reason, fix });
  if (s.paused) return block("Your purchasing allowance is paused.", "budget");
  if (o.cap < price)
    return block("The supplier quote exceeds your unit-price limit.");
  if (o.qty > 500) return block("The supplier has only 500 units available.");
  if (total > Math.min(s.balance, s.limit - s.used))
    return block("The order exceeds your available purchasing funds.", "budget");
  const cutoff = o.due - day;
  if (t > cutoff + 60000)
    return block("The supplier can no longer meet your delivery deadline.");
  if (t >= cutoff)
    return {
      kind: "Buy",
      reason: "Last safe ordering time reached. The offer meets your terms.",
    };
  const sameMarket = (m?.series ?? "COPPER") === (o.asset?.series ?? "COPPER");
  const c = (sameMarket ? m : null)?.contracts
    .filter((c) => c.strike * 100 + premium > price)
    .sort((a, b) => a.strike - b.strike)[0];
  if (
    !c ||
    !currentQuote(m, marketTime) ||
    Date.parse(m.expiry) - marketTime > cutoff - t
  )
    return {
      kind: "Wait",
      reason: "Waiting for a current market within your purchasing window.",
    };
  const probability = (c.bid + c.ask) / 2;
  return {
    kind: probability >= 0.65 ? "Buy" : "Wait",
    reason:
      "The market implies " +
      Math.round(probability * 100) +
      "% for " +
      (o.asset?.name ?? "Copper") +
      " at or above $" +
      c.strike.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }) +
      (probability >= 0.65 ? ". This meets" : ". This is below") + " your 65% early-order threshold.",
    contract: c,
  };
}
