// Keep the sparrow in viewport space while the two screens exchange places.
let travelling = false;
const ease = "cubic-bezier(.35,0,.18,1)";
function at(x, y, scale = 1, tilt = 0) {
  return { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${tilt}deg)` };
}

export async function flyToScreen(from, to, landingSelector, reveal) {
  if (travelling || from.hidden) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) {
    reveal();
    return;
  }
  const bird = from.querySelector(".perch-bird, .portrait");
  const origin = bird.querySelector("span").getBoundingClientRect();
  const flyer = document.createElement("div");
  flyer.className = "bird courier";
  flyer.setAttribute("aria-hidden", "true");
  flyer.append(document.querySelector("#flight-art").content.cloneNode(true));
  document.body.append(flyer);
  const x = origin.left, y = origin.top;
  let arrived = false, landing, entrance;
  const chrome = document.querySelectorAll("body > header, body > nav");
  for (const element of chrome) element.inert = true;
  travelling = from.inert = true;
  bird.style.visibility = "hidden";
  const animate = (node, frames, duration, easing = ease) => node.animate(frames, { duration, easing, fill: "forwards" });
  try {
    const size = origin.width / flyer.offsetWidth;
    const cruiseX = Math.max(12, Math.min(innerWidth - 96, x + innerWidth * .42));
    const cruiseY = Math.max(12, y - 85);
    const leave = animate(from, [{opacity:1}, {opacity:1,offset:.56}, {opacity:0,transform:"translateX(-14px)"}], 1320, "linear");
    const lift = Math.max(8, y - 34);
    // Spend the first beat close to the buyer, then accelerate across the screen.
    await animate(flyer, [
      { ...at(x,y,size), easing:"ease-in-out" },
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
    bird.style.visibility = "";
    if (landing) landing.style.visibility = "";
    entrance?.cancel();
    if (!arrived) reveal();
    from.inert = to.inert = travelling = false;
    for (const element of chrome) element.inert = false;
    to.querySelector("h1")?.focus({preventScroll:true});
  }
}
