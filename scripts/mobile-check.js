import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.APP_URL || "http://localhost:3000");
  await page.getByRole("button", { name: "Manual setup" }).click();
  await page.getByRole("button", { name: "Continue with demo balance" }).click();
  await page
    .getByRole("heading", { name: "Plan an order" })
    .waitFor();
  await page
    .getByRole("button", { name: "Animate the copper-winged sparrow" })
    .click();
  assert.equal(
    await page
      .locator(".portrait")
      .evaluate((b) => b.classList.contains("flying")),
    true,
  );
  await page.getByRole("button", { name: "Copper", exact: true }).click();
  await page.getByRole("button", { name: "1 lb", exact: true }).click();
  await page.getByRole("button", { name: "600 USDC", exact: true }).click();
  await page.getByRole("button", { name: "Review order" }).click();
  const threshold = page.getByRole("button", { name: /Early-order threshold/ });
  assert.match(await threshold.innerText(), /50%/);
  await threshold.click();
  await page.getByLabel("Minimum market probability").fill("40");
  await page.getByRole("button", { name: "Save threshold" }).click();
  assert.match(await threshold.innerText(), /40%/);
  await page.getByRole("button", { name: "Edit need" }).click();
  await page.locator('[name="qty"]').fill("50");
  await page.getByText("Save need", { exact: true }).click();
  await page.getByText("What happens at the order deadline?").click();
  await page.getByText("the demo will reserve $290.00", { exact: false }).waitFor();
  await page.getByText("Simulate ordering at the deadline").click();
  await page.getByText("Accept order").click();
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await page.getByRole("button", { name: "Continue with demo balance" }).click();
  await page.getByRole("button", { name: "600 USDC", exact: true }).click();
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("heading", { name: "Supplier receipt" }).waitFor();
  await page.getByRole("button", { name: /Budget/ }).click();
  assert.equal(await page.locator(".big").innerText(), "$310.00");
  await page.getByRole("button", { name: /Activity/ }).click();
  await page.getByRole("link", { name: /View refund/ }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Mobile order, hold, payout, persistence, budget and receipt links passed.",
  );
} finally {
  await browser.close();
}
