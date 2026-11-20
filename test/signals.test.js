import {test} from "node:test";
import assert from "node:assert/strict";
import signals,{signalFor} from "../api/signals.js";

test("Outlook quotes the named open outcome and rejects expired or wide books",()=>{
  const now = Date.now();
  const contract = {label:"Candidate A",prices:{bestBid:".5",bestAsk:".56"},expiryDate:new Date(now+86400000).toISOString(),marketState:"open",status:"active"};
  const event = {id:"100",ticker:"TEST",title:"Who wins?",category:"Politics",status:"active",contracts:[
    {...contract,expiryDate:new Date(now-1000).toISOString()}, {...contract,marketState:"closed"},
    {...contract,prices:{bestAsk:".98"}}, {...contract,prices:{bestBid:".61",bestAsk:".95"}}, contract]};
  const result = signalFor(event,"Politics",now);
  assert.equal(result.outcome.label,"Candidate A");
  assert.equal(result.outcome.probability,53);
  assert.ok(result.source.endsWith("/TEST"));
  assert.equal(signalFor(event,"Tech",now),undefined);
});
test("an unavailable category leaves the other feed available",async t=>{
  t.mock.method(globalThis,"fetch",async url=>url.searchParams.get("category")==="Tech"? Response.json({data:[]}) : new Response("",{status:503}));
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;}};
  await signals({},res);
  assert.equal(res.code,200);
  assert.deepEqual(res.body.groups,[{category:"Tech",events:[]},{category:"Politics",events:[],unavailable:true}]);
});
