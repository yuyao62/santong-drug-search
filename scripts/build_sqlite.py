"""Build the downloadable SQLite snapshot and full price-period tables from web data."""
import gzip,json,sqlite3,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
data=root/'data'
m=json.loads((data/'drugs.json').read_text())
if 'shards' not in m: raise ValueError('Official data manifest required')
db=data/'drugs.sqlite';db.unlink(missing_ok=True)
c=sqlite3.connect(db)
c.executescript('CREATE TABLE drugs(code TEXT PRIMARY KEY,name TEXT,english_name TEXT,form TEXT,specification TEXT,manufacturer TEXT,atc TEXT,grouping TEXT,match_eligible INTEGER,match_reason TEXT,snapshot_date TEXT); CREATE TABLE ingredients(code TEXT,position INTEGER,name TEXT,strength TEXT,PRIMARY KEY(code,position)); CREATE TABLE price_periods(code TEXT,valid_from TEXT,valid_to TEXT,price REAL); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);')
for name in m['shards']:
    rows=json.loads(gzip.decompress((data/name).read_bytes()))
    for d in rows:
        c.execute('INSERT INTO drugs VALUES(?,?,?,?,?,?,?,?,?,?,?)',(d['code'],d['name'],d['englishName'],d['form'],d['specification'],d['manufacturer'],d['atc'],d['group'],int(d['matchEligible']),d['matchReason'],d['snapshotDate']))
        c.executemany('INSERT INTO ingredients VALUES(?,?,?,?)',[(d['code'],i,x['name'],x['strength']) for i,x in enumerate(d['ingredients'])])
        c.executemany('INSERT INTO price_periods VALUES(?,?,?,?)',[(d['code'],*p) for p in d['pricePeriods']])
for k,v in m.items():c.execute('INSERT INTO metadata VALUES(?,?)',(k,json.dumps(v,ensure_ascii=False)))
c.executescript('CREATE INDEX idx_name ON drugs(name); CREATE INDEX idx_code_period ON price_periods(code,valid_from,valid_to);')
assert c.execute('SELECT COUNT(*) FROM drugs').fetchone()[0]==m['drugCount']
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
c.commit();print('SQLite:',c.execute('SELECT COUNT(*) FROM drugs').fetchone()[0],'drugs,',c.execute('SELECT COUNT(*) FROM price_periods').fetchone()[0],'price periods');c.close()
with db.open('rb') as source,(data/'drugs.sqlite.gz').open('wb') as packed,gzip.GzipFile(filename='',fileobj=packed,mode='wb',mtime=0) as target:shutil.copyfileobj(source,target)
db.unlink()
