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
    line.textContent = content;
    messages.append(line);
    messages.scrollTop = messages.scrollHeight;
    history.push({ role, content });
    if (history.length > 16) history.shift();
  }

  function selected() {
    return choices().find(a => a.series === draft.series);
  }

  function ready() {
    return selected() && draft.quantity !== null && draft.allowance !== null;
  }

  function summary() {
    return draft.quantity + " " + selected().unit + " of " + selected().name +
      " · " + draft.allowance.toLocaleString("en-US") + " test USDC per week";
  }

  function refreshSuggestions() {
    suggestions.replaceChildren();
    function offer(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = action;
      suggestions.append(button);
    }
    if (pending) return;
    if (ready()) {
      const terms = document.createElement("p");
      terms.className = "draft-terms";
      terms.textContent = summary();
      suggestions.append(terms);
      offer("Review order", () => finish(selected(), draft.quantity, draft.allowance));
    } else if (!selected()) {
      for (const a of choices()) offer(a.name, () => pick(a.name, { series: a.series }));
    } else if (draft.quantity === null) {
      const label = quantity + " " + selected().unit;
      offer(label, () => pick(label, { quantity }));
    } else {
      const label = allowance + " USDC";
      offer(label, () => pick(label, { allowance }));
    }
  }

  function pick(label, update) {
    say(label, "user");
    Object.assign(draft, update);
    restart.hidden = false;
    if (ready()) say("Ready when you are. Review your order below or tell me what to change.");
    else if (draft.quantity === null) say("How much " + selected().name + " do you need, in " + selected().unit + "?");
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
      finish(selected(), draft.quantity, draft.allowance);
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
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({ messages: history, draft, locked,
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
