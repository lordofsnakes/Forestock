const unitWords = {
  lb: ["lb", "lbs", "pound", "pounds"],
  bbl: ["bbl", "barrel", "barrels"],
  "troy oz": ["troy oz", "troy ounce", "troy ounces"],
  MMBtu: ["mmbtu"],
};

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function quantityIn(text, asset) {
  const units = unitWords[asset.unit] || [asset.unit];
  return readAmount(text, units, 10000, false);
}

function readAmount(text, units, maximum, currency) {
  const unit = units.map(unit => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(
    "^(?:I need |about |up to |my budget is )?" +
    (currency ? "\\$?\\s*" : "") +
    "(\\d{1,3}(?:,\\d{3})+|\\d+)" +
    (currency ? "(\\.\\d{1,2})?" : "") +
    "(?:\\s*(?:" + unit + "))?(?:\\s*(?:please|per week|a week|weekly))?[.!]?$", "i",
  );
  const match = text.trim().match(pattern);
  if (!match) return null;
  const value = Number(match[1].replaceAll(",", "") + (match[2] || ""));
  return value >= (currency ? 0 : 1) && value <= maximum ? value : null;
}

export function startChat({ choices, material, quantity, allowance, status, returning, finish }) {
  const form = document.querySelector("#setup");
  const input = form.elements.reply;
  const messages = document.querySelector("#messages");
  const suggestions = document.querySelector("#suggestions");
  const restart = document.querySelector("#restart");
  const locked = status !== "Watching";
  let step, asset, qty, limit;

  function say(text, buyer = false) {
    const line = document.createElement("p");
    line.className = (buyer ? "buyer" : "helper") + " message step-enter";
    line.setAttribute("aria-label", (buyer ? "You. " : "Purchasing helper. ") + text);
    line.textContent = text;
    messages.append(line);
    messages.scrollTop = messages.scrollHeight;
  }

  function refreshSuggestions() {
    let replies;
    if (step === "material") replies = choices().map(a => a.name);
    if (step === "quantity") replies = [quantity + " " + asset.unit];
    if (step === "allowance") replies = [allowance + " USDC"];
    if (step === "review") replies = ["Review order"];
    suggestions.replaceChildren(...replies.map(reply => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = reply;
      button.onclick = () => answer(reply);
      return button;
    }));
  }

  function ask(next, text, placeholder) {
    step = next;
    say(text);
    input.placeholder = placeholder;
    input.inputMode = next === "quantity" ? "numeric" : next === "allowance" ? "decimal" : "text";
    refreshSuggestions();
  }

  function askAllowance() {
    ask("allowance", "What’s your weekly spending allowance in test USDC?", "e.g. 600 USDC");
  }

  function begin() {
    messages.replaceChildren();
    input.value = "";
    restart.hidden = true;
    asset = material;
    qty = quantity;
    limit = allowance;
    if (locked) {
      say("Welcome back. Your order for " + qty + " " + asset.unit + " of " + asset.name + " is " + status.toLowerCase() + ".");
      askAllowance();
    } else {
      ask("material", returning
        ? "Welcome back. You last chose " + asset.name + ". Which material should we plan for today?"
        : "Hi! I can help plan your next purchase. What material do you need?", "e.g. I need copper");
    }
  }

  function answer(text) {
    text = text.trim();
    if (!text) return;
    say(text, true);
    input.value = "";
    restart.hidden = false;
    if (step === "material") {
      const request = " " + words(text) + " ";
      const matches = choices().filter(a =>
        [a.name, a.series].some(alias => request.includes(" " + words(alias) + " ")));
      if (matches.length !== 1) {
        say("Choose one of the listed materials. For oil, pick Brent or WTI.");
        return;
      }
      asset = matches[0];
      const alias = [asset.name, asset.series].find(name =>
        text.toLowerCase().endsWith(name.toLowerCase()));
      if (alias) {
        const prefix = text.slice(0, -alias.length).trim().replace(/\s+of$/i, "");
        const amount = quantityIn(prefix, asset);
        if (amount !== null) {
          qty = amount;
          askAllowance();
          return;
        }
      }
      ask("quantity", "How much " + asset.name + " do you need? I’ll use " + asset.unit + " for this order.", "Quantity in " + asset.unit);
    } else if (step === "quantity") {
      const amount = quantityIn(text, asset);
      if (amount === null) {
        say("Send a whole number from 1 to 10,000 in " + asset.unit + ".");
        return;
      }
      qty = amount;
      askAllowance();
    } else if (step === "allowance") {
      const amount = readAmount(text, ["test USDC", "USDC", "dollars"], 100000, true);
      if (amount === null) {
        say("The allowance caps what can be spent each week. Send an amount from 0 to 100,000 test USDC, with up to two decimal places.");
        return;
      }
      limit = amount;
      ask("review", "Got it. " + qty + " " + asset.unit + " of " + asset.name + ", with a weekly allowance of " + limit.toLocaleString("en-US") + " test USDC. Ready to review your order?", "Reply yes to continue");
    } else if (/^(yes|yep|ok|okay|review order|confirm)[.!]?$/i.test(text)) {
      finish(asset, qty, limit);
    } else {
      say("Reply yes to open your order, or choose Start over to change your answers.");
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    answer(input.value);
  });
  restart.onclick = begin;
  begin();
  return { refreshSuggestions };
}
