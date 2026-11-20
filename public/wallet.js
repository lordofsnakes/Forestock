const panel = document.querySelector("#walletPanel");
const status = panel.querySelector("[role=status]");
const address = panel.querySelector("output");
const actions = panel.querySelector(".actions");
const open = document.querySelector("#openWallet");
const key = "forestock.arcWallet";
let sdk, clientKey, busy = false;

function showAddress() {
  const saved = localStorage.getItem(key);
  address.hidden = !saved;
  address.textContent = saved || "";
  panel.querySelector("[data-register]").hidden = Boolean(saved);
  open.textContent = saved ? "Wallet" : "Set up wallet";
}

async function openPanel() {
  showAddress();
  panel.showModal();
  if (busy) return;
  actions.hidden = true;
  status.textContent = "Loading wallet setup…";
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext)
      throw Error("Open this site in a browser that supports passkeys over HTTPS.");
    const config = await fetch("/generated/wallet-config.json");
    if (!config.ok) throw Error();
    clientKey = (await config.json()).clientKey;
    if (!clientKey) throw Error("Wallet setup is waiting for Forestock’s Circle client key.");
    sdk = await import("./generated/circle.js");
    status.textContent = address.hidden ? "Create a passkey on this device or use an existing one." : "Your saved Arc Testnet wallet address";
    actions.hidden = false;
  } catch (error) {
    status.textContent = error.message || "Wallet setup couldn’t load. Close and try again.";
  }
}

open.addEventListener("click", openPanel);
panel.querySelector("[data-dismiss]").onclick = () => panel.close();
panel.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
actions.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || busy) return;
  busy = true;
  const buttons = panel.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  status.textContent = "Follow the passkey prompt on your device.";
  try {
    const result = await sdk.connectWallet(clientKey, button.hasAttribute("data-register"));
    localStorage.setItem(key, result);
    showAddress();
    status.textContent = "Passkey verified. Your Arc Testnet wallet address is ready.";
  } catch {
    status.textContent = "Wallet setup didn’t finish. If your device saved a passkey, choose Use existing passkey to reconnect.";
  } finally {
    busy = false;
    buttons.forEach(b => b.disabled = false);
  }
});
showAddress();
