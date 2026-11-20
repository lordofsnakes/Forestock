import { encodeAbiParameters, keccak256, toHex } from "viem";
import { currentQuote, liveCutoffWindowSeconds, midpointPercent, totalCents, watchedContract } from "../public/decision.js";

export function orderId(buyer, salt) {
  return keccak256(encodeAbiParameters([{type:"address"}, {type:"bytes32"}], [buyer, salt]));
}

export function relatedSalt(root, role) {
  const label = toHex("forestock/" + role + "/v1", {size:32});
  return keccak256(encodeAbiParameters([{type:"bytes32"}, {type:"bytes32"}], [root, label]));
}

// Each portion is an independently executable, single-use plan in the existing escrow.
export function sizedPurchases(line, buyer, threshold, flexible, quoteFor) {
  const milli = Math.round(line.quantity * 1000);
  const root = orderId(buyer, line.salt);
  const maxCount = flexible && milli <= 500000 ? Math.max(1, Math.min(3, milli, 101 - threshold)) : 1;
  const totalCap = totalCents(line.quantity, line.cap);
  for (let count = maxCount; count >= 1; count--) {
    const portions = Array.from({length:count}, (_, index) => {
      const quantityMilli = Math.floor((index + 1) * milli / count) - Math.floor(index * milli / count);
      const quantity = quantityMilli / 1000;
      return {
        quantity, quantityMilli,
        salt: index ? relatedSalt(root, "part" + index) : line.salt,
        threshold: threshold + Math.ceil(index * (100 - threshold) / count),
        offer: quoteFor({...line, quantity}),
      };
    });
    // Rounding each payment to cents must still respect the original total cap.
    const signedTotal = portions.reduce((sum, part) => sum + totalCents(part.quantity, line.cap), 0);
    const quotedTotal = portions.reduce((sum, part) => sum + part.offer.cents, 0);
    if (count === 1 || (signedTotal <= totalCap && quotedTotal <= totalCap)) return portions;
  }
}

// The buyer can reconstruct these relationships on another device from the onchain order list.
export function purchaseFamilies(ids, buyer) {
  const existing = new Set(ids);
  const families = new Map();
  for (const root of ids) {
    const portions = [root];
    for (const role of ["part1", "part2"]) {
      const id = orderId(buyer, relatedSalt(root, role));
      if (existing.has(id)) portions.push(id);
    }
    const extra = orderId(buyer, relatedSalt(root, "extra"));
    const hasExtra = existing.has(extra);
    if (portions.length === 1 && !hasExtra) continue;
    const family = {root, portions};
    for (const id of portions) families.set(id, family);
    if (hasExtra) {
      family.extra = extra;
      families.set(extra, family);
    }
  }
  return families;
}

export function stockUpQuote(orders, asset, market, time, quoteFor, availableCents) {
  if (!orders.length || !asset || !currentQuote(market, time)) return;
  if (orders.some(order => ![1, 2, 3, 6].includes(order.status))) return;
  const parent = orders[0];
  const orderBy = Number(parent.orderBy);
  if (orderBy * 1000 - time <= liveCutoffWindowSeconds * 1000 || Date.parse(market.expiry) > orderBy * 1000) return;

  const approvedMilli = orders.reduce((sum, order) => sum + order.quantityMilli, 0);
  const quantity = Math.floor(approvedMilli / 4) / 1000;
  if (!quantity || quantity > 500) return;
  const line = {...asset, quantity, cap:parent.capCents, orderBy};
  const offer = quoteFor(line);
  if (offer.price > line.cap || offer.cents > availableCents) return;
  const contract = watchedContract({...asset, price:offer.price}, market);
  if (!contract || !Number.isFinite(contract.bid) || !Number.isFinite(contract.ask) ||
      contract.bid < 0 || contract.ask > 1 || contract.ask < contract.bid || contract.ask - contract.bid > 0.10000001) return;
  const probability = midpointPercent(contract);
  const threshold = Math.max(70, parent.threshold);
  if (probability < threshold) return;

  return {
    line:{...line, cap:offer.price}, offer, probability, strike:contract.strike,
    threshold, expiry:market.expiry, observed:market.observed,
  };
}
