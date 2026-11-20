import {
  toCircleSmartAccount, toModularTransport, toPasskeyTransport,
  toWebAuthnCredential, WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, getAddress } from "viem";
import { toWebAuthnAccount } from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";

const url = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

export async function connectWallet(key, register) {
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(url, key),
    mode: register ? WebAuthnMode.Register : WebAuthnMode.Login,
    ...(register && { username: "Forestock-" + crypto.randomUUID() }),
  });
  try {
    const account = await toCircleSmartAccount({
      client: createPublicClient({ chain: arcTestnet, transport: toModularTransport(url + "/arcTestnet", key) }),
      owner: toWebAuthnAccount({ credential }),
      name: "Forestock",
    });
    return getAddress(account.address);
  } catch (cause) {
    throw Object.assign(new Error("Couldn’t load the Arc wallet address.", { cause }), { name: "WalletAddressError" });
  }
}
