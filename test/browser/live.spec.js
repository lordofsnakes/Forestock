import { test, expect } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseEther,
  toHex,
} from "viem";
import { orderId, relatedSalt } from "../../lib/purchase-sizing.js";
import { routeAbi } from "../../lib/routed-abi.js";
import { liveAbi } from "../../lib/live-abi.js";
import fs from "node:fs";
const abi = [...liveAbi,...routeAbi];
const network = JSON.parse(fs.readFileSync("public/arc-network.json"));
async function enterSavedOrders(page) {
  await page.goto("/arc.html");
  await expect(page.getByRole("heading", {name: "Let’s plan a purchase"})).toBeVisible();
  await expect(page.getByRole("link", {name: "Arc orders"})).toBeHidden();
  await page.getByRole("button", {name: "Continue to order planning"}).click();
  await page.getByRole("link", {name: "Arc orders"}).click();
  await expect(page).toHaveURL(/arc\.html$/);
}

async function mockArc(page, getBalance, reads = {}) {
  await page.route("https://rpc.testnet.arc.network/**", async (r) => {
    const req = r.request().postDataJSON();
    let result;
    if (req.method === "eth_chainId") result = toHex(5042002);
    if (req.method === "eth_getBlockByNumber")
      result = {
        number: "0x40",
        timestamp: toHex(Math.floor(Date.now() / 1000)),
        transactions: [],
      };
    if (req.method === "eth_getBalance") result = toHex(parseEther(getBalance()));
    if (req.method === "eth_call") {
      const { functionName, args } = decodeFunctionData({
        abi,
        data: req.params[0].data,
      });
      result = encodeFunctionResult({
        abi,
        functionName,
        result: typeof reads[functionName] === "function" ? reads[functionName](...args) : reads[functionName] ?? (functionName === "list" ? [] : 0n),
      });
    }
    return r.fulfill({ json: { jsonrpc: "2.0", id: req.id, result } });
  });
}

test("passkey review submits a funded Arc batch and links the confirmed transaction", async ({
  page,
}) => {
  const buyer = "0x" + "12".repeat(20),
    hash = "0x" + "ab".repeat(32);
  await page.addInitScript(
    ({ buyer }) => {
      localStorage.setItem("forestock.arcWallet", buyer);
      localStorage.setItem(
        "forestock.arcDraft." + buyer,
        JSON.stringify({
          allowance: 1,
          lines: [
            {
              series: "COPPER",
              name: "Copper",
              unit: "lb",
              quantity: 0.01,
              cap: 600,
              price: 580,
              salt: "0x" + "23".repeat(32),
              orderBy: Math.floor(Date.now() / 1000) + 86400,
            },
          ],
        }),
      );
    },
    { buyer },
  );
  await page.route("**/generated/wallet-config.json", r => r.fulfill({json:{clientKey:"test-client"}}));
  await page.route("**/api/market", (r) => r.fulfill({ json: { assets: [] } }));
  await page.route("**/generated/circle.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `let ready = false;
     export function hasWalletCredential() {return ready;}
     export async function connectWallet(key, register, expectedBuyer) {window.reconnected = expectedBuyer; ready = true;}
     export async function sendEscrowCalls(key, buyer, calls, submitted) {
       window.observedCalls = calls;
       submitted("0x" + "cd".repeat(32));
       return {success: true, receipt: {status: "success", transactionHash: "${hash}"}};
     }
     export function waitEscrowOperation() {}`,
    }),
  );
  let balance = "0";
  let escrow = "0";
  await mockArc(page, () => balance, {free: () => parseEther(escrow)});
  await enterSavedOrders(page);
  const authorize = page.locator("#authorize");
  await expect(page.locator("#fundingAddress")).toHaveText(buyer);
  await expect(authorize).toBeDisabled();
  await expect(page.getByRole("link", {name:"Open Circle faucet"})).toHaveAttribute("href","https://faucet.circle.com/");
  await expect(page.getByText("Deposit from your wallet", {exact:true})).toBeVisible();
  await expect(page.locator("#lines")).toContainText("Order by");
  await expect(page.locator("#depositHelp")).toContainText("This deposit covers the remaining 0.06 test USDC.");
  const recording = page.locator("#approve [name=recording]");
  await expect(recording).toBeHidden();
  await expect(recording).not.toBeChecked();
  await page.locator("#orderTerms summary").click();
  await expect(page.locator("#priceCaps")).toContainText("$6.00 / lb");
  await recording.check();
  await page.locator("#orderTerms summary").click();
  await expect(page.locator("#termsSummary")).toContainText("Dated forecast allowed");
  await page.locator("#orderTerms summary").click();
  await recording.uncheck();
  await page.getByLabel("Order within two minutes").check();
  await expect(page.locator("#lines")).toContainText("within 2 min");
  await page.locator("#approve [name=deposit]").fill("0");
  await expect(page.locator("#depositHelp")).toContainText("You still need 0.06 more test USDC");
  await expect(page.locator("#fundingReason")).toContainText("network fee");
  await expect(authorize).toBeDisabled();
  escrow = "0.06";
  await enterSavedOrders(page);
  await expect(page.locator("#depositSummary")).toHaveText("0 test USDC");
  await expect(page.locator("#depositHelp")).toContainText("Your escrow already covers this 0.06 test USDC order. Your wallet only pays the Arc network fee");
  await page.locator("#orderTerms summary").click();
  await page.getByLabel("Order within two minutes").check();
  await page.locator("#approve [name=deposit]").fill("0.06");
  balance = "1";
  await page.getByRole("button", {name:"Check balance"}).click();
  await expect(authorize).toBeEnabled();
  await expect(page.locator("#fundingHelp")).toBeHidden();
  await expect(page.locator("#approve [name=deposit]")).toHaveValue("0.06");
  await page.getByRole("button", {name: "Reconnect existing passkey"}).click();
  await expect(page.getByRole("button", {name:"Authorize with passkey"})).toBeEnabled();
  expect(await page.evaluate(() => window.reconnected)).toBe(buyer);
  expect(await page.evaluate(() => window.observedCalls)).toBeUndefined();
  await page.getByRole("button", { name: "Authorize with passkey" }).click();
  await expect(
    page.getByRole("link", { name: /View your transaction/ }),
  ).toHaveAttribute("href", "https://testnet.arcscan.app/tx/" + hash);
  const calls = await page.evaluate(() =>
    window.observedCalls.map((c) => ({ ...c, value: c.value.toString() })),
  );
  expect(calls.every((c) => c.to === network.escrow)).toBe(true);
  expect(calls[0].value).toBe(parseEther(".06").toString());
  expect(decodeFunctionData({ abi, data: calls[0].data }).args[0]).toBe(
    parseEther("1"),
  );
  const order = decodeFunctionData({ abi, data: calls[1].data });
  expect(order.functionName).toBe("plan");
  expect(order.args.at(-1)).toBe(false);
  const portions = calls.slice(1).map(c=>decodeFunctionData({abi,data:c.data}).args);
  expect(portions.map(p=>p[2])).toEqual([3,3,4]);
  expect(portions.map(p=>p[5])).toEqual([10,40,70]);
  expect(order.args[5]).toBe(10);
  const seconds = Number(order.args[4]) - Date.now()/1000;
  expect(seconds).toBeGreaterThan(105);
  expect(seconds).toBeLessThanOrEqual(120);
});

test("the sparrow flies from passkey planning into live order review", async ({page}) => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.addInitScript(() => localStorage.setItem("forestock.arcWallet", "0x" + "12".repeat(20)));
  await page.route("**/api/market", r => r.fulfill({json:{assets:[]}}));
  await page.goto("/?plan=arc");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("button", {name: "Continue to order planning"}).click();
  await expect(page.locator(".perch-bird.taking-off")).toBeAttached();
  await expect(page.locator(".courier-wing")).toBeVisible();
  await expect(page.getByRole("heading", {name: "Plan an order"})).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  for (const name of ["Copper","0.01 lb","1 USDC","Review order"]) {
    await page.getByRole("button",{name,exact:true}).click();
  }
  await expect(page.locator(".courier-wing")).toBeVisible();
  await expect(page).toHaveURL(/arc\.html$/);
  await expect(page.locator(".courier-wing")).toBeVisible();
  await expect(page.locator("#guide .portrait")).toBeVisible();
  await expect(page.locator(".courier")).toHaveCount(0);
  await page.locator("#guide .portrait").click();
  await expect(page.locator("#guide .portrait")).toHaveClass(/flying/);
});

test("live copper chat explains a waiting order and offers a different next question", async ({page}) => {
  await page.emulateMedia({reducedMotion: "reduce"});
  const buyer = "0x" + "12".repeat(20);
  const now = Date.now();
  const copper = JSON.parse(fs.readFileSync("public/commodities.json")).assets.find(a => a.series === "COPPER");
  copper.market = { ...copper.market, observed: new Date(now).toISOString(), expiry: new Date(now + 3600000).toISOString(),
    contracts: [{strike: 5.70, bid: .25, ask: .26}] };
  await page.addInitScript(buyer => localStorage.setItem("forestock.arcWallet", buyer), buyer);
  await page.route("**/api/market", route => route.fulfill({json: {assets: [copper]}}));
  await mockArc(page, () => "1", {
    list: ["0x" + "42".repeat(32)], weeklyLimit: parseEther("1"), free: parseEther("1"),
    order: {buyer, series: toHex("COPPER", {size: 32}), quantityMilli: 10, capCents: 601,
      orderBy: BigInt(Math.floor(now / 1000) + 86400), threshold: 50, allowRecording: false,
      status: 1, holdTime: 0n, holdBlock: 0n, settlementBlock: 0n, amount: 0n},
  });
  let turn;
  await page.route("**/api/chat", route => {
    turn = route.request().postDataJSON();
    return route.fulfill({json: {reply: "Your copper order stays open while the agent watches for a stronger signal."}});
  });
  await enterSavedOrders(page);
  const board = page.getByRole("region", {name:"Copper prediction market"});
  await expect(board).toContainText("Gemini · Live");
  await expect(board).toContainText("25.5%");
  await page.getByRole("button", {name: "Ask about this order"}).click();
  await expect(page.getByRole("log")).toContainText("25.5%");
  const ask = page.getByRole("button", {name: "How does this affect my order?"});
  await ask.click();
  await expect(page.getByRole("log")).toContainText("watches for a stronger signal");
  expect(turn.marketFacts.impact).toContain("stays open");
  expect(turn.marketFacts.deadline).toContain("order cutoff");
  expect(turn.marketContext).toContain("below your 50%");
  await expect(ask).toHaveCount(0);
  await expect(page.getByRole("button", {name: "What happens at the deadline?"})).toBeVisible();
});

test("fresh launches and reloads start at the sparrow, including saved chat links", async ({page}) => {
  await page.emulateMedia({reducedMotion: "reduce"});
  const buyer = "0x" + "12".repeat(20);
  await page.addInitScript(buyer => localStorage.setItem("forestock.arcWallet", buyer), buyer);
  await page.route("**/api/market", r => r.fulfill({json:{assets:[]}}));
  const welcome = page.getByRole("heading", {name: "Let’s plan a purchase"});
  await page.goto("/?plan=arc&talk=1");
  await expect(welcome).toBeVisible();
  await page.getByRole("button", {name:"Continue to order planning"}).click();
  await expect(page.getByRole("heading", {name:"Plan an order"})).toBeVisible();
  await page.reload();
  await expect(welcome).toBeVisible();
  await enterSavedOrders(page);
  await page.reload();
  await expect(welcome).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("forestock.arcWallet"))).toBe(buyer);
});

test("reopening a standalone app returns to onboarding", async ({page}) => {
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {value: true});
    localStorage.setItem("forestock.arcWallet", "0x" + "12".repeat(20));
  });
  await page.route("**/api/market", r => r.fulfill({json:{assets:[]}}));
  await page.goto("/");
  await page.getByRole("button", {name:"Continue to order planning"}).click();
  await expect(page.getByRole("heading", {name:"Plan an order"})).toBeVisible();
  await page.evaluate(() => {
    for (const hidden of [true, false]) {
      Object.defineProperty(document, "hidden", {value: hidden, configurable: true});
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await expect(page.getByRole("heading", {name: "Let’s plan a purchase"})).toBeVisible();
});

test("order filters show only the matching order’s market, purchases get icons, and sliders preview the budget", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  const buyer = "0x" + "12".repeat(20);
  const [paid, waiting, refunded] = ["10","20","30"].map(n => "0x" + n.repeat(32));
  await page.addInitScript(({buyer, refunded, escrow}) => {
    localStorage.setItem("forestock.arcWallet", buyer);
    localStorage.setItem("forestock.arcPlan." + escrow + "." + refunded, "0x" + "ab".repeat(32));
  }, {buyer, refunded, escrow:network.escrow});
  await page.route("**/api/market", r => r.fulfill({json:{assets:[]}}));
  await mockArc(page, () => "1", {
    list:[paid, waiting, refunded], weeklyLimit: parseEther("1"), free: parseEther(".5"),
    order: id => ({buyer, series:toHex(id === paid ? "XAU" : "COPPER", {size:32}), quantityMilli:10,
      capCents:600, orderBy:BigInt(Math.floor(Date.now()/1000)+86400), threshold:50, allowRecording:false,
      status:id === paid ? 3 : id === waiting ? 1 : 4, holdTime:0n, holdBlock:0n, settlementBlock:0n, amount:0n}),
  });
  await enterSavedOrders(page);
  const board = page.getByRole("region",{name:"Copper prediction market"});
  await expect(board).toBeVisible();
  await expect(board).toContainText("Gemini · Recorded");
  await expect(board).toContainText("Reference only");
  await page.getByRole("combobox",{name:"Material",exact:true}).selectOption("XAU");
  await page.getByRole("combobox",{name:"Status",exact:true}).selectOption("1");
  await expect(page.getByText("No orders match these filters.")).toBeVisible();
  await expect(board).toHaveCount(0);
  await page.getByRole("combobox",{name:"Status",exact:true}).selectOption("3");
  await expect(page.locator("#orderList article:visible")).toHaveCount(1);
  await expect(page.locator("#orderList article:visible")).toContainText("Gold");
  await page.getByRole("button",{name:"Activity",exact:true}).click();
  await expect(page.locator("#events .material-mark")).toHaveCount(1);
  await expect(page.locator("#events .receipt-line").filter({hasText:"Purchased"}).locator(".material-mark")).toHaveText("Au");
  await expect(page.locator("#events .receipt-line").filter({hasText:"Refunded"})).toBeVisible();
  await page.getByRole("button",{name:"Budget",exact:true}).click();
  await page.getByRole("slider",{name:"Adjust weekly cap"}).fill("2.75");
  await expect(page.locator("#fund [name=limit]")).toHaveValue("2.75");
  const deposit = page.getByRole("slider",{name:"Adjust escrow deposit"});
  await expect(deposit).toHaveAttribute("max","0.99");
  await page.locator("#fund [name=deposit]").fill("0.12");
  await expect(deposit).toHaveValue("0.12");
  await expect(page.locator("#balances")).toContainText(" / 1 test USDC");
  await page.getByRole("button",{name:"Orders",exact:true}).click();
  await expect(page.locator("#orderList article:visible")).toHaveCount(1);
  await expect(board).toHaveCount(0);
});

test("cross-chain review signs the cheaper delivered offer and the fee cap in one batch", async ({page}) => {
  const buyer = "0x"+"12".repeat(20);
  await page.addInitScript(buyer => {
    localStorage.setItem("forestock.arcWallet",buyer);
    localStorage.setItem("forestock.arcDraft."+buyer,JSON.stringify({allowance:1,lines:[
      {series:"COPPER",name:"Copper",unit:"lb",quantity:.1,price:580,cap:600,
       salt:"0x"+"23".repeat(32),orderBy:Math.floor(Date.now()/1000)+86400}]}));
  },buyer);
  await page.route("**/generated/wallet-config.json",r=>r.fulfill({json:{clientKey:"test-client"}}));
  await page.route("**/api/market",r=>r.fulfill({json:{assets:[]}}));
  await page.route("**/burn/USDC/fees/26/6?*",r=>r.fulfill({json:[{finalityThreshold:2000,minimumFee:0,forwardFee:{high:53000}}]}));
  await page.route("**/generated/circle.js",r=>r.fulfill({contentType:"application/javascript",body:
    'export function hasWalletCredential(){return true} export function connectWallet(){} export function waitEscrowOperation(){} export async function sendEscrowCalls(k,b,c){window.sent=c;return {success:true,receipt:{status:"success",transactionHash:"0x"+"ab".repeat(32)}}}'}));
  // Re-sign the test quote with a generated fixture so this test remains valid after production quotes expire.
  const {privateKeyToAccount,generatePrivateKey} = await import("viem/accounts");
  const supplier=privateKeyToAccount(generatePrivateKey());
  const terms={sourceChain:5042002,destinationChain:84532,escrow:network.routed.escrow,recipient:supplier.address,
    expires:Math.floor(Date.now()/1000)+172800,leadHours:24,stock:500,unitCents:{COPPER:464}};
  const signature=await supplier.signMessage({message:JSON.stringify(terms)});
  await page.route("**/base-offers.json",r=>r.fulfill({json:{terms,signature}}));
  await mockArc(page,()=>"2",{baseSupplier:supplier.address});
  await enterSavedOrders(page);
  await page.getByRole("link",{name:"Compare Arc and Base suppliers"}).click();
  await expect(page.locator("#lines")).toContainText("Base Sepolia");
  await page.locator("#orderTerms summary").click();
  await page.getByLabel("Let Sparrow buy in portions").uncheck();
  await expect(page.locator("#depositSummary")).toHaveText("0.52 test USDC");
  await page.getByRole("button",{name:"Authorize with passkey"}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.sent))).toBe(true);
  const calls=await page.evaluate(()=>window.sent.map(c=>({to:c.to,data:c.data})));
  expect(calls.every(c=>c.to===network.routed.escrow)).toBeTruthy();
  expect(calls.map(c=>decodeFunctionData({abi,data:c.data}).functionName)).toEqual(["configure","plan","selectBase"]);
  expect(decodeFunctionData({abi,data:calls[2].data}).args.slice(1)).toEqual([520,60000n]);
});

test("the sparrow dances only for eligible orders and forecast details stay with their order", async ({page}) => {
  const buyer = "0x" + "12".repeat(20);
  const [copper, gas] = ["34","56"].map(n => "0x" + n.repeat(32));
  const now = Date.now(), cutoff = BigInt(Math.floor(now/1000)+86400);
  const asset = JSON.parse(fs.readFileSync("public/commodities.json")).assets.find(a=>a.series==="COPPER");
  asset.market = {...asset.market, observed:new Date(now), expiry:new Date(now+3600000), contracts:[
    {strike:5.7,bid:.15,ask:.17},{strike:6,bid:.49,ask:.51}
  ]};
  await page.addInitScript(b=>localStorage.setItem("forestock.arcWallet",b),buyer);
  await page.route("**/api/market",r=>r.fulfill({json:{assets:[asset]}}));
  let free = parseEther("1"), gasCutoff = cutoff;
  await mockArc(page,()=>"1",{list:[copper,gas],weeklyLimit:parseEther("1"),free:()=>free,
    order:id=>({buyer,series:toHex(id===gas?"NGAS":"COPPER",{size:32}),quantityMilli:10,capCents:610,orderBy:id===gas?gasCutoff:cutoff,
      threshold:10,allowRecording:false,status:1,holdTime:0n,holdBlock:0n,settlementBlock:0n,amount:0n})});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await enterSavedOrders(page);
  const card=page.locator('[data-order="'+copper+'"]');
  const other=page.locator('[data-order="'+gas+'"]');
  await expect(other.getByRole("region",{name:"Natural Gas prediction market"})).toBeVisible();
  await expect(other.locator(".ready-dance")).toHaveCount(0);
  await expect(card.locator(".forecast-line")).toContainText("16%");
  const toggle=card.getByText("When will this buy?");
  await toggle.click();
  await expect(card.getByText(/reaches 10%/)).toBeVisible();
  await expect(card.getByText(/final 30 seconds/)).toBeVisible();
  const bird=card.locator(".order-bird span");
  await expect(bird).toHaveCSS("animation-name","sparrow-dance");
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(bird).toHaveCSS("animation-name","none");
  free=0n;
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await expect(card.locator(".ready-dance")).toHaveCount(0);
  await expect(card.getByText(/reaches 10%/)).toBeVisible();
  await expect(other.locator('[data-disclosure="rules"]')).not.toHaveAttribute("open","");
  free = parseEther("1");
  gasCutoff = BigInt(Math.floor(Date.now()/1000) + 25);
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await expect(other.locator(".ready-dance")).toBeVisible();
  await expect(other).toContainText("Final ordering window open");
  gasCutoff -= 60n;
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await expect(other.locator(".ready-dance")).toHaveCount(0);
  await expect(other).toContainText("deadline has passed");
});

test("typed planning can finish missing details and open live review without suggested replies", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  const buyer = "0x" + "12".repeat(20);
  await page.addInitScript(buyer => localStorage.setItem("forestock.arcWallet",buyer),buyer);
  await page.route("**/api/market",r=>r.fulfill({json:{assets:[]}}));
  await mockArc(page,()=>"1");
  let requests = 0;
  await page.route("**/api/chat", r => {
    requests++;
    return r.fulfill({json:{reply:"Which oil and how much should I include?",draft:{
      series:"COPPER",quantity:.02,allowance:null,additional:[{label:"oil",series:null,quantity:null,dateNote:"later next week"}]
    }}});
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Continue to order planning"}).click();
  const message = page.getByRole("textbox",{name:"Your message"});
  await message.fill("I need 0.02 lb of copper and some oil later next week");
  await message.press("Enter");
  const next = page.getByRole("button",{name:"Finish order details"});
  await next.click();
  const dialog = page.getByRole("dialog",{name:"Finish order details"});
  await expect(dialog.getByText("oil",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Continue to review"}).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Back to chat"}).click();
  await message.fill("next");
  await message.press("Enter");
  await dialog.getByLabel("Choose material").selectOption("BRENT");
  await dialog.getByLabel("Quantity (bbl)").fill("0.01");
  const delivery = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await dialog.getByLabel("Delivery date", {exact:false}).fill(delivery);
  await dialog.getByLabel("Weekly spending allowance (test USDC)").fill("2");
  await dialog.getByRole("button",{name:"Continue to review"}).click();
  await expect(page.getByRole("heading",{name:"Review your order"})).toBeVisible();
  await expect(page.locator("#lines li")).toHaveCount(2);
  await expect(page.locator("#lines li").first()).toContainText("0.02 lb");
  await expect(page.locator("#lines li").nth(1)).toContainText("Oil (Brent)");
  await expect(page.locator("#approve [name=limit]")).toHaveValue("2");
  expect(requests).toBe(1);
});

test("stock-up suggestions require a separate passkey and cannot compound", async ({page}) => {
  const buyer = "0x" + "12".repeat(20);
  const root = "0x" + "42".repeat(32);
  const salt = relatedSalt(root,"extra");
  const extra = orderId(buyer,salt);
  const now = Date.now();
  const orderBy = BigInt(Math.floor(now/1000) + 86400);
  const copper = JSON.parse(fs.readFileSync("public/commodities.json")).assets.find(a => a.series === "COPPER");
  const market = {series:"COPPER", observed:new Date(now).toISOString(), expiry:new Date(now+3600000).toISOString(),
    contracts:[{strike:5.7,bid:.78,ask:.80}]};
  await page.addInitScript(b => localStorage.setItem("forestock.arcWallet", b), buyer);
  await page.route("**/api/market", r => r.fulfill({json:{assets:[{...copper,market}]}}));
  await page.route("**/generated/wallet-config.json", r => r.fulfill({json:{clientKey:"test-client"}}));
  const submissions = [];
  await page.exposeFunction("recordExtra", data => submissions.push(data));
  await page.route("**/generated/circle.js", r => r.fulfill({contentType:"application/javascript",body:`
    export const hasWalletCredential = () => true;
    export function connectWallet() {}
    export function waitEscrowOperation() {}
    export async function sendEscrowCalls(key,buyer,calls,submitted) {
      await window.recordExtra(calls.map(c=>c.data));
      submitted("0x"+"cd".repeat(32));
      return {success:true,receipt:{status:"success",transactionHash:"0x"+"ab".repeat(32)}};
    }`}));
  await mockArc(page,()=>"1",{
    free:parseEther("2"), weeklyLimit:parseEther("2"),
    list:()=>submissions.length ? [root,extra] : [root],
    order:id=>({buyer,series:toHex("COPPER",{size:32}),quantityMilli:id===extra ? 25 : 100,
      capCents:id===extra ? copper.price : 601,orderBy,threshold:id===extra ? 70 : 10,
      allowRecording:false,status:1,holdTime:0n,holdBlock:0n,settlementBlock:0n,amount:0n}),
  });
  await enterSavedOrders(page);
  const review = page.getByRole("button",{name:"Review extra stock"});
  await review.click();
  const dialog = page.getByRole("dialog",{name:"Review extra stock"});
  await expect(dialog).toContainText("79%");
  await expect(dialog).toContainText("0.025 lb");
  await dialog.getByRole("button",{name:"Not now"}).click();
  expect(submissions).toHaveLength(0);
  await review.click();
  await dialog.getByRole("button",{name:"Approve extra with passkey"}).click();
  await expect(page.getByText("Buyer-approved extra stock")).toBeVisible();
  await expect(review).toHaveCount(0);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toHaveLength(1);
  expect(decodeFunctionData({abi,data:submissions[0][0]})).toMatchObject({
    functionName:"plan",args:[salt,toHex("COPPER",{size:32}),25,copper.price,orderBy,70,false],
  });
});
