import {
  toCircleSmartAccount, toModularTransport, toPasskeyTransport,
  toWebAuthnCredential, WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, getAddress } from "viem";
import { createBundlerClient, toWebAuthnAccount } from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";

const url = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

let walletSession;

const credentialKey = address => "forestock.passkey." + getAddress(address);

function savedCredential(address) {
  try {
    const data = JSON.parse(localStorage.getItem(credentialKey(address)));
    if (data && typeof data.id === "string" && /^[A-Za-z0-9_-]+$/.test(data.id) &&
        /^0x[a-f0-9]{128}$/i.test(data.publicKey)) return data;
  } catch {}
  return null;
}

export function hasWalletCredential(address) {
  return walletSession?.account.address.toLowerCase() === address.toLowerCase() || Boolean(savedCredential(address));
}

async function walletFromCredential(key, credential) {
  const client = createPublicClient({ chain: arcTestnet, transport: toModularTransport(url + "/arcTestnet", key) });
  const account = await toCircleSmartAccount({
    client, owner: toWebAuthnAccount({ credential, rpId: credential.rpId }), name: "Forestock",
  });
  return { account, client };
}

export async function connectWallet(key, register, expectedBuyer) {
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(url, key),
    mode: register ? WebAuthnMode.Register : WebAuthnMode.Login,
    ...(register && { username: "Forestock-" + crypto.randomUUID() }),
  });
  let session;
  try {
    session = await walletFromCredential(key, credential);
  } catch (cause) {
    throw Object.assign(new Error("Couldn’t load the Arc wallet address.", { cause }), { name: "WalletAddressError" });
  }
  const address = getAddress(session.account.address);
  if (expectedBuyer && address !== getAddress(expectedBuyer)) throw Error("That passkey belongs to a different wallet.");
  const { id, publicKey, rpId } = credential;
  localStorage.setItem(credentialKey(address), JSON.stringify({ id, publicKey, rpId }));
  walletSession = session;
  return address;
}

export async function sendEscrowCalls(key, expectedBuyer, calls, submitted) {
  const buyer = getAddress(expectedBuyer);
  if (!walletSession || getAddress(walletSession.account.address) !== buyer) {
    const credential = savedCredential(buyer);
    if (!credential) throw Error("Reconnect your existing passkey before authorizing escrow.");
    const session = await walletFromCredential(key, credential);
    if (getAddress(session.account.address) !== buyer) {
      localStorage.removeItem(credentialKey(buyer));
      throw Error("Reconnect the passkey for this wallet.");
    }
    walletSession = session;
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
