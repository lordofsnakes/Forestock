import { selectMarket } from "../lib/market.js";
export default async function market(req, res) {
  try {
    const r = await fetch(
      "https://api.gemini.com/v1/prediction-markets/events?search=copper&status=active",
      { signal: AbortSignal.timeout(5500) },
    );
    if (!r.ok) throw Error("Market unavailable");
    const snapshot = selectMarket((await r.json()).data, Date.now());
    res.setHeader("Cache-Control", "public, s-maxage=15");
    res.status(200).json(snapshot);
  } catch {
    res.status(503).json({ error: "No current market quote" });
  }
}
