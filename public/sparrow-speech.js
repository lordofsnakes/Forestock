// The text reveal and beak use one clock, including the pause at sentence ends.
export function sparrowSpeech(scene, log) {
  const bird = scene.querySelector(".portrait");
  const mouth = bird.querySelector(".mouth-opening");
  const bill = bird.querySelector(".lower-bill");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let reply, timer, beat = [];

  function closeBeak() {
    for (const animation of beat) animation.cancel();
    beat = [];
    bird.classList.remove("speaking");
  }

  function finish() {
    clearTimeout(timer);
    closeBeak();
    if (reply) reply.visual.textContent = reply.content;
    reply = null;
  }

  function revealWord() {
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 36;
    const word = reply.words[reply.index++];
    const token = document.createElement("span");
    token.className = "spoken-word";
    token.textContent = word;
    if (reply.remainder) {
      reply.remainder.textContent = reply.remainder.textContent.slice(word.length);
    }
    reply.visual.insertBefore(token, reply.remainder);
    if (follow) log.scrollTop = log.scrollHeight;

    const duration = Math.min(180, 85 + word.trim().length * 9);
    const timing = { duration, easing: "ease-in-out" };
    for (const animation of beat) animation.cancel();
    beat = [
      mouth.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], timing),
      bill.animate([{ transform: "none" }, { transform: "rotate(22deg)" }, { transform: "none" }], timing),
    ];
    const pause = /[.!?…]["’”)]?$/.test(word.trim()) ? 160 : /[,;:]$/.test(word.trim()) ? 75 : 12;
    timer = setTimeout(reply.index === reply.words.length ? finish : revealWord, duration + pause);
  }

  function sync() {
    if (!reply) return;
    if (reduced.matches || document.hidden || !bill.animate) return finish();
    if (scene.hidden || scene.inert) {
      if (reply.index) finish();
      return;
    }
    if (reply.index === 0) {
      bird.classList.add("speaking");
      revealWord();
    }
  }

  new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ["hidden", "inert"] });
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);

  function speak(line, content) {
    finish();
    const accessible = document.createElement("span");
    accessible.className = "sr-only";
    accessible.textContent = "Sparrow: " + content;
    const visual = document.createElement("span");
    visual.className = "speech";
    visual.setAttribute("aria-hidden", "true");
    bird.closest(".speaker-turn")?.classList.remove("speaker-turn");
    line.classList.add("speaker-turn");
    line.append(bird, accessible, visual);
    // Reserve room for the greeting during the handoff from the wallet screen.
    let remainder = null;
    if (!log.childElementCount) {
      remainder = document.createElement("span");
      remainder.style.visibility = "hidden";
      remainder.textContent = content;
      visual.append(remainder);
    }
    log.append(line);
    log.scrollTop = log.scrollHeight;
    reply = { visual, content, remainder, words: content.match(/\S+\s*/gu) || [content], index: 0 };
    sync();
  }

  return { speak, finish };
}
