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
    if (req.method === "eth_getBalance") result = toHex(parseEther("2"));
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
  await expect(page.locator("#balances")).toContainText("Wallet 2");
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
