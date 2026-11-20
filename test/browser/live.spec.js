import { test, expect } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseEther,
  toHex,
} from "viem";
import { liveAbi as abi } from "../../lib/live-abi.js";
import fs from "node:fs";
const network = JSON.parse(fs.readFileSync("public/arc-network.json"));
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
      body: `export async function sendEscrowCalls(key, buyer, calls, submitted) {
       window.observedCalls = calls;
       submitted("0x" + "cd".repeat(32));
       return {success: true, receipt: {status: "success", transactionHash: "${hash}"}};
     }
     export function waitEscrowOperation() {}`,
    }),
  );
  let balance = "0";
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
    if (req.method === "eth_getBalance") result = toHex(parseEther(balance));
    if (req.method === "eth_call") {
      const { functionName } = decodeFunctionData({
        abi,
        data: req.params[0].data,
      });
      result = encodeFunctionResult({
        abi,
        functionName,
        result: functionName === "list" ? [] : 0n,
      });
    }
    return r.fulfill({ json: { jsonrpc: "2.0", id: req.id, result } });
  });
  await page.goto("/arc.html");
  const authorize = page.getByRole("button", {name:"Authorize with passkey"});
  await expect(page.locator("#fundingAddress")).toHaveText(buyer);
  await expect(authorize).toBeDisabled();
  await expect(page.getByRole("link", {name:"Open Circle faucet"})).toHaveAttribute("href","https://faucet.circle.com/");
  await page.locator("#orderTerms summary").click();
  await page.locator("#approve [name=deposit]").fill("0");
  await expect(page.locator("#fundingReason")).toContainText("network fee");
  await expect(authorize).toBeDisabled();
  await page.locator("#approve [name=deposit]").fill("0.06");
  balance = "1";
  await page.getByRole("button", {name:"Check balance"}).click();
  await expect(authorize).toBeEnabled();
  await expect(page.locator("#fundingHelp")).toBeHidden();
  await expect(page.locator("#approve [name=deposit]")).toHaveValue("0.06");
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
});

test("the sparrow flies from passkey planning into live order review", async ({page}) => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.addInitScript(() => localStorage.setItem("forestock.arcWallet", "0x" + "12".repeat(20)));
  await page.route("**/api/market", r => r.fulfill({json:{assets:[]}}));
  await page.goto("/?plan=arc");
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
