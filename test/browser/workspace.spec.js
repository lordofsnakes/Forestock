import { test, expect } from "@playwright/test";
import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("public/commodities.json"));
async function send(page, text) {
  await page.getByRole("textbox", { name: "Your message" }).fill(text);
  await button(page, "Send").click();
}
async function start(page, asset = "COPPER") {
  await page.goto("/");
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await button(page, data.assets.find(a => a.series === asset).name).click();
  await finishSetup(page);
}
async function finishSetup(page) {
  await expect(page.getByRole("heading", { name: "Plan an order" })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeHidden();
  if (await button(page, "Copper").isVisible()) {
    await button(page, "Copper").click();
  }
  if (await page.locator("#suggestions button").filter({ hasText: /^\d+ (lb|MMBtu|bbl|troy oz)$/ }).isVisible()) {
    await page.locator("#suggestions button").first().click();
  }
  await page.locator("#suggestions button").filter({ hasText: "USDC" }).click();
  await button(page, "Review order").click();
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/market", (route) => route.fulfill({ json: data }));
});
test("all six materials have units, editable quantities and persistent supplier terms", async ({
  page,
}) => {
  await start(page, "NGAS");
  for (const [series, unit] of [
    ["XAU", "troy oz"],
    ["BRENT", "bbl"],
    ["WTI", "bbl"],
    ["NGAS", "MMBtu"],
    ["XAG", "troy oz"],
    ["COPPER", "lb"],
  ]) {
    await button(page, "Edit need").click();
    await page.locator("#editor select").selectOption(series);
    await page.locator('[name="qty"]').fill("2");
    await page.locator('[name="notes"]').fill("Morning delivery");
    await button(page, "Save need").click();
    await expect(page.locator(".order-summary")).toContainText("2 " + unit);
  }
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await finishSetup(page);
  await expect(
    page.getByText("Morning delivery", { exact: true }),
  ).toBeVisible();
  await page.getByText("Order details", { exact: true }).click();
  await expect(page.getByText("$5.80 / lb")).toBeVisible();
});
test("a paused allowance blocks purchase; a resumed order can be declined and refunded", async ({
  page,
}) => {
  await start(page);
  await button(page, "Budget").click();
  await button(page, "Pause").click();
  await button(page, "Orders").click();
  await button(page, "Run decision").click();
  await expect(
    page.getByText("Your purchasing allowance is paused."),
  ).toBeVisible();
  await button(page, "Budget").click();
  await button(page, "Resume").click();
  await page.locator("#limit").fill("590");
  await button(page, "Save allowance").click();
  await button(page, "Orders").click();
  await page.getByText("Try deadline scenario").click();
  await button(page, "Run at cutoff").click();
  await expect(page.getByRole("heading", { name: "Funds held" })).toBeVisible();
  await button(page, "Budget").click();
  await expect(page.locator(".big")).toHaveText("$584.20");
  await button(page, "Orders").click();
  await button(page, "Decline").click();
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await finishSetup(page);
  await expect(
    page.getByRole("heading", { name: "Funds returned" }),
  ).toBeVisible();
  await button(page, "Budget").click();
  await expect(page.locator(".big")).toHaveText("$590.00");
  await button(page, "Activity").click();
  await expect(page.getByRole("heading", { name: "Refunded" })).toBeVisible();
});
test("upstream failure displays dated replay and commodity-specific thresholds", async ({
  page,
}) => {
  await page.route("**/api/market", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await start(page, "XAG");
  await page.getByText("Gemini forecast · Recorded replay").click();
  await expect(page.getByText(/Silver price on/)).toBeVisible();
});
test("live data advances an eligible order and supplier acceptance persists", async ({
  page,
}) => {
  const copper = structuredClone(
    data.assets.find((a) => a.series === "COPPER"),
  );
  copper.market = {
    ...copper.market,
    observed: new Date().toISOString(),
    expiry: new Date(Date.now() + 3600000).toISOString(),
    contracts: [{ strike: 5.7, bid: 0.75, ask: 0.79 }],
  };
  await page.route("**/api/market", (r) =>
    r.fulfill({ json: { assets: [copper] } }),
  );
  await start(page);
  await expect(
    page.getByRole("heading", { name: "Ready to order" }),
  ).toBeVisible();
  await button(page, "Run decision").click();
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await expect(page.getByRole("log")).toContainText("is held");
  await finishSetup(page);
  await button(page, "Accept order").click();
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await finishSetup(page);
  await expect(
    page.getByRole("heading", { name: "Supplier receipt" }),
  ).toBeVisible();
  await button(page, "Budget").click();
  await expect(page.locator(".big")).toHaveText("$594.20");
});
test("legacy orders require onboarding; mascot respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  const bird = button(page, "Animate the copper-winged sparrow");
  await bird.focus();
  await page.keyboard.press("Enter");
  await expect(bird.locator("span")).toHaveCSS("animation-name", "none");
  await page.evaluate(() =>
    localStorage.setItem(
      "forestock.v1",
      JSON.stringify({
        week: 0,
        limit: 60000,
        balance: 100000,
        used: 0,
        order: {
          qty: 7,
          cap: 600,
          due: Date.now() + 172800000,
          notes: "Existing order",
          status: "Watching",
        },
        activity: [],
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await expect(page.locator(".message").last()).toHaveCSS("animation-name", "none");
  await button(page, "Copper").click();
  await button(page, "Keep 7 lb").click();
  await finishSetup(page);
  await expect(page.locator(".order-summary")).toContainText("7 lb");
  await expect(page.locator("#welcome")).toBeHidden();
});
test("home-screen metadata and public receipts are reachable from the phone layout", async ({
  page,
  request,
}) => {
  await start(page);
  const manifest = await (await request.get("/manifest.json")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  const icon = await request.get(
    await page.locator("link[rel=apple-touch-icon]").getAttribute("href"),
  );
  expect(icon.ok()).toBeTruthy();
  expect(icon.headers()["content-type"]).toBe("image/png");
  await button(page, "Activity").click();
  for (const name of ["hold", "payout", "refund"])
    await expect(
      page.getByRole("link", { name: new RegExp("View " + name) }),
    ).toHaveAttribute(
      "href",
      /^https:\/\/testnet\.arcscan\.app\/tx\/0x[0-9a-f]{64}$/,
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("AI questions retain context, corrections update the draft and confirmation opens the order", async ({ page }) => {
  const requests = [];
  await page.route("**/api/chat", route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const draft = { series: "COPPER", quantity: requests.length === 3 ? 35 : 25, allowance: 150 };
    return route.fulfill({ json: { reply: ["Shall we review?", "Your allowance is a weekly cap.", "Updated to 35 pounds."][requests.length - 1], draft } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await send(page, "Our shop needs twenty-five pounds of copper. Set aside $150 each week.");
  await expect(page.locator(".draft-terms")).toContainText("25 lb of Copper");
  await send(page, "How does that cap work?");
  await expect(page.getByRole("log")).toContainText("weekly cap");
  await send(page, "Actually make that thirty-five pounds.");
  await expect(page.locator(".draft-terms")).toContainText("35 lb of Copper");
  expect(requests[2].draft.quantity).toBe(25);
  expect(requests[2].messages.some(m => m.content.includes("weekly cap"))).toBe(true);
  await button(page, "Review order").click();
  await expect(page.locator(".order-summary")).toContainText("35 lb");
  await button(page, "Budget").click();
  await expect(page.locator(".big")).toHaveText("$150.00");
});

test("AI outage keeps the message available for retry and quick replies still work", async ({ page }) => {
  await page.route("**/api/chat", r => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await send(page, "What is a weekly allowance?");
  await expect(page.getByRole("log")).toContainText("couldn’t reach AI chat");
  await expect(page.getByRole("textbox")).toHaveValue("What is a weekly allowance?");
  await finishSetup(page);
  await expect(page.locator(".order-summary")).toContainText("1 lb");
});

test("multiple needs survive a reload and settle against one shared balance", async ({ page }) => {
  await start(page);
  await button(page, "Add need").click();
  await page.locator("#editor select").selectOption("NGAS");
  await page.locator("#editor [name=qty]").fill("1");
  await button(page, "Save need").click();
  await expect(page.locator(".need-entry")).toHaveCount(2);
  async function hold() {
    const cutoff = button(page, "Run at cutoff");
    if (!await cutoff.isVisible()) await page.getByText("Try deadline scenario").click();
    await cutoff.click();
  }
  await hold();
  await page.getByRole("button", { name: /Copper · 1 lb/ }).click();
  await hold();
  await button(page, "Budget").click();
  const held = 580 + data.assets.find(a => a.series === "NGAS").price;
  await expect(page.locator(".row").filter({ hasText: "Funds held" })).toContainText((held / 100).toFixed(2));
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await button(page, "Continue with demo balance").click();
  await finishSetup(page);
  await button(page, "Decline").click();
  await expect(page.locator(".needs-overview > .need-entry")).toHaveCount(1);
  await page.getByRole("button", { name: /Natural Gas · 1 MMBtu/ }).click();
  await button(page, "Accept order").click();
  await expect(page.getByText("No active needs.", { exact: true })).toBeVisible();
  await button(page, "Budget").click();
  await expect(page.locator(".row").filter({ hasText: "Funds held" })).toContainText("$0.00");
});

test("the sparrow flies from the conversation to the reviewed orders", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(button(page, "Continue with demo balance")).toBeHidden();
  await button(page, "Manual setup").click();
  await button(page, "Continue with demo balance").click();
  const wing = await page.locator(".courier-wing").elementHandle();
  const beforeSwap = await wing.evaluate(node => node.getAnimations()[0].currentTime);
  await page.waitForFunction(() => !document.querySelector("#welcome").hidden);
  const afterSwap = await wing.evaluate(node => ({ attached: node.isConnected, time: node.getAnimations()[0].currentTime }));
  expect(afterSwap.attached).toBe(true);
  expect(afterSwap.time).toBeGreaterThan(beforeSwap);
  await button(page, "Natural Gas").click();
  await button(page, "1 MMBtu").click();
  await button(page, "600 USDC").click();
  await button(page, "Review order").click();
  await expect(page.locator(".courier")).toBeAttached();
  await expect(page.getByRole("heading", { name: "Active needs" })).toBeFocused();
  await expect(page.locator(".courier")).toHaveCount(0);
  await expect(page.locator(".need-entry")).toHaveCount(1);
});

test("a returning buyer can clarify a mixed-material request and review all three needs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, "NGAS");
  await page.reload();
  await button(page, "Manual setup").click();
  await button(page, "Continue with demo balance").click();
  const log = page.getByRole("log");
  await expect(log).toContainText("You last chose Natural Gas");
  const additional = [
    { label: "oil", series: null, quantity: null },
    { label: "gold", series: "XAU", quantity: null },
  ];
  const initial = { series: "COPPER", quantity: null, allowance: null, additional };
  let turn = 0;
  await page.route("**/api/chat", route => {
    const request = route.request().postDataJSON();
    expect(request.catalog.map(a => a.series)).toEqual(expect.arrayContaining(["COPPER", "XAU", "BRENT", "WTI"]));
    if (++turn === 1) return route.fulfill({ json: { draft: initial, reply: "Copper starts at 1 lb. Did you mean 100 mg? I also have oil and gold on your list." } });
    expect(request.draft).toEqual(initial);
    return route.fulfill({ json: { reply: "I’ve filled in all three needs.", draft: {
      series: "COPPER", quantity: 1, allowance: 3000, dueDate: "2027-02-05",
      additional: [{ ...additional[0], series: "BRENT", quantity: 2 }, { ...additional[1], quantity: 3 }],
    } } });
  });
  await send(page, "I need 100mg of copper by the end of this week, and also a bit of oil and gold as well");
  await expect(log.locator(".helper").last().locator(".sr-only")).toContainText("Sparrow:");
  await page.getByText("Your draft", { exact: true }).click();
  await expect(page.locator("#draftNeeds")).toHaveText("Copper\noil\nGold");
  await expect(button(page, "Review order")).toHaveCount(0);
  await send(page, "Make it 1 lb copper by February 5 2027, 2 bbl Brent and 3 troy oz gold. 3000 USDC/week.");
  await button(page, "Review order").click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("forestock.v1")));
  expect(state.orders.map(o => [o.asset.series, o.qty])).toEqual([["NGAS", 1], ["COPPER", 1], ["BRENT", 2], ["XAU", 3]]);
  const date = await page.evaluate(() => new Date("2027-02-05T23:59:00").getTime());
  expect(state.orders[1].due).toBe(date);
  expect(state.limit).toBe(300000);
});

test("the sparrow's beak follows the visible words of an AI reply and rests afterward", async ({ page }) => {
  const reply = "I have your copper request. When should it arrive?";
  await page.route("**/api/chat", route => route.fulfill({ json: {
    reply, draft: { series: "COPPER", quantity: 25, allowance: null },
  } }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await button(page, "Manual setup").click();
  await button(page, "Continue with demo balance").click();
  await expect(page.locator(".portrait.speaking")).toBeVisible();
  await send(page, "I need 25 lb of copper");
  const last = page.locator("#messages .helper").last();
  await expect(last.locator(".sr-only")).toHaveText("Sparrow: " + reply);
  await expect(last.locator(".spoken-word").first()).toBeVisible();
  const gap = await last.evaluate(line => {
    const bird = line.querySelector(".portrait").getBoundingClientRect();
    const word = line.querySelector(".spoken-word").getBoundingClientRect();
    return { x: word.left - (bird.left + bird.width * .87), y: word.top + word.height / 2 - (bird.top + bird.height * .20) };
  });
  expect(Math.abs(gap.x)).toBeLessThan(12);
  expect(Math.abs(gap.y)).toBeLessThan(12);
  const motion = await page.locator(".lower-bill").evaluate(el => el.getAnimations().map(a => a.effect.getKeyframes()));
  expect(motion.flat().some(frame => frame.transform === "rotate(22deg)")).toBe(true);
  await expect(page.locator(".portrait.speaking")).toHaveCount(0);
  await expect(last.locator(".speech")).toHaveText(reply);
  await expect(page.locator(".lower-bill")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await send(page, "Can you repeat that?");
  await expect(page.locator(".helper")).toHaveCount(3);
  await expect(page.locator(".helper").last().locator(".speech")).toHaveText(reply);
  await expect(page.locator(".portrait.speaking, .spoken-word")).toHaveCount(0);
});


test("a commodity above the available demo budget has no suggested purchase quantity", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await button(page, "Manual setup").click();
  await button(page, "Continue with demo balance").click();
  await button(page, "Gold").click();
  await expect(page.locator("#suggestions")).toContainText("Your demo spending balance is 600.00 USDC");
  await expect(button(page, "1 troy oz")).toHaveCount(0);
});

test("a partial live response replays the matching copper quote through to a receipt", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const copper = data.assets.find(a => a.series === "COPPER");
  await page.route("**/api/market", route => route.fulfill({ json: { assets: [{ ...copper, market: null }] } }));
  await start(page);
  await expect(page.locator(".order-status")).toContainText("70%");
  await expect(page.locator(".order-status")).toContainText("Recorded forecast from");
  await button(page, "Run decision").click();
  await expect(page.getByRole("heading", { name: "Funds held" })).toBeVisible();
  await button(page, "Accept order").click();
  await expect(page.getByRole("heading", { name: "Supplier receipt" })).toBeVisible();
  await expect(page.locator(".order-status")).toContainText("Used forecast recorded");
  await button(page, "Activity").click();
  const buy = page.locator(".log").filter({ has: page.getByRole("heading", { name: "Buy", exact: true }) });
  await expect(buy).toContainText("Recorded forecast from");
  await expect(buy).toContainText("Held $5.80");
});

test("a buyer can switch a waiting live copper order to the dated recording and back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const copper = structuredClone(data.assets.find(a => a.series === "COPPER"));
  copper.market.observed = new Date().toISOString();
  copper.market.expiry = new Date(Date.now() + 3600000).toISOString();
  copper.market.contracts = [{ strike: 5.7, bid: .40, ask: .44 }];
  await page.route("**/api/market", route => route.fulfill({ json: { assets: [copper] } }));
  await start(page);
  await expect(page.locator(".order-status")).toContainText("42%");
  await button(page, "Use recorded forecast").click();
  await expect(page.locator(".order-status")).toContainText("70%");
  await button(page, "Use live forecast").click();
  await expect(page.locator(".order-status")).toContainText("42%");
});

test("bottom tabs slide in the selected direction and rapid switches leave one active page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  const main = page.locator("#app");
  await button(page, "Budget").click();
  expect(await main.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Inspect immediately in the same task, before animation frames are consumed.
  const moves = await page.evaluate(() => ["Activity", "Budget", "Orders"].map(name => {
    document.querySelector('[data-tab="' + name + '"]').click();
    return document.querySelector("#app").getAnimations()[0].effect.getKeyframes()[0].transform;
  }));
  expect(moves[0]).toMatch(/^translateX\(\d/);
  expect(moves.slice(1).every(value => value.startsWith("translateX(-"))).toBe(true);
  await expect(page.locator(".departing-tab")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Active needs" })).toBeVisible();
  await expect(button(page, "Orders")).toHaveAttribute("aria-current", "page");
});
