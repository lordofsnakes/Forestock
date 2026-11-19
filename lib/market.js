const units = {
  COPPER: "lb",
  XAG: "troy oz",
  XAU: "troy oz",
  NGAS: "MMBtu",
  WTI: "bbl",
  BRENT: "bbl",
};
export function selectMarket(events, now, series = "COPPER") {
  const choices = events
    .filter((e) => e.series === series && Date.parse(e.expiryDate) > now)
    .sort((a, b) => Date.parse(a.expiryDate) - Date.parse(b.expiryDate));
  for (const e of choices) {
    const contracts = e.contracts
      .filter(
        (c) =>
          c.strike?.type === "above" &&
          c.prices?.bestBid != null &&
          c.prices?.bestAsk != null,
      )
      .map((c) => ({
        symbol: c.instrumentSymbol,
        strike: Number(c.strike.value),
        bid: Number(c.prices.bestBid),
        ask: Number(c.prices.bestAsk),
        rules: c.termsAndConditionsUrl,
      }))
      .filter(
        (c) =>
          c.strike > 0 &&
          c.bid >= 0 &&
          c.ask <= 1 &&
          c.bid <= c.ask &&
          c.ask - c.bid <= 0.100001,
      );
    if (contracts.length)
      return {
        series,
        title: e.title,
        expiry: e.expiryDate,
        observed: new Date(now).toISOString(),
        contracts,
      };
  }
  throw Error("No usable quotes");
}
export function catalog(events, now) {
  return [...new Set(events.map((e) => e.series).filter(Boolean))]
    .sort()
    .map((series) => {
      const event = events.find((e) => e.series === series);
      let market = null;
      try {
        market = selectMarket(events, now, series);
      } catch {}
      const strikes = event.contracts
        .map((c) => Number(c.strike?.value))
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      if (!strikes.length) return null;
      const benchmark = strikes[Math.floor(strikes.length / 2)];
      const premium =
        series === "COPPER" ? 12 : Math.max(1, Math.round(benchmark * 2));
      const price =
        series === "COPPER" ? 580 : Math.round(benchmark * 100) + premium;
      return {
        series,
        name: event.title.split(/ price on /i)[0],
        unit: units[series] || "benchmark unit",
        price,
        premium,
        market,
      };
    })
    .filter(Boolean);
}
