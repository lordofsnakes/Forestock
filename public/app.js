import { flyToScreen } from "./onboarding-motion.js";
import { startChat } from "./setup-chat.js";
import { day, week, refresh, evaluate, currentQuote, defaultThreshold, thresholdFor, midpointPercent, totalCents, defaultQuantity } from "./decision.js";
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
      threshold: defaultThreshold,
      qty: .01,
      cap: 600,
      due: now() + 2 * day,
      notes: "",
      status: "Watching",
    },
    activity: [],
  };
}
const liveBuyer = new URLSearchParams(location.search).get("plan") === "arc" && localStorage.getItem("forestock.arcWallet");
const saved = liveBuyer ? null : JSON.parse(localStorage.getItem(key) || "null");
let s = saved || initial(),
  tab = "Orders";
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
function finishSetup(lines, allowance) {
  if (liveBuyer) {
    const drafts = lines.map(({asset, quantity, dueDate}) => {
      const quote = baseline.find(a => a.series === asset.series) || asset;
      const due = dueDate ? new Date(dueDate + "T23:59:00").getTime() : now() + 2 * day;
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,"0")).join("");
      return {...compact(quote), quantity, cap: Math.ceil(quote.price * 1.035),
        orderBy: Math.floor((due - day) / 1000), salt: "0x" + salt};
    });
    localStorage.setItem("forestock.arcDraft." + liveBuyer, JSON.stringify({lines:drafts,allowance}));
    location.assign("/arc.html");
    return;
  }
  flyToScreen(welcome, el, ".order-bird", () => openOrder(lines, allowance));
}
function openOrder(lines, allowance) {
  const previous = order();
  const previousSeries = current().series;
  for (const [index, { asset, quantity, dueDate }] of lines.entries()) {
    if (index === 0 && previous.status !== "Watching") continue;
    const reuse = index === 0 && (!saved || asset.series === previousSeries);
    const need = reuse ? previous : { ...initial().order, id: crypto.randomUUID() };
    if (!reuse || !saved) {
      need.asset = compact(asset);
      need.cap = Math.ceil(asset.price * 1.035);
    }
    need.qty = quantity;
    if (dueDate) need.due = new Date(dueDate + "T23:59:00").getTime();
    if (!reuse) s.orders.push(need);
    if (index === 0) s.selectedId = need.id;
  }
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
// Buyers can plan a catalog item even while its live market is loading or closed.
const baseline = await fetch("/commodities.json").then(r => r.json()).then(data => data.assets).catch(() => [copper]);
let assets = baseline.map(compact);
function current() {
  return order().asset || copper;
}
function selected(f) {
  return assets.find((a) => a.series === f.elements.asset.value) || current();
}
function forecast(t = now(), series = current().series, preferRecording = order().preferRecording) {
  const latest = assets.find(asset => asset.series === series)?.market;
  const recording = baseline.find(asset => asset.series === series)?.market;
  const live = currentQuote(latest, t) ? latest : null;
  const replay = Boolean(recording?.contracts?.length && (preferRecording || !live));
  return { market: replay ? recording : live, replay, canSwitch: Boolean(live && recording?.contracts?.length) };
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
  if (addingNeed) form.qty.value = defaultQuantity(selected(form));
  form.cap.value = ((selected(form).price / 100) * 1.03).toFixed(2);
});
const chat = startChat({
  choices, material: current(), quantity: order().qty, allowance: liveBuyer ? 1 : s.limit / 100, live: Boolean(liveBuyer),
  status: order().status, returning: Boolean(saved), availableFunds: liveBuyer ? () => Infinity : available, finish: finishSetup,
});
fillPickers();
function save() {
  localStorage.setItem(key, JSON.stringify(s));
}
function record(title, reason) {
  s.activity.unshift({ title, reason, time: now() });
  save();
}
function available(limit = s.limit) {
  return Math.max(0, Math.min(s.balance, limit - s.used));
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
function assessment({ market, replay }, t = now()) {
  return evaluate({ ...s, order: order() }, market, t, replay ? Date.parse(market.observed) : t);
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
// Keep each button attached to the exact snapshot the buyer saw, even at expiry.
let marketNotes = [];
function sparrowUpdates() {
  const selectedSeries = current().series;
  const timestamp = now();
  marketNotes = assets.flatMap(asset => {
    const { market, replay } = forecast(timestamp, asset.series, asset.series === selectedSeries && order().preferRecording);
    if (!market) return [];
    // Pick the two-sided contract closest to even odds to surface an uncertain outcome.
    const contract = market.contracts.reduce((best, c) =>
      Math.abs(c.bid + c.ask - 1) < Math.abs(best.bid + best.ask - 1) ? c : best);
    const chance = midpointPercent(contract);
    const label = (replay ? "Recorded" : "Live quote") + " · " + dt(market.observed);
    const text = asset.name + " at $" + contract.strike.toLocaleString("en-US", { maximumFractionDigits: 4 }) +
      "/" + asset.unit + " or higher by " + dt(market.expiry) + "? " + (replay ? "The recorded odds were " : "The market puts it at ") + chance + "%.";
    return [{ series: asset.series, replay, label, text }];
  }).sort((a, b) => Number(a.replay) - Number(b.replay) ||
    Number(a.series === selectedSeries) - Number(b.series === selectedSeries));
  if (!marketNotes.length) marketNotes.push({ label: "Market update", text: "I don’t have a qualifying quote yet. Ask me about your order timing." });
  return '<aside class="market-updates" aria-label="Market updates from the sparrow">' +
    '<button class="bird order-bird" data-note="0" aria-label="Chat with the sparrow"><span></span></button>' +
    '<div><h3>Ask the sparrow</h3>' + marketNotes.slice(0, 2).map((note, i) =>
      '<button class="market-bubble" data-note="' + i + '"><small>' + esc(note.label) +
      '</small><span>' + esc(note.text) + '</span></button>').join("") + '</div></aside>';
}

function openMarketChat(note) {
  const o = order();
  const source = forecast();
  const selectedOrigin = source.market ? (source.replay ? "Recorded" : "Live") + " as of " + dt(source.market.observed) + ". " : "";
  const snapshot = marketNotes.slice(0, 6).map(n => n.label + ". " + n.text).join("\n");
  const quote = note.label + ". " + note.text;
  const impact = (note.series && note.series !== current().series ? current().name + " uses its own forecast. " : "") +
    (o.status === "Watching" ? selectedOrigin + assessment(source).reason :
      "Your " + current().name + " order is " + ({ Held: "awaiting supplier confirmation.", Paid: "paid.", Refunded: "refunded." }[o.status]));
  const context = "Selected order: " + o.qty + " " + current().unit + " of " + current().name +
    ", status " + o.status + ", needed by " + dt(o.due) + ". Simulated supplier total: " + money(totalCents(o.qty, current().price)) +
    ". Early-order threshold: " + thresholdFor(o) + "%. Available demo budget: " + money(available()) + ".\nOrder assessment: " + impact +
    "\nTapped update: " + quote + "\nQuotes on Orders:\n" + snapshot;
  chat.marketConversation(o.id, { quote, impact }, context,
    { series: current().series, quantity: o.qty, allowance: s.limit / 100 });
  el.hidden = true;
  document.querySelector("nav").hidden = true;
  welcome.hidden = false;
  window.scrollTo(0, 0);
  document.querySelector("#welcomeTitle").focus();
}

if (liveBuyer && new URLSearchParams(location.search).get("talk") === "1") {
  const talk = JSON.parse(sessionStorage.getItem("forestock.arcTalk") || "null");
  if (talk) chat.marketConversation(talk.id, talk.facts, talk.context, talk.draft);
}
document.querySelector("#backToOrders").onclick = () => {
  if (liveBuyer) { location.assign("/arc.html"); return; }
  chat.leaveMarket();
  welcome.hidden = true;
  document.querySelector("nav").hidden = false;
  el.hidden = false;
  render();
  el.querySelector(".order-bird").focus();
};

function orderActions(decision, total) {
  const edit = btn("Edit need", "edit");
  if (decision.kind === "Buy") return btn("Place demo order · " + money(total), "place", true) + edit;
  if (decision.kind === "Wait") return btn("Refresh forecast", "check", true) + edit;
  return decision.fix === "budget" ? btn("Review budget", "budget", true) + edit : btn("Edit need", "edit", true);
}

function render(check, savedThreshold = false) {
  if (inSetup) return;
  const expanded = new Set(
    [...el.querySelectorAll("details[open] summary")].map((n) => n.textContent),
  );
  refresh(s, now());
  save();
  const { price, name, unit, premium } = current();
  const o = order(),
    total = totalCents(o.qty, price);
  for (const b of document.querySelectorAll("[data-tab]"))
    b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
  if (tab === "Orders") {
    const source = forecast();
    const { market, replay } = source;
    const d = check || assessment(source),
      open = o.status === "Watching",
      held = o.status === "Held";
    el.innerHTML =
      needsOverview() + '<section class="order-status"><div class="order-heading"><div><p class="hint">' + esc(name) + ' order</p><h2 tabindex="-1">' +
      (open
        ? ({Buy:"Ready to order",Wait:"Watching the market",Blocked:"Order needs attention"}[d.kind])
        : held
          ? "Funds held"
          : o.status === "Paid"
            ? "Supplier receipt"
            : "Funds returned") +
      '</h2></div></div><p>' +
      esc(
        open
          ? d.reason
          : held
            ? money(total) + " in demo funds is reserved for " + o.qty + " " + unit + " of " + name + ". Accept the order below to simulate supplier confirmation."
            : o.status === "Paid"
              ? "The supplier accepted your order."
              : "The supplier declined the order.",
      ) +
      "</p>" +
      (check && open ? '<p class="check-result" role="status">' +
        (savedThreshold ? "Saved " + thresholdFor(o) + "%. " : "") +
        ({ Wait: "Checked just now. Your order is still waiting.", Blocked: "Order blocked. No funds were reserved.", Buy: "Conditions met. You can place this order." }[check.kind]) + "</p>" : "") +
      '<p class="hint">' +
      (open && replay ? "Simulated purchase · Recorded forecast from " + dt(market.observed)
        : o.replayObserved && !open ? "Simulated purchase · Used forecast recorded " + dt(o.replayObserved)
        : "Simulated purchase") + "</p>" +
      (open ? '<button class="threshold-setting" data-action="threshold"><span>Early-order threshold <strong>' +
        thresholdFor(o) + '%</strong></span><span>Change</span></button>' : "") +
      (open && source.canSwitch ? '<button class="forecast-switch" data-action="forecast">' +
        (replay ? "Use live forecast" : "Use recorded forecast") + "</button>" : "") +
      '<div class="actions">' +
      (open
        ? orderActions(d, total)
        : held
          ? btn("Decline", "decline") + btn("Accept order", "accept", true)
          : btn("New material need", "add", true)) +
      "</div>" +
      (open
        ? "<details><summary>What happens at the order deadline?</summary><p>To arrive by " +
          dt(o.due) + ", " + esc(name) + " must be ordered by " + dt(o.due - day) +
          ". The supplier needs 24 hours for delivery.</p><p>Try that moment now. If the price, stock and budget allow, the demo will reserve " +
          money(total) + " for this order regardless of the forecast.</p>" +
          btn("Simulate ordering at the deadline", "cutoff") +
          "</details>"
        : "") +
      '</section>' + sparrowUpdates() + '<section class="card order-summary"><h2>' + esc(name) + '</h2>' +
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
      (replay ? "Recorded replay" : market ? "Market snapshot" : "No quote") +
      "</summary><p>" +
      esc(market?.title || "No qualifying Gemini quote or recording for " + name + " yet.") +
      '</p><p class="hint">' +
      (market
        ? (replay ? "Recorded " : "Fetched ") +
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
      row("Funds held", money(s.orders.reduce((sum, need) => sum + (need.status === "Held" ? totalCents(need.qty, (need.asset || copper).price) : 0), 0))) +
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
      "</div></section><section><p>Demo orders use this browser’s practice balance. No faucet tokens are needed.</p>" +
      btn("Reset demo workspace", "reset") + "</section>";
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
const tabs = [...document.querySelectorAll("nav [data-tab]")].map(button => button.dataset.tab);
let endTabSlide;
function switchTab(next) {
  if (tab === next) {
    window.scrollTo(0, 0);
    return;
  }
  endTabSlide?.();
  const direction = Math.sign(tabs.indexOf(next) - tabs.indexOf(tab));
  const animate = el.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let outgoing;
  if (animate) {
    const rect = el.getBoundingClientRect();
    outgoing = document.createElement("main");
    outgoing.className = "departing-tab";
    outgoing.inert = true;
    outgoing.setAttribute("aria-hidden", "true");
    Object.assign(outgoing.style, { top: rect.top + "px", left: rect.left + "px", width: rect.width + "px" });
    outgoing.append(...el.children);
    outgoing.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    el.before(outgoing);
  }
  tab = next;
  render();
  window.scrollTo(0, 0);
  if (!outgoing) return;
  const distance = Math.min(el.clientWidth * .28, 180) * direction;
  const timing = { duration: 270, easing: "cubic-bezier(.2,.75,.25,1)" };
  const leave = outgoing.animate([{ opacity: 1 }, { transform: `translateX(${-distance}px)`, opacity: 0 }], timing);
  const enter = el.animate([{ transform: `translateX(${distance}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], timing);
  endTabSlide = () => {
    enter.onfinish = null;
    enter.cancel();
    leave.cancel();
    outgoing.remove();
    endTabSlide = null;
  };
  enter.onfinish = endTabSlide;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-note")) {
    openMarketChat(marketNotes[Number(b.dataset.note)]);
    return;
  }
  if (b.matches(".bird")) {
    animateBird(b);
    return;
  }
  if (b.dataset.need) {
    s.selectedId = b.dataset.need;
    fillPickers();
    render();
    el.querySelector('.need-entry[aria-pressed="true"]').focus({ preventScroll: true });
    return;
  }
  if (!b.dataset.action && !b.dataset.tab && !b.hasAttribute("data-close"))
    return;
  if (b.dataset.tab) {
    switchTab(b.dataset.tab);
    return;
  }
  if (b.hasAttribute("data-close")) {
    b.closest("dialog").close();
    return;
  }
  const { price } = current();
  const a = b.dataset.action,
    o = order();
  const total = totalCents(o.qty, price);
  refresh(s, now());
  if (a === "reset") {
    document.querySelector("#resetDemo").showModal();
    return;
  }
  if (a === "threshold" && o.status === "Watching") {
    thresholdForm.elements.threshold.value = thresholdFor(o);
    thresholdForm.querySelector("h2").textContent = current().name + " early-order threshold";
    previewThreshold();
    thresholdDialog.showModal();
    thresholdForm.elements.threshold.select();
    return;
  }
  if (a === "add" || (a === "edit" && o.status === "Watching")) {
    addingNeed = a === "add";
    const template = addingNeed ? initial().order : o;
    form.elements.asset.value = current().series;
    updatePicker(form);
    form.qty.value = addingNeed ? defaultQuantity(current()) : template.qty;
    form.cap.value = addingNeed ? Math.ceil(current().price * 1.035) / 100 : o.cap / 100;
    form.notes.value = template.notes;
    const local = new Date(Math.max(template.due, now() + day));
    form.due.value = new Date(+local - local.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    dialog.showModal();
    return;
  }
  if (a === "budget") {
    switchTab("Budget");
    return;
  }
  if (a === "check" && o.status === "Watching") {
    b.disabled = true;
    b.textContent = "Checking forecast…";
    await loadMarket();
    if (el.hidden || tab !== "Orders" || order() !== o || o.status !== "Watching") return;
    const source = forecast();
    const result = assessment(source);
    const origin = source.replay ? "Recorded forecast from " + dt(source.market.observed) + ". " : "";
    record("Forecast checked", current().name + " · " + origin + result.reason);
    render(result);
    el.querySelector(".order-status h2").focus();
    return;
  }
  if (a === "forecast") {
    o.preferRecording = !forecast().replay;
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
  if ((a === "place" || a === "cutoff") && o.status === "Watching") {
    const source = forecast();
    const d = assessment(source, a === "cutoff" ? o.due - day : now());
    const recorded = source.replay && d.contract ? source.market.observed : null;
    if (d.kind === "Buy") {
      s.used += total;
      s.balance -= total;
      o.status = "Held";
      o.commitWeek = s.week;
      if (recorded) o.replayObserved = recorded;
    }
    record(
      (a === "cutoff" ? "Cutoff scenario · " : "") + d.kind,
      (recorded ? "Recorded forecast from " + dt(recorded) + ". " : "") + d.reason +
        (d.kind === "Buy" ? " Held " + money(total) + "." : ""),
    );
    render(d);
    el.querySelector(".order-status h2").focus();
    return;
  }
  if (o.status === "Held" && (a === "accept" || a === "decline")) {
    if (a === "decline") {
      s.balance += total;
      if (o.commitWeek === s.week) s.used -= total;
    }
    o.status = a === "accept" ? "Paid" : "Refunded";
    record(
      o.status,
      money(total) + " · simulated " + current().name + " order",
    );
  }
  render();
});
const thresholdDialog = document.querySelector("#thresholdEditor");
const thresholdForm = thresholdDialog.querySelector("form");
thresholdDialog.querySelector("#defaultThreshold").textContent = defaultThreshold;
function previewThreshold() {
  const input = thresholdForm.elements.threshold;
  const preview = document.querySelector("#thresholdPreview");
  if (!input.validity.valid) {
    preview.textContent = "Enter a whole percentage from 1 to 100.";
    return;
  }
  const source = forecast();
  const t = now();
  const result = evaluate({ ...s, order: { ...order(), threshold: input.valueAsNumber } }, source.market, t,
    source.replay ? Date.parse(source.market.observed) : t);
  preview.textContent = (source.replay ? "Recorded forecast · " : "") +
    ({ Buy: "Ready to order. ", Wait: "Still watching. ", Blocked: "Order blocked. " }[result.kind]) + result.reason;
}
thresholdForm.elements.threshold.addEventListener("input", previewThreshold);
thresholdForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = thresholdForm.elements.threshold.valueAsNumber;
  if (!thresholdForm.reportValidity() || order().status !== "Watching") return;
  order().threshold = value;
  record("Early-order threshold updated", current().name + " · " + value + "%");
  thresholdDialog.close();
  render(assessment(forecast()), true);
  const result = el.querySelector(".check-result");
  result.tabIndex = -1;
  result.focus();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const need = {
    ...(addingNeed ? { id: crypto.randomUUID(), threshold: defaultThreshold } : order()),
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
  record(
    "Material need saved",
    order().qty + " " + current().unit + " of " + current().name + "",
  );
  dialog.close();
  render();
});
let marketRequest;
function loadMarket() {
  marketRequest ??= updateMarket().finally(() => { marketRequest = null; });
  return marketRequest;
}
async function updateMarket() {
  try {
    const r = await fetch("/api/market");
    if (!r.ok) throw Error();
    const live = (await r.json()).assets;
    const active = new Set(live.map(asset => asset.series));
    assets = [...live, ...baseline.filter(asset => !active.has(asset.series)).map(compact)];
  } catch {
    assets = baseline.map(compact);
  }
  fillPickers();
  if (tab === "Orders") render();
}
const resetDialog = document.querySelector("#resetDemo");
document.querySelector("#confirmReset").onclick = () => {
  localStorage.removeItem(key);
  location.reload();
};
window.addEventListener("storage", event => {
  if (event.key === key && event.newValue === null) location.reload();
});
function openResetLink() {
  if (location.hash !== "#reset-demo") return;
  history.replaceState(null, "", location.pathname + location.search);
  if (!resetDialog.open) resetDialog.showModal();
}
window.addEventListener("hashchange", openResetLink);
openResetLink();
render();
loadMarket();
setInterval(loadMarket, 60000);
