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
