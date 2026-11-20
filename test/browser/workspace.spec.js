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
  await expect(page.locator(".big")).toHaveText("$10.00");
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
  await expect(page.locator(".big")).toHaveText("$20.00");
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
  await expect(page.locator(".order-summary")).toContainText("100 lb");
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
  await page.getByRole("button", { name: /Copper · 100 lb/ }).click();
  await hold();
  await button(page, "Budget").click();
  const held = 58000 + data.assets.find(a => a.series === "NGAS").price;
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

test("the sparrow carries the buyer’s completed slip into the orders screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(button(page, "Continue with demo balance")).toBeHidden();
  await button(page, "Manual setup").click();
  await button(page, "Continue with demo balance").click();
  await expect(page.locator(".courier")).toBeAttached();
  await button(page, "Natural Gas").click();
  await button(page, "100 MMBtu").click();
  await button(page, "600 USDC").click();
  await button(page, "Review order").click();
  await expect(page.locator(".courier-slip")).toContainText("100 MMBtu of Natural Gas");
  await expect(page.getByRole("heading", { name: "Active needs" })).toBeFocused();
  await expect(page.locator(".courier")).toHaveCount(0);
  await expect(page.locator(".need-entry")).toHaveCount(1);
});
