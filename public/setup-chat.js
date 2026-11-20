export function startChat({ choices, material, quantity, allowance, status, returning, finish }) {
  const form = document.querySelector("#setup");
  const input = form.elements.reply;
  const send = form.querySelector("button");
  const messages = document.querySelector("#messages");
  const suggestions = document.querySelector("#suggestions");
  const restart = document.querySelector("#restart");
  const locked = status !== "Watching";
  const history = [];
  let draft, pending;

  function say(content, role = "assistant") {
    const line = document.createElement("p");
    line.className = (role === "user" ? "buyer" : "helper") + " message step-enter";
    if (role === "assistant") {
      const avatar = document.createElement("img");
      avatar.src = "/sparrow.png";
      avatar.alt = "Sparrow";
      avatar.width = avatar.height = 38;
      const bubble = document.createElement("span");
      bubble.className = "speech";
      bubble.textContent = content;
      line.append(avatar, bubble);
    } else {
      line.textContent = content;
    }
    messages.append(line);
    messages.scrollTop = messages.scrollHeight;
    history.push({ role, content });
    if (history.length > 16) history.shift();
  }

  function lines() {
    return [draft, ...(draft.additional || [])];
  }

  function selected(line) {
    return choices().find(a => a.series === line.series);
  }

  function incompleteLine() {
    return lines().find(line => !selected(line) || line.quantity === null || line.dateNote);
  }

  function ready() {
    return !incompleteLine() && draft.allowance !== null;
  }

  function review() {
    finish(lines().map(line => ({ asset: selected(line), quantity: line.quantity, dueDate: line.dueDate })), draft.allowance);
  }

  function printLine(id, value) {
    const line = document.getElementById(id);
    if (line.textContent === value) return;
    line.textContent = value;
    if (line.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      line.animate([{ opacity: .2, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
        { duration: 260, easing: "ease-out" });
    }
  }

  function refreshSuggestions() {
    printLine("receiptNeed", lines().map(line => {
      const asset = selected(line);
      const name = asset?.name || line.label || "Material pending";
      const amount = asset && line.quantity !== null ? line.quantity + " " + asset.unit + " of " : "";
      const timing = line.dueDate ? " · by " + line.dueDate : line.dateNote ? " · " + line.dateNote + "?" : "";
      return (line.amountNote ? line.amountNote + " of " : amount) + name + timing;
    }).join("\n"));
    printLine("receiptLimit", draft.allowance === null
      ? "Weekly allowance pending" : draft.allowance.toLocaleString("en-US") + " test USDC per week");
    suggestions.replaceChildren();
    function offer(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = action;
      suggestions.append(button);
    }
    if (pending) return;
    const line = incompleteLine();
    if (ready()) {
      offer("Review order", review);
    } else if (line && !selected(line)) {
      for (const a of choices()) offer(a.name, () => pick(a.name, line, { series: a.series }));
    } else if (line) {
      if (line.quantity !== null || line.amountNote || draft.additional?.length) return;
      const label = quantity + " " + selected(line).unit;
      offer(label, () => pick(label, line, { quantity }));
    } else {
      const label = allowance + " USDC";
      offer(label, () => pick(label, draft, { allowance }));
    }
  }

  function pick(label, line, update) {
    say(label, "user");
    Object.assign(line, update);
    if (update.quantity !== undefined) delete line.amountNote;
    restart.hidden = false;
    const missing = incompleteLine();
    if (ready()) say("I’ve filled in your request. You can review it or tell me what to change.");
    else if (missing && !selected(missing)) say("Which catalog material should I use for " + (missing.label || "this need") + "?");
    else if (missing?.quantity !== null && missing?.dateNote) say("Which day should I use for " + missing.dateNote + "?");
    else if (missing) say("How much " + selected(missing).name + " do you need, in " + selected(missing).unit + "?");
    else say("What weekly spending allowance should I use, in test USDC?");
    refreshSuggestions();
  }

  function begin() {
    pending?.abort();
    pending = null;
    history.length = 0;
    messages.replaceChildren();
    draft = { series: locked ? material.series : null, quantity: locked ? quantity : null, allowance: null };
    input.value = "";
    input.placeholder = "Ask a question or describe your order";
    send.disabled = false;
    send.textContent = "Send";
    restart.hidden = true;
    if (locked) say("Welcome back. Your order for " + quantity + " " + material.unit + " of " + material.name +
      " is " + status.toLowerCase() + ". What weekly allowance should I use?");
    else say(returning ? "Welcome back. You last chose " + material.name + ". What do you need this time?"
      : "What are you buying for your next production run? Tell me what you need, or ask me how ordering works.");
    refreshSuggestions();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || pending) return;
    if (ready() && /^(yes|confirm|review order)[.!]?$/i.test(text)) {
      review();
      return;
    }
    say(text, "user");
    input.value = "";
    restart.hidden = false;
    const request = new AbortController();
    pending = request;
    send.disabled = true;
    send.textContent = "Thinking…";
    refreshSuggestions();
    try {
      const today = new Date();
      const localDate = new Date(+today - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({ messages: history, draft, locked, localDate,
          catalog: choices().map(({ series, name, unit }) => ({ series, name, unit })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.code || "unavailable");
      if (request !== pending) return;
      draft = result.draft;
      say(result.reply);
    } catch (error) {
      if (request !== pending) return;
      history.pop();
      say(error.message === "gateway_verification_required"
        ? "AI chat is waiting for Forestock’s Vercel account verification. You can use a suggested reply to continue."
        : "I couldn’t reach AI chat. Send your message again or use a suggested reply.");
      if (!input.value) input.value = text;
    } finally {
      if (request === pending) {
        pending = null;
        send.disabled = false;
        send.textContent = "Send";
        refreshSuggestions();
      }
    }
  });
  restart.onclick = begin;
  begin();
  return { refreshSuggestions };
}
