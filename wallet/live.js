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
import { liveDecision } from "../lib/live-decision.js";
import { currentQuote, defaultThreshold, midpointPercent, totalCents } from "../public/decision.js";
import {
  connectWallet, hasWalletCredential, sendEscrowCalls,
  waitEscrowOperation,
} from "../public/generated/circle.js";

import { escapeText as escape, filterControls, populateFilters, matchesOrder, purchaseMark, marketSection, showMarket, syncAmountSlider, thresholdHint } from "../public/workspace-controls.js";

const abi = [...liveAbi,...routeAbi];
let routed, book, fee, feeTime = 0, baseSupplier;
const destination = new Map();
const burnIds = new Map();
const routeKey = "forestock.routed." + localStorage.getItem("forestock.arcWallet");
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
  loading = false,
  previewInitialized = false;
let liveAssets = [],
  quoteTime = 0;
const receipts = new Map();
const planKey = (id) => "forestock.arcPlan." + address + "." + id;
function planReceipt(id) {
  const hash = localStorage.getItem(planKey(id));
  return /^0x[0-9a-f]{64}$/i.test(hash || "")
    ? link(hash, "Authorization")
    : "";
}
const orders = new Map();
const statusLabels = ["", "Watching", "Funds held", "Purchased", "Refunded", "Cancelled", "Payment in transit"];
const filter = { material: "", status: "" };
let marketSeries, budgetEdited = false;
$("arcFilters").innerHTML = filterControls();
$("arcMarkets").innerHTML = marketSection();
$("speedHint").textContent = thresholdHint;
$("fund").oninput = () => { budgetEdited = true; };
function filterOrders() {
  const materials = new Map();
  let visible = 0, watching = false;
  for (const card of $("orderList").querySelectorAll("article")) {
    const { series, status, name } = card.dataset;
    materials.set(series, name);
    card.hidden = !matchesOrder(filter, series, status);
    if (!card.hidden) {
      visible++;
      if (status === "1") watching = true;
    }
  }
  populateFilters($("arcFilters"), materials, statusLabels.slice(1).map((s,i) => [String(i + 1), s]), filter);
  $("arcFilters").hidden = materials.size === 0;
  $("speedHint").hidden = !watching;
  const empty = $("noMatches");
  if (empty) empty.hidden = visible > 0;
}
$("arcFilters").onchange = event => {
  filter[event.target.dataset.filter] = event.target.value;
  filterOrders();
  renderMarkets();
};
function renderMarkets() {
  const assets = new Map((catalog || []).map(a => [a.series, a]));
  for (const asset of liveAssets) assets.set(asset.series, asset);
  if (!assets.size) return;
  const series = marketSeries || filter.material || draft?.lines?.[0]?.series || $("orderList").querySelector("article")?.dataset.series;
  const asset = assets.get(series) || assets.values().next().value;
  const live = liveAssets.find(a => a.series === asset.series)?.market;
  const fresh = currentQuote(live, Date.now());
  showMarket($("arcMarkets"), [...assets.values()], asset.series,
    fresh ? live : catalog?.find(a => a.series === asset.series)?.market, !fresh);
}
$("arcMarkets").onchange = event => {
  marketSeries = event.target.value;
  renderMarkets();
};
let view = "orders",
  editingId;
function showView(next) {
  view = next;
  for (const name of ["orders", "budget", "activity"])
    $(name).hidden = name !== next;
  $("review").hidden = next !== "orders" || !draft?.lines?.length;
  $("arc").querySelector("h1").textContent = {
    orders: draft?.lines?.length ? "Review your order" : "Purchase orders",
    budget: "Budget",
    activity: "Activity",
  }[next];
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
const opKey = () => "forestock.arcPending." + address + "." + buyer;
const read = (functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });
const call = (functionName, args, value = 0n) => ({
  to: address,
  value,
  data: encodeFunctionData({ abi, functionName, args }),
});

async function blockReceipt(id, block, eventName, isBurn = false) {
  if (!block) return "";
  const k = id + eventName;
  if (!receipts.has(k)) {
    const logs = await client.getContractEvents({
      address,
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
  $("termsSummary").textContent = f.elements.limit.value + " USDC/week · " + f.elements.threshold.value + "%" + (f.elements.recording.checked ? " · Dated forecast allowed" : "") + (f.elements.shortWindow.checked ? " · 2 min cutoff" : "");
  if (needsFunds) {
    $("fundingReason").textContent = "Your wallet has " + amount(funds.wallet) + " test USDC. " +
      (funds.wallet < deposit ? "The deposit needs " + amount(deposit) + ", plus the network fee." :
        feeShort ? "Arc reported insufficient funds for the network fee. Add funds or lower the deposit." :
        "Leave some test USDC in your wallet for the network fee.");
    say("Your draft is saved. Add funds to authorize it.");
  } else if (valid) {
    say(reconnect ? "First, reconnect your passkey." :
      "I’ll watch for a buying opportunity within your limits.");
  }
}
$("approve").addEventListener("input", updateApproval);
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
  $("lines").innerHTML = draft.lines
    .map((line) => {
      const offer = offerFor(line);
      const cents = offer.cents;
      cost += BigInt(cents) * 10n ** 16n;
      const alternative = routed && baseQuote(line,book,fee,Math.floor(Date.now()/1000));
      const comparison = alternative ? '<details><summary>Compare supplier prices</summary><p>Arc ' + usd(totalCents(line.quantity,line.price)) +
        ' · Base Sepolia ' + usd(alternative.cents) + ' including forwarding' +
        (alternative.price>line.cap ? ' (above your price cap)' : '') + '</p></details>' : '';
      return '<li><div class="review-item"><strong>' + escape(line.name) + '</strong><b>' + usd(cents) +
        '</b></div><div class="review-item-meta"><span>' + escape(line.quantity + " " + line.unit) +
        '</span>' + (routed ? '<span>' + offer.network + (offer.feeMicros ? ' · up to ' + (offer.feeMicros/1e6).toFixed(4) + ' USDC forwarding' : '') + '</span>' : '') + '<span data-cutoff="' + Number(line.orderBy) + '">Order by ' + date(line.orderBy) + '</span></div>' + comparison + '</li>';
    })
    .join("");
  $("priceCaps").innerHTML = draft.lines.map(line =>
    '<p>Maximum price for ' + escape(line.name) + ' <strong>' + usd(line.cap) + ' / ' + escape(line.unit) + '</strong></p>'
  ).join("");
  if (!previewInitialized) {
    $("approve").elements.limit.value = draft.allowance;
    $("approve").elements.deposit.value = formatEther(
      cost > funds.free ? cost - funds.free : 0n,
    );
    previewInitialized = true;
  }
  updateApproval();
}
async function orderCard(id, o) {
  const series = hexToString(o.series, { size: 32 });
  const live = liveAssets.find((a) => a.series === series);
  const archived = catalog.find((a) => a.series === series);
  const reference = archived || live;
  const [baseUnit, feeCap] = routed && (o.status === 1 || o.status === 2 || o.status === 6) ? await read("baseOffer",[id]) : [0];
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
          funds,
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
    else if (!book?.unitCents[series] || book.expires*1000 < Date.now())
      assessment = {kind:"Wait",reason:"Waiting for a valid supplier quote for your Base order."};
  }
  orders.set(id, {
    o,
    asset,
    live: live?.market,
    recording: archived?.market,
    assessment, mintLink, status,
  });
  let body = assessment
    ? "<p>" +
      escape(assessment.recorded ? "Recorded forecast. " : "") +
      escape(assessment.reason) +
      "</p>"
    : "";
  if (o.status === 1)
    body +=
      '<button data-change="' +
      id +
      '" data-value="' +
      o.threshold +
      '">Change ' +
      o.threshold +
      '% threshold</button> <button data-cancel="' +
      id +
      '">Cancel need</button>';
  body +=
    '<div class="market-updates"><button class="bird order-bird" data-chat="' +
    id +
    '" aria-label="Chat with the sparrow"><span></span></button><button class="market-bubble" data-chat="' +
    id +
    '">Ask about this order</button></div>';
  const links = await Promise.all([
    mintLink,
    planReceipt(id),
    blockReceipt(id, o.holdBlock, "Held"),
    blockReceipt(id, o.settlementBlock, "Settled", o.status === 6),
  ]);
  return (
    '<article data-series="' + escape(series) + '" data-status="' + (mint ? 3 : o.status) + '" data-name="' + escape(asset?.name || series) + '"><h3>' +
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
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const head = await client.getBlock({ blockTag: "latest" });
    const [wallet, free, limit, spent] = await Promise.all([
      client.getBalance({ address: buyer }),
      read("free", [buyer]),
      read("weeklyLimit", [buyer]),
      read("committed", [buyer, (head.timestamp + 259200n) / 604800n]),
    ]);
    funds = { wallet, free, limit, spent };
    if ($("notice").textContent.trim() === "Reading your escrow on Arc…") notice("");
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
    const ids = [];
    for (;;) {
      const batch = await read("list", [buyer, BigInt(ids.length), 50n]);
      ids.push(...batch);
      if (batch.length < 50) break;
    }
    const cards = await Promise.all(
      ids.reverse().map(async (id) => orderCard(id, await read("order", [id]))),
    );
    $("orderList").innerHTML =
      cards.length ? cards.join("") + '<p id="noMatches" hidden>No orders match these filters.</p>' : "<p>Your authorized orders will appear here.</p>";
    filterOrders();
    renderMarkets();
    $("events").innerHTML =
      ids
        .filter((id) => orders.get(id).o.status === 3 || planReceipt(id) || receipts.has(id + "Held") || receipts.has(id + "Settled"))
        .map(id => {
          const { o, asset, mintLink, status } = orders.get(id);
          const series = hexToString(o.series, {size: 32});
          const links = [mintLink, planReceipt(id), receipts.get(id + "Held"), receipts.get(id + "Settled")].filter(Boolean).join(" · ");
          return '<div class="receipt-line">' + (o.status === 3 || mintLink ? purchaseMark(series) : "") +
            '<div><strong>' + escape(asset?.name || series) + '</strong> · ' + escape(o.status === 6 ? status : statusLabels[o.status]) +
            (links ? "<br>" + links : "") + "</div></div>";
        })
        .join("") ||
      "<p>Receipts appear here when the agent places an order on Arc.</p>";
  } finally {
    loading = false;
  }
}
async function confirmed(receipt, type) {
  if (
    receipt.success &&
    receipt.receipt.status === "success" &&
    type === "plan"
  ) {
    const events = parseEventLogs({
      abi,
      eventName: "Planned",
      logs: receipt.receipt.logs || [],
    });
    for (const e of events) {
      if (
        e.address.toLowerCase() === address.toLowerCase() &&
        e.args.buyer.toLowerCase() === buyer.toLowerCase()
      )
        localStorage.setItem(
          planKey(e.args.id),
          receipt.receipt.transactionHash,
        );
    }
    localStorage.removeItem(draftKey);
    draft = null;
  }
  localStorage.removeItem(opKey());
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
async function transact(type, calls) {
  if (!address) return notice("Waiting for your Arc wallet connection.");
  if (!key) return notice("Wallet signing is unavailable. The deployment needs its Circle web client key.");
  if (navigator.locks) {
    return navigator.locks.request(opKey(), { ifAvailable: true }, (lock) =>
      lock
        ? submit(type, calls)
        : notice("A wallet transaction is already open in another tab."),
    );
  }
  return submit(type, calls);
}
async function submit(type, calls) {
  if (working) return;
  working = true;
  updateApproval();
  try {
    const pending = JSON.parse(localStorage.getItem(opKey()));
    if (pending) {
      notice("Checking the previously submitted operation…");
      await confirmed(
        await waitEscrowOperation(key, pending.hash),
        pending.type,
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
      localStorage.setItem(opKey(), JSON.stringify({ type, hash }));
      notice("Submitted to Arc. Waiting for confirmation…");
    });
    await confirmed(receipt, type);
  } catch (e) {
    const feeError = /prefund|insufficient funds|AA21/i.test((e.shortMessage || "") + " " + (e.message || ""));
    if (localStorage.getItem(opKey())) notice("Submitted. Reopen Arc orders to check the pending operation.");
    else if (feeError) {
      if (type === "plan" && funds) gasShortfall = { balance: funds.wallet, deposit: calls[0].value };
      notice(type === "plan" ? "Arc needs more test USDC for this authorization." : "Your wallet needs test USDC for the network fee. Open Budget for the funding address.");
    } else notice((e.shortMessage || e.message || "The transaction was not completed.").slice(0, 360));
  } finally {
    working = false;
    updateApproval();
  }
}
function terms(form) {
  return call(
    "configure",
    [parseEther(form.elements.limit.value)],
    parseEther(form.elements.deposit.value),
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
    const before = draft.lines.map(offerFor);
    await updateFee();
    if (JSON.stringify(before)!==JSON.stringify(draft.lines.map(offerFor))) {
      showDraft(); return notice("Supplier pricing changed. Review the updated offer before authorizing.");
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const calls = [
    terms(f),
    ...draft.lines.flatMap((l) => {
      const offer = offerFor(l);
      const plan = call("plan", [
        l.salt,
        stringToHex(l.series, { size: 32 }),
        Math.round(l.quantity * 1000),
        l.cap,
        BigInt(signedCutoff(l, f.elements.shortWindow.checked, now)),
        Number(f.elements.threshold.value),
        f.elements.recording.checked,
      ]);
      return offer.feeMicros ? [plan,call("selectBase",[l.salt,offer.price,BigInt(offer.feeMicros)])] : [plan];
    }),
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
  transact("budget", [terms(e.target)]);
};
$("withdraw").onclick = () => {
  if (
    funds?.free > 0n &&
    confirm(
      "Return " + amount(funds.free) + " test USDC from escrow to your wallet?",
    )
  )
    transact("withdraw", [call("withdraw", [funds.free])]);
};
$("orderList").onclick = (e) => {
  const b = e.target.closest("button");
  if (b?.dataset.change) {
    editingId = b.dataset.change;
    $("thresholdForm").elements.value.value = b.dataset.value;
    preview();
    $("editThreshold").showModal();
  }
  if (b?.dataset.chat) {
    const { o, asset, assessment, live, recording } = orders.get(b.dataset.chat);
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
      terms: "Your early-order threshold is " + o.threshold + "% and your maximum unit price is " + usd(o.capCents) + ".",
    };
    sessionStorage.setItem(
      "forestock.arcTalk",
      JSON.stringify({
        id: b.dataset.chat,
        facts,
        context: "Arc Testnet, passkey-authorized order for " + o.quantityMilli / 1000 + " " +
          (asset?.unit || "units") + " of " + name + ". Onchain status: " + status + ". " +
          (assessment?.reason || "") + (o.allowRecording ? " Dated forecasts are allowed." : " Only live forecasts are allowed.") +
          " While watching, the agent checks for an eligible forecast. At cutoff it can reserve funds without a forecast if supplier and spending limits still allow it. The test supplier receives payment only after a confirmed hold and settlement.",
        draft: {
          series,
          quantity: o.quantityMilli / 1000,
          allowance: Number(formatEther(funds.limit)),
        },
      }),
    );
    openStep("/?plan=arc&talk=1");
  }
  if (b?.dataset.cancel && confirm("Cancel this authorized need on Arc?"))
    transact("cancel", [call("cancel", [b.dataset.cancel])]);
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
    funds,
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
  transact("threshold", [
    call("changeThreshold", [editingId, e.target.elements.value.valueAsNumber]),
  ]);
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
  renderMarkets();
  if (
    network.chainId !== 5042002 ||
    !isAddress(network.escrow || "") ||
    (await client.getChainId()) !== network.chainId
  )
    throw Error("Arc escrow configuration is unavailable.");
  const desk = new URLSearchParams(location.search).get("desk");
  if (desk === "routed" || desk === "original") sessionStorage.setItem(routeKey,desk);
  routed = network.routed && sessionStorage.getItem(routeKey)==="routed";
  address = routed ? network.routed.escrow : network.escrow;
  if (network.routed) {
    $("deskSwitch").hidden = false;
    $("deskLink").href = routed ? "/arc.html?desk=original" : "/arc.html?desk=routed";
    $("deskLink").textContent = routed ? "Return to Arc-only orders" : "Compare Arc and Base suppliers";
    $("deskNote").textContent = routed ? "Cross-chain orders use a separate escrow and weekly cap." : "";
  }
  if (routed) {
    baseSupplier = await read("baseSupplier");
    try {
      const data = await (await fetch("/base-offers.json")).json();
      book = await verifiedBook(data,baseSupplier,address);
    } catch { book = null; }
    await updateFee();
  }
  key = walletConfig.clientKey;
  if (localStorage.getItem(opKey())) await transact("resume", []);
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
