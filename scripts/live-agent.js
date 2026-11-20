// Run on the presenter's machine. Only public order terms leave the vault.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  hexToString,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, foundry } from "viem/chains";
import { liveAbi as abi } from "../lib/live-abi.js";
import { liveDecision } from "../lib/live-decision.js";

const local = process.argv.includes("--local");
const chain = local ? foundry : arcTestnet;
const dir = local
  ? process.env.FORESTOCK_LOCAL_DIR
  : path.join(os.homedir(), ".config/forestock-testnet");
const config = JSON.parse(
  fs.readFileSync(
    local ? path.join(dir, "live.json") : "public/arc-network.json",
  ),
);
const address = config.escrow;
const transport = http(
  local ? process.env.FORESTOCK_LOCAL_RPC : "https://rpc.testnet.arc.network",
);
const client = createPublicClient({ chain, transport });
if ((await client.getChainId()) !== chain.id || !address)
  throw Error("Unexpected escrow network.");
const read = (functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });
const signer = (name) =>
  createWalletClient({
    chain,
    transport,
    account: privateKeyToAccount(
      fs.readFileSync(path.join(dir, name + ".key"), "utf8").trim(),
    ),
  });
const agent = signer("agent"),
  supplier = signer("supplier");
for (const [name, wallet] of [
  ["agent", agent],
  ["supplier", supplier],
]) {
  if ((await read(name)).toLowerCase() !== wallet.account.address.toLowerCase())
    throw Error("Incorrect " + name + " signer.");
}
const catalog = JSON.parse(fs.readFileSync("public/commodities.json")).assets;
const file = path.join(dir, "live-" + address + ".json");
let state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file))
  : { nextBlock: config.block, pending: [] };
function save() {
  fs.writeFileSync(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(file + ".tmp", file);
}
async function write(wallet, functionName, args) {
  const { request } = await client.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: wallet.account,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw Error("Reverted " + hash);
  console.log(functionName, args[0], hash);
}
async function tick() {
  const head = await client.getBlock({ blockTag: "latest" });
  while (BigInt(state.nextBlock) <= head.number) {
    const fromBlock = BigInt(state.nextBlock);
    const toBlock =
      head.number < fromBlock + 999n ? head.number : fromBlock + 999n;
    const plans = await client.getContractEvents({
      address,
      abi,
      eventName: "Planned",
      fromBlock,
      toBlock,
    });
    state.pending = [
      ...new Set([...state.pending, ...plans.map((e) => e.args.id)]),
    ];
    state.nextBlock = Number(toBlock + 1n);
    save();
  }
  if (!state.pending.length) return;
  let quotes = [];
  if (!local) {
    try {
      const r = await fetch("https://forestock-brown.vercel.app/api/market", {
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) quotes = (await r.json()).assets;
    } catch {}
  }
  for (const id of [...state.pending]) {
    try {
      const o = await read("order", [id]);
      if (o.status === 1 && o.orderBy >= head.timestamp) {
        const series = hexToString(o.series, { size: 32 });
        const live = quotes.find((a) => a.series === series),
          archived = catalog.find((a) => a.series === series);
        const [free, limit, spent] = await Promise.all([
          read("free", [o.buyer]),
          read("weeklyLimit", [o.buyer]),
          read("committed", [o.buyer, (head.timestamp + 259200n) / 604800n]),
        ]);
        const asset = archived || live;
        const d = liveDecision(
          o,
          { free, limit, spent },
          asset,
          live?.market,
          archived?.market,
          Number(head.timestamp) * 1000,
        );
        if (d.kind === "Buy")
          await write(agent, "hold", [
            id,
            asset.price,
            keccak256(
              toHex(
                JSON.stringify({
                  reason: d.reason,
                  observed: d.observed,
                  quote: d.contract,
                }),
              ),
            ),
            d.recorded,
            o.threshold,
          ]);
        continue;
      }
      if (o.status === 2)
        await write(supplier, "settle", [
          id,
          head.timestamp < o.holdTime + 3600n,
        ]);
      state.pending = state.pending.filter((value) => value !== id);
      save();
    } catch (error) {
      console.warn(id, error.shortMessage || error.message);
    }
  }
}
do {
  try {
    await tick();
  } catch (error) {
    console.warn(error.shortMessage || error.message);
    if (local) throw error;
  }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 10000));
} while (true);
