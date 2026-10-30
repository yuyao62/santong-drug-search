import test from 'node:test';import assert from 'node:assert/strict';
import {sameThree,validate,search,activeOn,fromCSV,toCSV} from '../core.js';
const base={code:'TEST001',name:'示範藥品',englishName:'DEMO',ingredients:[{name:'INGREDIENT A',strength:'5 mg'},{name:'INGREDIENT B',strength:'10 mg'}],form:'膜衣錠',specification:'每錠',manufacturer:'測試廠',price:2,validFrom:'2026-01-01',validTo:'2026-12-31'};
test('複方順序不同仍一致，大小寫與空白正規化',()=>assert.ok(sameThree(base,{...base,ingredients:[{name:'ingredient b',strength:'10 MG'},{name:'INGREDIENT A ',strength:'5 mg'}]})));
test('缺少成分、不同劑量、鹽類、劑型與規格均不相同',()=>{
 for(const change of [{ingredients:base.ingredients.slice(0,1)},{ingredients:[base.ingredients[0],{name:'INGREDIENT B',strength:'20 mg'}]},{ingredients:[{name:'INGREDIENT A SALT',strength:'5 mg'},base.ingredients[1]]},{form:'緩釋膜衣錠'},{specification:'每 5 mL'}])assert.equal(sameThree(base,{...base,...change}),false);
});
test('給付期間含端點',()=>{assert.ok(activeOn(base,'2026-01-01'));assert.ok(activeOn(base,'2026-12-31'));assert.equal(activeOn(base,'2027-01-01'),false);});
test('資料檢核拒絕缺欄、重複、壞日期、錯誤價格',()=>{
 for(const d of [{...base,form:''},{...base,ingredients:[]},{...base,validFrom:'2026-02-30'},{...base,validFrom:'2027-01-01'},{...base,price:NaN},{...base,manufacturer:{}}])assert.throws(()=>validate([d]));
 assert.throws(()=>validate([base,base]));
});
test('中英多關鍵字與健保碼搜尋',()=>{assert.equal(search([base],'示範 ingredient b').length,1);assert.equal(search([base],'test001').length,1);assert.equal(search([base],'找不到').length,0);});
test('CSV 引號、逗號、換行及 BOM 正確往返',()=>{const d={...base,name:'示範,"藥"\n品'};assert.deepEqual(fromCSV(toCSV([d])),[d]);});
test('未知價為 null，匯出防止試算表公式執行',()=>{const [d]=fromCSV(toCSV([{...base,price:null,name:'=1+1'}]));assert.equal(d.price,null);assert.equal(d.name,"'=1+1");});
test('拒絕錯誤 CSV',()=>{assert.throws(()=>fromCSV('a,b\n"unfinished'));});
