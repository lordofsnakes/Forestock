const categories = ["Tech", "Politics"];
const endpoint = "https://api.gemini.com/v1/prediction-markets/events";

export function signalFor(event, category, now) {
  if (!event.ticker || event.category !== category || event.status !== "active") return;
  const outcomes = [];
  for (const contract of event.contracts || []) {
    if (contract.marketState !== "open" || contract.status !== "active" || !contract.label) continue;
    const expiry = contract.expiryDate || event.expiryDate;
    if (!(Date.parse(expiry) > now)) continue;
    const prices = contract.prices;
    if ([prices?.bestBid,prices?.bestAsk].some(value=>value == null || String(value).trim() === "")) continue;
    const bid = Number(prices.bestBid), ask = Number(prices.bestAsk);
    if (!(bid >= 0 && ask <= 1 && ask >= bid && ask - bid <= .100001)) continue;
    outcomes.push({label:contract.label, probability:Math.round((bid + ask) * 500) / 10, expiry});
  }
  if (!outcomes.length) return;
  outcomes.sort((a,b) => b.probability - a.probability);
  return {id:event.id, title:event.title, category, outcome:outcomes[0],
    source:endpoint + "/" + encodeURIComponent(event.ticker)};
}

export default async function signals(req,res) {
  const observed = Date.now();
  const groups = await Promise.all(categories.map(async category => {
    try {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({category,status:"active",limit:"100"});
      const timeout = AbortSignal.timeout(6000);
      const events = new Map();
      let offset = 0;
      for (;;) {
        url.searchParams.set("offset",String(offset));
        const response = await fetch(url,{signal:timeout});
        if (!response.ok) throw Error();
        const {data,pagination} = await response.json();
        for (const row of data) {
          const signal = signalFor(row,category,observed);
          if (signal) events.set(signal.id,signal);
        }
        offset += data.length;
        if (!data.length || offset >= (pagination?.total ?? offset)) break;
      }
      return {category, events:[...events.values()]};
    } catch { return {category,events:[],unavailable:true}; }
  }));
  res.setHeader("Cache-Control","public, s-maxage=45");
  res.status(groups.every(g=>g.unavailable) ? 503 : 200).json({observed:new Date(observed).toISOString(),groups});
}
