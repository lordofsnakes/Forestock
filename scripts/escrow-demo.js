// Run locally on the presenter's machine. Only public receipt data goes to the browser.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  keccak256,
  toHex,
  defineChain,
  formatEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { selectMarket } from "../lib/market.js";
import { evaluate, day } from "../public/decision.js";

const local = process.argv.includes("--local");
const endpoint = local
  ? "http://127.0.0.1:8545"
  : "https://rpc.testnet.arc.network";
const chain = defineChain({
  id: local ? 31337 : 5042002,
  name: local ? "Local rehearsal" : "Arc Testnet",
  nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [endpoint] } },
});
const dir = path.join(
  os.homedir(),
  ".config",
  local ? "forestock-local" : "forestock-testnet",
);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
function account(name) {
  const f = path.join(dir, name + ".key");
  if (!fs.existsSync(f))
    fs.writeFileSync(f, generatePrivateKey(), { mode: 0o600, flag: "wx" });
  return privateKeyToAccount(fs.readFileSync(f, "utf8").trim());
}
const buyer = account("deployer"),
  agent = account("agent"),
  supplier = account("supplier");
const client = createPublicClient({ chain, transport: http(endpoint) });
const wallet = (a) =>
  createWalletClient({ account: a, chain, transport: http(endpoint) });
const artifact = JSON.parse(
  fs.readFileSync("out/Forestock.sol/Forestock.json", "utf8"),
);
const abi = artifact.abi;
const refundDemo = process.argv.includes("--refund-demo");
const stateFile = path.join(
  dir,
  refundDemo ? "refund-order.json" : "order.json",
);
let state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile))
  : null;
function save() {
  fs.writeFileSync(stateFile + ".tmp", JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(stateFile + ".tmp", stateFile);
}
async function receipt(hash) {
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw Error("Transaction reverted: " + hash);
  return r;
}
async function write(a, name, args) {
  const { request } = await client.simulateContract({
    account: a.address,
    address: state.vault,
    abi,
    functionName: name,
    args,
  });
  return receipt(await wallet(a).writeContract({ ...request, account: a }));
}
const read = (name, args = []) =>
  client.readContract({ address: state.vault, abi, functionName: name, args });
if (local)
  await client.request({
    method: "anvil_setBalance",
    params: [buyer.address, toHex(parseEther("100"))],
  });
if (!state && refundDemo) {
  const paid = JSON.parse(fs.readFileSync(path.join(dir, "order.json")));
  state = {
    vault: paid.vault,
    id: keccak256(toHex("refund-rehearsal")),
    terms: paid.terms,
    quote: paid.quote,
    cutoff: Math.floor(Date.now() / 1000) + 60,
  };
  const funding = await wallet(buyer).writeContract({
    address: state.vault,
    abi,
    functionName: "deposit",
    value: parseEther("5.8"),
  });
  await receipt(funding);
  await write(buyer, "configure", [parseEther("12"), false]);
  save();
}
if (!state) {
  const balance = await client.getBalance({ address: buyer.address });
  if (balance < parseEther("8"))
    throw Error(
      "Fund " +
        buyer.address +
        " with at least 8 test USDC. Available: " +
        formatEther(balance),
    );
  for (const a of [agent, supplier])
    await receipt(
      await wallet(buyer).sendTransaction({
        to: a.address,
        value: parseEther("0.25"),
      }),
    );
  const deployed = await receipt(
    await wallet(buyer).deployContract({
      abi,
      bytecode: artifact.bytecode.object,
      args: [agent.address, supplier.address, parseEther("6")],
      value: parseEther("6"),
    }),
  );
  const cutoff = Math.floor(Date.now() / 1000) + (local ? 3 : 86400);
  state = {
    vault: deployed.contractAddress,
    id: keccak256(toHex("one-pound-copper")),
    terms: keccak256(toHex("1 lb copper; $6 maximum; 24h lead")),
    quote: keccak256(toHex("Central Metals 1 lb at $5.80")),
    cutoff,
    deployTx: deployed.transactionHash,
  };
  save();
}
if ((await client.getCode({ address: state.vault })) === undefined)
  throw Error(
    "Saved contract missing on this chain. Use a fresh local rehearsal directory.",
  );
const need = await read("needs", [state.id]);
if (need[0] === 0n)
  await write(buyer, "authorize", [
    state.id,
    state.terms,
    parseEther("6"),
    BigInt(state.cutoff + 60),
  ]);
console.log(
  chain.name,
  "vault",
  state.vault,
  "order by",
  new Date(state.cutoff * 1000).toISOString(),
);
async function tick() {
  let hold = await read("holds", [state.id]);
  if (hold[4] === 0) {
    const t = Date.now();
    let market;
    try {
      const r = await fetch(
        "https://api.gemini.com/v1/prediction-markets/events?search=copper&status=active",
        { signal: AbortSignal.timeout(5000) },
      );
      market = selectMarket((await r.json()).data, t);
    } catch {}
    const decision = evaluate(
      {
        order: { qty: 1, cap: 600, due: state.cutoff * 1000 + day },
        limit: 600,
        used: 0,
        balance: 600,
        paused: false,
      },
      market,
      t,
    );
    console.log(decision.kind, decision.reason);
    if (decision.kind === "Blocked") throw Error(decision.reason);
    if (decision.kind === "Wait") return false;
    const sec = BigInt(Math.floor(Date.now() / 1000));
    const r = await write(agent, "hold", [
      state.id,
      state.terms,
      state.quote,
      parseEther("5.80"),
      sec + 120n,
      sec + 300n,
    ]);
    Object.assign(state, {
      holdTx: r.transactionHash,
      reason: decision.reason,
      observation: market?.observed,
    });
    save();
    hold = await read("holds", [state.id]);
  }
  if (hold[4] === 1) {
    const decline =
      refundDemo ||
      process.argv.includes("--decline") ||
      BigInt(Math.floor(Date.now() / 1000)) >= hold[1];
    const r = await write(
      supplier,
      decline ? "refund" : "accept",
      decline ? [state.id] : [state.id, state.quote],
    );
    state.settlementTx = r.transactionHash;
    save();
  }
  const final = await read("holds", [state.id]);
  console.log(
    JSON.stringify(
      {
        network: chain.name,
        vault: state.vault,
        status: final[4] === 2 ? "Supplier accepted" : "Refunded",
        hold: state.holdTx,
        settlement: state.settlementTx,
      },
      null,
      2,
    ),
  );
  return true;
}
while (!(await tick()))
  await new Promise((resolve) => setTimeout(resolve, local ? 1000 : 30000));
