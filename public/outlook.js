import {escapeText as esc} from "./workspace-controls.js";
import {openStep} from "./navigation.js";

const localTime = value => new Date(value).toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});

export function outlookTab(section, context, onPlan = (series,idea) => {
  sessionStorage.setItem("forestock.outlookIdea."+localStorage.getItem("forestock.arcWallet"),JSON.stringify(idea));
  openStep("/?plan=arc&material="+encodeURIComponent(series));
}) {
  section.innerHTML = `<p>Explore how events could affect your next material purchase.</p>
        <div class="signal-tabs" aria-label="Market category"><button data-category="Tech" aria-pressed="true">Tech</button><button data-category="Politics" aria-pressed="false">Politics</button></div>
        <div id="signalFeed" aria-live="polite"></div>`;
  const feed = section.querySelector("#signalFeed");
  let category = "Tech", snapshot, fetching, page = 0;
  const analyses = new Map();
  const quoteKey = ({id,outcome}) => [id,outcome.label,outcome.probability,outcome.expiry].join("/");
  function paint() {
    if (!snapshot) return;
    const group = snapshot.groups.find(g => g.category === category);
    const events = group?.events || [];
    const rows = events.slice(page * 4, page * 4 + 4).map(event => {
      const {label, probability, expiry} = event.outcome;
      const key = quoteKey(event);
      const result = analyses.get(key);
      const asset = context().catalog.find(a => a.series === result?.series);
      return '<article class="outlook-event"><h3>'+esc(event.title)+'</h3><p class="signal-quote">'+esc(label)+' · '+esc(probability)+'% implied</p>'+
        '<small>Resolves '+esc(localTime(expiry))+' · <a target="_blank" rel="noreferrer" href="'+esc(event.source)+'">Gemini market ↗</a></small>'+
        (result?.reply ? '<strong>Sparrow’s take</strong><p>'+esc(result.reply)+'</p>'+(asset ? '<button data-plan="'+esc(asset.series)+'" data-event="'+esc(event.id)+'">Plan a '+esc(asset.name)+' purchase</button>' : '') :
         '<button data-analyze="'+esc(event.id)+'" '+(result?.pending?'disabled':'')+'>'+(result?.pending?'Sparrow is thinking…':result?.error?'Retry analysis':'Ask Sparrow about the impact')+'</button>'+
         (result?.error?'<p role="status">Sparrow couldn’t analyze this market just now.</p>':''))+'</article>';
    });
    feed.innerHTML = events.length ? '<p class="hint">Gemini quotes checked '+esc(localTime(snapshot.observed))+'</p>'+rows.join("")+
      (page ? '<button data-page="-1">Previous markets</button> ' : '')+(events.length>(page+1)*4 ? '<button data-page="1">More markets</button>' : '') :
      '<p>'+(group?.unavailable?'Gemini’s '+esc(category)+' feed is unavailable.':'No open '+esc(category)+' markets have a qualifying two-sided quote.')+'</p><button data-reload>Check again</button>';
    const lead = events[page * 4];
    if (lead && context().catalog.length && section.isConnected && !section.hidden && !analyses.has(quoteKey(lead))) {
      analyze(lead);
    }
  }
  async function load() {
    if (fetching) return fetching;
    if (snapshot && Date.now()-Date.parse(snapshot.observed)<60000) return paint();
    feed.textContent = "Checking Gemini markets…";
    fetching = (async () => {
      try {
        const response = await fetch("/api/signals",{signal:AbortSignal.timeout(9000)});
        if (!response.ok) throw Error();
        snapshot = await response.json();
        page = 0;
        paint();
      } catch {
        snapshot = null;
        feed.innerHTML = '<p>Gemini’s event feed is unavailable.</p><button data-reload>Try again</button>';
      } finally { fetching = null; }
    })();
    return fetching;
  }
  section.onclick = async e => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.category) {
      category = button.dataset.category;
      page = 0;
      for (const b of section.querySelectorAll("[data-category]")) b.setAttribute("aria-pressed",String(b===button));
      return load();
    }
    if (button.hasAttribute("data-reload")) { snapshot = null; return load(); }
    if (button.dataset.page) { page += Number(button.dataset.page); return paint(); }
    if (button.dataset.plan) {
      const event = snapshot?.groups.find(g=>g.category===category)?.events.find(row=>String(row.id)===button.dataset.event);
      if (event) onPlan(button.dataset.plan,{series:button.dataset.plan,title:event.title,outcome:event.outcome.label,
        observed:snapshot.observed,reason:analyses.get(quoteKey(event))?.reply});
      return;
    }
    if (!button.dataset.analyze || !snapshot) return;
    if (Date.now()-Date.parse(snapshot.observed)>120000) return load();
    const event = snapshot.groups.find(g=>g.category===category)?.events.find(row=>String(row.id)===button.dataset.analyze);
    if (event) await analyze(event);
  };
  async function analyze(event) {
    const {catalog, needs} = context();
    if (!catalog.length) return;
    const key = quoteKey(event);
    analyses.set(key,{pending:true}); paint();
    try {
      const response = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),
        body:JSON.stringify({mode:"outlook",live:true,locked:false,catalog, draft:{series:null,quantity:null,allowance:null},
          marketContext:JSON.stringify({event,observed:snapshot.observed,openMaterials:needs,catalog:catalog.map(a=>[a.series,a.name])}),
          messages:[{role:"user",content:"If this outcome happens, what could change for my material buying and what should I check first?"}]})});
      if (!response.ok) throw Error();
      const result = await response.json();
      if (!result.reply) throw Error();
      analyses.set(key,result);
    } catch { analyses.set(key,{error:true}); }
    paint();
  }
  return load;
}
