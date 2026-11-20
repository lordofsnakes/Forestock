// One project-funded, buyer-authorized order. Re-running cannot create a second order.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatEther,
  http,
  keccak256,
  parseEther,
  stringToHex,
} from "viem";
import { arcTestnet as chain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { liveAbi } from "../lib/live-abi.js";
import { routeAbi } from "../lib/routed-abi.js";
import {
  chooseOffer,
  verifiedBook,
  forwardingFee,
} from "../lib/supplier-offers.js";
const dir = path.join(os.homedir(), ".config/forestock-testnet");
const config = JSON.parse(await fs.readFile("public/arc-network.json")).routed;
const address = config.escrow,
  abi = [...liveAbi, ...routeAbi];
const account = privateKeyToAccount(
  (await fs.readFile(path.join(dir, "deployer.key"), "utf8")).trim(),
);
const options = { chain, transport: http("https://rpc.testnet.arc.network") };
const rpc = createPublicClient(options);
if ((await rpc.getChainId()) !== 5042002) throw Error("Wrong chain.");
const signer = createWalletClient({ ...options, account });
const read = (functionName, args) =>
  rpc.readContract({ address, abi, functionName, args });
const salt = stringToHex("first-base-supplier-rehearsal", { size: 32 });
const id = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [account.address, salt],
  ),
);
const order = await read("order", [id]);
console.log("Order", id, "status", order.status);
if (order.status) process.exit(0);
if (
  (await read("free", [account.address])) !== 0n ||
  (await read("list", [account.address, 0n, 1n])).length
)
  throw Error("Expected an empty project rehearsal account in the new escrow.");
const book = await verifiedBook(
  JSON.parse(await fs.readFile("public/base-offers.json")),
  config.supplier,
  address,
);
const now = Number((await rpc.getBlock()).timestamp);
// Give today's market time to resolve, allowing a genuine threshold-driven hold.
const deadline = now + 86400;
const line = {
  series: "COPPER",
  price: 580,
  cap: 600,
  quantity: 0.1,
  orderBy: deadline,
};
const offer = chooseOffer(line, book, await forwardingFee(), now);
if (offer.network !== "Base Sepolia" || offer.cents > 60)
  throw Error("No eligible Base offer inside the purchase cap.");
let left = parseEther("0.20");
async function send(functionName, args, value = 0n) {
  const request = { address, abi, account, functionName, args, value };
  const gas = ((await rpc.estimateContractGas(request)) * 12n) / 10n;
  const fees = await rpc.estimateFeesPerGas();
  const bound = gas * fees.maxFeePerGas;
  if (bound > left) throw Error("Project buyer gas cap reached.");
  left -= bound;
  const hash = await signer.writeContract({ ...request, ...fees, gas });
  const tx = await rpc.waitForTransactionReceipt({ hash });
  console.log(functionName, hash, tx.status);
  if (tx.status !== "success") throw Error("Rehearsal transaction reverted.");
}
if (!process.argv.includes("--broadcast")) {
  console.log(offer);
  process.exit(0);
}
await fs.writeFile(
  path.join(dir, "rehearsal-gas-" + id + ".json"),
  JSON.stringify({ remaining: String(parseEther("0.20")) }),
  { flag: "wx", mode: 0o600 },
);
// The new account has zero allowance until both the plan and route are set.
await send("plan", [
  salt,
  stringToHex("COPPER", { size: 32 }),
  100,
  600,
  BigInt(deadline),
  10,
  true,
]);
await send("selectBase", [salt, offer.price, BigInt(offer.feeMicros)]);
const deposit = BigInt(offer.cents) * 10n ** 16n;
await send("configure", [deposit], deposit);
console.log(
  "Authorized",
  formatEther(deposit),
  "test USDC with a 10% forecast threshold.",
);
