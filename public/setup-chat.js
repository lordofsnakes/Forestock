import { defaultQuantity, minimumQuantity, totalCents } from "./decision.js";
import { sparrowSpeech } from "./sparrow-speech.js";

export function startChat({ choices, material, quantity, allowance, status, returning, availableFunds, finish, live = false }) {
  const form = document.querySelector("#setup");
  const input = form.elements.reply;
  const send = form.querySelector("button");
  const messages = document.querySelector("#messages");
  const speech = sparrowSpeech(document.querySelector("#welcome"), messages);
  const draftDetails = document.querySelector("#chatDraft");
  const suggestions = document.querySelector("#suggestions");
  const restart = document.querySelector("#restart");
  const next = document.querySelector("#nextFromChat");
  const dialog = document.querySelector("#finishDraft");
  const detailsForm = document.querySelector("#finishDraftForm");
  const fields = document.querySelector("#missingTerms");
  const locked = status !== "Watching";
  const history = [];
  const answered = new Set();
  const questions = ["How does this affect my order?", "What happens at the deadline?", "What do these odds mean?"];
  let draft, pending, marketId, marketContext, marketFacts;

  function say(content, role = "assistant") {
    const line = document.createElement("p");
    if (role === "assistant") {
      line.className = "helper message";
      speech.speak(line, content);
    } else {
      speech.finish();
      line.className = "buyer message step-enter";
      line.textContent = content;
      messages.append(line);
      messages.scrollTop = messages.scrollHeight;
    }
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

  function field(parent, labelText, name, options) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const control = document.createElement(options ? "select" : "input");
    control.name = name;
    control.required = true;
    if (options) control.append(...options);
    label.append(control);
    parent.append(label);
    return control;
  }

  function advance() {
    if (marketContext || pending) return;
    if (ready()) { review(); return; }
    fields.replaceChildren();
    for (const [i, line] of lines().entries()) {
      const asset = selected(line);
      if (asset && line.quantity !== null && !line.dateNote) continue;
      const group = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = asset?.name || line.label || "Material";
      group.append(legend);
      fields.append(group);
      let picker;
      if (!asset) {
        picker = field(group, "Choose material", "material" + i,
          [new Option("Select a material", ""), ...choices().map(a => new Option(a.name, a.series))]);
      }
      if (!asset || line.quantity === null) {
        const qty = field(group, "Quantity", "qty" + i);
        Object.assign(qty, {type:"number", min:String(minimumQuantity), max:"10000", step:".001"});
        if (line.amountNote) qty.placeholder = "You asked for " + line.amountNote;
        const units = () => {
          const unit = (asset || choices().find(a => a.series === picker.value))?.unit;
          qty.parentElement.firstChild.textContent = unit ? "Quantity (" + unit + ")" : "Quantity";
        };
        units();
        if (picker) picker.onchange = units;
      }
      if (line.dateNote) {
        field(group, "Delivery date for “" + line.dateNote + "”", "date" + i).type = "date";
      }
    }
    if (draft.allowance === null) {
      const limit = field(fields, "Weekly spending allowance (test USDC)", "allowance");
      Object.assign(limit, {type:"number", min:"0", max:"100000", step:".01", placeholder:String(allowance)});
    }
    dialog.showModal();
  }

  next.onclick = advance;
  document.querySelector("#keepChatting").onclick = () => dialog.close();
  detailsForm.onsubmit = event => {
    event.preventDefault();
    if (marketContext || pending || !dialog.open) return;
    const controls = detailsForm.elements;
    for (const [i, line] of lines().entries()) {
      if (controls["material"+i]) line.series = controls["material"+i].value;
      if (controls["qty"+i]) {
        line.quantity = controls["qty"+i].valueAsNumber;
        delete line.amountNote;
      }
      if (controls["date"+i]) {
        line.dueDate = controls["date"+i].value;
        delete line.dateNote;
      }
    }
    if (controls.allowance) draft.allowance = controls.allowance.valueAsNumber;
    dialog.close();
    refreshSuggestions();
    if (ready()) review();
  };

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
    next.hidden = Boolean(marketContext);
    send.classList.toggle("primary", Boolean(marketContext));
    if (!marketContext) {
      next.disabled = Boolean(pending);
      next.textContent = pending ? "Updating draft…" : ready() ? "Review order" : "Finish order details";
    }
    if (marketContext) {
      draftDetails.hidden = true;
      suggestions.replaceChildren();
      const question = questions.find(label => !answered.has(label));
      if (!pending && question) {
        const followUp = document.createElement("button");
        followUp.type = "button";
        followUp.textContent = question;
        followUp.onclick = () => { input.value = followUp.textContent; form.requestSubmit(); };
        suggestions.append(followUp);
      }
      return;
    }
    draftDetails.hidden = !draft.series && !draft.additional?.length && draft.allowance === null;
    printLine("draftNeeds", lines().map(line => {
      const asset = selected(line);
      const name = asset?.name || line.label || "Material pending";
      const amount = asset && line.quantity !== null ? line.quantity + " " + asset.unit + " of " : "";
      const timing = line.dueDate ? " · by " + line.dueDate : line.dateNote ? " · " + line.dateNote + "?" : "";
      return (line.amountNote ? line.amountNote + " of " : amount) + name + timing;
    }).join("\n"));
    printLine("draftAllowance", draft.allowance === null
      ? "Weekly allowance pending" : draft.allowance.toLocaleString("en-US") + " test USDC per week");
    suggestions.replaceChildren();
    function offer(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = action;
      suggestions.append(button);
    }
    if (pending || ready()) return;
    const line = incompleteLine();
    if (line && !selected(line)) {
      for (const a of choices()) offer(a.name, () => pick(a.name, line, { series: a.series }));
    } else if (line) {
      if (line.quantity !== null || line.amountNote || draft.additional?.length) return;
      const asset = selected(line);
      const funds = availableFunds(draft.allowance === null ? undefined : Math.round(draft.allowance * 100));
      const preferred = defaultQuantity(asset);
      const suggested = totalCents(preferred, asset.price) <= funds ? preferred : minimumQuantity;
      const cost = totalCents(suggested, asset.price);
      if (cost > funds) {
        suggestions.textContent = "The smallest order (" + minimumQuantity + " " + asset.unit + ") costs " + (cost / 100).toFixed(2) +
          " USDC. Your demo spending balance is " + (funds / 100).toFixed(2) + " USDC.";
        offer("Reset demo workspace", () => document.querySelector("#resetDemo").showModal());
        return;
      }
      const label = suggested + " " + asset.unit;
      offer(label, () => pick(label, line, { quantity: suggested }));
      const quote = document.createElement("small");
      quote.textContent = "$" + (cost / 100).toFixed(2) + (live ? " test USDC" : " in demo funds");
      suggestions.append(quote);
      if (returning && material.series === line.series && quantity !== suggested && totalCents(quantity, asset.price) <= funds) {
        const keep = "Keep " + quantity + " " + asset.unit;
        offer(keep, () => pick(keep, line, { quantity }));
      }
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

  function resetComposer() {
    pending?.abort();
    pending = null;
    speech.finish();
    draftDetails.open = false;
    input.value = "";
    input.placeholder = "Message your sparrow…";
    send.disabled = false;
    send.textContent = "Send";
    restart.hidden = true;
  }

  function marketConversation(id, facts, context, orderDraft) {
    resetComposer();
    const changedQuote = marketId !== id || marketFacts?.quote !== facts.quote;
    if (changedQuote) answered.clear();
    if (marketId !== id) {
      history.length = 0;
      messages.replaceChildren();
    }
    marketId = id;
    marketContext = context;
    marketFacts = facts;
    draft = orderDraft;
    document.querySelector("#backToOrders").hidden = false;
    document.querySelector("#welcomeTitle").textContent = "Market chat";
    if (changedQuote) say(facts.quote);
    refreshSuggestions();
  }

  function begin() {
    resetComposer();
    history.length = 0;
    messages.replaceChildren();
    draft = { series: locked ? material.series : null, quantity: locked ? quantity : null, allowance: null };
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
    if (!marketContext && (/^(next|continue|review(?: my| the)? order|go to (?:the )?review)[.!]?$/i.test(text) ||
      (ready() && /^(yes|confirm)[.!]?$/i.test(text)))) {
      input.value = "";
      advance();
      return;
    }
    say(text, "user");
    input.value = "";
    restart.hidden = Boolean(marketContext);
    const request = new AbortController();
    pending = request;
    const timeout = setTimeout(() => request.abort(), 32000);
    send.disabled = true;
    send.textContent = "Thinking…";
    refreshSuggestions();
    try {
      const today = new Date();
      const localDate = new Date(+today - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({ live, messages: history, draft, locked, localDate, marketContext, marketFacts,
          catalog: choices().map(({ series, name, unit }) => ({ series, name, unit })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.code || "unavailable");
      if (request !== pending) return;
      if (!marketContext) draft = result.draft;
      else if (questions.includes(text)) answered.add(text);
      say(result.reply);
    } catch (error) {
      if (request !== pending) return;
      history.pop();
      say(marketContext ? "I couldn’t answer that just now. Your question is in the message box to try again."
        : error.message === "gateway_verification_required"
        ? "AI chat is waiting for Forestock’s Vercel account verification. You can finish your order details below."
        : "I couldn’t reach AI chat. Try again or tap Finish order details below.");
      if (!input.value) input.value = text;
    } finally {
      clearTimeout(timeout);
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
  return { refreshSuggestions, marketConversation, leaveMarket: resetComposer };
}
