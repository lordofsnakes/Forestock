import test from "node:test";
import assert from "node:assert/strict";
import { catalog, selectMarket } from "../lib/market.js";
import handler from "../api/market.js";

const now = Date.UTC(2026, 10, 19);
function event(series, days = 1, prices = { bestBid: "0.6", bestAsk: "0.66" }) {
  return {
    series,
    title: series + " price on Friday?",
    expiryDate: new Date(now + days * 86400000).toISOString(),
    contracts: [
      {
        strike: { type: "above", value: "50" },
        prices,
        instrumentSymbol: series + "-50",
      },
    ],
  };
}
test("nearest usable expiry wins; expired, one-sided, crossed and wide quotes are excluded", () => {
  const bad = [
    { bestBid: 0.4 },
    { bestBid: 0.8, bestAsk: 0.7 },
    { bestBid: 0.1, bestAsk: 0.9 },
  ];
  const good = event("XAG", 2);
  const result = selectMarket(
    [
      event("COPPER"),
      event("XAG", -1),
      event("XAG", 3),
      ...bad.map((p) => event("XAG", 1, p)),
      good,
    ],
    now,
    "XAG",
  );
  assert.equal(result.expiry, good.expiryDate);
  assert.equal(result.contracts[0].symbol, "XAG-50");
  assert.throws(() => selectMarket([event("WTI")], now, "BRENT"));
});
test("catalog deduplicates series, labels units, retains thin markets and supports new listings", () => {
  const ids = ["COPPER", "XAG", "XAU", "WTI", "BRENT", "NGAS", "NEW"];
  const result = catalog(
    [...ids.map((s) => event(s)), event("COPPER", 2), event("THIN", 1, {})],
    now,
  );
  const index = Object.fromEntries(result.map((a) => [a.series, a]));
  assert.deepEqual(
    ids.map((s) => index[s].unit),
    ["lb", "troy oz", "troy oz", "bbl", "bbl", "MMBtu", "benchmark unit"],
  );
  assert.equal(result.length, 8);
  assert.equal(index.THIN.market, null);
  assert.equal(index.WTI.price, 5100);
  assert.equal(index.COPPER.price, 580);
});
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(n) {
      this.code = n;
      return this;
    },
    json(value) {
      this.body = value;
    },
  };
}
test("API follows pagination and preserves the copper response for existing clients", async (t) => {
  t.mock.method(Date, "now", () => now);
  const offsets = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.searchParams.get("category"), "Commodities");
    offsets.push(url.searchParams.get("offset"));
    return Response.json({
      data: [event(offsets.length === 1 ? "WTI" : "COPPER")],
      pagination: { total: 2 },
    });
  });
  const res = response();
  await handler({}, res);
  assert.deepEqual(offsets, ["0", "1"]);
  assert.equal(res.code, 200);
  assert.equal(res.body.series, "COPPER");
  assert.equal(res.body.assets.length, 2);
  assert.match(res.headers["Cache-Control"], /s-maxage/);
});
test("API reports upstream failures so clients can use the dated replay", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 503 }),
  );
  const res = response();
  await handler({}, res);
  assert.equal(res.code, 503);
  assert.ok(res.body.error);
});
