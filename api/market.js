import { catalog } from "../lib/market.js";
export default async function market(req, res) {
  try {
    const url = new URL("https://api.gemini.com/v1/prediction-markets/events");
    url.search = new URLSearchParams({
      category: "Commodities",
      status: "active",
      limit: "500",
    });
    const events = [];
    while (true) {
      url.searchParams.set("offset", String(events.length));
      const r = await fetch(url, { signal: AbortSignal.timeout(5500) });
      if (!r.ok) throw Error();
      const page = await r.json();
      events.push(...page.data);
      if (!page.data.length || events.length >= page.pagination.total) break;
    }
    const assets = catalog(events, Date.now());
    res.setHeader("Cache-Control", "public, s-maxage=15");
    const copper = assets.find((asset) => asset.series === "COPPER");
    res.status(200).json({ ...copper?.market, assets });
  } catch {
    res.status(503).json({ error: "Market data unavailable" });
  }
}
