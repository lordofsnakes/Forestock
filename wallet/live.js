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
import { hop, landOnArcReview } from "../public/onboarding-motion.js";
import { sparrowSpeech } from "../public/sparrow-speech.js";
import { arcTestnet } from "viem/chains";
import { liveAbi as abi } from "../lib/live-abi.js";
import { liveDecision } from "../lib/live-decision.js";
import { totalCents } from "../public/decision.js";
import {
  sendEscrowCalls,
  waitEscrowOperation,
} from "../public/generated/circle.js";

const $ = (id) => document.getElementById(id);
const buyer = localStorage.getItem("forestock.arcWallet");
const client = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
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

async function blockReceipt(id, block, eventName) {
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
          eventName === "Held" ? "Escrow hold" : "Settlement",
        ) + (logs[0].args.recorded ? " · recorded forecast" : ""),
      );
  }
  return receipts.get(k) || "";
}
const guide = sparrowSpeech($("review"), $("guideMessage"));
let spoken, gasShortfall;
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
  const input = f.elements.deposit;
  const valid = input.validity.valid;
  const deposit = valid ? parseEther(input.value) : 0n;
  const feeShort = gasShortfall?.balance === funds.wallet && gasShortfall?.deposit === deposit;
  const needsFunds = valid && (funds.wallet <= deposit || feeShort);
  $("authorize").disabled = !valid || needsFunds || working;
  $("fundingHelp").hidden = !needsFunds;
  $("depositSummary").textContent = valid ? amount(deposit) + " test USDC" : "Choose a deposit";
  $("termsSummary").textContent = f.elements.limit.value + " USDC/week · " + f.elements.threshold.value + "%";
  if (needsFunds) {
    $("fundingReason").textContent = "Your wallet has " + amount(funds.wallet) + " test USDC. " +
      (funds.wallet < deposit ? "The deposit needs " + amount(deposit) + ", plus the network fee." :
        feeShort ? "Arc reported insufficient funds for the network fee. Add funds or lower the deposit." :
        "Leave some test USDC in your wallet for the network fee.");
    say("Your draft is saved. Add test USDC to your wallet, then I can help you authorize this order.");
  } else if (valid) {
    say("Review your limits, then use your passkey to let me watch for the right time to buy.");
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
  let cost = 0n;
  $("lines").innerHTML = draft.lines
    .map((line) => {
      const cents = totalCents(line.quantity, line.price);
      cost += BigInt(cents) * 10n ** 16n;
      return (
        "<p><strong>" +
        escape(line.name) +
        "</strong> · " +
        escape(line.quantity + " " + line.unit) +
        " · " +
        usd(cents) +
        "<br>Maximum unit price " +
        usd(line.cap) +
        " · order by " +
        date(line.orderBy) +
        "</p>"
      );
    })
    .join("");
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
  const asset = archived || live;
  const status = [
    "",
    "Watching",
    "Funds held",
    "Supplier paid",
    "Refunded",
    "Cancelled",
  ][o.status];
  const assessment =
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
  orders.set(id, {
    o,
    asset,
    live: live?.market,
    recording: archived?.market,
    assessment,
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
    planReceipt(id),
    blockReceipt(id, o.holdBlock, "Held"),
    blockReceipt(id, o.settlementBlock, "Settled"),
  ]);
  return (
    "<article><h3>" +
    escape(asset?.name || series) +
    " · " +
    escape(status) +
    "</h3><p>" +
    o.quantityMilli / 1000 +
    " " +
    escape(asset?.unit || "units") +
    (o.amount ? " · " + amount(o.amount) + " test USDC" : "") +
    "</p>" +
    body +
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
    if ($("notice").textContent === "Reading your escrow on Arc…") notice("");
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
    if (!$("manage").open) $("fund").elements.limit.value = formatEther(limit);
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
      cards.join("") || "<p>Your authorized orders will appear here.</p>";
    $("events").innerHTML =
      ids
        .filter((id) => planReceipt(id) || receipts.has(id + "Held"))
        .map(
          (id) =>
            "<p><strong>" +
            escape(orders.get(id).asset?.name || "Order") +
            "</strong> · " +
            [
              planReceipt(id),
              receipts.get(id + "Held"),
              receipts.get(id + "Settled"),
            ]
              .filter(Boolean)
              .join(" · ") +
            "</p>",
        )
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
    showView(view);
  }
  localStorage.removeItem(opKey());
  if (!receipt.success || receipt.receipt.status !== "success")
    throw Error(
      "Arc reported a failed operation. Check your balance and order terms.",
    );
  $("notice").innerHTML =
    "Confirmed on Arc. " +
    link(receipt.receipt.transactionHash, "View your transaction");
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
    if (localStorage.getItem(opKey())) notice("Submitted. Refresh this page to check the pending operation.");
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
$("approve").onsubmit = (e) => {
  e.preventDefault();
  if (!draft || !funds) return;
  const f = e.target;
  if (draft.lines.some((l) => l.orderBy * 1000 <= Date.now()))
    return notice(
      "This delivery date is too soon. Discard this draft and choose a later date.",
    );
  const calls = [
    terms(f),
    ...draft.lines.map((l) =>
      call("plan", [
        l.salt,
        stringToHex(l.series, { size: 32 }),
        Math.round(l.quantity * 1000),
        l.cap,
        BigInt(l.orderBy),
        Number(f.elements.threshold.value),
        f.elements.recording.checked,
      ]),
    ),
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
    const { o, asset, assessment } = orders.get(b.dataset.chat);
    const series = hexToString(o.series, { size: 32 });
    const marketQuote = assessment?.contract
      ? (assessment.recorded ? "Recorded" : "Live") +
        " forecast from " +
        date(Date.parse(assessment.observed) / 1000) +
        ". " +
        assessment.reason
      : "There is no timing quote attached to this assessment.";
    const impact =
      assessment?.reason ||
      "Arc reports this order as " +
        ["", "watching", "held", "paid", "refunded", "cancelled"][o.status] +
        ".";
    sessionStorage.setItem(
      "forestock.arcTalk",
      JSON.stringify({
        id: b.dataset.chat,
        facts: { quote: marketQuote, impact },
        context:
          "Arc Testnet order: " +
          o.quantityMilli / 1000 +
          " " +
          (asset?.unit || "units") +
          " of " +
          series +
          ". " +
          impact,
        draft: {
          series,
          quantity: o.quantityMilli / 1000,
          allowance: Number(formatEther(funds.limit)),
        },
      }),
    );
    location.assign("/?plan=arc&talk=1");
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
  if (
    network.chainId !== 5042002 ||
    !isAddress(network.escrow || "") ||
    (await client.getChainId()) !== network.chainId
  )
    throw Error("Arc escrow configuration is unavailable.");
  address = network.escrow;
  key = walletConfig.clientKey;
  catalog = materials.assets;
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
