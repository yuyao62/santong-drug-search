import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {applyNameCorrections,signature} from '../core.js';
const audit=JSON.parse(fs.readFileSync(new URL('../data/name-corrections.json',import.meta.url)));
const m=JSON.parse(fs.readFileSync(new URL('../data/drugs.json',import.meta.url)));
const raw=m.shards.flatMap(n=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../data/'+n,import.meta.url)))));
test('官方名稱校正筆數、原文、成分與價格期間完整保留',()=>{
 const fixed=applyNameCorrections(raw,audit),map=new Map(raw.map(d=>[d.code,d]));
 assert.equal(fixed.filter(d=>d.nameVerification).length,audit.verifiedCount);
 assert.equal(fixed.filter(d=>d.nameReviewReason).length,audit.pendingCount);
 assert.equal(audit.verifiedCount+audit.pendingCount,audit.affectedCount);
 for(const d of fixed){const r=map.get(d.code);assert.equal(signature(d),signature(r));assert.deepEqual(d.pricePeriods,r.pricePeriods);if(d.nameVerification){assert.equal(d.originalName,r.name);assert.ok(!/[?\uFFFD\uE000-\uF8FF]/u.test(d.name));}}
});
test('健保碼相同但英文或原中文不符時，不套用過期校正',()=>{
 const c=audit.corrections[0],r=raw.find(d=>d.code===c.code);
 for(const changed of [{...r,englishName:r.englishName+' DIFFERENT'},{...r,name:'另一品項'}]){
  const [d]=applyNameCorrections([changed],audit);assert.equal(d.name,changed.name);assert.ok(d.nameReviewReason);assert.equal(d.nameVerification,undefined);
 }
});
test('截圖中的四項名稱已依官方資料校正',()=>{
 const fixed=new Map(applyNameCorrections(raw,audit).map(d=>[d.code,d]));
 for(const [code,name] of Object.entries({AC14755100:'双克痛錠',AC57925100:'疱伏膜衣錠500毫克',BC21128229:'哌明克注射劑',AC49858100:'疱易剋 膜衣錠 500 毫克'}))assert.equal(fixed.get(code).name,name);
});
