import test from "node:test";
import assert from "node:assert/strict";
import chat from "../api/chat.js";

const draft = { series: "COPPER", quantity: 25, allowance: null };
const body = { catalog: [{ series: "COPPER", name: "Copper", unit: "lb" }],
  draft, locked: false, messages: [{ role: "user", content: "What does the allowance do?" }] };

async function request(body) {
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; } };
  await chat({ method: "POST", headers: {}, body }, res);
  return res;
}

test("chat limits message roles, draft ranges, and model output", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    choices: [{ message: { content: JSON.stringify({ reply: "Okay", draft: { ...draft, series: "unknown" } }) } }],
  }));
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  assert.equal((await request({ ...body, messages: [{ role: "system", content: "Example" }] })).code, 400);
  assert.equal((await request({ ...body, draft: { ...draft, allowance: -1 } })).code, 400);
  assert.equal((await request(body)).code, 503);
});

test("locked orders retain their quantity when the model proposes a revision", async t => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).messages.at(-1).content, body.messages[0].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      reply: "Your weekly allowance is ready to review.", draft: { ...draft, quantity: 100, allowance: 300 },
    }) } }] });
  });
  const response = await request({ ...body, locked: true });
  assert.equal(response.code, 200);
  assert.deepEqual(response.data.draft, { ...draft, allowance: 300 });
});

test("the chat keeps incomplete material lines and buyer wording until clarified", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    choices: [{ message: { content: JSON.stringify({
      reply: "I have all three. Copper starts at one pound. What quantity works for you?",
      draft: proposal,
    }) } }],
  }));
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  const proposal = { series: "COPPER", quantity: null, amountNote: "100 mg", dateNote: "end of this week", allowance: null,
    additional: [{ label: "oil", series: null, quantity: null }, { label: "gold", series: "XAU", quantity: null }] };
  const catalog = [...body.catalog, { series: "XAU", name: "Gold", unit: "troy oz" }];
  const res = await request({ ...body, catalog, localDate: "2026-11-20" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.data.draft, proposal);
  proposal.quantity = 100;
  delete proposal.amountNote;
  delete proposal.dateNote;
  const guarded = await request({ ...body, catalog, messages: [{ role: "user", content: "I need 100mg of copper by the end of this week, and also a bit of oil and gold as well" }] });
  assert.equal(guarded.code, 200);
  assert.equal(guarded.data.draft.quantity, null);
  assert.equal(guarded.data.draft.amountNote, "100 mg");
  assert.equal(guarded.data.draft.dateNote, "end of this week");
  assert.ok(guarded.data.reply.includes("0.001 lb"));
  proposal.additional.unshift({ label: "Copper", series: "COPPER", quantity: null, dateNote: "2026-11-27" });
  proposal.series = proposal.quantity = null;
  const promoted = await request({ ...body, catalog });
  assert.equal(promoted.data.draft.series, "COPPER");
  assert.equal(promoted.data.draft.dueDate, "2026-11-27");
  assert.equal(promoted.data.draft.additional.length, 2);
  delete proposal.additional[0].dateNote;
  const dated = await request({ ...body, catalog, messages: [{ role: "user", content: "Make it 1 lb of copper by November 27, 2026." }] });
  assert.equal(dated.data.draft.dueDate, "2026-11-27");
  proposal.additional[1].dueDate = "2026-02-31";
  assert.equal((await request({ ...body, catalog })).code, 503);
});

test("market questions use the displayed facts and retain the original order", async t => {
  const marketContext = "Recorded quote: Silver at $47 or higher by Nov 19. Midpoint 42%.";
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { messages } = JSON.parse(options.body);
    assert.equal(messages[1].content, marketContext);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "That was a recorded quote.", draft: { ...draft, quantity: 800 } }) } }] });
  });
  const result = await request({ ...body, marketContext });
  assert.equal(result.code, 200);
  assert.deepEqual(result.data, { reply: "That was a recorded quote.", draft });
  assert.equal((await request({ ...body, marketContext: {} })).code, 400);
});

test("market chat uses the calculated order assessment for threshold comparisons", async t => {
  const marketFacts = { quote: "Silver was quoted at 42%.", impact: "The copper signal is 71%. This meets your 65% early-order threshold." };
  const input = { ...body, marketContext: "Copper order", marketFacts };
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  const gateway = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: {
    content: JSON.stringify({ reply: "71% is below 65%." }),
  } }] }));
  assert.equal((await request({ ...input, messages: [{ role: "user", content: "How does this affect my order?" }] })).data.reply, marketFacts.impact);
  assert.equal(gateway.mock.callCount(), 0);
  const answer = (await request(input)).data.reply;
  assert.match(answer, /midpoint of the bid and ask/);
  assert.ok(answer.endsWith(marketFacts.quote + " " + marketFacts.impact));
});

test("the sparrow accepts thousandth-unit requests and rejects finer order quantities", async t => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test";
  t.after(() => { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; });
  const fractional = { ...draft, quantity: .001 };
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: {
    content: JSON.stringify({ reply: "Got it.", draft: fractional }),
  } }] }));
  const response = await request({ ...body, draft: fractional, messages: [{ role: "user", content: "I need 0.001 lb of copper." }] });
  assert.equal(response.code, 200);
  assert.equal(response.data.draft.quantity, .001);
  assert.equal((await request({ ...body, draft: { ...draft, quantity: .0009 } })).code, 400);
});
