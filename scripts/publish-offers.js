// Publish the project test supplier's Base Sepolia quote sheet for this escrow.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
const network = JSON.parse(await fs.readFile("public/arc-network.json"));
if (!network.routed?.escrow)
  throw Error("Deploy the routed testnet escrow first.");
const signer = privateKeyToAccount(
  (
    await fs.readFile(
      path.join(os.homedir(), ".config/forestock-testnet/supplier.key"),
      "utf8",
    )
  ).trim(),
);
const { assets } = JSON.parse(await fs.readFile("public/commodities.json"));
const terms = {
  sourceChain: 5042002,
  destinationChain: 84532,
  escrow: network.routed.escrow,
  recipient: signer.address,
  expires: Math.floor(Date.now() / 1000) + 30 * 86400,
  leadHours: 24,
  stock: 500,
  unitCents: Object.fromEntries(
    assets.map((a) => [a.series, Math.max(1, Math.round(a.price * 0.8))]),
  ),
};
const signature = await signer.signMessage({ message: JSON.stringify(terms) });
await fs.writeFile(
  "public/base-offers.json",
  JSON.stringify({ terms, signature }, null, 2) + "\n",
);
