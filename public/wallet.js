import { flyToScreen } from "./onboarding-motion.js";
const intro = document.querySelector("#walletIntro");
const controls = document.querySelector("#walletControls");
const panel = document.querySelector("#walletPanel");
const status = controls.querySelector("[role=status]");
const address = controls.querySelector("output");
const register = controls.querySelector("[data-register]");
const login = controls.querySelector("[data-login]");
const manual = controls.querySelector("#manualSetup");
const options = controls.querySelector("#manualOptions");
const demo = controls.querySelector("[data-demo]");
const retry = controls.querySelector("[data-retry]");
const next = document.querySelector("#continueSetup");
const open = document.querySelector("#openWallet");
const close = panel.querySelector("[data-dismiss]");
const key = "forestock.arcWallet";
let sdk, clientKey, busy = false, loadId = 0;

function showAddress() {
  const saved = localStorage.getItem(key);
  document.querySelector("#liveOrders").hidden = !saved;
  address.hidden = !saved || !panel.open;
  address.textContent = saved || "";
  register.hidden = Boolean(saved);
  next.hidden = !saved || panel.open;
  const practice = new URLSearchParams(location.search).get("practice") === "1";
  demo.hidden = !practice || panel.open || Boolean(saved);
  controls.querySelector('[data-action="reset"]').hidden = !practice;
  open.textContent = saved ? "Wallet" : "Set up wallet";
}

function startPlanning() {
  if (busy) return;
  if (localStorage.getItem(key) && new URLSearchParams(location.search).get("plan") !== "arc") {
    location.assign("/?plan=arc");
    return;
  }
  loadId++;
  const welcome = document.querySelector("#welcome");
  flyToScreen(intro, welcome, ".portrait", () => {
    intro.hidden = true;
    open.hidden = false;
    welcome.hidden = false;
    const title = document.querySelector("#welcomeTitle");
    title.tabIndex = -1;
    title.focus();
  });
}

async function loadWallet() {
  const id = ++loadId;
  showAddress();
  retry.hidden = true;
  register.disabled = login.disabled = true;
  status.textContent = "Preparing passkey setup…";
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext)
      throw Error("Open this site in a browser that supports passkeys over HTTPS.");
    const config = await fetch("/generated/wallet-config.json");
    if (!config.ok) throw Error("Wallet setup couldn’t load. Try again.");
    clientKey = (await config.json()).clientKey;
    if (!clientKey) throw Error("Wallet setup is waiting for Forestock’s Circle client key.");
    sdk = await import("./generated/circle.js");
    if (id !== loadId) return;
    status.textContent = panel.open ? (address.hidden ? "Connect a passkey to this wallet." : "Your saved wallet address")
      : "";
    register.disabled = login.disabled = false;
  } catch (error) {
    if (id !== loadId) return;
    status.textContent = error.message || "Wallet setup couldn’t load. Try again.";
    retry.hidden = false;
  }
}

next.onclick = demo.onclick = startPlanning;
manual.onclick = () => {
  options.hidden = !options.hidden;
  manual.setAttribute("aria-expanded", String(!options.hidden));
};
retry.onclick = loadWallet;
open.onclick = () => {
  close.before(controls);
  panel.showModal();
  manual.hidden = false;
  options.hidden = false;
  manual.setAttribute("aria-expanded", "true");
  loadWallet();
};
close.onclick = () => panel.close();
panel.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
controls.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if ((button !== register && button !== login) || busy) return;
  busy = true;
  const buttons = [register, login, manual, demo, next, close];
  buttons.forEach(b => b.disabled = true);
  status.textContent = "Follow the passkey prompt on your device.";
  let connected = false;
  try {
    const result = await sdk.connectWallet(clientKey, button.hasAttribute("data-register"));
    localStorage.setItem(key, result);
    showAddress();
    status.textContent = "Passkey verified. Your Arc Testnet wallet address is ready.";
    connected = true;
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      status.textContent = "The passkey prompt was dismissed or timed out. Tap again to retry.";
    } else if (error.name === "InvalidStateError" || error.name === "WalletAddressError") {
      options.hidden = false;
      manual.setAttribute("aria-expanded", "true");
      status.textContent = error.name === "WalletAddressError"
        ? "Your passkey was verified. Choose Use existing passkey to load your wallet."
        : "A passkey already exists on this device. Choose Use existing passkey.";
    } else {
      status.textContent = "Passkey setup is unavailable. Try again, or open Manual setup for other options.";
    }
  } finally {
    busy = false;
    buttons.forEach(b => b.disabled = false);
  }
  if (connected && !intro.hidden) startPlanning();
  else if (connected && !document.querySelector("#app").hidden) location.assign("/arc.html");
});
loadWallet();

if (localStorage.getItem(key) && new URLSearchParams(location.search).get("plan") === "arc") startPlanning();
