"""Verify damaged NHI Chinese names against official TFDA license JSON ZIP.

Usage: python scripts/verify_names.py /path/to/tfda-licenses.zip
Names are overlaid, never guessed or written over the original NHI shards.
"""
import collections,datetime,gzip,hashlib,json,re,sys,unicodedata,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SOURCE='https://data.fda.gov.tw/data/opendata/export/36/json'

def canonical(value):
    return ''.join(c for c in unicodedata.normalize('NFKC',value or '').upper() if c.isalnum())

def english_key(value):
    # Only this explicit NHI packaging suffix is omitted; strength remains intact.
    return canonical(re.sub(r'\(鋁箔/膠箔\)\s*$','',value))

def broken(value):
    return any(c in value for c in ['?','\ufffd']) or any(unicodedata.category(c)=='Co' for c in value)

def family(license,code):
    if code.startswith(('A','N')): return '製' in license and '輸' not in license
    if code.startswith(('B','K','Y')): return '輸' in license
    return False

def matches_english(nhi,tfda):
    if english_key(nhi)==english_key(tfda):return 'license-number-and-english'
    # Exact, reviewed variation: manufacturer and ingredient parentheses swapped.
    pair=('BENAMINE INJECTION 30MG/ML (DIPHENHYDRAMINE HCL) "VPP"',
          'BENAMINE INJECTION 30MG/ML "VPP" (DIPHENHYDRAMINE HCL)')
    if canonical(nhi)==canonical(pair[0]) and canonical(tfda)==canonical(pair[1]):
        return 'license-number-and-reviewed-english-order'
    return None

def build(path):
    packed=Path(path).read_bytes()
    with zipfile.ZipFile(path) as z:
        names=[n for n in z.namelist() if n.lower().endswith('.json')]
        if len(names)!=1:raise ValueError('Expected exactly one TFDA JSON file')
        records=json.loads(z.read(names[0]).decode('utf-8-sig'))
    index=collections.defaultdict(list)
    for r in records:
        n=re.search(r'第(\d{6})號',r['許可證字號'])
        if n:index[n[1]].append(r)
    manifest=json.loads((ROOT/'data/drugs.json').read_text())
    drugs=[d for n in manifest['shards'] for d in json.loads(gzip.decompress((ROOT/'data'/n).read_bytes()))]
    changes=[];pending=[]
    for d in drugs:
        if not broken(d['name']):continue
        rows=[r for r in index[d['code'][2:7].zfill(6)] if family(r['許可證字號'],d['code'])]
        matches=[(r,matches_english(d['englishName'],r['英文品名'])) for r in rows]
        matches=[(r,method) for r,method in matches if method and not broken(r['中文品名'])]
        unique={r['中文品名'].strip() for r,method in matches}
        if len(unique)!=1:
            pending.append(dict(code=d['code'],originalName=d['name'],englishName=d['englishName'],reason='官方名稱仍含自訂字元或缺字' if any(broken(r['中文品名']) for r in rows) else '英文品名差異，尚未唯一確認',candidates=[dict(license=r['許可證字號'],name=r['中文品名'],englishName=r['英文品名']) for r in rows]))
            continue
        r,method=matches[0]
        changes.append(dict(code=d['code'],originalName=d['name'],englishName=d['englishName'],name=r['中文品名'].strip(),license=r['許可證字號'],sourceEnglishName=r['英文品名'],sourceApplicant=r['申請商名稱'],sourceLicenseStatus=r['註銷狀態'],sourceModifiedDate=r['異動日期'],method=method))
    audit=dict(source=SOURCE,dataset='https://data.gov.tw/dataset/9122',sourceSha256=hashlib.sha256(packed).hexdigest(),checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),sourceRecordCount=len(records),affectedCount=len(changes)+len(pending),verifiedCount=len(changes),pendingCount=len(pending),corrections=changes,pending=pending)
    (ROOT/'data/name-corrections.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in audit.items() if k not in ['corrections','pending']},ensure_ascii=False,indent=2))
    print('Screenshot examples',[(x['code'],x['originalName'],x['name']) for x in changes if x['code'] in ['AC57925100','AC14755100','BC21128229','AC49858100']])
    print('Pending',[(x['code'],x['reason']) for x in pending])

if __name__=='__main__':build(sys.argv[1])
