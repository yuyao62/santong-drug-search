import {validate,search,sameThree,activeOn,atDate,fromCSV,toCSV} from './core.js';
const $=id=>document.getElementById(id);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let official=[],drugs=[],visible=[],selected=null,limit=40,mode='正式資料';
$('date').value=today();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
function setMode(label,source,date){mode=label;$('mode').textContent=label;$('metadata').textContent=`${drugs.length.toLocaleString()} 筆 · ${source}${date?' · '+date:''}`;}
function detail(d){return `${d.ingredients.map(i=>`${i.name} ${i.strength}`).join(' + ')}\n${d.form} · ${d.specification}\n${d.manufacturer||'廠商未提供'} · 給付期間 ${d.validFrom} ～ ${d.validTo}`;}
function render(){
  const date=$('date').value;
  if(!date){$('message').textContent='請選擇有效查詢日期。';return;}
  const snapshotMismatch=selected?.snapshotDate && date!==selected.snapshotDate;
  let list=selected?(snapshotMismatch?[]:drugs.filter(d=>d.code!==selected.code&&sameThree(selected,d))):search(drugs,$('query').value);
  list=list.map(d=>atDate(d,date));
  if($('active').checked)list=list.filter(d=>activeOn(d,date));
  list.sort($('sort').value==='price'?(a,b)=>(a.price??Infinity)-(b.price??Infinity):(a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  visible=list;$('count').textContent=`${list.length.toLocaleString()} 個品項`;$('export').disabled=!list.length;
  $('resultTitle').textContent=selected?'三同候選品項':'查詢結果';
  const container=$('results');container.replaceChildren();
  if(selected && snapshotMismatch)$('message').textContent=`三同比對請選擇快照日 ${selected.snapshotDate}。其他日期僅供查詢價格有效期間。`;
  if(!list.length){const n=el('div',null,'empty');n.append(el('strong',drugs.length?'沒有符合條件的品項':'先加入藥品資料，開始查詢。'),el('p',drugs.length?'試試其他關鍵字、日期或取消篩選。三同比對僅限快照日；查無候選不代表沒有其他藥品。':'可匯入已整理的 JSON / CSV，或按「體驗示範」查看操作。正式藥品主檔尚未載入。'));container.append(n);}
  for(const d of list.slice(0,limit)){
    const row=el('article',null,'drug'),body=el('div'),side=el('div',null,'drug-side');
    body.append(el('span',d.code,'code'),el('h3',d.name));
    if(d.englishName)body.append(el('span',d.englishName,'code'));
    if(mode==='示範資料')body.append(el('div','虛構示範品項，非實際藥品','badge'));
    const p=el('p',detail(d),'detail');p.style.whiteSpace='pre-line';body.append(p);
    if(!activeOn(d,date))body.append(el('span','查詢日無有效正支付價','badge'));
    const price=el('div',d.price==null?'—':d.price===0?'0（待核對）':`$${d.price.toFixed(2)}`,'price');price.append(el('small',' / 原檔計價單位'));side.append(price);
    if(d.matchReason)body.append(el('div',d.matchReason,'badge'));
    const b=el('button',d.matchEligible===false?'待核對':(selected?'以此品項比對':'查詢三同'));b.disabled=d.matchEligible===false;b.addEventListener('click',()=>choose(d));side.append(b);row.append(body,side);container.append(row);
  }
  $('more').hidden=list.length<=limit;
}
function choose(d){selected=d;limit=40;const box=$('selected');box.hidden=false;box.replaceChildren(el('span','正在比對的原品項','tag'),el('h3',`${d.name} · ${d.code}`));const p=el('p',detail(d),'detail');p.style.whiteSpace='pre-line';box.append(p,el('p','清單已排除原品項。完整成分、含量、劑型、規格及官方分類分組均須一致；僅供藥師核對，不代表可直接替代。','detail'));const b=el('button','返回搜尋結果','secondary');b.onclick=()=>{clearSelection();render();};box.append(b);render();box.scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearSelection(){selected=null;$('selected').hidden=true;limit=40;}
$('searchForm').onsubmit=e=>{e.preventDefault();clearSelection();render();};
for(const id of ['active','date','sort'])$(id).addEventListener('change',()=>{limit=40;render();});
$('more').onclick=()=>{limit+=40;render();};
$('export').onclick=()=>{const blob=new Blob([toCSV(visible)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`${mode==='示範資料'?'DEMO_':''}三同查詢_${$('date').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('importFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>50*1024*1024)throw new Error('檔案請小於 50 MB。');
    const text=await file.text();let imported;
    if(file.name.toLowerCase().endsWith('.csv'))imported=fromCSV(text);else {const parsed=JSON.parse(text);imported=validate(Array.isArray(parsed)?parsed:parsed.drugs);}
    drugs=imported;clearSelection();setMode('本次匯入',file.name,today());$('message').textContent='匯入成功，僅保留於這次瀏覽；重新整理即清除。匯入日期不代表資料生效或官方更新日期。';render();
  }catch(err){$('message').textContent=`匯入失敗：${err.message} 原有資料仍保留。`;}
  finally{e.target.value='';}
};
$('demo').onclick=async()=>{try{const r=await fetch('./data/demo.json');if(!r.ok)throw Error();drugs=validate(await r.json());clearSelection();$('query').value='';setMode('示範資料','全部為虛構品項，僅供功能測試',null);$('message').textContent='示範模式：品名、健保碼、廠商與支付價均為虛構，不可用於調劑。';render();}catch{$('message').textContent='示範資料載入失敗，請確認網站檔案完整。';}};
let officialMeta=null;
$('reset').onclick=()=>{drugs=official;clearSelection();$('query').value='';setMode('正式資料',officialMeta?.source||'正式資料未載入',officialMeta?.updatedAt);$('message').textContent='';render();};
try{const response=await fetch('./data/drugs.json');if(!response.ok)throw Error();const data=await response.json();
  if(data.shards){
    if(!globalThis.DecompressionStream)throw Error('瀏覽器不支援壓縮資料，請更新瀏覽器。');
    $('metadata').textContent='正在讀取正式藥品資料庫…';
    const parts=await Promise.all(data.shards.map(async name=>{
      const r=await fetch('./data/'+name);if(!r.ok)throw Error('資料分檔載入失敗');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }));
    official=validate(parts.flat());
    if(official.length!==data.drugCount)throw Error('資料筆數檢核失敗');
    $('message').textContent=`正式主檔：${data.recordCount.toLocaleString()} 筆歷次紀錄，${data.drugCount.toLocaleString()} 個健保碼。成分與品名為 ${data.snapshotDate} 快照；價格依所選日期查詢。複方與未完整核對的劑型不自動比對。`;
  }else official=validate(data.drugs);drugs=official;officialMeta=data;setMode('正式資料',data.source,data.snapshotDate||data.updatedAt);render();}
catch{$('metadata').textContent='正式資料載入失敗';$('message').textContent='請透過網站網址或本機 HTTP 伺服器開啟，可繼續使用匯入功能。';render();}
