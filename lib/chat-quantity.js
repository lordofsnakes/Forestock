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
    if (mass < grams[asset.unit]) found.push({ series: asset.series, name: asset.name,
      requested: match[1] + " " + match[2], minimum: "1 " + asset.unit });
  }
  return found;
}
