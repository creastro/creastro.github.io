"""Download the raw data behind the presets and store the rows that are used, unmodified.

  NASA Exoplanet Archive (TAP): table ps (every published parameter set) and pscomppars (composite), rows of the targets
  Exoplanet.eu: full catalogue CSV, from which only the rows of the targets are kept
  ADS (API, personal token added by the network proxy): abstracts of the papers cited in spin_measurements.json

Output goes to sources/. The full catalogues are not stored: their SHA-256 and the retrieval time are recorded instead.
Nothing is interpreted here. usage: python3 -I fetch_sources.py   (needs curl and network access to the three hosts)
"""
import csv, datetime, hashlib, io, json, os, subprocess, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sources')
os.makedirs(SRC, exist_ok=True)
targets = json.load(open(os.path.join(HERE, 'targets.json'), encoding='utf-8'))
spin = json.load(open(os.path.join(HERE, 'spin_measurements.json'), encoding='utf-8'))

def curl(url, timeout=180):
    res = subprocess.run(['curl', '-sS', '-L', '-m', str(timeout), '-w', '\n%{http_code}', url], capture_output=True)
    assert res.returncode == 0, 'curl failed for %s: %s' % (url, res.stderr.decode()[:300])
    body, _, code = res.stdout.rpartition(b'\n')
    assert code == b'200', 'HTTP %s for %s' % (code.decode(), url)
    return body

def write(name, data):
    path = os.path.join(SRC, name)
    if os.path.exists(path): os.chmod(path, 0o644)
    with open(path, 'wb') as fh: fh.write(data)
    os.chmod(path, 0o444)
    return hashlib.sha256(data).hexdigest()

log = {'retrieved_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'files': {}, 'full_downloads': {}}

# NASA Exoplanet Archive
names = ','.join("'%s'" % t['nasa'] for t in targets)
for table, order in (('ps', ' order by pl_name,pl_pubdate desc'), ('pscomppars', ' order by pl_name')):
    q = 'select * from %s where pl_name in (%s)%s' % (table, names, order)
    data = curl('https://exoplanetarchive.ipac.caltech.edu/TAP/sync?' + urllib.parse.urlencode({'query': q, 'format': 'csv'}))
    log['files']['nasa_%s_targets.csv' % table] = {'sha256': write('nasa_%s_targets.csv' % table, data), 'query': q}

# Exoplanet.eu: keep the rows of the targets
full = curl('https://exoplanet.eu/catalog/csv/', timeout=300)
log['full_downloads']['https://exoplanet.eu/catalog/csv/'] = {'sha256': hashlib.sha256(full).hexdigest(), 'bytes': len(full)}
reader = csv.DictReader(io.StringIO(full.decode('utf-8')))
wanted = {t['eu'] for t in targets}
rows = [r for r in reader if r['name'] in wanted]
assert {r['name'] for r in rows} == wanted, 'missing in Exoplanet.eu: %s' % (wanted - {r['name'] for r in rows})
buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=reader.fieldnames, lineterminator='\n')
w.writeheader(); w.writerows(rows)
log['files']['exoplanet_eu_targets.csv'] = {'sha256': write('exoplanet_eu_targets.csv', buf.getvalue().encode('utf-8')), 'rule': 'rows of the full catalogue whose name equals the target name'}

# ADS abstracts of the cited papers
bibcodes = sorted({m['bibcode'] for m in spin.values()})
q = 'bibcode:(%s)' % ' OR '.join('"%s"' % b for b in bibcodes)
url = 'https://api.adsabs.harvard.edu/v1/search/query?' + urllib.parse.urlencode({'q': q, 'fl': 'bibcode,title,author,year,pub,volume,page,doi,abstract', 'rows': len(bibcodes) + 5})
data = curl(url)
found = {d['bibcode'] for d in json.loads(data)['response']['docs']}
assert found == set(bibcodes), 'missing in ADS: %s' % (set(bibcodes) - found)
log['files']['ads_abstracts.json'] = {'sha256': write('ads_abstracts.json', data), 'query': q}

write('RETRIEVAL.json', (json.dumps(log, indent=1) + '\n').encode('utf-8'))
print('stored', sorted(log['files']), 'at', log['retrieved_utc'])
