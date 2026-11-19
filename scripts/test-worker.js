import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createPublicClient, http, parseEther } from "viem";

const run = promisify(execFile);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forestock-worker-"));
const port = "18546";
const env = {
  ...process.env,
  FORESTOCK_LOCAL_PORT: port,
  FORESTOCK_LOCAL_DIR: dir,
};
const server = spawn("anvil", ["--port", port, "--silent"], {
  stdio: "ignore",
});
const exited = once(server, "exit");
try {
  const client = createPublicClient({
    transport: http("http://127.0.0.1:" + port, { retryCount: 0 }),
  });
  for (let n = 0; n < 40; n++) {
    if (server.exitCode !== null)
      throw Error("Dedicated Anvil instance failed to start");
    try {
      assert.equal(await client.getChainId(), 31337);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal(server.exitCode, null);
  const abi = JSON.parse(
    await fs.readFile("out/Forestock.sol/Forestock.json"),
  ).abi;
  async function worker(args = []) {
    await run(
      process.execPath,
      ["scripts/escrow-demo.js", "--local", ...args],
      { env, timeout: 40000 },
    );
  }
  for (const [args, file, state] of [
    [[], "order.json", 2],
    [["--refund-demo"], "refund-order.json", 3],
  ]) {
    await worker(args);
    const order = JSON.parse(await fs.readFile(path.join(dir, file)));
    const read = (name, params = []) =>
      client.readContract({
        address: order.vault,
        abi,
        functionName: name,
        args: params,
      });
    const h = await read("holds", [order.id]);
    assert.equal(h[0], parseEther("5.80"));
    assert.equal(h[4], state);
    for (const hash of [order.holdTx, order.settlementTx])
      assert.equal(
        (await client.getTransactionReceipt({ hash })).status,
        "success",
      );
    const free = await read("freeBalance");
    await worker(args);
    assert.equal(await read("freeBalance"), free);
    const saved = JSON.parse(await fs.readFile(path.join(dir, file)));
    assert.equal(saved.settlementTx, order.settlementTx);
  }
  console.log("Isolated worker payout, refund and restart checks passed.");
} finally {
  server.kill();
  await exited;
  await fs.rm(dir, { recursive: true, force: true });
}
