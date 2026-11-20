// Only a transition requested by the current tab can enter a later onboarding step.
const stepKey = "forestock.nextStep";

export function openStep(path) {
  sessionStorage.setItem(stepKey, path);
  location.assign(path);
}

export function consumeStep() {
  const path = sessionStorage.getItem(stepKey);
  sessionStorage.removeItem(stepKey);
  return path === location.pathname + location.search &&
    (performance.getEntriesByType("navigation")[0]?.type ?? "navigate") === "navigate";
}

export function restartOnReopen(canRestart) {
  if (!matchMedia("(display-mode: standalone)").matches && !navigator.standalone) return;
  let outsideLink = false;
  let restart = false;
  document.addEventListener("click", event => {
    outsideLink = Boolean(event.target.closest("a[target='_blank']"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      restart = !outsideLink && canRestart();
    } else {
      outsideLink = false;
      if (restart && canRestart()) location.replace(location.search === "?practice=1" ? "/?practice=1" : "/");
      restart = false;
    }
  });
}
