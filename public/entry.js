import { consumeStep, openStep } from "./navigation.js";

const arc = location.pathname === "/arc.html";
const planner = new URLSearchParams(location.search).get("plan") === "arc";
const continuing = consumeStep();

if ((arc || planner) && !continuing) {
  location.replace("/");
} else {
  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-step]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openStep(link.pathname + link.search);
  });
  if (arc) {
    document.body.hidden = false;
    await import("./generated/live.js");
  } else {
    await Promise.all([import("./wallet.js"), import("./app.js")]);
  }
}
