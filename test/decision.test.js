import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, day, refresh, week } from "../public/decision.js";
const t = Date.now(),
  s = {
    order: { qty: 100, cap: 600, due: t + 2 * day },
    balance: 100000,
    limit: 60000,
    used: 0,
  };
const m = {
  observed: new Date(t),
  expiry: new Date(t + day / 2),
  contracts: [{ strike: 5.7, bid: 0.7, ask: 0.74 }],
};
test("live forecast can advance a qualified order", () =>
  assert.equal(evaluate(s, m, t).kind, "Buy"));
test("stale data waits until the deadline", () => {
  assert.equal(evaluate(s, m, t + 150000).kind, "Wait");
  assert.equal(evaluate(s, null, t + day).kind, "Buy");
});
test("deadline cannot override allowance or delivery", () => {
  assert.equal(evaluate({ ...s, used: 5000 }, m, t + day).kind, "Blocked");
  assert.equal(evaluate(s, null, t + 2 * day).kind, "Blocked");
});
test("renewal preserves uncommitted balance", () => {
  let v = { week: week(t) - 1, used: 100, balance: 90 };
  refresh(v, t);
  assert.equal(v.used, 0);
  assert.equal(v.balance, 90);
});
test("oil uses its quoted price and ignores copper signals", () => {
  const order = {
    ...s.order,
    qty: 2,
    cap: 9000,
    asset: {
      series: "WTI",
      name: "WTI",
      unit: "bbl",
      price: 8400,
      premium: 100,
    },
  };
  const market = {
    ...m,
    series: "WTI",
    contracts: [{ strike: 84, bid: 0.8, ask: 0.85 }],
  };
  assert.equal(evaluate({ ...s, order }, market, t).kind, "Buy");
  assert.equal(evaluate({ ...s, order }, m, t).kind, "Wait");
  assert.equal(
    evaluate({ ...s, order, balance: 16799 }, market, t).kind,
    "Blocked",
  );
});
