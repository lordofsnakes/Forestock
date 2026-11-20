import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  stringToHex,
  toHex,
} from "viem";
import { foundry as chain } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sizedPurchases } from "../lib/purchase-sizing.js";
import { chooseOffer } from "../lib/supplier-offers.js";
import { liveAbi as abi } from "../lib/live-abi.js";

const run = promisify(execFile),
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "forestock-live-"));
const rpc = "http://127.0.0.1:18548",
  transport = http(rpc, { retryCount: 0 });
const server = spawn("anvil", ["--port", "18548", "--silent"], {
  stdio: "ignore",
});
const exit = once(server, "exit"),
  client = createPublicClient({ chain, transport });
try {
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null)
      throw Error("Dedicated Anvil failed to start.");
    try {
      await client.getChainId();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const wallets = [];
  for (const role of ["buyer", "agent", "supplier"]) {
    const key = generatePrivateKey(),
      account = privateKeyToAccount(key);
    await fs.writeFile(path.join(dir, role + ".key"), key, { mode: 0o600 });
    await client.request({
      method: "anvil_setBalance",
      params: [account.address, toHex(parseEther("2"))],
    });
    wallets.push(createWalletClient({ chain, transport, account }));
  }
  const [buyer, agent, supplier] = wallets;
  const contract = JSON.parse(
    await fs.readFile("out/ForestockLive.sol/ForestockLive.json"),
  );
  const receipt = async (hash) => {
    const r = await client.waitForTransactionReceipt({ hash });
    assert.equal(r.status, "success");
    return r;
  };
  const deployed = await receipt(
    await buyer.deployContract({
      abi,
      bytecode: contract.bytecode.object,
      args: [agent.account.address, supplier.account.address],
    }),
  );
  const address = deployed.contractAddress;
  await fs.writeFile(
    path.join(dir, "live.json"),
    JSON.stringify({ escrow: address, block: Number(deployed.blockNumber) }),
  );
  const read = (functionName, args) =>
    client.readContract({ address, abi, functionName, args });
  await receipt(
    await buyer.writeContract({
      address,
      abi,
      functionName: "configure",
      args: [parseEther("0.10")],
      value: parseEther("0.06"),
    }),
  );
  await receipt(
    await buyer.writeContract({
      address,
      abi,
      functionName: "plan",
      args: [
        stringToHex("one", { size: 32 }),
        stringToHex("COPPER", { size: 32 }),
        10,
        600,
        BigInt(Math.floor(Date.now() / 1000) + 86400),
        50,
        true,
      ],
    }),
  );
  const [id] = await read("list", [buyer.account.address, 0n, 10n]);
  const worker = () =>
    run(process.execPath, ["scripts/live-agent.js", "--once", "--local"], {
      env: {
        ...process.env,
        FORESTOCK_LOCAL_DIR: dir,
        FORESTOCK_LOCAL_RPC: rpc,
      },
    });
  await worker();
  const held = await read("order", [id]);
  assert.equal(held.status, 2);
  assert.equal(held.amount, parseEther("0.06"));
  await worker();
  await worker();
  const paid = await read("order", [id]);
  assert.equal(paid.status, 3);
  assert.equal(await read("free", [buyer.account.address]), 0n);
  for (const [eventName, b] of [
    ["Held", held.holdBlock],
    ["Settled", paid.settlementBlock],
  ]) {
    const [log] = await client.getContractEvents({
      address,
      abi,
      eventName,
      args: { id },
      fromBlock: b,
      toBlock: b,
    });
    assert.equal(
      (await client.getTransactionReceipt({ hash: log.transactionHash }))
        .status,
      "success",
    );
    if (eventName === "Held") assert.equal(log.args.recorded, true);
  }
  // The archived market is at 70%. It qualifies two portions, then stays flat.
  const head = await client.getBlock();
  const line = {quantity:.03,price:580,cap:600,salt:stringToHex("adaptive",{size:32})};
  const portions = sizedPurchases(line,buyer.account.address,50,true,l=>chooseOffer(l,null,null,0));
  const deadline = head.timestamp+86400n;
  await receipt(await buyer.writeContract({address,abi,functionName:"configure",args:[parseEther("1")],value:parseEther(".18")}));
  for (const part of portions) await receipt(await buyer.writeContract({address,abi,functionName:"plan",
    args:[part.salt,stringToHex("COPPER",{size:32}),part.quantityMilli,600,deadline,part.threshold,true]}));
  const ids = await read("list",[buyer.account.address,1n,10n]);
  const statuses = async()=>Promise.all(ids.map(async id=>(await read("order",[id])).status));
  await worker(); await worker(); await worker();
  assert.deepEqual(await statuses(),[3,3,1]);
  assert.equal(await read("free",[buyer.account.address]),parseEther(".06"));
  await client.request({method:"evm_setNextBlockTimestamp",params:[Number(deadline)-20]});
  await client.request({method:"evm_mine",params:[]});
  await worker(); await worker();
  assert.deepEqual(await statuses(),[3,3,3]);
  assert.equal(await read("free",[buyer.account.address]),0n);
  assert.equal((await read("list",[buyer.account.address,0n,20n])).length,4);
  console.log("The real worker bought 0.02 lb on the 70% signal, waited on the same signal, and settled the last 0.01 lb at cutoff.");
  console.log(
    "Buyer-funded fractional purchase, worker restart, supplier payout and per-order receipts passed on Anvil.",
  );
} finally {
  server.kill();
  await exit;
  await fs.rm(dir, { recursive: true, force: true });
}
