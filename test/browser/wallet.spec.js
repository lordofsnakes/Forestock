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
  await page.getByRole("button", { name: "Set up wallet" }).click();
  await page.getByRole("button", { name: "Create passkey wallet" }).click();
  await expect(page.locator("#walletPanel output")).toHaveText(address);
  await page.reload();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page.getByRole("button", { name: "Use existing passkey" }).click();
  await expect(page.locator("#walletPanel p[role=status]")).toContainText("Passkey verified");
  expect(methods).toEqual(["rp_getRegistrationOptions","rp_getRegistrationVerification","circle_getAddress",
    "rp_getLoginOptions","rp_getLoginVerification","circle_getAddress"]);
});
