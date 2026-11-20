// Keep the sparrow in viewport space while the two screens exchange places.
let travelling = false;
const ease = "cubic-bezier(.35,0,.18,1)";
function at(x, y, scale = 1, tilt = 0) {
  return { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${tilt}deg)` };
}

export async function flyToScreen(from, to, landingSelector, reveal, receipt) {
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
  flyer.append(document.createElement("span"));
  document.body.append(flyer);
  let x = origin.left, y = origin.top;
  let arrived = false, landing, entrance;
  const chrome = document.querySelectorAll("body > header, body > nav");
  for (const element of chrome) element.inert = true;
  travelling = from.inert = true;
  bird.style.visibility = "hidden";
  const animate = (node, frames, duration) => node.animate(frames, { duration, easing: ease, fill: "forwards" });
  try {
    const size = origin.width / flyer.offsetWidth;
    if (receipt) {
      const box = receipt.getBoundingClientRect();
      const pickupX = box.left + box.width * .46;
      const pickupY = box.top - 30;
      await animate(flyer, [at(x,y,size), at(x+55,y-20,1,-7), at(pickupX,pickupY,.85,10)], 390).finished;
      const slip = document.createElement("div");
      slip.className = "courier-slip";
      slip.textContent = receipt.innerText;
      flyer.append(slip);
      const paperX = (box.left - pickupX) / .85 - slip.offsetLeft;
      const paperY = (box.top - pickupY) / .85 - slip.offsetTop;
      const fold = animate(slip, [at(paperX,paperY,box.width / (slip.offsetWidth * .85)),
        at(0,0,1,18)], 240);
      receipt.animate([{opacity:1},{opacity:0,transform:"scale(.82)"}], {duration:180,fill:"forwards"});
      await fold.finished;
      x = pickupX; y = pickupY;
    }
    const edgeX = innerWidth + 90;
    const edgeY = Math.max(22, y - 64);
    const leave = animate(from, [{opacity:1},{opacity:0,transform:"translateX(-14px)"}], 360);
    await animate(flyer, [at(x,y,receipt ? .85 : size), at(x+70,y-45,1,-9), at(edgeX,edgeY,.83,-4)], 470).finished;
    arrived = true;
    reveal();
    leave.cancel();
    to.inert = true;
    landing = to.querySelector(landingSelector);
    if (!landing || landing.getBoundingClientRect().top > innerHeight - 30)
      landing = document.querySelector("header .mark");
    const target = landing.getBoundingClientRect();
    landing.style.visibility = "hidden";
    entrance = animate(to, [{opacity:0,transform:"translateX(18px)"},{opacity:1,transform:"none"}], 450);
    await animate(flyer, [at(-90,Math.max(8,target.top-40),.83,-7), at(target.left,target.top,target.width/flyer.offsetWidth)], 510).finished;
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
