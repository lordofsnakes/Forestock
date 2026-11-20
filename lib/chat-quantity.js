// Find explicit, sub-minimum mass requests before interpreting a model's draft.
// Keep the buyer's units on the receipt; a missing quantity cannot enter review.
export function smallMassRequests(message, catalog) {
  const grams = { mg: .001, milligram: .001, g: 1, gram: 1, kg: 1000, kilogram: 1000,
    lb: 453.59237, pound: 453.59237, "troy oz": 31.1034768, "troy ounce": 31.1034768 };
  const measure = /(?<![\w.,])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*(milligrams?|mg|kilograms?|kg|grams?|g|pounds?|lbs?|troy ounces?|troy oz)\b/gi;
  const found = [];
  for (const match of message.matchAll(measure)) {
    const after = message.slice(match.index + match[0].length).replace(/^\s+(?:of\s+)?/i, "").toLowerCase();
    const before = message.slice(0, match.index).trimEnd().replace(/[:=,-]$/, "").trimEnd().toLowerCase();
    const asset = catalog.find(a => {
      const name = a.name.toLowerCase();
      return (after.startsWith(name) && !/\w/.test(after[name.length] || "")) ||
        (before.endsWith(name) && !/\w/.test(before.at(-name.length-1) || ""));
    });
    if (!asset || !grams[asset.unit]) continue;
    const unit = match[2].toLowerCase().replace(/s$/, "");
    const mass = Number(match[1].replaceAll(",", "")) * grams[unit];
    if (mass >= grams[asset.unit]) continue;
    const tail = after.startsWith(asset.name.toLowerCase()) ? after.slice(asset.name.length) : after;
    const deadline = tail.trimStart().match(/^by (?:the )?(end of (?:this|the|next) (?:week|month))\b/i);
    found.push({ series: asset.series, name: asset.name, requested: match[1] + " " + match[2],
      minimum: "1 " + asset.unit, ...(deadline && { dateNote: deadline[1] }) });
  }
  return found;
}

// A date explicitly attached to a material belongs to that line throughout review.
export function materialDeadlines(message, catalog) {
  const deadlines = new Map();
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (const { name, series } of catalog) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp("\\b" + escaped + "\\s+(?:due\\s+)?by\\s+(" +
      "\\d{4}-\\d{2}-\\d{2}|(" + months.join("|") + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}))\\b", "i"));
    if (!match) continue;
    const date = match[2] ? [match[4], String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0"),
      match[3].padStart(2, "0")].join("-") : match[1];
    const parsed = new Date(date + "T00:00:00Z");
    if (Number.isFinite(+parsed) && parsed.toISOString().startsWith(date)) deadlines.set(series, date);
  }
  return deadlines;
}
