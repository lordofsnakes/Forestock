const intro = document.querySelector("#walletIntro");
const controls = document.querySelector("#walletControls");
const panel = document.querySelector("#walletPanel");
const status = controls.querySelector("[role=status]");
const address = controls.querySelector("output");
const actions = controls.querySelector(".actions");
const retry = controls.querySelector("[data-retry]");
const next = document.querySelector("#continueSetup");
const open = document.querySelector("#openWallet");
const close = panel.querySelector("[data-dismiss]");
const key = "forestock.arcWallet";
let sdk, clientKey, busy = false, loadId = 0;

function showAddress() {
  const saved = localStorage.getItem(key);
  address.hidden = !saved;
  address.textContent = saved || "";
  controls.querySelector("[data-register]").hidden = Boolean(saved);
  next.textContent = saved ? "Continue to order planning" : "Continue with demo balance";
  open.textContent = saved ? "Wallet" : "Set up wallet";
}

function startPlanning() {
  if (busy) return;
  loadId++;
  intro.hidden = true;
  open.hidden = false;
  const welcome = document.querySelector("#welcome");
  welcome.hidden = false;
  welcome.classList.add("step-enter");
  const title = document.querySelector("#welcomeTitle");
  title.tabIndex = -1;
  title.focus();
}

async function loadWallet() {
  const id = ++loadId;
  showAddress();
  retry.hidden = true;
  actions.hidden = true;
  status.textContent = "Loading wallet setup…";
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext)
      throw Error("Open this site in a browser that supports passkeys over HTTPS.");
    const config = await fetch("/generated/wallet-config.json");
    if (!config.ok) throw Error("Wallet setup couldn’t load. Try again.");
    clientKey = (await config.json()).clientKey;
    if (!clientKey) throw Error("Wallet setup is waiting for Forestock’s Circle client key.");
    sdk = await import("./generated/circle.js");
    if (id !== loadId) return;
    status.textContent = address.hidden
      ? "Create a wallet with your device’s passkey, or reconnect one you already have."
      : "Your saved wallet address";
    actions.hidden = false;
  } catch (error) {
    if (id !== loadId) return;
    status.textContent = error.message || "Wallet setup couldn’t load. Try again.";
    retry.hidden = false;
  }
}

next.onclick = startPlanning;
retry.onclick = loadWallet;
open.onclick = () => {
  close.before(controls);
  panel.showModal();
  loadWallet();
};
close.onclick = () => panel.close();
panel.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
actions.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || busy) return;
  busy = true;
  const buttons = [...actions.querySelectorAll("button"), next, close];
  buttons.forEach(b => b.disabled = true);
  status.textContent = "Follow the passkey prompt on your device.";
  let connected = false;
  try {
    const result = await sdk.connectWallet(clientKey, button.hasAttribute("data-register"));
    localStorage.setItem(key, result);
    showAddress();
    status.textContent = "Passkey verified. Your Arc Testnet wallet address is ready.";
    connected = true;
  } catch {
    status.textContent = "Wallet setup didn’t finish. If your device saved a passkey, choose Use existing passkey to reconnect.";
  } finally {
    busy = false;
    buttons.forEach(b => b.disabled = false);
  }
  if (connected && !intro.hidden) startPlanning();
});
loadWallet();
