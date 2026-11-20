import { outlookTab } from "../public/outlook.js";
import { openStep, restartOnReopen } from "../public/navigation.js";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseEventLogs,
  stringToHex,
  hexToString,
  parseEther,
  formatEther,
  isAddress,
} from "viem";
import { flyToScreen, hop, landOnArcReview } from "../public/onboarding-motion.js";
import { sparrowSpeech } from "../public/sparrow-speech.js";
import { arcTestnet } from "viem/chains";
import { baseQuote, chooseOffer, requiredFee, verifiedBook, forwardingFee } from "../lib/supplier-offers.js";
import { destinationReceipt } from "../lib/bridge-receipt.js";
import { routeAbi } from "../lib/routed-abi.js";
import { liveAbi } from "../lib/live-abi.js";
import { orderId, relatedSalt, purchaseFamilies, sizedPurchases, stockUpQuote } from "../lib/purchase-sizing.js";
import { liveDecision } from "../lib/live-decision.js";
import { currentQuote, defaultThreshold, midpointPercent, totalCents } from "../public/decision.js";
import {
  connectWallet, hasWalletCredential, sendEscrowCalls,
  waitEscrowOperation,
} from "../public/generated/circle.js";

import { escapeText as escape, filterControls, populateFilters, matchesOrder, purchaseMark, orderForecast, syncAmountSlider } from "../public/workspace-controls.js";

const abi = [...liveAbi,...routeAbi];
let routed, book, fee, feeTime = 0, baseSupplier;
const destination = new Map();
const burnIds = new Map();
let original, originalFunds;
const budgetTarget = () => $("budgetDesk").value === "original" ? original : address;
const $ = (id) => document.getElementById(id);
const buyer = localStorage.getItem("forestock.arcWallet");
const client = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});
const amount = (n) =>
  Number(formatEther(n)).toLocaleString("en-US", { maximumFractionDigits: 6 });
const usd = (cents) => "$" + (cents / 100).toFixed(2);
const date = (seconds) =>
  new Date(Number(seconds) * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const link = (hash, label) =>
  '<a href="https://testnet.arcscan.app/tx/' +
  hash +
  '" target="_blank" rel="noreferrer">' +
  label +
  " ↗</a>";
const notice = (text) => {
  $("notice").textContent = text;
};
const draftKey = "forestock.arcDraft." + buyer;
let address,
  key,
  catalog,
  draft,
  funds,
  working = false,
  ongoingRefresh,
  previewInitialized = false,
  draftCost = 0n;
let liveAssets = [],
  quoteTime = 0;
const receipts = new Map();
const planKey = (id, target = address) => "forestock.arcPlan." + target + "." + id;
function planReceipt(id, target) {
  const hash = localStorage.getItem(planKey(id,target));
  return /^0x[0-9a-f]{64}$/i.test(hash || "")
    ? link(hash, "Authorization")
    : "";
}
const orders = new Map();
const proposals = new Map();
const loadOutlook = outlookTab($("signals"), () => ({
  catalog:(catalog || []).map(({series,name,unit}) => ({series,name,unit})),
  needs:[...new Set([...orders.values()].filter(entry=>entry.o.status===1).map(entry=>entry.asset?.name).filter(Boolean))],
}));
let displayedProposal;
let depositEdited = false;
function portionsFor(line) {
  const form = $("approve").elements;
  const trigger = form.threshold.validity.valid ? form.threshold.valueAsNumber : defaultThreshold;
  return sizedPurchases(line,buyer,trigger,form.flexible.checked,offerFor);
}
function purchaseCalls(line, portion, cutoff, recorded) {
  const {salt,quantityMilli,threshold,offer}=portion;
  const plan=call("plan",[salt,stringToHex(line.series,{size:32}),quantityMilli,line.cap,BigInt(cutoff),threshold,recorded]);
  return offer.feeMicros ? [plan,call("selectBase",[salt,offer.price,BigInt(offer.feeMicros)])] : [plan];
}
const statusLabels = ["", "Watching", "Funds held", "Purchased", "Refunded", "Cancelled", "Payment in transit"];
const filter = { material: "", status: "" };
let budgetEdited = false;
let lastOrderMarkup;
$("arcFilters").innerHTML = filterControls();
$("fund").oninput = () => { budgetEdited = true; };
function filterOrders() {
  const materials = new Map();
  let visible = 0;
  for (const card of $("orderList").querySelectorAll("article")) {
    const { series, status, name } = card.dataset;
    materials.set(series, name);
    card.hidden = !matchesOrder(filter, series, status);
    if (!card.hidden) visible++;
  }
  for (const group of $("orderList").querySelectorAll(".purchase-family")) group.hidden = !group.querySelector("article:not([hidden])");
  populateFilters($("arcFilters"), materials, statusLabels.slice(1).map((s,i) => [String(i + 1), s]), filter);
  $("arcFilters").hidden = materials.size === 0;
  const empty = $("noMatches");
  if (empty) empty.hidden = visible > 0;
}
$("arcFilters").onchange = event => {
  filter[event.target.dataset.filter] = event.target.value;
  filterOrders();
};
let view = "orders",
  editingId;
function showView(next) {
  view = next;
  for (const name of ["orders", "signals", "budget", "activity"])
    $(name).hidden = name !== next;
  $("review").hidden = next !== "orders" || !draft?.lines?.length;
  $("arc").querySelector("h1").textContent = {
    orders: draft?.lines?.length ? "Review your order" : "Purchase orders",
    signals: "Market outlook",
    budget: "Budget",
    activity: "Activity",
  }[next];
  if (next === "signals") loadOutlook();
  document
    .querySelectorAll("[data-view]")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.view === next ? "page" : "false",
      ),
    );
}
document.querySelector("nav").onclick = (e) => {
  const next = e.target.closest("button")?.dataset.view;
  if (!next || next === view) return;
  showView(next);
  scrollTo(0, 0);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    $(next).animate(
      [
        { transform: "translateX(12px)", opacity: 0.5 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 240 },
    );
};
const opKey = (target = address) => "forestock.arcPending." + target + "." + buyer;
const read = (functionName, args = [], target = address) =>
  client.readContract({ address:target, abi, functionName, args });
const call = (functionName, args, value = 0n, target = address) => ({
  to: target,
  value,
  data: encodeFunctionData({ abi, functionName, args }),
});

async function blockReceipt(id, block, eventName, isBurn, target, cardKey) {
  if (!block) return "";
  const k = cardKey + eventName;
  if (!receipts.has(k)) {
    const logs = await client.getContractEvents({
      address:target,
      abi,
      eventName,
      args: { id },
      fromBlock: block,
      toBlock: block,
    });
    if (logs.length)
      receipts.set(
        k,
        link(
          logs[0].transactionHash,
          eventName === "Held" ? "Escrow hold" : isBurn ? "Arc burn" : "Settlement",
        ) + (logs[0].args.recorded ? " · recorded forecast" : ""),
      );
  }
  return receipts.get(k) || "";
}
async function updateFee() {
  try { fee = await forwardingFee(); } catch { fee = null; }
  feeTime = Date.now();
}
function offerFor(line) {
  return chooseOffer(line, book, fee, Math.floor(Date.now()/1000));
}
async function bridgeStatus(id, o) {
  if (!burnIds.has(id)) {
    const [burn] = await client.getContractEvents({address,abi,eventName:"Burned",args:{id},fromBlock:o.settlementBlock,toBlock:o.settlementBlock});
    if (!burn) return;
    burnIds.set(id,burn);
  }
  const prior = destination.get(id);
  if (prior?.hash || prior?.checked > Date.now()-15000) return prior?.hash;
  const burn = burnIds.get(id);
  const entry = {checked:Date.now()};
  destination.set(id,entry);
  // Keep the order list responsive while Circle forwards and Base confirms.
  destinationReceipt(burn.transactionHash, burn.args.recipient, burn.args.grossMicros-burn.args.maxFee)
    .then(hash => { if(hash) entry.hash=hash; }).catch(()=>{});
}
const guide = sparrowSpeech($("review"), $("guideMessage"));
let spoken, gasShortfall;
$("approve").elements.threshold.value = defaultThreshold;
const signedCutoff = (line, shortWindow, now) =>
  shortWindow ? Math.min(line.orderBy, now + 120) : line.orderBy;
function say(message) {
  if (message === spoken) return;
  spoken = message;
  const line = document.createElement("div");
  guide.speak(line, message);
  for (const old of [...$("guideMessage").children]) if (old !== line) old.remove();
}
document.addEventListener("pointerover", e => {
  const bird = e.target.closest(".bird");
  if (e.pointerType === "mouse" && bird && !bird.contains(e.relatedTarget)) hop(bird);
});
document.addEventListener("click", e => {
  const bird = e.target.closest(".bird");
  if (bird) hop(bird);
});
function updateApproval() {
  if (!funds || !draft) return;
  const f = $("approve");
  $("windowHint").hidden = !f.elements.shortWindow.checked;
  for (const cutoff of $("lines").querySelectorAll("[data-cutoff]")) {
    cutoff.textContent = f.elements.shortWindow.checked ? "Order within 2 min or by the original cutoff, whichever comes first" : "Order by " + date(cutoff.dataset.cutoff);
  }
  const input = f.elements.deposit;
  const valid = input.validity.valid;
  const deposit = valid ? parseEther(input.value) : 0n;
  const feeShort = gasShortfall?.balance === funds.wallet && gasShortfall?.deposit === deposit;
  const needsFunds = valid && (funds.wallet <= deposit || feeShort);
  const reconnect = !hasWalletCredential(buyer);
  $("authorize").textContent = working ? "Please wait…" : reconnect ? "Reconnect existing passkey" : "Authorize with passkey";
  $("authorize").disabled = !valid || needsFunds || working;
  $("fundingHelp").hidden = !needsFunds;
  $("depositSummary").textContent = valid ? amount(deposit) + " test USDC" : "Choose a deposit";
  const remaining = draftCost - funds.free;
  let fundingText;
  if (!valid) {
    fundingText = "Enter a deposit in Buying rules to see how much your escrow will cover.";
  } else if (remaining <= 0n) {
    fundingText = "Your escrow already covers this " + amount(draftCost) + " test USDC order. " +
      (deposit === 0n ? "Your wallet only pays the Arc network fee when you authorize." :
        "This deposit adds to your available escrow balance. Your wallet also pays the Arc network fee.");
  } else {
    fundingText = "You have " + amount(funds.free) + " test USDC available in escrow. " +
      (deposit < remaining ? "You still need " + amount(remaining - deposit) + " more test USDC to fund this order." :
        "This deposit covers the remaining " + amount(remaining) + " test USDC.") +
      " Your wallet also pays the Arc network fee.";
  }
  if (originalFunds?.free > 0n && remaining > 0n) fundingText += " Earlier Arc escrow has "+amount(originalFunds.free)+" test USDC. You can withdraw it in Budget.";
  $("depositHelp").textContent = fundingText;
  $("termsSummary").textContent = f.elements.limit.value + " USDC/week · " + f.elements.threshold.value + "%" + (f.elements.recording.checked ? " · Dated forecast allowed" : "") + (f.elements.shortWindow.checked ? " · 2 min cutoff" : "");
  if (needsFunds) {
    $("fundingReason").textContent = "Your wallet has " + amount(funds.wallet) + " test USDC. " +
      (funds.wallet < deposit ? "The deposit needs " + amount(deposit) + ", plus the network fee." :
        feeShort ? "Arc reported insufficient funds for the network fee. Add funds or lower the deposit." :
        "Leave some test USDC in your wallet for the network fee.");
    say("Your draft is saved. Add funds to authorize it.");
  } else if (valid) {
    say(reconnect ? "First, reconnect your passkey." :
      f.elements.flexible.checked ? "When your order can be split, I’ll buy in portions as the forecast strengthens. I’ll ask before buying extra." : "I’ll watch for a buying opportunity within your limits.");
  }
}
$("approve").addEventListener("input", e => {
  if (e.target.name === "deposit") depositEdited = true;
  if (["flexible","threshold"].includes(e.target.name)) showDraft();
  else updateApproval();
});
$("approve").addEventListener("invalid", e => {
  if ($("orderTerms").contains(e.target)) $("orderTerms").open = true;
}, true);
$("copyAddress").onclick = async () => {
  try {
    await navigator.clipboard.writeText(buyer);
    $("balanceResult").textContent = "Address copied.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("fundingAddress"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $("balanceResult").textContent = "Wallet address selected. Copy it to use at the faucet.";
  }
};
$("checkBalance").onclick = async () => {
  const button = $("checkBalance");
  button.disabled = true;
  $("balanceResult").textContent = "Checking Arc…";
  try {
    funds.wallet = await client.getBalance({address: buyer, blockTag:"latest"});
    gasShortfall = undefined;
    showDraft();
    if ($("fundingHelp").hidden) {
      notice("Balance updated. Your deposit is available.");
      $("authorize").focus({preventScroll:true});
    } else $("balanceResult").textContent = "Checked. Available " + amount(funds.wallet) + " test USDC.";
  } catch { $("balanceResult").textContent = "Couldn’t read Arc. Try checking again."; }
  finally { button.disabled = false; }
};
function showDraft() {
  if (!draft?.lines?.length) return;
  $("review").hidden = view !== "orders";
  $("approve").hidden = false;
  $("reviewBalance").textContent =
    "Wallet balance " +
    amount(funds.wallet) +
    " test USDC · Already in escrow " +
    amount(funds.free) +
    ".";
  $("quoteSource").hidden = !routed;
  if (routed) $("quoteSource").textContent = book && fee ? "Comparing delivered offers from the project’s Arc and Base Sepolia test suppliers. Forwarding is included." : "Showing the Arc offer while the Base supplier or forwarding quote is unavailable.";
  let cost = 0n;
  const openPlans = new Set([...$("lines").querySelectorAll("details[open]")].map(el => el.dataset.plan));
  $("lines").innerHTML = draft.lines
    .map((line) => {
      const portions = portionsFor(line);
      const cents = portions.reduce((sum,p)=>sum+p.offer.cents,0);
      cost += BigInt(cents) * 10n ** 16n;
      const networks = [...new Set(portions.map(p=>p.offer.network))].join(" + ");
      const fees = portions.reduce((sum,p)=>sum+(p.offer.feeMicros || 0),0);
      const comparison = routed ? '<details data-plan="'+escape(line.salt)+'-compare"><summary>Compare supplier offers</summary>'+
        portions.map(part => {
          const alternative = baseQuote({...line,quantity:part.quantity},book,fee,Math.floor(Date.now()/1000));
          const base = alternative ? usd(alternative.cents)+' including forwarding'+(alternative.price>line.cap?' (above cap)':'') : 'quote unavailable';
          return '<p>'+escape(part.quantity+" "+line.unit)+' · Arc '+usd(totalCents(part.quantity,line.price))+' · Base Sepolia '+base+'</p>';
        }).join("")+'</details>' : '';
      const sizing = portions.length>1 ? '<details class="portion-plan" data-plan="'+escape(line.salt)+'-sizing"><summary>Up to '+escape(line.quantity+" "+line.unit)+' in '+portions.length+
        ' purchases</summary>'+portions.map(p=>'<p>'+escape(p.quantity+" "+line.unit)+' at '+p.threshold+'% or higher · '+usd(p.offer.cents)+
        (routed?' · '+p.offer.network:'')+'</p>').join("")+'<p>Near the cutoff, any remaining portions can be bought within your price and spending limits.</p></details>' : '<p class="hint">One purchase at this quantity and price cap.</p>';
      const idea = line.idea ? '<details data-plan="'+escape(line.salt)+'-idea"><summary>Why Sparrow suggested this</summary><p>'+
        escape(line.idea.title)+' · '+escape(line.idea.outcome)+'</p><p>'+escape(line.idea.reason)+'</p><small>The commodity forecast and your buying rules govern this order.</small></details>' : '';
      return '<li><div class="review-item"><strong>' + escape(line.name) + '</strong><b>' + usd(cents) +
        '</b></div><div class="review-item-meta"><span>' + escape(line.quantity + " " + line.unit) +
        '</span>' + (routed ? '<span>' + networks + (fees ? ' · up to ' + (fees/1e6).toFixed(4) + ' USDC forwarding' : '') + '</span>' : '') + '<span data-cutoff="' + Number(line.orderBy) + '">Order by ' + date(line.orderBy) + '</span></div>' + sizing + comparison + idea + '</li>';
    })
    .join("");
  for (const plan of $("lines").querySelectorAll("details")) plan.open = openPlans.has(plan.dataset.plan);
  draftCost = cost;
  $("priceCaps").innerHTML = draft.lines.map(line =>
    '<p>Maximum price for ' + escape(line.name) + ' <strong>' + usd(line.cap) + ' / ' + escape(line.unit) + '</strong></p>'
  ).join("");
  if (!previewInitialized) {
    $("approve").elements.limit.value = draft.allowance;
    previewInitialized = true;
  }
  if (!depositEdited) $("approve").elements.deposit.value = formatEther(cost > funds.free ? cost - funds.free : 0n);
  updateApproval();
}
async function orderCard(rawId, o, family, records, target, account, isExtra) {
  const legacy = target !== address;
  const id = legacy ? "old-" + rawId : rawId;
  const series = hexToString(o.series, { size: 32 });
  const live = liveAssets.find((a) => a.series === series);
  const archived = catalog.find((a) => a.series === series);
  const reference = archived || live;
  const [baseUnit, feeCap] = routed && !legacy && (o.status === 1 || o.status === 2 || o.status === 6) ? await read("baseOffer",[rawId]) : [0];
  const asset = baseUnit && reference ? {...reference,price:baseUnit} : reference;
  const mint = o.status === 6 ? await bridgeStatus(id,o) : undefined;
  const mintLink = mint ? '<a href="https://sepolia.basescan.org/tx/'+mint+'" target="_blank" rel="noreferrer">Base supplier receipt ↗</a>' : "";
  const status = [
    "",
    "Watching",
    "Funds held",
    "Supplier paid",
    "Refunded",
    "Cancelled",
    mint ? "Supplier paid on Base Sepolia" : "USDC in transit to Base Sepolia",
  ][o.status];
  let assessment =
    o.status === 1
      ? liveDecision(
          o,
          account,
          asset,
          live?.market,
          archived?.market,
          Date.now(),
        )
      : null;
  if (baseUnit && o.status === 1 && Number(o.orderBy)*1000 >= Date.now()) {
    const gross = totalCents(o.quantityMilli/1000,baseUnit)*10000;
    if (!fee || requiredFee(gross,fee) > Number(feeCap))
      assessment = {kind:"Wait",reason:fee ? "Waiting for Circle’s forwarding fee to fit your signed offer." : "Waiting for a forwarding fee from Circle."};
    else if (!book?.unitCents[series] || book.expires*1000 < Date.now() || o.quantityMilli/1000 > book.stock ||
      gross - Number(feeCap) < totalCents(o.quantityMilli/1000,book.unitCents[series])*10000)
      assessment = {kind:"Wait",reason:"Waiting for a valid supplier quote for your Base order."};
  }
  orders.set(id, {
    o,
    asset,
    live: live?.market,
    recording: archived?.market,
    assessment, mintLink, status, rawId, target, account,
  });
  let body = "";
  if (assessment) {
    const fresh = currentQuote(live?.market, Date.now());
    const market = fresh ? live.market : archived?.market;
    const message = assessment.kind === "Buy"
      ? (assessment.contract ? "Forecast trigger met. Ready for the agent to reserve funds." : "Final ordering window open. Ready for the agent to reserve funds.")
      : assessment.contract ? "Waiting for the forecast to reach " + o.threshold + "%." : assessment.reason;
    body = "<p>" + escape(message) + "</p>" + orderForecast({
      id, asset:asset || {name:series, series}, market, recorded:!fresh, threshold:o.threshold,
      cap:o.capCents, cutoff:Number(o.orderBy)*1000, allowRecording:o.allowRecording, feeCap
    }) +
      '<button data-change="' +
      id +
      '" data-value="' +
      o.threshold +
      '">Change ' +
      o.threshold +
      '% threshold</button> <button data-cancel="' +
      id +
      '">Cancel need</button>';
  }
  let sizing = "";
  if (isExtra) sizing = "Buyer-approved extra stock";
  else if (family?.portions.length > 1) {
    const total = family.portions.reduce((sum, key) => sum + records.get(key).quantityMilli, 0) / 1000;
    sizing = "Portion " + (family.portions.indexOf(rawId) + 1) + " of " + family.portions.length +
      " · " + total + " " + (asset?.unit || "units") + " approved in total";
  }
  orders.get(id).sizing = sizing;
  if (sizing) body = '<p class="hint">' + escape(sizing) + '</p>' + body;
  if (o.status === 1 && reference && routed) {
    const line = {...reference, quantity:o.quantityMilli / 1000, cap:o.capCents, orderBy:Number(o.orderBy)};
    const alternative = baseQuote(line,book,fee,Math.floor(Date.now()/1000));
    const best = offerFor(line);
    orders.get(id).switchOffer = !baseUnit && best.feeMicros ? best : null;
    body += '<details data-owner="'+id+'" data-disclosure="offers"><summary>Supplier offers · '+(baseUnit ? 'Base selected' : 'Arc selected')+'</summary><p>Arc '+usd(totalCents(line.quantity,line.price))+
      ' · Base Sepolia '+(alternative ? usd(alternative.cents)+' including forwarding'+(alternative.price>line.cap?' (above cap)':'') : 'quote unavailable')+'</p>'+
      (orders.get(id).switchOffer ? '<button data-route="'+id+'">Review Base offer</button>' : '')+'</details>';
  }
  if (legacy) body += '<p class="hint">Earlier Arc escrow</p>';
  const proposal=proposals.get(id);
  if (proposal) body += '<div class="stock-suggestion"><strong>Sparrow suggests stocking up</strong><p>'+
    proposal.probability+'% chance of '+escape(asset.name)+' reaching $'+proposal.strike+' or higher. Add '+escape(proposal.line.quantity+" "+asset.unit)+
    ' for about '+usd(proposal.offer.cents)+'?</p><button data-stock="'+id+'">Review extra stock</button></div>';
  body +=
    '<div class="market-updates"><button class="bird order-bird' + (assessment?.kind === "Buy" ? ' ready-dance' : '') + '" data-chat="' +
    id +
    '" aria-label="Chat with the sparrow"><span></span></button><button class="market-bubble" data-chat="' +
    id +
    '">Ask about this order</button></div>';
  const links = await Promise.all([
    mintLink,
    planReceipt(rawId,target),
    blockReceipt(rawId, o.holdBlock, "Held",false,target,id),
    blockReceipt(rawId, o.settlementBlock, "Settled",o.status===6,target,id),
  ]);
  return (
    '<article data-order="' + id + '" data-series="' + escape(series) + '" data-status="' + (mint ? 3 : o.status) + '" data-name="' + escape(asset?.name || series) + '"><h3>' +
    escape(asset?.name || series) +
    " · " +
    escape(status) +
    "</h3><p>" +
    o.quantityMilli / 1000 +
    " " +
    escape(asset?.unit || "units") +
    (o.amount ? " · " + amount(o.amount) + " test USDC" : "") +
    "</p>" +
    (baseUnit && o.status < 6 ? "<p>Supplier payout on Base Sepolia · forwarding included</p>" : "") + body +
    links.filter(Boolean).join(" · ") +
    "</article>"
  );
}
function renderBudget() {
  const account = budgetTarget() === original ? originalFunds : funds;
  if (!account) return;
  const {wallet, free, limit, spent} = account;
  $("balances").textContent =
    "Wallet " +
    amount(wallet) +
    " · In escrow " +
    amount(free) +
    " · Committed this week " +
    amount(spent) +
    " / " +
    amount(limit) +
    " test USDC";
  const {limit: capField, deposit: depositField} = $("fund").elements;
  if (!budgetEdited) capField.value = formatEther(limit);
  const walletCents = wallet / (10n ** 16n);
  syncAmountSlider($("capRange"), capField, Math.max(10, 2 * Number(formatEther(limit)), Number(capField.value), Number(formatEther(wallet + free))));
  syncAmountSlider($("depositRange"), depositField, Number(walletCents > 0n ? walletCents - 1n : 0n) / 100);
}
$("budgetDesk").onchange = () => {
  budgetEdited = false;
  $("fund").elements.deposit.value = "0";
  renderBudget();
};
function refresh() {
  ongoingRefresh ??= readWorkspace().finally(() => { ongoingRefresh = undefined; });
  return ongoingRefresh;
}
async function readWorkspace() {
  const head = await client.getBlock({ blockTag: "latest" });
  const wallet = await client.getBalance({ address: buyer });
  const period = (head.timestamp + 259200n) / 604800n;
  async function balanceFor(target) {
    const [free, limit, spent] = await Promise.all([read("free",[buyer],target),read("weeklyLimit",[buyer],target),read("committed",[buyer,period],target)]);
    return {wallet,free,limit,spent};
  }
  [funds,originalFunds] = await Promise.all([balanceFor(address), original && balanceFor(original)]);
  if ($("notice").textContent.trim() === "Reading your escrow on Arc…") notice("");
  renderBudget();
  if (routed && !draft?.lines?.length && Date.now() - feeTime > 60000) await updateFee();
  showDraft();
  if (Date.now() - quoteTime > 60000) {
    quoteTime = Date.now();
    try {
      const r = await fetch("/api/market", {
        signal: AbortSignal.timeout(6000),
      });
      liveAssets = r.ok ? (await r.json()).assets : [];
    } catch {
      liveAssets = [];
    }
  }
  async function loadOrders(target) {
    const ids = [];
    for (;;) {
      const batch = await read("list", [buyer, BigInt(ids.length), 50n],target);
      ids.push(...batch);
      if (batch.length < 50) break;
    }
    return new Map(await Promise.all(ids.map(async id=>[id,await read("order",[id],target)])));
  }
  const [current, older] = await Promise.all([loadOrders(address), original ? loadOrders(original) : new Map()]);
  $("budgetDeskLabel").hidden = !original || !(older.size || originalFunds.free || originalFunds.limit);
  const now=Date.now();
  const reservedCents=[...current.values()].filter(o=>o.status===1 && Number(o.orderBy)*1000>=now)
    .reduce((sum,o)=>sum+totalCents(o.quantityMilli/1000,o.capCents),0);
  const weeklyRoom=Number((funds.limit-funds.spent)/10n**16n)-reservedCents;
  proposals.clear();
  const ids = [];
  const rows = [];
  const groups = new Map();
  const linkedExtras = new Set();
  for (const root of [...older.keys(),...current.keys()]) {
    const extra = orderId(buyer,relatedSalt(root,"extra"));
    if (current.has(extra) || older.has(extra)) linkedExtras.add(extra);
  }
  for (const [records,target,account] of [[current,address,funds],[older,original,originalFunds]]) {
    const families=purchaseFamilies([...records.keys()],buyer);
    for (const [rawId,o] of [...records].reverse()) {
      const id=target===address ? rawId : "old-"+rawId;
      const family=families.get(rawId);
      if (!linkedExtras.has(rawId) && (!family || (family.root===rawId && !family.extra)) && !current.has(orderId(buyer,relatedSalt(rawId,"extra")))) {
        const series=hexToString(o.series,{size:32});
        const live=liveAssets.find(a=>a.series===series);
        const familyOrders=(family?.portions || [rawId]).map(key=>records.get(key));
        const proposal=stockUpQuote(familyOrders,catalog.find(a=>a.series===series)||live,live?.market,now,offerFor,weeklyRoom);
        if (proposal) proposals.set(id,{...proposal,root:id,saltRoot:rawId,escrowRoom:Number(funds.free/10n**16n)-reservedCents});
      }
      if (family?.portions.length > 1 && family.portions.includes(rawId)) {
        const groupKey = target + family.root;
        const total = family.portions.reduce((sum,key)=>sum+records.get(key).quantityMilli,0)/1000;
        const asset = catalog.find(a=>a.series===hexToString(o.series,{size:32}));
        groups.set(id,{key:groupKey,label:(asset?.name || "Material")+" · "+total+" "+(asset?.unit || "units")+" total"});
      }
      ids.push(id);
      rows.push(orderCard(rawId,o,family,records,target,account,linkedExtras.has(rawId)));
    }
  }
  const cards = await Promise.all(rows);
  const groupsMarkup = new Map();
  cards.forEach((card,i) => {
    const group = groups.get(ids[i]);
    const key = group?.key || ids[i];
    if (!groupsMarkup.has(key)) groupsMarkup.set(key,{group, cards:[]});
    if (group) groupsMarkup.get(key).cards.unshift(card);
    else groupsMarkup.get(key).cards.push(card);
  });
  const blocks = [...groupsMarkup.values()].map(({group,cards}) => group
    ? '<section class="purchase-family"><h3>'+escape(group.label)+'</h3>'+cards.join("")+'</section>' : cards.join(""));
  const markup = cards.length ? blocks.join("") + '<p id="noMatches" hidden>No orders match these filters.</p>' : "<p>Your authorized orders will appear here.</p>";
  if (markup !== lastOrderMarkup) {
    const list = $("orderList");
    const open = new Set([...list.querySelectorAll("details[open]")].map(d => d.dataset.owner + d.dataset.disclosure));
    const focus = document.activeElement;
    const parent = focus?.closest("[data-disclosure]");
    list.innerHTML = markup;
    lastOrderMarkup = markup;
    for (const d of list.querySelectorAll("details")) {
      d.open = open.has(d.dataset.owner + d.dataset.disclosure);
      if (focus?.tagName === "SUMMARY" && parent?.dataset.owner === d.dataset.owner && parent.dataset.disclosure === d.dataset.disclosure)
        d.querySelector("summary").focus({preventScroll:true});
    }
  }
  filterOrders();
  $("events").innerHTML =
    ids
      .filter((id) => orders.get(id).o.status === 3 || planReceipt(orders.get(id).rawId,orders.get(id).target) || receipts.has(id + "Held") || receipts.has(id + "Settled"))
      .map(id => {
        const { o, asset, mintLink, status } = orders.get(id);
        const series = hexToString(o.series, {size: 32});
        const links = [mintLink, planReceipt(orders.get(id).rawId,orders.get(id).target), receipts.get(id + "Held"), receipts.get(id + "Settled")].filter(Boolean).join(" · ");
        return '<div class="receipt-line">' + (o.status === 3 || mintLink ? purchaseMark(series) : "") +
          '<div><strong>' + escape(asset?.name || series) + '</strong> · ' + escape(o.status === 6 ? status : statusLabels[o.status]) +
          (links ? "<br>" + links : "") + "</div></div>";
      })
      .join("") ||
    "<p>Receipts appear here when the agent places an order on Arc.</p>";
}
async function confirmed(receipt, type, target) {
  if (
    receipt.success &&
    receipt.receipt.status === "success" &&
    (type === "plan" || type === "stock" || type === "route")
  ) {
    const events = parseEventLogs({
      abi,
      eventName: "Planned",
      logs: receipt.receipt.logs || [],
    });
    for (const e of events) {
      if (
        e.address.toLowerCase() === target.toLowerCase() &&
        e.args.buyer.toLowerCase() === buyer.toLowerCase()
      )
        localStorage.setItem(
          planKey(e.args.id,target),
          receipt.receipt.transactionHash,
        );
    }
    if (type === "plan") { localStorage.removeItem(draftKey); draft = null; }
  }
  localStorage.removeItem(opKey(target));
  if (!receipt.success || receipt.receipt.status !== "success")
    throw Error(
      "Arc reported a failed operation. Check your balance and order terms.",
    );
  if (type === "budget") {
    budgetEdited = false;
    $("fund").elements.deposit.value = "0";
  }
  $("notice").innerHTML =
    "Confirmed on Arc. " +
    link(receipt.receipt.transactionHash, "View your transaction");
  if (type === "plan" && !$("review").hidden) {
    const reveal = () => showView(view);
    await flyToScreen($("review"), $("orders"), ".order-bird", reveal).catch(reveal);
  }
  await refresh();
}
async function transact(type, calls, target = address) {
  if (!address) return notice("Waiting for your Arc wallet connection.");
  if (!key) return notice("Wallet signing is unavailable. The deployment needs its Circle web client key.");
  if (navigator.locks) {
    return navigator.locks.request(opKey(target), { ifAvailable: true }, (lock) =>
      lock
        ? submit(type, calls, target)
        : notice("A wallet transaction is already open in another tab."),
    );
  }
  return submit(type, calls, target);
}
async function submit(type, calls, target) {
  if (working) return;
  working = true;
  updateApproval();
  try {
    const pending = JSON.parse(localStorage.getItem(opKey(target)));
    if (pending) {
      notice("Checking the previously submitted operation…");
      await confirmed(
        await waitEscrowOperation(key, pending.hash),
        pending.type,target,
      );
      return;
    }
    if (!hasWalletCredential(buyer)) {
      notice("Reconnect the passkey for this wallet.");
      await connectWallet(key, false, buyer);
      notice("Wallet reconnected. You can now confirm the transaction.");
      return;
    }
    if (!funds) throw Error("Wait for your wallet balance to load.");
    if (type === "plan" && !localStorage.getItem(draftKey))
      throw Error(
        "This draft was already cleared. Refresh to see your orders.",
      );
    const value = calls.reduce((sum, c) => sum + c.value, 0n);
    funds.wallet = await client.getBalance({address: buyer, blockTag:"latest"});
    showDraft();
    if (value > funds.wallet)
      throw Error(
        "Your wallet has " +
          amount(funds.wallet) +
          " test USDC. Reduce the deposit or fund your wallet.",
      );
    if (value === funds.wallet) throw Error("Leave test USDC in your wallet for the Arc network fee.");
    notice("Confirm this Arc Testnet transaction with your passkey.");
    const receipt = await sendEscrowCalls(key, buyer, calls, (hash) => {
      localStorage.setItem(opKey(target), JSON.stringify({ type, hash }));
      notice("Submitted to Arc. Waiting for confirmation…");
    });
    await confirmed(receipt, type,target);
  } catch (e) {
    const feeError = /prefund|insufficient funds|AA21/i.test((e.shortMessage || "") + " " + (e.message || ""));
    if (localStorage.getItem(opKey(target))) notice("Submitted. Reopen Arc orders to check the pending operation.");
    else if (feeError) {
      if (type === "plan" && funds) gasShortfall = { balance: funds.wallet, deposit: calls[0].value };
      notice(type === "plan" ? "Arc needs more test USDC for this authorization." : "Your wallet needs test USDC for the network fee. Open Budget for the funding address.");
    } else notice((e.shortMessage || e.message || "The transaction was not completed.").slice(0, 360));
  } finally {
    working = false;
    updateApproval();
  }
}
function terms(form,target = address) {
  return call(
    "configure",
    [parseEther(form.elements.limit.value)],
    parseEther(form.elements.deposit.value),target,
  );
}
$("approve").onsubmit = async (e) => {
  e.preventDefault();
  if (!draft || !funds) return;
  const f = e.target;
  if (draft.lines.some((l) => l.orderBy * 1000 <= Date.now()))
    return notice(
      "This delivery date is too soon. Discard this draft and choose a later date.",
    );
  if (routed && Date.now()-feeTime > 90000) {
    const before = draft.lines.map(portionsFor);
    await updateFee();
    if (JSON.stringify(before)!==JSON.stringify(draft.lines.map(portionsFor))) {
      showDraft(); return notice("Supplier pricing changed. Review the updated offer before authorizing.");
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const calls = [
    terms(f),
    ...draft.lines.flatMap(l => portionsFor(l).flatMap(p =>
      purchaseCalls(l,p,signedCutoff(l,f.elements.shortWindow.checked,now),f.elements.recording.checked))),
  ];
  transact("plan", calls);
};
$("discard").onclick = () => {
  if (working || localStorage.getItem(opKey())) return;
  localStorage.removeItem(draftKey);
  draft = null;
  showView(view);
};
$("fund").onsubmit = (e) => {
  e.preventDefault();
  transact("budget", [terms(e.target,budgetTarget())],budgetTarget());
};
$("withdraw").onclick = () => {
  const target = budgetTarget();
  const free = (target === original ? originalFunds : funds)?.free;
  if (free > 0n && confirm("Return " + amount(free) + " test USDC from this escrow to your wallet?"))
    transact("withdraw", [call("withdraw",[free],0n,target)],target);
};
$("orderList").onclick = (e) => {
  const b = e.target.closest("button");
  if (b?.dataset.route) return openRoute(b.dataset.route);
  if (b?.dataset.stock) {
    const proposal=proposals.get(b.dataset.stock);
    if (proposal) openStockProposal(proposal);
    return;
  }
  if (b?.dataset.change) {
    editingId = b.dataset.change;
    $("thresholdForm").elements.value.value = b.dataset.value;
    preview();
    $("editThreshold").showModal();
  }
  if (b?.dataset.chat) {
    const { o, asset, assessment, live, recording, sizing } = orders.get(b.dataset.chat);
    const series = hexToString(o.series, { size: 32 });
    const name = asset?.name || series;
    const market = assessment?.recorded ? recording : live;
    const contract = assessment?.contract;
    const status = orders.get(b.dataset.chat).status;
    const quote = contract
      ? (assessment.recorded ? "Recorded" : "Live") + " forecast from " + date(Date.parse(assessment.observed) / 1000) +
        ". The market put the chance of " + name + " being at $" + contract.strike +
        " or higher at expiry on " + date(Date.parse(market.expiry) / 1000) + " at " + midpointPercent(contract) + "%."
      : assessment?.reason || "Your order is " + status + ".";
    const impact = assessment ? {
      Wait: "Your order stays open. This assessment does not trigger an early purchase.",
      Buy: "Your order qualifies for the agent to reserve funds. The hold still needs onchain confirmation.",
      Blocked: "The agent cannot reserve funds for this order under the current terms.",
    }[assessment.kind] : "The order is " + status + ". Changes in the forecast no longer trigger an early purchase for it.";
    const facts = {
      quote, impact,
      deadline: "The order cutoff is " + date(o.orderBy) + ".",
      terms: "Your early-order threshold is " + o.threshold + "% and your maximum unit price is " + usd(o.capCents) + "." + (sizing ? " " + sizing + "." : ""),
    };
    sessionStorage.setItem(
      "forestock.arcTalk",
      JSON.stringify({
        id: b.dataset.chat,
        facts,
        context: "Arc Testnet, passkey-authorized order for " + o.quantityMilli / 1000 + " " +
          (asset?.unit || "units") + " of " + name + ". Onchain status: " + status + ". " +
          (sizing ? sizing + ". " : "") + "Any extra stock needs a separate passkey approval. " +
          (assessment?.reason || "") + (o.allowRecording ? " Dated forecasts are allowed." : " Only live forecasts are allowed.") +
          " While watching, the agent checks for an eligible forecast. At cutoff it can reserve funds without a forecast if supplier and spending limits still allow it. The test supplier receives payment only after a confirmed hold and settlement.",
        draft: {
          series,
          quantity: o.quantityMilli / 1000,
          allowance: Number(formatEther(orders.get(b.dataset.chat).account.limit)),
        },
      }),
    );
    openStep("/?plan=arc&talk=1");
  }
  if (b?.dataset.cancel && confirm("Cancel this authorized need on Arc?"))
    { const {rawId,target}=orders.get(b.dataset.cancel); transact("cancel",[call("cancel",[rawId],0n,target)],target); }
};
let routeReview;
function openRoute(id) {
  const entry = orders.get(id);
  if (!entry?.switchOffer || entry.o.status !== 1) return;
  const {o,asset,switchOffer:offer} = entry;
  routeReview = {id,price:offer.price,cents:offer.cents,fee:offer.feeMicros,threshold:o.threshold,allowRecording:o.allowRecording};
  $("routeTerms").textContent = o.quantityMilli/1000+" "+asset.unit+" of "+asset.name+" · Arc "+usd(totalCents(o.quantityMilli/1000,asset.price))+
    " · Base "+usd(offer.cents)+" including forwarding. One passkey approval cancels the current order and signs the Base offer with the same quantity, price cap, forecast rule and cutoff.";
  const cost = BigInt(offer.cents)*10n**16n;
  const covered = funds.free >= cost && funds.limit-funds.spent >= cost;
  $("routeFunding").textContent = covered ? "Your Arc and Base escrow covers this offer." :
    "This offer uses the Arc and Base escrow. Review its balance and weekly cap in Budget first.";
  $("approveRoute").textContent = covered ? "Approve with passkey" : "Open budget";
  if (!$("routeDialog").open) $("routeDialog").showModal();
}
$("closeRoute").onclick = () => $("routeDialog").close();
$("approveRoute").onclick = async () => {
  const previous = routeReview;
  const button = $("approveRoute");
  button.disabled = true;
  try {
    if (button.textContent === "Open budget") {
      $("routeDialog").close();
      $("budgetDesk").value="current"; $("budgetDesk").onchange(); showView("budget"); return;
    }
    await updateFee();
    await refresh();
    const entry = orders.get(previous.id);
    const offer = entry?.switchOffer, o = entry?.o;
    if (!offer || o.status !== 1) { $("routeDialog").close(); return notice("The Base offer is no longer available for this order."); }
    openRoute(previous.id);
    if (Object.keys(previous).some(key => previous[key] !== routeReview[key]) || button.textContent === "Open budget") {
      $("routeTerms").prepend("Terms changed. "); return;
    }
    const salt = relatedSalt(entry.rawId,entry.target === original ? "route-legacy" : "route");
    const portion = {salt,quantityMilli:o.quantityMilli,threshold:o.threshold,offer};
    const line = {...entry.asset,cap:o.capCents};
    $("routeDialog").close();
    await transact("route",[call("cancel",[entry.rawId],0n,entry.target),...purchaseCalls(line,portion,o.orderBy,o.allowRecording)]);
  } catch { notice("Couldn’t verify the latest offer. Try again."); }
  finally { button.disabled=false; }
};
function openStockProposal(proposal) {
  displayedProposal=proposal;
  const {line,offer}=proposal;
  $("stockReason").textContent="The live forecast puts the chance of "+line.name+" reaching $"+proposal.strike+
    " or higher at "+proposal.probability+"% by "+date(Date.parse(proposal.expiry)/1000)+".";
  $("stockTerms").textContent="Approve an extra "+line.quantity+" "+line.unit+" from "+offer.network+" at an estimated "+usd(offer.cents)+
    ". Maximum "+usd(line.cap)+"/"+line.unit+". Sparrow may buy at "+proposal.threshold+"% or in the final ordering window before "+date(line.orderBy)+".";
  const short=Math.max(0,offer.cents-proposal.escrowRoom);
  $("stockFunding").textContent=short ? "Add "+usd(short)+" to escrow to cover this extra and your open needs. Your weekly limit is "+amount(funds.limit)+" test USDC."
    : "Your current escrow and weekly limit cover this extra. A passkey approval creates the additional order.";
  $("approveStock").textContent=short ? "Open budget" : "Approve extra with passkey";
  if (!$("stockDialog").open) $("stockDialog").showModal();
}
$("dismissStock").onclick=()=>$("stockDialog").close();
$("approveStock").onclick=async () => {
  const previous=displayedProposal;
  if (!previous || working) return;
  if (previous.escrowRoom<previous.offer.cents) { $("stockDialog").close(); $("budgetDesk").value="current"; $("budgetDesk").onchange(); showView("budget"); return; }
  const button=$("approveStock");
  button.disabled=true;
  try {
    await refresh();
    const proposal=proposals.get(previous.root);
    if (!proposal) {
      $("stockDialog").close(); return notice("This stock-up opportunity is no longer available.");
    }
    if (proposal.offer.cents!==previous.offer.cents || proposal.offer.network!==previous.offer.network ||
        proposal.offer.price!==previous.offer.price || proposal.offer.feeMicros!==previous.offer.feeMicros ||
        proposal.probability!==previous.probability || proposal.strike!==previous.strike || proposal.expiry!==previous.expiry ||
        proposal.threshold!==previous.threshold || proposal.escrowRoom<proposal.offer.cents) {
      openStockProposal(proposal); $("stockReason").prepend("The terms changed. "); return;
    }
    $("stockDialog").close();
    const salt=relatedSalt(proposal.saltRoot,"extra");
    await transact("stock",purchaseCalls(proposal.line,{salt,quantityMilli:Math.round(proposal.line.quantity*1000),
      threshold:proposal.threshold,offer:proposal.offer},proposal.line.orderBy,false));
  } catch { notice("Couldn’t verify the stock-up terms. Try again."); }
  finally {button.disabled=false;}
};
function preview() {
  const { o, asset, live, recording } = orders.get(editingId);
  const input = $("thresholdForm").elements.value;
  if (!input.validity.valid) {
    $("preview").textContent = "Choose a whole percentage from 1 to 100.";
    return;
  }
  const d = liveDecision(
    { ...o, threshold: input.valueAsNumber },
    orders.get(editingId).account,
    asset,
    live,
    recording,
    Date.now(),
  );
  $("preview").textContent =
    (d.recorded ? "Recorded forecast. " : "") + d.reason;
}
$("thresholdForm").oninput = preview;
$("closeThreshold").onclick = () => $("editThreshold").close();
$("thresholdForm").onsubmit = (e) => {
  e.preventDefault();
  $("editThreshold").close();
  const {rawId,target} = orders.get(editingId);
  transact("threshold",[call("changeThreshold",[rawId,e.target.elements.value.valueAsNumber],0n,target)],target);
};
async function start() {
  if (!isAddress(buyer || "")) {
    location.replace("/");
    return;
  }
  $("walletAddress").textContent = $("fundingAddress").textContent = buyer;
  draft = JSON.parse(localStorage.getItem(draftKey));
  if (draft?.lines?.length) {
    showView("orders");
    $("approve").hidden = true;
    say("Let me check your wallet and order.");
    landOnArcReview($("guide").querySelector(".portrait"));
  }
  const [network, walletConfig, materials] = await Promise.all(
    [
      "/arc-network.json",
      "/generated/wallet-config.json",
      "/commodities.json",
    ].map(async (path) => (await fetch(path)).json()),
  );
  catalog = materials.assets;
  if (
    network.chainId !== 5042002 ||
    !isAddress(network.escrow || "") ||
    (await client.getChainId()) !== network.chainId
  )
    throw Error("Arc escrow configuration is unavailable.");
  routed = Boolean(network.routed);
  address = routed ? network.routed.escrow : network.escrow;
  original = routed ? network.escrow : null;
  if (routed) {
    try {
      baseSupplier = await read("baseSupplier");
      const data = await (await fetch("/base-offers.json")).json();
      book = await verifiedBook(data,baseSupplier,address);
    } catch { book = null; }
    await updateFee();
  }
  key = walletConfig.clientKey;
  for (const target of [address,original].filter(Boolean))
    if (localStorage.getItem(opKey(target))) await transact("resume", [],target);
  await refresh();
  const refreshWhenVisible = () => {
    if (!document.hidden && !working)
      refresh().catch(() =>
        notice("Arc is temporarily unavailable. Rechecking…"),
      );
  };
  document.addEventListener("visibilitychange", refreshWhenVisible);
  setInterval(refreshWhenVisible, 12000);
}
start().catch((e) => notice(e.shortMessage || e.message));

restartOnReopen(() => !working);
