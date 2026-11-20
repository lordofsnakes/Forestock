import {
  createPublicClient,
  http,
  parseEventLogs,
  erc20Abi,
  zeroAddress,
} from "viem";
import { baseSepolia } from "viem/chains";
import { baseToken } from "./supplier-offers.js";

const base = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org", { timeout: 4500, retryCount: 0 }),
});
export async function destinationReceipt(burnHash, recipient, minimum) {
  const r = await fetch(
    "https://iris-api-sandbox.circle.com/v2/messages/26?transactionHash=" +
      burnHash,
    { signal: AbortSignal.timeout(4500), cache: "no-store" },
  );
  if (!r.ok) return;
  const { messages } = await r.json();
  for (const m of messages || []) {
    const hash = m.forwardTxHash;
    if (!/^0x[0-9a-f]{64}$/i.test(hash || "")) continue;
    const tx = await base.getTransactionReceipt({ hash });
    if (tx.status !== "success") continue;
    const logs = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: tx.logs,
    });
    if (
      logs.some(
        (l) =>
          l.address.toLowerCase() === baseToken.toLowerCase() &&
          l.args.from === zeroAddress &&
          l.args.to.toLowerCase() === recipient.toLowerCase() &&
          l.args.value >= minimum,
      )
    )
      return hash;
  }
}
