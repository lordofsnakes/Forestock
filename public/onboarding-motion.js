import { openStep } from "./navigation.js";
// Keep the sparrow in viewport space while the two screens exchange places.
let travelling = false;
const ease = "cubic-bezier(.35,0,.18,1)";
function at(x, y, scale = 1, tilt = 0) {
  return { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${tilt}deg)` };
}

function blendTakeoff(bird, flyer) {
  // Keep the perched pose in place as the side-facing flight sprite takes over.
  bird.classList.add("taking-off");
  const timing = { duration: 200, easing: "ease-in-out", fill: "forwards" };
  const fade = bird.animate([{ opacity: 1 }, { opacity: 0 }], timing);
  flyer.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  return () => {
    fade.cancel();
    bird.classList.remove("taking-off");
  };
}

export async function flyToScreen(from, to, landingSelector, reveal) {
  if (travelling || from.hidden) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) {
    reveal();
    return;
  }
  const bird = from.querySelector(".perch-bird, .portrait");
  const origin = bird.querySelector("span").getBoundingClientRect();
  const flyer = makeFlyer();
  const x = origin.left, y = origin.top;
  let arrived = false, landing, entrance;
  const chrome = document.querySelectorAll("body > header, body > nav");
  for (const element of chrome) element.inert = true;
  travelling = from.inert = true;
  const restoreBird = blendTakeoff(bird, flyer);
  const animate = (node, frames, duration, easing = ease) => node.animate(frames, { duration, easing, fill: "forwards" });
  try {
    const size = origin.width / flyer.offsetWidth;
    const cruiseX = Math.max(12, Math.min(innerWidth - 96, x + innerWidth * .42));
    const cruiseY = Math.max(12, y - 85);
    const leave = animate(from, [{opacity:1}, {opacity:1,offset:.56}, {opacity:0,transform:"translateX(-14px)"}], 1320, "linear");
    const lift = Math.max(8, y - 34);
    // Spend the first beat close to the buyer, then accelerate across the screen.
    await animate(flyer, [
      { ...at(x,y,size), easing:"ease-out" },
      { ...at(x+4,y+2,size*.99,-2), offset:.12, easing:"ease-in-out" },
      { ...at(x+34,lift,size*.92,-7), offset:.52, easing:"ease-in" },
      at(cruiseX,cruiseY,1.15,8),
    ], 1320, "linear").finished;
    arrived = true;
    reveal();
    leave.cancel();
    to.inert = true;
    landing = to.querySelector(landingSelector);
    if (!landing || landing.getBoundingClientRect().top > innerHeight - 30)
      landing = document.querySelector("header .mark");
    const target = landing.getBoundingClientRect();
    landing.style.visibility = "hidden";
    entrance = animate(to, [{opacity:0,transform:"translateX(18px)"},{opacity:1,transform:"none"}], 650);
    await animate(flyer, [
      at(cruiseX,cruiseY,1.15,8),
      at((cruiseX+target.left)/2, Math.max(8, Math.min(cruiseY,target.top)-30),1.22,-3),
      at(target.left,target.top,target.width/flyer.offsetWidth),
    ], 860).finished;
  } finally {
    flyer.remove();
    restoreBird();
    if (landing) landing.style.visibility = "";
    entrance?.cancel();
    if (!arrived) reveal();
    from.inert = to.inert = travelling = false;
    for (const element of chrome) element.inert = false;
    to.querySelector("h1")?.focus({preventScroll:true});
  }
}

function makeFlyer() {
  const flyer = document.createElement("div");
  flyer.className = "bird courier";
  flyer.setAttribute("aria-hidden", "true");
  flyer.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true" focusable="false">
        <defs>
          <path id="flight-feathers" d="M92 251 C97 208 138 159 190 149 C227 141 256 153 259 184 C263 225 225 268 162 287 C123 300 84 297 92 251Z"/>
          <clipPath id="wing-shape"><use href="#flight-feathers"/></clipPath>
          <mask id="flying-body">
            <rect width="400" height="400" fill="white"/>
            <use href="#flight-feathers" fill="black" stroke="black" stroke-width="4"/>
          </mask>
          <clipPath id="underwing-shape"><path d="M132 135 Q219 106 274 157 L277 248 Q228 314 120 302 Q97 277 103 249 Q110 195 132 165Z"/></clipPath>
        </defs>
        <g clip-path="url(#underwing-shape)">
          <rect x="98" y="125" width="185" height="184" fill="#eed1a7"/>
          <image href="/sparrow.png" width="400" height="400" transform="translate(-970 44) scale(3.8 1)"/>
        </g>
        <image href="/sparrow.png" width="400" height="400" mask="url(#flying-body)"/>
        <g class="courier-wing"><image href="/sparrow.png" width="400" height="400" clip-path="url(#wing-shape)"/></g>
      </svg>`;
  document.body.append(flyer);
  return flyer;
}

export async function flyToArcReview(scene) {
  if (travelling) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) {
    openStep("/arc.html");
    return;
  }
  travelling = true;
  const bird = scene.querySelector(".portrait");
  const origin = bird.getBoundingClientRect();
  const flyer = makeFlyer();
  scene.inert = true;
  const restoreBird = blendTakeoff(bird, flyer);
  const scale = origin.width / flyer.offsetWidth;
  try {
    await flyer.animate([
      {...at(origin.left, origin.top, scale), easing: "ease-out"},
      {...at(origin.left + 5, origin.top - 3, scale, -2), offset: .13, easing: "ease-in-out"},
      {...at(origin.left + 32, Math.max(8, origin.top - 34), scale * .94, -6), offset: .5},
      at(innerWidth + 72, Math.max(8, origin.top - 110), 1, 8)
    ], {duration: 1350, easing: "linear", fill: "forwards"}).finished;
    sessionStorage.setItem("forestock.reviewFlight", String(Date.now()));
  } finally {
    openStep("/arc.html");
    // Restore the conversation if the browser caches it for Back.
    window.addEventListener("pageshow", () => {
      flyer.remove();
      restoreBird();
      scene.inert = travelling = false;
    }, {once:true});
  }
}

export async function landOnArcReview(bird) {
  const time = Number(sessionStorage.getItem("forestock.reviewFlight"));
  sessionStorage.removeItem("forestock.reviewFlight");
  if (!time || Date.now() - time > 30000 || matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) return;
  const target = bird.getBoundingClientRect();
  if (!target.width) return;
  const flyer = makeFlyer();
  bird.style.visibility = "hidden";
  try {
    await flyer.animate([at(-78, Math.max(8, target.top-55), 1, -4),
      at(target.left, target.top, target.width/flyer.offsetWidth)], {duration: 850, easing:"ease-out"}).finished;
  } finally {
    flyer.remove();
    bird.style.visibility = "";
  }
}

export function hop(bird) {
  bird.classList.remove("flying");
  void bird.offsetWidth;
  bird.classList.add("flying");
}
