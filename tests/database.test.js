import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {validate,activeOn,atDate,sameThree} from '../core.js';
const m=JSON.parse(fs.readFileSync(new URL('../data/drugs.json',import.meta.url)));
test('正式主檔分檔完整、健保碼唯一、快照日期正支付價筆數符合清單',{skip:!m.shards},()=>{
  const drugs=validate(m.shards.flatMap(n=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../data/'+n,import.meta.url))))));
  assert.equal(drugs.length,m.drugCount);
  assert.equal(drugs.filter(d=>activeOn(d,m.snapshotDate)).length,m.payableCount);
  const blocked=drugs.find(d=>d.matchEligible===false);assert.equal(sameThree(blocked,blocked),false);
});
test('價格按指定日期選擇，零金額及期間空隙不列有效正支付價',()=>{
  const d={price:8,validFrom:'2020-01-01',validTo:'9999-12-31',pricePeriods:[['2026-01-01','2026-06-30',5],['2026-07-01','2026-12-31',3],['2027-02-01','9999-12-31',0]]};
  assert.equal(atDate(d,'2026-06-30').price,5);assert.equal(atDate(d,'2026-07-01').price,3);
  assert.equal(atDate(d,'2027-01-01').price,null);assert.equal(activeOn(d,'2027-02-01'),false);
});
