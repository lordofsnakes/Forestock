import { verifyMessage } from "viem";
import { totalCents } from "../public/decision.js";

export const baseToken = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const feeURL =
  "https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/26/6?forward=true";

export async function verifiedBook(book, supplier, escrow) {
  if (
    !book ||
    book.terms?.sourceChain !== 5042002 ||
    book.terms.destinationChain !== 84532 ||
    book.terms.escrow.toLowerCase() !== escrow.toLowerCase() ||
    book.terms.recipient.toLowerCase() !== supplier.toLowerCase()
  )
    throw Error("Supplier quote belongs to a different route.");
  if (
    !(await verifyMessage({
      address: supplier,
      message: JSON.stringify(book.terms),
      signature: book.signature,
    }))
  )
    throw Error("Supplier quote signature is invalid.");
  return book.terms;
}

export async function forwardingFee() {
  const r = await fetch(feeURL, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!r.ok) throw Error("Circle fee unavailable.");
  const row = (await r.json()).find((f) => f.finalityThreshold === 2000);
  if (
    !Number.isSafeInteger(row?.forwardFee?.high) ||
    row.forwardFee.high <= 0 ||
    !Number.isFinite(row.minimumFee) ||
    row.minimumFee < 0 ||
    row.minimumFee >= 10000
  )
    throw Error("Circle returned an unavailable fee.");
  return { forward: row.forwardFee.high, bps: row.minimumFee };
}

export function requiredFee(grossMicros, fee) {
  return fee.forward + Math.ceil((grossMicros * fee.bps) / 10000);
}

// Compare delivered, cent-rounded totals. Ties stay on Arc.
export function baseQuote(line, book, fee, now) {
  const quote = book?.unitCents?.[line.series];
  if (
    !fee ||
    !Number.isSafeInteger(quote) ||
    quote <= 0 ||
    book.expires < line.orderBy ||
    line.orderBy <= now ||
    line.quantity > book.stock ||
    book.leadHours > 24
  )
    return null;
  const net = totalCents(line.quantity, quote) * 10000;
  // Reserve 10% headroom on forwarding gas. Circle takes its actual fee from the gross amount.
  const reserve = Math.ceil(
    (fee.forward * 1.1 + (net * fee.bps) / 10000) / (1 - fee.bps / 10000),
  );
  const cents = Math.ceil((net + reserve) / 10000);
  const price = Math.ceil(cents / line.quantity);
  const gross = totalCents(line.quantity, price);
  if (requiredFee(gross * 10000, fee) > gross * 10000 - net) return null;
  return {
    network: "Base Sepolia",
    price,
    cents: gross,
    feeMicros: gross * 10000 - net,
  };
}

export function chooseOffer(line, book, fee, now) {
  const arc = {
    network: "Arc",
    price: line.price,
    cents: totalCents(line.quantity, line.price),
  };
  const base = baseQuote(line, book, fee, now);
  return base &&
    base.price <= line.cap &&
    (base.cents < arc.cents || line.price > line.cap)
    ? base
    : arc;
}
