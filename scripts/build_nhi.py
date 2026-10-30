"""Convert official 1,859-byte Big5 NHI TXT records to SQLite and web shards.
Usage: python scripts/build_nhi.py RAW_DIRECTORY --as-of YYYY-MM-DD
Source format: https://www.nhi.gov.tw/ch/dl-23028-4a6a13a8a1ad4f30b04b9aa4b222227d-1.pdf
"""
import argparse, collections, datetime, decimal, gzip, hashlib, json, re, sqlite3
from pathlib import Path

def date(s):
    if s == '9991231': return '9999-12-31'
    if not re.fullmatch(r'\d{7}', s): raise ValueError('Invalid ROC date: '+s)
    return datetime.date(int(s[:3])+1911,int(s[3:5]),int(s[5:])).isoformat()

def number(s):
    if not s or s == '-': return None
    n=decimal.Decimal(s)
    if not n.is_finite() or n<0: raise ValueError('Invalid amount')
    return float(n)

def parse_record(b):
    if len(b)!=1859: raise ValueError(f'Unexpected record length: {len(b)}')
    def text(a,z): return b[a:z].decode('cp950',errors='replace').strip()
    ingredients=[]
    for a,z,c,d,e,f in [(236,292,293,305,306,357),(1200,1256,1257,1269,1270,1321),(1322,1378,1379,1390,1391,1442),(1443,1499,1500,1511,1512,1563),(1564,1620,1621,1632,1633,1684),(1685,1741,1742,1753,1754,1805)]:
        name,amount,unit=text(a,z),text(c,d),text(e,f)
        if name or amount or unit: ingredients.append(dict(name=name,amount=number(amount),unit=unit))
    code=text(17,27)
    if not re.fullmatch('[A-Z0-9]{10}',code): raise ValueError('Invalid NHI code: '+code)
    return dict(code=code,name=text(771,899),englishName=text(54,174),form=text(358,444),manufacturer=text(1806,1848),vendor=text(604,624),group=text(900,1200),atc=text(1849,1857),compound=text(14,16),specAmount=number(text(175,182)),specUnit=text(183,235),ingredients=ingredients,price=number(text(28,37)),validFrom=date(text(38,45)),validTo=date(text(46,53)))

def build(raw,asof):
    datetime.date.fromisoformat(asof)
    root=Path(__file__).resolve().parent.parent;out=root/'data';out.mkdir(exist_ok=True)
    db=out/'drugs.sqlite';db.unlink(missing_ok=True)
    conn=sqlite3.connect(db)
    conn.executescript('CREATE TABLE records(id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT, english_name TEXT, form TEXT, manufacturer TEXT, atc TEXT, compound TEXT, spec_amount REAL, spec_unit TEXT, grouping TEXT, price REAL, valid_from TEXT, valid_to TEXT, ingredients_json TEXT NOT NULL); CREATE TABLE provenance(filename TEXT PRIMARY KEY,sha256 TEXT NOT NULL,records INTEGER NOT NULL);')
    bycode=collections.defaultdict(list);total=0;files=[]
    for file in sorted(Path(raw).glob('*')):
        if file.suffix.lower() not in ('.txt','.b5'): continue
        digest=hashlib.sha256();count=0
        for line in file.open('rb'):
            digest.update(line);b=line.rstrip(b'\r\n')
            if not b: continue
            d=parse_record(b);count+=1;total+=1;bycode[d['code']].append(d)
            conn.execute('INSERT INTO records(code,name,english_name,form,manufacturer,atc,compound,spec_amount,spec_unit,grouping,price,valid_from,valid_to,ingredients_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(d['code'],d['name'],d['englishName'],d['form'],d['manufacturer'],d['atc'],d['compound'],d['specAmount'],d['specUnit'],d['group'],d['price'],d['validFrom'],d['validTo'],json.dumps(d['ingredients'],ensure_ascii=False)))
        conn.execute('INSERT INTO provenance VALUES(?,?,?)',(file.name,digest.hexdigest(),count));files.append(dict(filename=file.name,sha256=digest.hexdigest(),records=count))
    if not total: raise ValueError('No records found')
    conn.executescript('CREATE INDEX idx_code ON records(code); CREATE INDEX idx_name ON records(name); CREATE INDEX idx_atc ON records(atc); CREATE INDEX idx_period ON records(valid_from,valid_to);')
    conn.commit();assert conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok';conn.close()
    web=[];reasons=collections.Counter();positive=0
    for code,rows in sorted(bycode.items()):
        past=[r for r in rows if r['validFrom']<=asof]
        current=[r for r in past if asof<=r['validTo']]
        r=max(current or past,key=lambda r:(r['validFrom'],r['validTo'])) if past else min(rows,key=lambda r:r['validFrom'])
        periods=sorted(set((x['validFrom'],x['validTo'],x['price']) for x in rows),key=lambda p:(p[0],p[1],p[2] or -1))
        full=bool(r['ingredients']) and all(i['name'] and i['amount'] is not None and i['unit'] for i in r['ingredients'])
        reason=''
        if '\ufffd' in json.dumps(r,ensure_ascii=False): reason='原檔含無法解碼字元，須核對'
        elif not full: reason='成分或含量欄位不完整'
        elif r['compound']!='N' or len(r['ingredients'])!=1: reason='複方須先核對完整成分'
        elif not re.search('錠|膠囊',r['form']): reason='非口服固體劑型，須核對給藥規格'
        elif re.search(r'\b(?:SR|ER|XR|CR|XL|MR|EC|RETARD|SUSTAINED|EXTENDED|DELAYED)\b',r['englishName'],re.I) and not re.search('緩釋|持續|腸溶|控釋|徐放|遲放',r['form']): reason='品名可能含特殊釋放型態，須核對'
        elif not r['group']: reason='缺少分類分組資料'
        reasons[reason or '可比對單方候選']+=1
        if any(a<=asof<=b and p is not None and p>0 for a,b,p in periods): positive+=1
        # Blank fields remain explicit; they are never permitted to match.
        ingredients=[dict(name=i['name'] or '未提供',strength=((format(decimal.Decimal(str(i['amount'])).normalize(),'f')+' '+i['unit']) if i['amount'] is not None and i['unit'] else '未提供')) for i in r['ingredients']] or [dict(name='未提供',strength='未提供')]
        spec=(str(r['specAmount'])+' '+r['specUnit']) if r['specAmount'] is not None and r['specUnit'] else '原檔未提供規格量'
        web.append(dict(code=code,name=r['name'] or r['englishName'] or code,englishName=r['englishName'],form=r['form'] or '未提供',manufacturer=r['manufacturer'],ingredients=ingredients,specification=spec,price=r['price'],validFrom=r['validFrom'],validTo=r['validTo'],pricePeriods=periods,atc=r['atc'],group=r['group'],matchEligible=not reason,matchReason=reason,snapshotDate=asof))
    shards=[]
    for index in range(0,len(web),6000):
        name=f'drugs-{index//6000:02}.json.gz';payload=json.dumps(web[index:index+6000],ensure_ascii=False,separators=(',',':')).encode()
        packed=gzip.compress(payload,mtime=0);(out/name).write_bytes(packed);shards.append(name)
    with db.open('rb') as source,gzip.GzipFile(filename='',mode='wb',fileobj=(out/'drugs.sqlite.gz').open('wb'),mtime=0) as target:
        import shutil;shutil.copyfileobj(source,target)
    db.unlink()
    manifest=dict(source='中央健康保險署｜115年11月查詢檔（使用者提供）',updatedAt=None,snapshotDate=asof,importedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),recordCount=total,drugCount=len(web),payableCount=positive,shards=shards,files=files,eligibility=dict(reasons),formatSource='https://www.nhi.gov.tw/ch/dl-23028-4a6a13a8a1ad4f30b04b9aa4b222227d-1.pdf',license='政府資料開放授權條款第1版',notes='原檔含歷次價格異動。名稱成分採快照版本，價格按有效期間查詢。金額為0或空白不列為有效正支付價。複方等未核對品項不自動判定三同。')
    (out/'drugs.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest,ensure_ascii=False,indent=2));print('File sizes',[(p.name,p.stat().st_size) for p in out.glob('*.gz')])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('raw');p.add_argument('--as-of',required=True);a=p.parse_args();build(a.raw,a.as_of)
