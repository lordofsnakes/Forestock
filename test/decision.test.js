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

test("pause, stock and unit price ceilings still apply at cutoff", () => {
  for (const [update, reason] of [
    [{ paused: true }, /paused/],
    [{ order: { ...s.order, qty: 501 } }, /500/],
    [{ order: { ...s.order, cap: 579 } }, /unit-price/],
  ]) {
    const result = evaluate({ ...s, ...update }, null, t + day);
    assert.equal(result.kind, "Blocked");
    assert.match(result.reason, reason);
  }
});
test("weak forecasts and markets settling outside the purchasing window wait", () => {
  const weak = { ...m, contracts: [{ strike: 5.7, bid: 0.52, ask: 0.56 }] };
  for (const market of [
    weak,
    { ...m, expiry: new Date(t) },
    { ...m, expiry: new Date(t + 2 * day) },
  ]) {
    assert.equal(evaluate(s, market, t).kind, "Wait");
  }
});
test("weekly allowance renews exactly at Monday midnight UTC", () => {
  const boundary = Date.parse("2026-11-23T00:00:00Z");
  const state = { week: week(boundary - 1), used: 58000, balance: 42000 };
  assert.equal(refresh(state, boundary - 1).used, 58000);
  assert.equal(refresh(state, boundary).used, 0);
  assert.equal(state.balance, 42000);
});

test("historical expiry fits only if the buyer has enough time left before cutoff", () => {
  const observed = Date.UTC(2026, 10, 19, 19);
  const recorded = { ...m, observed: new Date(observed), expiry: new Date(observed + 3 * 3600000) };
  const today = observed + 7 * day;
  const state = { ...s, order: { ...s.order, due: today + day + 2 * 3600000 } };
  assert.equal(evaluate(state, recorded, today, observed).kind, "Wait");
  state.order.due += 2 * 3600000;
  assert.equal(evaluate(state, recorded, today, observed).kind, "Buy");
});
