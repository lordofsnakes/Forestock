export function selectMarket(events, now) {
  const choices = events
    .filter(
      (e) => /^Copper price/i.test(e.title) && Date.parse(e.expiryDate) > now,
    )
    .sort((a, b) => Date.parse(a.expiryDate) - Date.parse(b.expiryDate));
  for (const event of choices) {
    const contracts = event.contracts
      .map((c) => ({
        symbol: c.instrumentSymbol,
        strike: Number(c.strike?.value ?? c.label.match(/[\d.]+/)?.[0]),
        bid: Number(c.prices?.bestBid),
        ask: Number(c.prices?.bestAsk),
        rules: c.termsAndConditionsUrl,
      }))
      .filter(
        (c) =>
          Number.isFinite(c.strike) &&
          c.bid >= 0 &&
          c.ask <= 1 &&
          c.bid <= c.ask &&
          c.ask - c.bid <= 0.100001,
      );
    if (contracts.length)
      return {
        title: event.title,
        expiry: event.expiryDate,
        observed: new Date(now).toISOString(),
        contracts,
      };
  }
  throw Error("No usable copper quotes");
}
