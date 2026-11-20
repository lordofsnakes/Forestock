import { startChat } from "./setup-chat.js";
import { day, week, refresh, evaluate } from "./decision.js";
const el = document.querySelector("#app"),
  dialog = document.querySelector("#editor"),
  form = document.querySelector("#orderForm");
const key = "forestock.v1",
  money = (c) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(c / 100);
const dt = (t) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const esc = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const now = () => Date.now();
function initial() {
  return {
    week: week(now()),
    limit: 60000,
    used: 0,
    balance: 100000,
    paused: false,
    order: {
      qty: 100,
      cap: 600,
      due: now() + 2 * day,
      notes: "",
      status: "Watching",
    },
    activity: [],
  };
}
const saved = JSON.parse(localStorage.getItem(key) || "null");
let s = saved || initial(),
  tab = "Orders",
  market,
  replay = false;
// Upgrade the original single-need workspace without rebooking its holds.
if (!s.orders) {
  const id = crypto.randomUUID();
  s.orders = [{ ...s.order, id }];
  s.selectedId = id;
  delete s.order;
}
function order() {
  return s.orders.find(o => o.id === s.selectedId) || s.orders[0];
}
let addingNeed = false;
const welcome = document.querySelector("#welcome");
let inSetup = true;
function finishSetup(asset, quantity, allowance) {
  if (order().status === "Watching") {
    if (saved && asset.series !== current().series) {
      const need = { ...initial().order, asset: compact(asset), id: crypto.randomUUID() };
      s.orders.push(need);
      s.selectedId = need.id;
      need.cap = Math.ceil(asset.price * 1.035);
    } else if (!saved) {
      order().asset = compact(asset);
      order().cap = Math.ceil(asset.price * 1.035);
    }
    order().qty = quantity;
  }
  syncMarket();
  s.limit = Math.round(allowance * 100);
  inSetup = false;
  record(
    "Workspace opened",
    order().qty +
      " " +
      current().unit +
      " of " +
      current().name +
      " · " +
      money(s.limit) +
      " weekly allowance",
  );
  welcome.hidden = true;
  el.hidden = false;
  document.querySelector("nav").hidden = false;
  render();
  el.classList.add("step-enter");
  el.querySelector("h1").tabIndex = -1;
  el.querySelector("h1").focus();
}
function animateBird(button) {
  button.classList.remove("flying");
  void button.offsetWidth;
  button.classList.add("flying");
}
document.addEventListener("pointerover", (e) => {
  const button = e.target.closest(".bird");
  if (button && e.pointerType === "mouse" && !button.contains(e.relatedTarget))
    animateBird(button);
});
function compact(asset) {
  const { series, name, unit, price, premium } = asset;
  return { series, name, unit, price, premium };
}
const copper = {
  series: "COPPER",
  name: "Copper",
  unit: "lb",
  price: 580,
  premium: 12,
};
let assets = [copper];
function current() {
  return order().asset || copper;
}
function selected(f) {
  return assets.find((a) => a.series === f.elements.asset.value) || current();
}
function syncMarket() {
  market = assets.find((a) => a.series === current().series)?.market;
}
function updatePicker(f) {
  const a = selected(f);
  f.querySelectorAll("[data-unit]").forEach((n) => (n.textContent = a.unit));
}
function choices() {
  return assets.some(a => a.series === current().series) ? assets : [...assets, current()];
}
function fillPickers() {
  const field = form.elements.asset;
  const previous = field.value || current().series;
  field.replaceChildren(...choices().map(a => new Option(a.name, a.series)));
  field.value = choices().some(a => a.series === previous) ? previous : current().series;
  updatePicker(form);
  if (inSetup) chat.refreshSuggestions();
}
form.elements.asset.addEventListener("change", () => {
  updatePicker(form);
  form.cap.value = ((selected(form).price / 100) * 1.03).toFixed(2);
});
const chat = startChat({
  choices, material: current(), quantity: order().qty, allowance: s.limit / 100,
  status: order().status, returning: Boolean(saved), finish: finishSetup,
});
fillPickers();
function save() {
  localStorage.setItem(key, JSON.stringify(s));
}
function record(title, reason) {
  s.activity.unshift({ title, reason, time: now() });
  save();
}
function available() {
  return Math.max(0, Math.min(s.balance, s.limit - s.used));
}
function row(k, v) {
  return (
    '<div class="row"><span>' + k + "</span><strong>" + v + "</strong></div>"
  );
}
function btn(label, action, primary = false) {
  return (
    '<button data-action="' +
    action +
    '" class="' +
    (primary ? "primary" : "") +
    '">' +
    label +
    "</button>"
  );
}
function chainReceipts() {
  return '<section class="card"><small>VERIFIED ON ARC TESTNET</small><h2>One-pound copper rehearsal</h2><p>Central Metals accepted the simulated order. The vault released 5.80 test USDC after the supplier signed.</p><div class="actions"><a href="https://testnet.arcscan.app/tx/0xafa53f0c08a315097e58bcc6653a4e7e13917e5b5dead0a12a4d08c102e16ae5">View hold ↗</a><a href="https://testnet.arcscan.app/tx/0x9360fef60eaa513b590608280bc53fb81ad1289e49d8c8019c9d0fa430918da1">View payout ↗</a></div><p>A second order was declined. Its 5.80 test USDC returned to the buyer’s available balance.</p><a href="https://testnet.arcscan.app/tx/0x734668b9fc0016ea9ffca774db2855a8894ae5d517d75d9952bccf8f84046c94">View refund ↗</a></section>';
}
function assessment(t = now()) {
  return evaluate(
    { ...s, order: order() },
    market,
    t,
    replay && market ? Date.parse(market.observed) : now(),
  );
}
function needsOverview() {
  const active = s.orders.filter(o => o.status === "Watching" || o.status === "Held");
  const closed = s.orders.filter(o => o.status === "Paid" || o.status === "Refunded");
  function entry(o) {
    const asset = o.asset || copper;
    return '<button class="need-entry" data-need="' + esc(o.id) + '" aria-pressed="' +
      (o.id === order().id) + '"><span><strong>' + esc(asset.name) + '</strong> · ' +
      o.qty + ' ' + esc(asset.unit) + '</span><span>' + esc(o.status) + '</span></button>';
  }
  return '<section class="needs-overview"><div class="needs-heading"><h1>Active needs</h1>' +
    btn("Add need", "add") + '</div>' +
    (active.map(entry).join("") || '<p>No active needs.</p>') +
    (closed.length ? '<details><summary>Completed needs (' + closed.length + ')</summary>' +
      closed.map(entry).join("") + '</details>' : '') + '</section>';
}
function render() {
  if (inSetup) return;
  const expanded = new Set(
    [...el.querySelectorAll("details[open] summary")].map((n) => n.textContent),
  );
  refresh(s, now());
  save();
  const { price, name, unit, premium } = current();
  const o = order(),
    total = o.qty * price;
  for (const b of document.querySelectorAll("[data-tab]"))
    b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
  if (tab === "Orders") {
    const d = assessment(),
      open = o.status === "Watching",
      held = o.status === "Held";
    el.innerHTML =
      needsOverview() + '<section class="order-status"><div class="order-heading"><div><p class="hint">' + esc(name) + ' order</p><h2>' +
      (open
        ? ({Buy:"Ready to order",Wait:"Watching the market",Blocked:"Order needs attention"}[d.kind])
        : held
          ? "Funds held"
          : o.status === "Paid"
            ? "Supplier receipt"
            : "Funds returned") +
      '</h2></div><button class="bird order-bird" aria-label="Animate the order sparrow"><span></span></button></div><p>' +
      esc(
        open
          ? d.reason
          : held
            ? "Waiting for the simulated supplier to accept the order."
            : o.status === "Paid"
              ? "The supplier accepted your order."
              : "The supplier declined the order.",
      ) +
      '</p><p class="hint">Simulated purchase</p><div class="actions">' +
      (open
        ? btn("Run decision", "run", true) + btn("Edit need", "edit")
        : held
          ? btn("Decline", "decline") + btn("Accept order", "accept", true)
          : btn("New material need", "add", true)) +
      "</div>" +
      (open
        ? "<details><summary>Try deadline scenario</summary><p>Preview the decision at the last safe ordering time.</p>" +
          btn("Run at cutoff", "cutoff") +
          "</details>"
        : "") +
      '</section><section class="card order-summary"><h2>' + esc(name) + '</h2>' +
      row("Quantity", o.qty + " " + esc(unit)) +
      row("Order total", money(total)) +
      row("Order by", dt(o.due - day)) +
      (o.notes ? row("Receiving notes", esc(o.notes)) : "") +
      '<details><summary>Order details</summary>' +
      row("Supplier lead time","24 hours") +
      row("Delivered price",money(price)+" / "+esc(unit)) +
      row("Maximum price",money(o.cap)+" / "+esc(unit)) +
      row("Needed by",dt(o.due)) +
      '</details></section><section class="card"><details><summary>Gemini forecast · ' +
      (replay ? "Recorded replay" : "Market snapshot") +
      "</summary><p>" +
      esc(market?.title || "Market unavailable") +
      '</p><p class="hint">' +
      (market
        ? "Fetched " +
          dt(market.observed) +
          " · simulated supplier premium " +
          money(premium) +
          "/" +
          esc(unit)
        : "") +
      "</p>" +
      (market?.contracts || [])
        .slice(0, 8)
        .map((c) =>
          row(
            "$" +
              c.strike.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              }) +
              " or above",
            Math.round(c.bid * 100) + "–" + Math.round(c.ask * 100) + "¢",
          ),
        )
        .join("") +
      "</details></section>";
  } else if (tab === "Budget") {
    el.innerHTML =
      '<h1>Purchasing budget</h1><section class="hero"><div><small>AVAILABLE TO ORDER</small><div class="big">' +
      money(available()) +
      '</div><span>Demo USDC</span></div></section><section class="card"><h2>Weekly allowance</h2>' +
      row("Limit", money(s.limit)) +
      row("Committed this week", money(s.used)) +
      row("Uncommitted balance", money(s.balance)) +
      row("Funds held", money(s.orders.reduce((sum, need) => sum + (need.status === "Held" ? need.qty * (need.asset || copper).price : 0), 0))) +
      row("Resets", dt((s.week + 1) * 7 * day - 3 * day)) +
      '<progress max="' +
      Math.max(1, s.limit) +
      '" value="' +
      s.used +
      '"></progress><label>Weekly limit (USDC)<input id="limit" type="number" min="0" max="100000" step=".01" value="' +
      s.limit / 100 +
      '"></label><div class="actions">' +
      btn(s.paused ? "Resume" : "Pause", "pause") +
      btn("Save allowance", "limit", true) +
      "</div></section>";
  } else {
    el.innerHTML =
      '<h1>Activity</h1><section class="card">' +
      (s.activity.length
        ? s.activity
            .map(
              (a) =>
                '<div class="log"><small>' +
                dt(a.time) +
                "</small><h3>" +
                esc(a.title) +
                "</h3><p>" +
                esc(a.reason) +
                "</p></div>",
            )
            .join("")
        : "Decisions and supplier receipts appear here after you run an order.") +
      "</section>" +
      chainReceipts();
  }
  for (const detail of el.querySelectorAll("details"))
    if (expanded.has(detail.querySelector("summary")?.textContent))
      detail.open = true;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.matches(".bird")) {
    animateBird(b);
    return;
  }
  if (b.dataset.need) {
    s.selectedId = b.dataset.need;
    syncMarket();
    fillPickers();
    render();
    el.querySelector(".order-status").scrollIntoView({ block: "start" });
    return;
  }
  if (!b.dataset.action && !b.dataset.tab && !b.hasAttribute("data-close"))
    return;
  if (b.dataset.tab) {
    tab = b.dataset.tab;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (b.hasAttribute("data-close")) {
    dialog.close();
    return;
  }
  const { price } = current();
  const a = b.dataset.action,
    o = order();
  refresh(s, now());
  if (a === "add" || (a === "edit" && o.status === "Watching")) {
    addingNeed = a === "add";
    const template = addingNeed ? initial().order : o;
    form.elements.asset.value = current().series;
    updatePicker(form);
    form.qty.value = template.qty;
    form.cap.value = addingNeed ? Math.ceil(current().price * 1.035) / 100 : o.cap / 100;
    form.notes.value = template.notes;
    const local = new Date(Math.max(template.due, now() + day));
    form.due.value = new Date(+local - local.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    dialog.showModal();
    return;
  }
  if (a === "pause") {
    s.paused = !s.paused;
    record(
      s.paused ? "Allowance paused" : "Allowance resumed",
      "Future order commitments updated.",
    );
  }
  if (a === "limit") {
    const i = document.querySelector("#limit");
    if (!i.reportValidity() || !i.value) return;
    s.limit = Math.round(Number(i.value) * 100);
    record("Allowance updated", money(s.limit) + " weekly limit.");
  }
  if ((a === "run" || a === "cutoff") && o.status === "Watching") {
    const d = assessment(a === "cutoff" ? o.due - day : now());
    if (d.kind === "Buy") {
      s.used += o.qty * price;
      s.balance -= o.qty * price;
      o.status = "Held";
      o.commitWeek = s.week;
    }
    record(
      (a === "cutoff" ? "Cutoff scenario · " : "") + d.kind,
      d.reason +
        (d.kind === "Buy" ? " Held " + money(o.qty * price) + "." : ""),
    );
    if (d.kind !== "Buy") tab = "Activity";
  }
  if (o.status === "Held" && (a === "accept" || a === "decline")) {
    if (a === "decline") {
      s.balance += o.qty * price;
      if (o.commitWeek === s.week) s.used -= o.qty * price;
    }
    o.status = a === "accept" ? "Paid" : "Refunded";
    record(
      o.status,
      money(o.qty * price) + " · simulated " + current().name + " order",
    );
  }
  render();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const need = {
    id: addingNeed ? crypto.randomUUID() : order().id,
    asset: compact(selected(form)),
    qty: Number(form.qty.value),
    cap: Math.round(Number(form.cap.value) * 100),
    due: new Date(form.due.value).getTime(),
    notes: form.notes.value,
    status: "Watching",
  };
  if (addingNeed) s.orders.push(need);
  else s.orders[s.orders.indexOf(order())] = need;
  s.selectedId = need.id;
  syncMarket();
  record(
    "Material need saved",
    order().qty + " " + current().unit + " of " + current().name + "",
  );
  dialog.close();
  render();
});
async function loadMarket() {
  try {
    const r = await fetch("/api/market");
    if (!r.ok) throw Error();
    assets = (await r.json()).assets;
    replay = false;
  } catch {
    assets = (await (await fetch("/commodities.json")).json()).assets;
    replay = true;
  }
  fillPickers();
  syncMarket();
  if (tab === "Orders") render();
}
render();
loadMarket();
setInterval(loadMarket, 60000);
