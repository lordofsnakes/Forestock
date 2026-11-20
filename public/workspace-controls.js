import { midpointPercent } from "./decision.js";

export const escapeText = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

export const thresholdHint = "Want to order sooner? Lower the threshold so a smaller forecast probability can trigger an early order. Your price and budget limits still apply.";

const marks = new Map([
  ["COPPER", ["Cu", "copper"]], ["XAG", ["Ag", "silver"]], ["XAU", ["Au", "gold"]],
  ["BRENT", ["B", "oil"]], ["WTI", ["W", "oil"]], ["NGAS", ["♨", "gas"]],
]);
export function purchaseMark(series) {
  const [symbol, style] = marks.get(series) || ["◆", "other"];
  return '<span aria-hidden="true" class="material-mark ' + style + '">' + symbol + '</span>';
}

export function filterControls() {
  return '<div class="order-filters"><label>Material<select data-filter="material"></select></label>' +
    '<label>Status<select data-filter="status"></select></label></div>';
}

function updateChoices(select, entries, value) {
  const options = [...entries].map(([id, label]) => '<option value="' + escapeText(id) + '">' + escapeText(label) + '</option>').join("");
  // Leave the native picker in place when a background refresh has the same choices.
  if (select.dataset.options !== options) {
    select.innerHTML = options;
    select.dataset.options = options;
  }
  select.value = value;
}

export function populateFilters(root, materials, statuses, filter) {
  updateChoices(root.querySelector('[data-filter="material"]'), [["", "All materials"], ...materials], filter.material);
  updateChoices(root.querySelector('[data-filter="status"]'), [["", "All statuses"], ...statuses], filter.status);
}

export function matchesOrder(filter, series, status) {
  return (!filter.material || filter.material === series) && (!filter.status || filter.status === status);
}

export function marketSection() {
  return '<section class="market-board card" aria-label="Gemini prediction markets"><div class="needs-heading"><h2>Prediction markets</h2>' +
    '<select data-market-material aria-label="Forecast material"></select></div><div data-market-quotes></div></section>';
}

export function showMarket(root, assets, selected, market, recorded) {
  const picker = root.querySelector("[data-market-material]");
  updateChoices(picker, assets.map(a => [a.series, a.name]), selected);
  const asset = assets.find(a => a.series === selected);
  const box = root.querySelector("[data-market-quotes]");
  let html = "<p>No two-sided forecast is available for this material yet.</p>";
  if (market?.contracts?.length) {
    const stamp = t => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const contracts = [...market.contracts].sort((a, b) => a.strike - b.strike);
    const featured = contracts.reduce((best, c) => Math.abs(midpointPercent(c) - 50) < Math.abs(midpointPercent(best) - 50) ? c : best);
    const row = c => '<div class="market-strike"><span>$' + c.strike.toLocaleString("en-US", {maximumFractionDigits: 4}) +
      ' / ' + escapeText(asset?.unit || "unit") + ' or higher</span><span><strong>' + midpointPercent(c) +
      '%</strong><small>Bid ' + Math.round(c.bid * 100) + '¢ · Ask ' + Math.round(c.ask * 100) + '¢</small></span></div>';
    html = '<p class="hint">Gemini · ' + (recorded ? "Recorded" : "Live") + ' · ' + stamp(market.observed) + '</p>' +
      '<p>' + escapeText(market.title || asset?.name || "Forecast") + '<br><small>At expiry on ' + stamp(market.expiry) + '</small></p>' + row(featured) +
      (contracts.length > 1 ? '<details><summary>Other price levels (' + (contracts.length - 1) + ')</summary>' +
        contracts.filter(c => c !== featured).map(row).join("") + '</details>' : "");
  }
  if (box.dataset.content === html) return;
  const open = box.querySelector("details")?.open && box.dataset.series === selected;
  box.innerHTML = html;
  box.dataset.content = html;
  box.dataset.series = selected;
  if (open && box.querySelector("details")) box.querySelector("details").open = true;
}

export function syncAmountSlider(range, field, max) {
  range.max = Math.max(.01, max);
  range.value = field.value || "0";
  range.disabled = max <= 0;
  range.setAttribute("aria-valuetext", range.value + " USDC");
  range.oninput = () => {
    field.value = range.value;
    range.setAttribute("aria-valuetext", range.value + " USDC");
  };
  field.oninput = () => {
    if (field.value && field.validity.valid) {
      if (range.hasAttribute("data-expand") && field.valueAsNumber > Number(range.max)) range.max = field.value;
      range.value = field.value;
      range.setAttribute("aria-valuetext", range.value + " USDC");
    }
  };
}
