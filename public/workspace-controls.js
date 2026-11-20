import { midpointPercent, watchedContract, liveCutoffWindowSeconds } from "./decision.js";

export const escapeText = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

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

const stamp = t => new Date(t).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"});

export function orderForecast({id, asset, market, recorded, threshold, cap, cutoff, practice, allowRecording, feeCap}) {
  const name = escapeText(asset.name);
  const unit = escapeText(asset.unit || "unit");
  const strike = c => "$" + c.strike.toLocaleString("en-US", {maximumFractionDigits:4});
  const contract = watchedContract(asset, market);
  const source = market ? "Gemini · " + (recorded ? "Recorded" : "Live") + " · " + stamp(market.observed) : "Gemini · Forecast unavailable";
  const target = contract ? name + " at " + strike(contract) + "/" + unit + " or higher" : "";
  const headline = contract ? '<div class="forecast-line"><span>' + target + '</span><strong>' + midpointPercent(contract) + '%</strong></div>' : "";
  const early = (practice ? "Your practice order is ready" : "The agent can reserve funds") + " when " +
    (contract ? "the probability of " + target + " reaches " + threshold + "%" : "a qualifying " + name + " forecast shows at least " + threshold + "%") +
    " and the forecast’s time to expiry fits the remaining order window.";
  const deadline = practice ? "At the " + stamp(cutoff) + " cutoff, you can place the practice order regardless of the forecast." :
    "In the final " + liveCutoffWindowSeconds + " seconds before " + stamp(cutoff) + ", the agent can reserve funds regardless of the forecast.";
  const limits = "The supplier must have stock at or below $" + (cap / 100).toFixed(2) + "/" + unit +
    ", and the order must fit your " + (practice ? "demo balance" : "available escrow") + " and remaining weekly allowance.";
  const levels = (market?.contracts || []).slice().sort((a,b) => a.strike - b.strike).map(c =>
    '<div class="market-strike"><span>' + strike(c) + '/' + unit + ' or higher</span><span><strong>' + midpointPercent(c) +
    '%</strong><small>Bid ' + Math.round(c.bid*100) + '¢ · Ask ' + Math.round(c.ask*100) + '¢</small></span></div>').join("");
  return '<section class="order-forecast" aria-label="' + name + ' prediction market"><small>' + source +
    (market && recorded && !practice && !allowRecording ? ' · Reference only' : '') + '</small>' + headline +
    '<details data-disclosure="rules" data-owner="' + escapeText(id) + '"><summary>When will this buy?</summary><p>' + early +
    ' Lower the threshold to qualify sooner.</p><p>' + deadline + ' ' + limits + '</p>' +
    (!practice ? '<p>' + (allowRecording ? 'A dated forecast may be used when live data is unavailable.' : 'Early buying requires a live forecast.') +
      (feeCap ? ' The Base forwarding fee must fit your signed fee limit.' : '') + ' The supplier receives payment after accepting the order.</p>' : '') +
    (levels ? '<details data-disclosure="prices" data-owner="' + escapeText(id) + '"><summary>Market prices and odds</summary><p>' +
      escapeText(market.title || name) + ' · Expires ' + stamp(market.expiry) + '</p>' + levels + '</details>' : '') + '</details></section>';
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
