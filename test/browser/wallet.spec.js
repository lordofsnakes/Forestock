import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("Circle SDK registers and restores a passkey-backed wallet", async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await session.send("WebAuthn.enable");
  await session.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true,
  } });
  await page.route("**/generated/wallet-config.json", route => route.fulfill({ json: { clientKey: "test-client" } }));
  const address = "0x0000000000000000000000000000000000000001";
  const challenge = randomBytes(32).toString("base64url");
  const methods = [];
  let publicKey;
  await page.route("https://modular-sdk.circle.com/**", route => {
    const { method, id, params } = route.request().postDataJSON();
    methods.push(method);
    let result;
    if (method === "rp_getRegistrationOptions") expect(params[0]).toMatch(/^[A-Za-z0-9_@.:+\-]{5,50}$/);
    if (method === "rp_getRegistrationOptions") result = {
      challenge, rp: { name: "Forestock", id: "localhost" },
      user: { id: challenge, name: params[0], displayName: "Buyer" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    };
    if (method === "rp_getRegistrationVerification") {
      publicKey = params[0].response.publicKey;
      result = {};
    }
    if (method === "rp_getLoginOptions") result = { challenge, rpId: "localhost", userVerification: "required" };
    if (method === "rp_getLoginVerification") result = { publicKey };
    if (method === "circle_getAddress") result = { address };
    return route.fulfill({ json: { id, jsonrpc: "2.0", result } });
  });
  await page.goto("http://localhost:3271/");
  await expect(page.getByRole("heading", { name: "Let’s plan a purchase" })).toBeVisible();
  await expect(page.locator("#welcome")).toBeHidden();
  await page.getByRole("button", { name: "Create a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Plan an order" })).toBeVisible();
  await page.reload();
  await expect(page.locator("#walletIntro output")).toHaveText(address);
  await page.getByRole("button", { name: "Continue to order planning" }).click();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page.getByRole("button", { name: "Use existing passkey" }).click();
  await expect(page.locator("#walletPanel p[role=status]")).toContainText("Passkey verified");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("forestock.arcWallet"));
  await page.reload();
  await page.getByRole("button", { name: "Manual setup" }).click();
  await page.getByRole("button", { name: "Use existing passkey" }).click();
  await expect(page.getByRole("heading", { name: "Plan an order" })).toBeVisible();
  expect(methods).toEqual(["rp_getRegistrationOptions","rp_getRegistrationVerification","circle_getAddress",
    "rp_getLoginOptions","rp_getLoginVerification","circle_getAddress",
    "rp_getLoginOptions","rp_getLoginVerification","circle_getAddress"]);
});


test("a dismissed passkey prompt can be retried on the welcome screen", async ({ page }) => {
  await page.route("**/generated/wallet-config.json", route => route.fulfill({ json: { clientKey: "test-client" } }));
  await page.route("**/generated/circle.js", route => route.fulfill({
    contentType: "application/javascript",
    body: 'export async function connectWallet() { throw new DOMException("Dismissed", "NotAllowedError"); }',
  }));
  await page.goto("/");
  const register = page.getByRole("button", { name: "Create a passkey" });
  await register.click();
  await expect(page.locator("#walletControls [role=status]")).toContainText("Tap again to retry");
  await expect(register).toBeEnabled();
  await expect(page.locator("#welcome")).toBeHidden();
});
