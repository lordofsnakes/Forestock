import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const clientKey = process.env.CIRCLE_WALLET_CLIENT_KEY?.trim() || "";
if (/API_KEY/i.test(clientKey)) throw Error("Set a Circle web Client Key for modular wallets.");
await build({
  entryPoints: ["wallet/circle.js"], outfile: "public/generated/circle.js",
  format: "esm", platform: "browser", bundle: true, minify: true, target: "es2022",
  // Circle imports ResponseError from the web3 umbrella. Use its defining package.
  alias: { web3: "web3-errors" },
});
await writeFile("public/generated/wallet-config.json", JSON.stringify({ clientKey }));
