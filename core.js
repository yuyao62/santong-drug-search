export const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
export function validate(drugs) {
  if (!Array.isArray(drugs) || drugs.length > 100000) throw new Error('資料必須是陣列，且不超過 100,000 筆。');
  const codes = new Set();
  for (const d of drugs) {
    if (!d || typeof d !== 'object') throw new Error('藥品格式錯誤。');
    for (const key of ['code','name','form','specification','validFrom','validTo']) {
      if (typeof d[key] !== 'string' || !d[key].trim()) throw new Error(`缺少 ${key}。`);
    }
    if (codes.has(normalize(d.code))) throw new Error(`健保碼重複：${d.code}`);
    codes.add(normalize(d.code));
    if (!Array.isArray(d.ingredients) || !d.ingredients.length) throw new Error(`${d.code} 缺少完整成分。`);
    const ingredients = new Set();
    for (const i of d.ingredients) {
      if (!i || typeof i.name !== 'string' || !i.name.trim() || typeof i.strength !== 'string' || !i.strength.trim()) throw new Error(`${d.code} 成分與含量不可空白。`);
      if (d.matchEligible !== false && ingredients.has(normalize(i.name))) throw new Error(`${d.code} 成分重複。`);
      ingredients.add(normalize(i.name));
    }
    for (const k of ['validFrom','validTo']) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d[k]) || !Number.isFinite(Date.parse(d[k])) || new Date(d[k]).toISOString().slice(0,10) !== d[k]) throw new Error(`${d.code} 日期需為有效 YYYY-MM-DD。`);
    }
    if (d.validFrom > d.validTo) throw new Error(`${d.code} 日期範圍錯誤。`);
    if (d.price !== null && (typeof d.price !== 'number' || !Number.isFinite(d.price) || d.price < 0)) throw new Error(`${d.code} 支付價錯誤，未知請用 null。`);
    if(d.matchEligible != null && typeof d.matchEligible !== 'boolean')throw new Error('matchEligible 格式錯誤');
    if(d.pricePeriods != null){
      if(!Array.isArray(d.pricePeriods)||!d.pricePeriods.length)throw new Error('價格期間格式錯誤');
      for(const p of d.pricePeriods)if(!Array.isArray(p)||p.length!==3||!/^\d{4}-\d{2}-\d{2}$/.test(p[0])||!/^\d{4}-\d{2}-\d{2}$/.test(p[1])||p[0]>p[1]||(p[2]!==null && (typeof p[2]!=='number'||!Number.isFinite(p[2])||p[2]<0)))throw new Error('價格期間內容錯誤');
    }
    for (const key of ['englishName','manufacturer','group','snapshotDate','matchReason']) if (d[key] != null && typeof d[key] !== 'string') throw new Error(`${d.code} ${key} 格式錯誤。`);
  }
  return drugs;
}
// 完整成分 + 含量 + 詳細劑型 + 給藥規格逐字比對；不猜測鹽類、單位或釋放型態。
export function signature(d) {
  return JSON.stringify([d.ingredients.map(i => [normalize(i.name),normalize(i.strength)]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), normalize(d.form),normalize(d.specification)]);
}
export const sameThree = (a,b) => a.matchEligible !== false && b.matchEligible !== false && (!a.group || !b.group || normalize(a.group) === normalize(b.group)) && signature(a) === signature(b);
export function periodOn(d,date) {
  if (!d.pricePeriods) return d.validFrom <= date && date <= d.validTo ? [d.validFrom,d.validTo,d.price] : null;
  return d.pricePeriods.filter(p => p[0] <= date && date <= p[1]).sort((a,b) => b[0].localeCompare(a[0]))[0] || null;
}
export const activeOn = (d,date) => { const p=periodOn(d,date);return !!p && p[2] != null && p[2] > 0; };
export function atDate(d,date) {
  if(!d.pricePeriods)return d;
  const p=periodOn(d,date);
  return {...d,price:p ? p[2] : null,validFrom:p ? p[0] : d.validFrom,validTo:p ? p[1] : d.validTo};
}
export const search = (drugs,query) => {
  const tokens = normalize(query).split(' ').filter(Boolean);
  return drugs.filter(d => tokens.every(t => normalize([d.code,d.name,d.englishName,d.manufacturer,...d.ingredients.map(i=>i.name)].join(' ')).includes(t)));
};
export function parseCSV(text) {
  const rows=[]; let row=[],value='',quoted=false;
  const s=text.replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++) {
    const c=s[i];
    if(c==='"') { if(quoted && s[i+1]==='"'){value+='"';i++;} else if(!quoted && value) throw new Error('CSV 引號位置錯誤。'); else quoted=!quoted; }
    else if(c===',' && !quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r') && !quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(value);if(row.some(x=>x!==''))rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('CSV 引號未關閉。');
  row.push(value);if(row.some(x=>x!==''))rows.push(row);
  if(!rows.length)throw new Error('CSV 為空。');
  const headers=rows.shift().map(x=>x.trim());
  if(new Set(headers).size!==headers.length)throw new Error('CSV 欄位重複。');
  return rows.map(r=>{if(r.length!==headers.length)throw new Error('CSV 欄位數不一致。');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export function fromCSV(text) {
  return validate(parseCSV(text).map(r=>({...r,ingredients:JSON.parse(r.ingredients),price:r.price?.trim()?Number(r.price):null})));
}
export function toCSV(drugs) {
  const keys=['code','name','englishName','ingredients','form','specification','manufacturer','price','validFrom','validTo'];
  const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[keys.join(','),...drugs.map(d=>keys.map(k=>cell(k==='ingredients'?JSON.stringify(d[k]):d[k])).join(','))].join('\r\n');
}
