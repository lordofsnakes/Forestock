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
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: "Edit need" }).click();
  await page.locator('[name="qty"]').fill("50");
  await page.getByText("Save need", { exact: true }).click();
  await page.getByText("Try deadline scenario").click();
  await page.getByText("Run at cutoff").click();
  await page.getByText("Accept order").click();
  await page.reload();
  await page.getByRole("button", { name: "Next", exact: true }).click();
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
