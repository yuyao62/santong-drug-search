"""Build the downloadable SQLite snapshot and full price-period tables from web data."""
import gzip,json,sqlite3,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
data=root/'data'
m=json.loads((data/'drugs.json').read_text())
if 'shards' not in m: raise ValueError('Official data manifest required')
db=data/'drugs.sqlite';db.unlink(missing_ok=True)
audit=json.loads((data/'name-corrections.json').read_text())
corrections={x['code']:x for x in audit['corrections']}
c=sqlite3.connect(db)
c.executescript('CREATE TABLE drugs(code TEXT PRIMARY KEY,name TEXT,english_name TEXT,form TEXT,specification TEXT,manufacturer TEXT,atc TEXT,grouping TEXT,match_eligible INTEGER,match_reason TEXT,snapshot_date TEXT); CREATE TABLE ingredients(code TEXT,position INTEGER,name TEXT,strength TEXT,PRIMARY KEY(code,position)); CREATE TABLE price_periods(code TEXT,valid_from TEXT,valid_to TEXT,price REAL); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);')
for name in m['shards']:
    rows=json.loads(gzip.decompress((data/name).read_bytes()))
    for d in rows:
        fix=corrections.get(d['code'])
        if fix and fix['originalName']==d['name'] and fix['englishName']==d['englishName']:d={**d,'name':fix['name']}
        c.execute('INSERT INTO drugs VALUES(?,?,?,?,?,?,?,?,?,?,?)',(d['code'],d['name'],d['englishName'],d['form'],d['specification'],d['manufacturer'],d['atc'],d['group'],int(d['matchEligible']),d['matchReason'],d['snapshotDate']))
        c.executemany('INSERT INTO ingredients VALUES(?,?,?,?)',[(d['code'],i,x['name'],x['strength']) for i,x in enumerate(d['ingredients'])])
        c.executemany('INSERT INTO price_periods VALUES(?,?,?,?)',[(d['code'],*p) for p in d['pricePeriods']])
c.execute('CREATE TABLE name_audit(code TEXT PRIMARY KEY,original_name TEXT,corrected_name TEXT,status TEXT,license TEXT,source_url TEXT,evidence_json TEXT)')
for fix in audit['corrections']:
    c.execute('INSERT INTO name_audit VALUES(?,?,?,?,?,?,?)',(fix['code'],fix['originalName'],fix['name'],'verified',fix['license'],audit['dataset'],json.dumps(fix,ensure_ascii=False)))
for pending in audit['pending']:
    c.execute('INSERT INTO name_audit VALUES(?,?,?,?,?,?,?)',(pending['code'],pending['originalName'],None,'pending',None,audit['dataset'],json.dumps(pending,ensure_ascii=False)))
m['nameVerification']={k:v for k,v in audit.items() if k not in ['corrections','pending']}
for k,v in m.items():c.execute('INSERT INTO metadata VALUES(?,?)',(k,json.dumps(v,ensure_ascii=False)))
c.executescript('CREATE INDEX idx_name ON drugs(name); CREATE INDEX idx_code_period ON price_periods(code,valid_from,valid_to);')
assert c.execute('SELECT COUNT(*) FROM drugs').fetchone()[0]==m['drugCount']
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
c.commit();print('SQLite:',c.execute('SELECT COUNT(*) FROM drugs').fetchone()[0],'drugs,',c.execute('SELECT COUNT(*) FROM price_periods').fetchone()[0],'price periods');c.close()
with db.open('rb') as source,(data/'drugs.sqlite.gz').open('wb') as packed,gzip.GzipFile(filename='',fileobj=packed,mode='wb',mtime=0) as target:shutil.copyfileobj(source,target)
db.unlink()
