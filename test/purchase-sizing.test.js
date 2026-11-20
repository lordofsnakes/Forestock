import {test} from "node:test";
import assert from "node:assert/strict";
import {toHex} from "viem";
import {orderId,relatedSalt,purchaseFamilies,sizedPurchases,stockUpQuote} from "../lib/purchase-sizing.js";
import {chooseOffer} from "../lib/supplier-offers.js";
const buyer="0x"+"12".repeat(20);
const line={series:"COPPER",name:"Copper",unit:"lb",price:580,premium:12,cap:600,quantity:10,salt:toHex("example",{size:32})};
const quote=l=>chooseOffer(l,null,null,0);
test("staged plans preserve exact quantity, unique triggers and the total price cap",()=>{
  for(const milli of [1,2,3,4,10,19,111,10000]) for(const threshold of [1,10,70,99,100]){
    const parts=sizedPurchases({...line,quantity:milli/1000},buyer,threshold,true,quote);
    assert.equal(parts.reduce((s,p)=>s+p.quantityMilli,0),milli);
    assert.ok(parts.every(p=>p.quantityMilli>0 && p.threshold>=threshold && p.threshold<=100));
    assert.equal(new Set(parts.map(p=>p.threshold)).size,parts.length);
    assert.ok(parts.reduce((s,p)=>s+Math.max(1,Math.round(p.quantityMilli*line.cap/1000)),0)<=Math.max(1,Math.round(milli*line.cap/1000)));
    assert.ok(parts.reduce((s,p)=>s+p.offer.cents,0)<=Math.max(1,Math.round(milli*line.cap/1000)));
  }
  const parts=sizedPurchases(line,buyer,10,true,quote);const ids=parts.map(p=>orderId(buyer,p.salt));
  const extra=orderId(buyer,relatedSalt(ids[0],"extra"));
  const groups=purchaseFamilies([...ids,extra].reverse(),buyer);
  assert.deepEqual(groups.get(extra),{root:ids[0],portions:ids,extra});
  assert.equal(sizedPurchases(line,buyer,10,false,quote).length,1);
});
test("stock-up needs a current strong forecast, spend headroom and an eligible original need",()=>{
  const now=Date.now();const market={series:"COPPER",observed:new Date(now),expiry:new Date(now+3600000),contracts:[{strike:5.7,bid:.72,ask:.74}]};
  const o={status:1,orderBy:Math.floor(now/1000)+86400,quantityMilli:10000,capCents:601,threshold:10};
  const assess=(order=o,m=market,room=1500)=>stockUpQuote([order],line,m,now,quote,room);
  assert.equal(assess().line.quantity,2.5);assert.equal(assess().probability,73);assert.equal(assess().line.cap,580);
  for(const proposal of [assess({...o,status:5}),assess({...o,threshold:75}),assess({...o,capCents:575}),assess(o,market,1400), assess(o,{...market,contracts:[{strike:5.7,bid:.65,ask:.85}]}),
    assess(o,{...market,observed:new Date(now-3600000)}),assess({...o,orderBy:Math.floor(now/1000)+20}),assess(o,{...market,expiry:new Date(now+172800000)})])
    assert.equal(proposal,undefined);
});
