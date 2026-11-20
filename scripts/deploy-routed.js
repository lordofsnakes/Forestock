import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  http,
  parseEther,
} from "viem";
import { arcTestnet as chain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
const file = "public/arc-network.json";
const config = JSON.parse(await fs.readFile(file));
if (config.routed) throw Error("A routed escrow is already configured.");
const clients = { chain, transport: http("https://rpc.testnet.arc.network") };
const rpc = createPublicClient(clients);
if ((await rpc.getChainId()) !== 5042002) throw Error("Wrong chain.");
const dir = path.join(os.homedir(), ".config/forestock-testnet");
const signer = async (role) =>
  privateKeyToAccount(
    (await fs.readFile(path.join(dir, role + ".key"), "utf8")).trim(),
  );
const [deployer, agent, supplier] = await Promise.all(
  ["deployer", "agent", "supplier"].map(signer),
);
const token = "0x3600000000000000000000000000000000000000";
const messenger = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const artifact = JSON.parse(
  await fs.readFile("out/ForestockRouted.sol/ForestockRouted.json"),
);
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [agent.address, supplier.address, supplier.address, token, messenger],
});
const gas =
  ((await rpc.estimateGas({ account: deployer.address, data })) * 110n) / 100n;
const fees = await rpc.estimateFeesPerGas();
if (gas * fees.maxFeePerGas > parseEther("0.5"))
  throw Error("Deployment exceeds approved gas cap.");
if (!process.argv.includes("--broadcast")) {
  console.log("Deployment simulation passed.");
  process.exit(0);
}
const wallet = createWalletClient({ ...clients, account: deployer });
const hash = await wallet.sendTransaction({ data, gas, ...fees });
console.log("Deployment submitted", hash);
const receipt = await rpc.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw Error("Deployment failed.");
config.routed = {
  escrow: receipt.contractAddress,
  block: Number(receipt.blockNumber),
  deployment: hash,
  supplier: supplier.address,
};
await fs.writeFile(file, JSON.stringify(config, null, 2) + "\n");
console.log(
  "Routed escrow",
  receipt.contractAddress,
  "gas paid (wei)",
  String(receipt.gasUsed * receipt.effectiveGasPrice),
);
