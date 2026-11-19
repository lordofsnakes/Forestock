export const price=580, premium=12, day=86400000;
export function week(t){return Math.floor((t+3*day)/(7*day))}
export function refresh(s,t){
  if(s.week!==week(t)){s.week=week(t);s.used=0}
  return s;
}
export function evaluate(s,m,t,marketTime=t){
  const o=s.order, total=o.qty*price;
  const block=reason=>({kind:'Blocked',reason});
  if(s.paused)return block('Your purchasing allowance is paused.');
  if(o.cap<price)return block('The supplier quote exceeds your unit-price limit.');
  if(o.qty>500)return block('The supplier has only 500 lb available.');
  if(total>Math.min(s.balance,s.limit-s.used))return block('The order exceeds your available purchasing funds.');
  const cutoff=o.due-day;
  if(t>cutoff+60000)return block('The supplier can no longer meet your delivery deadline.');
  if(t>=cutoff)return {kind:'Buy',reason:'Last safe ordering time reached. The offer meets your terms.'};
  const c=m?.contracts.filter(c=>Math.round(c.strike*100)+premium>price).sort((a,b)=>a.strike-b.strike)[0];
  if(!c || Math.abs(marketTime-Date.parse(m.observed))>120000 || Date.parse(m.expiry)<=marketTime || Date.parse(m.expiry)>cutoff)return {kind:'Wait',reason:'Waiting for a current market within your purchasing window.'};
  const probability=(c.bid+c.ask)/2;
  return {kind:probability>=.65?'Buy':'Wait',reason:'The market implies '+Math.round(probability*100)+'% for copper at or above $'+c.strike.toFixed(2)+'. Your early-order threshold is 65%.',contract:c};
}
