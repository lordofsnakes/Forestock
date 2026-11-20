import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseOffer, requiredFee } from "../lib/supplier-offers.js";
const line = {
  series: "COPPER",
  price: 580,
  quantity: 0.1,
  cap: 600,
  orderBy: 1200,
};
const book = {
  unitCents: { COPPER: 464 },
  expires: 1500,
  leadHours: 24,
  stock: 500,
};
const fee = { forward: 53000, bps: 0 };
test("compares delivered totals, stocks, expiry, lead time and buyer price cap", () => {
  assert.deepEqual(chooseOffer(line, book, fee, 900), {
    network: "Base Sepolia",
    price: 520,
    cents: 52,
    feeMicros: 60000,
  });
  for (const [l, b, f] of [
    [{ ...line, quantity: 0.01 }, book, fee],
    [line, null, fee],
    [line, book, null],
    [line, { ...book, expires: 1199 }, fee],
    [line, { ...book, stock: 0.01 }, fee],
    [line, { ...book, leadHours: 25 }, fee],
    [{ ...line, cap: 510 }, book, fee],
    [line, book, { forward: 120000, bps: 0 }],
  ])
    assert.equal(chooseOffer(l, b, f, 900).network, "Arc");
  assert.equal(requiredFee(520000, { forward: 53000, bps: 1.3 }), 53068);
});
