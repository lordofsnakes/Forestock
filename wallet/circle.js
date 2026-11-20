import {
  toCircleSmartAccount, toModularTransport, toPasskeyTransport,
  toWebAuthnCredential, WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, getAddress } from "viem";
import { createBundlerClient, toWebAuthnAccount } from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";

const url = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

let walletSession;

export async function connectWallet(key, register) {
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(url, key),
    mode: register ? WebAuthnMode.Register : WebAuthnMode.Login,
    ...(register && { username: "Forestock-" + crypto.randomUUID() }),
  });
  try {
    const client = createPublicClient({ chain: arcTestnet, transport: toModularTransport(url + "/arcTestnet", key) });
    const account = await toCircleSmartAccount({
      client,
      owner: toWebAuthnAccount({ credential }),
      name: "Forestock",
    });
    walletSession = {account, client};
    return getAddress(account.address);
  } catch (cause) {
    throw Object.assign(new Error("Couldn’t load the Arc wallet address.", { cause }), { name: "WalletAddressError" });
  }
}

export async function sendEscrowCalls(key, expectedBuyer, calls, submitted) {
  if (!walletSession || getAddress(walletSession.account.address) !== getAddress(expectedBuyer)) {
    const connected = await connectWallet(key, false);
    if (connected !== getAddress(expectedBuyer)) throw Error("That passkey belongs to a different wallet.");
  }
  const {account, client} = walletSession;
  const bundler = createBundlerClient({ account, client, transport: toModularTransport(url + "/arcTestnet", key) });
  const { medium } = await client.request({method: "circle_getUserOperationGasPrice", params: []});
  const hash = await bundler.sendUserOperation({calls, maxFeePerGas: BigInt(medium.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(medium.maxPriorityFeePerGas)});
  submitted(hash);
  return waitEscrowOperation(key, hash);
}

export async function waitEscrowOperation(key, hash) {
  const bundler = createBundlerClient({chain: arcTestnet, transport: toModularTransport(url + "/arcTestnet", key)});
  return bundler.waitForUserOperationReceipt({hash, timeout: 90000});
}
