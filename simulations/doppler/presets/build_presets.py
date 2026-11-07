"""Build ../presets.js (presets for real directly imaged planets and brown dwarfs) from sources/.

Inputs (all read-only): sources/*  (raw rows from NASA Exoplanet Archive, Exoplanet.eu and ADS abstracts),
                        targets.json, spin_measurements.json (values copied from ADS abstracts, with evidence strings).
Output: ../presets.js   usage: python3 -I build_presets.py

What a preset sets in the simulation: the inclination i of the spin axis and the equatorial speed v_eq.
Nothing is defaulted. If an input that a preset needs is missing, or an evidence string is not found in the abstract
it is quoted from, the script stops with an error.

Rules (chosen with the user):
  1. v_eq = v sin i / sin i  when a projected velocity was measured, else v_eq = 2 pi R / P from a measured period.
  2. Spin inclination: measured value if there is one; else the orbital inclination (spin assumed parallel to the
     orbit); else 90 deg (assumed equator-on).
  3. NASA Exoplanet Archive: among all published parameter sets (table ps), the set with the most recent reference that
     has the quantity. Ties in date are broken by the archive's default flag, and an unresolved tie is an error.
     If no set has it, the composite table (pscomppars) is used and said so.
  4. Exoplanet.eu does not publish a reference per value, so its values cannot take part in rule 3. They are shown
     beside the NASA value and flagged when they differ by more than 10 %, with the result they would give.
     If NASA has no value but Exoplanet.eu has, the Exoplanet.eu value is used and the panel says so.
"""
import csv, html, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(HERE, '..', 'presets.js')

R_JUP_KM = 71492.0            # nominal equatorial radius of Jupiter (IAU 2015 resolution B3), km
REL_FLAG = 0.10               # catalogs are flagged when they differ by more than this fraction
ADS_ABS = 'https://ui.adsabs.harvard.edu/abs/%s/abstract'


def load_csv(name):
    with open(os.path.join(SRC, name), encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


def num(s):
    s = (s or '').strip()
    return float(s) if s else None


def strip_tags(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def parse_ref(raw):
    """NASA reference field -> (text, bibcode or None)."""
    text = re.sub(r'\s+', ' ', strip_tags(raw))
    m = re.search(r'/abs/([^/]+)/abstract', raw)
    return text, (html.unescape(m.group(1)) if m else None)


def sym(plus, minus):
    """Symmetric error from an upper and a lower error (None if either is missing)."""
    if plus is None or minus is None:
        return None
    return (abs(plus) + abs(minus)) / 2.0


def fmt(v, nd):
    return ('%.*f' % (nd, v)).rstrip('0').rstrip('.') if nd > 0 else '%d' % round(v)


def fmt_err(v, plus, minus, nd, unit=''):
    if plus is None or minus is None:
        return fmt(v, nd) + (' ' + unit if unit else '')
    if abs(abs(plus) - abs(minus)) < 10 ** (-nd) * 0.5:
        s = '%s ± %s' % (fmt(v, nd), fmt(abs(plus), nd))
    else:
        s = '%s +%s −%s' % (fmt(v, nd), fmt(abs(plus), nd), fmt(abs(minus), nd))
    return s + (' ' + unit if unit else '')


# ---------------------------------------------------------------- sources
targets = json.load(open(os.path.join(HERE, 'targets.json'), encoding='utf-8'))
spin_all = json.load(open(os.path.join(HERE, 'spin_measurements.json'), encoding='utf-8'))
retrieval = json.load(open(os.path.join(SRC, 'RETRIEVAL.json'), encoding='utf-8'))
ps_rows = load_csv('nasa_ps_targets.csv')
comp_rows = {r['pl_name']: r for r in load_csv('nasa_pscomppars_targets.csv')}
eu_rows = {r['name']: r for r in load_csv('exoplanet_eu_targets.csv')}
ads = {d['bibcode']: d for d in json.load(open(os.path.join(SRC, 'ads_abstracts.json'), encoding='utf-8'))['response']['docs']}


def ads_cite(bibcode):
    d = ads[bibcode]
    first = d['author'][0].split(',')[0]
    etal = ' et al.' if len(d['author']) > 1 else ''
    return '%s%s %s' % (first, etal, d['year'])


def selftest():
    # Jupiter: equatorial radius 71 492 km, rotation period 9.925 h -> equatorial speed about 12.6 km/s
    v_jup = 2.0 * math.pi * 1.0 * R_JUP_KM / (9.925 * 3600.0)
    assert abs(v_jup - 12.57) < 0.05, v_jup
    # the two routes to v_eq agree: v sin i / sin i, and 2 pi R / P with the period that follows from them
    veq = 19.9 / math.sin(math.radians(89.0))
    R = 1.35
    P_h = 2.0 * math.pi * R * R_JUP_KM / veq / 3600.0
    assert abs(2.0 * math.pi * R * R_JUP_KM / (P_h * 3600.0) - veq) < 1e-9
    assert fold_incl(100.0) == 80.0 and fold_incl(30.0) == 30.0


# the slider limits in the page must contain every preset value
page = open(os.path.join(HERE, '..', 'index.html'), encoding='utf-8').read()


def slider(id_):
    m = re.search(r'<input id="%s" type="range" min="([\d.]+)" max="([\d.]+)"' % id_, page)
    assert m, 'slider %s not found in index.html' % id_
    return float(m.group(1)), float(m.group(2))


INC_RANGE, VEQ_RANGE = slider('inc'), slider('veq')

# every evidence string must be in the abstract it is quoted from, and must contain the value
for key, m in spin_all.items():
    assert m['bibcode'] in ads, '%s: %s is not in ads_abstracts.json' % (key, m['bibcode'])
    abstract = re.sub(r'\s+', ' ', strip_tags(ads[m['bibcode']].get('abstract', '')))
    assert abstract, '%s: no abstract stored for %s' % (key, m['bibcode'])
    for ev in m['evidence']:
        assert ev in abstract, '%s: evidence %r not found in the abstract of %s' % (key, ev, m['bibcode'])
    assert '%g' % m['value'] in ' '.join(m['evidence']), '%s: value %g does not appear in its evidence' % (key, m['value'])


# ---------------------------------------------------------------- catalog quantities
QUANTITIES = {   # name: (NASA ps column, EU column, unit, decimals, EU error columns)
    'radius': ('pl_radj', 'radius', 'R_J', 2, ('radius_error_max', 'radius_error_min')),
    'mass': ('pl_bmassj', 'mass', 'M_J', 1, ('mass_error_max', 'mass_error_min')),
    'incl': ('pl_orbincl', 'inclination', 'deg', 1, ('inclination_error_max', 'inclination_error_min')),
}


def nasa_latest(name, col, allow_tie):
    """Rule 3. Returns dict(value, plus, minus, ref, bibcode, pubdate, n_sets, source) or None.
    A tie that the default flag cannot break is an error when the quantity is used in a computation. For a quantity that
    is only shown, the tied values are returned in 'tie' (value is None) so that both are displayed."""
    rows = [r for r in ps_rows if r['pl_name'] == name and num(r[col]) is not None]
    if rows:
        key = lambda r: (r['pl_pubdate'], int(r['default_flag']))
        rows.sort(key=key, reverse=True)
        best = rows[0]
        ties = [r for r in rows if key(r) == key(best)]
        ref, bib = parse_ref(best['pl_refname'])
        if len(ties) > 1:
            assert allow_tie, '%s %s: unresolved tie between %s' % (name, col, [(r[col], r['pl_refname'][:60]) for r in ties])
            return dict(value=None, tie=[(num(r[col]), num(r[col + 'err1']), num(r[col + 'err2'])) for r in ties], plus=None, minus=None,
                        ref=ref, bibcode=bib, pubdate=best['pl_pubdate'], n_sets=len(rows), source='ps')
        return dict(value=num(best[col]), plus=num(best[col + 'err1']), minus=num(best[col + 'err2']), ref=ref, bibcode=bib,
                    pubdate=best['pl_pubdate'], n_sets=len(rows), source='ps')
    comp = comp_rows[name]
    if num(comp[col]) is not None:
        ref, bib = parse_ref(comp[col + '_reflink'])
        return dict(value=num(comp[col]), plus=num(comp[col + 'err1']), minus=num(comp[col + 'err2']), ref=ref, bibcode=bib,
                    pubdate=None, n_sets=0, source='pscomppars')
    return None


def eu_value(row, col, errcols):
    v = num(row[col])
    if v is None:
        return None
    return dict(value=v, plus=num(row[errcols[0]]), minus=num(row[errcols[1]]), updated=row['updated'])


def differs(a, b):
    return abs(a - b) / abs(a) > REL_FLAG


def fold_incl(i):
    """The Doppler effect depends on sin i, so i and 180 - i are equivalent."""
    return min(i, 180.0 - i)


def sigma_rad(plus, minus):
    s = sym(plus, minus)
    return None if s is None else math.radians(s)


# ---------------------------------------------------------------- one preset
def build(t):
    nasa_name, eu_name = t['nasa'], t['eu']
    assert nasa_name in comp_rows and eu_name in eu_rows, 'target %s missing from the sources' % t['id']
    eu = eu_rows[eu_name]
    spin = {}
    for key in t['spin']:
        m = spin_all[key]
        assert m['used'] and m['quantity'] not in spin, '%s: duplicate or unused spin entry %s' % (t['id'], key)
        spin[m['quantity']] = (key, m)
    assert 'vsini' in spin or 'period' in spin, '%s has no measured spin rate' % t['id']

    cat, flags, rows = {}, [], []
    uses = {'radius': 'period' in spin, 'incl': 'incl_spin' not in spin, 'mass': False}   # quantities that enter a computation
    for q, (ncol, ecol, unit, nd, ecols) in QUANTITIES.items():
        cat[q] = dict(nasa=nasa_latest(nasa_name, ncol, allow_tie=not uses[q]), eu=eu_value(eu, ecol, ecols), unit=unit, nd=nd)

    # --- spin inclination (rule 2)
    inc_basis, inc_err_rad, incl_alt = None, None, None
    if 'incl_spin' in spin:
        key, m = spin['incl_spin']
        i_deg, inc_basis = fold_incl(m['value']), 'measured'
        inc_err_rad = sigma_rad(m['err_plus'], m['err_minus'])
        inc_src = '%s (ADS)' % ads_cite(m['bibcode'])
        inc_url = ADS_ABS % m['bibcode']
        inc_txt = fmt_err(m['value'], m['err_plus'], m['err_minus'], 0, 'deg')
        inc_note = m['note']
    else:
        o = cat['incl']
        if o['nasa'] is not None:
            i_deg, inc_basis = fold_incl(o['nasa']['value']), 'assumed'
            inc_err_rad = sigma_rad(o['nasa']['plus'], o['nasa']['minus'])
            inc_src = 'orbital inclination, NASA Exoplanet Archive, %s' % o['nasa']['ref']
            inc_url = ADS_ABS % o['nasa']['bibcode'] if o['nasa']['bibcode'] else None
            inc_txt = fmt_err(i_deg, o['nasa']['plus'], o['nasa']['minus'], 1, 'deg')
            inc_note = 'Spin axis assumed parallel to the orbit axis (orbital inclination folded to 0-90 deg).'
            if o['eu'] is not None and differs(o['nasa']['value'], o['eu']['value']):
                incl_alt = fold_incl(o['eu']['value'])
        elif o['eu'] is not None:
            i_deg, inc_basis = fold_incl(o['eu']['value']), 'assumed'
            inc_err_rad = sigma_rad(o['eu']['plus'], o['eu']['minus'])
            inc_src = 'orbital inclination, Exoplanet.eu (NASA Exoplanet Archive has none; Exoplanet.eu gives no reference)'
            inc_url = None
            inc_txt = fmt_err(i_deg, o['eu']['plus'], o['eu']['minus'], 1, 'deg')
            inc_note = 'Spin axis assumed parallel to the orbit axis.'
        else:
            i_deg, inc_basis = 90.0, 'assumed'
            inc_src = 'no measured or catalog inclination: equator-on assumed'
            inc_url = None
            inc_txt = '90 deg'
            inc_note = 'Equator-on assumed, so v_eq is the smallest speed that is compatible with the data.'
    sin_i = math.sin(math.radians(i_deg))
    assert 0 < i_deg <= 90, '%s: inclination %g out of range' % (t['id'], i_deg)

    # --- equatorial speed (rule 1)
    def veq_from_vsini(vsini, inc_deg):
        return vsini / math.sin(math.radians(inc_deg))

    if 'vsini' in spin:
        key, m = spin['vsini']
        vsini = m['value']
        veq = vsini / sin_i
        rel2 = (sym(m['err_plus'], m['err_minus']) / vsini) ** 2
        if inc_err_rad is not None:
            rel2 += (inc_err_rad / math.tan(math.radians(i_deg))) ** 2
        veq_err = veq * math.sqrt(rel2)
        veq_how = 'v_eq = v sin i / sin i'
        veq_alt = None if incl_alt is None else veq_from_vsini(vsini, incl_alt)
        spin_rows = [dict(name='Projected rotation v sin i', value=fmt_err(m['value'], m['err_plus'], m['err_minus'], 2 if m['value'] < 10 else 1, 'km/s'),
                          basis='measured', source='%s (ADS)' % ads_cite(m['bibcode']), url=ADS_ABS % m['bibcode'], note=m['note'])]
        veq_unc_note = None
    else:
        key, m = spin['period']
        o = cat['radius']
        if o['nasa'] is not None:
            R, R_plus, R_minus = o['nasa']['value'], o['nasa']['plus'], o['nasa']['minus']
            R_src = o['nasa']
        elif o['eu'] is not None:
            R, R_plus, R_minus, R_src = o['eu']['value'], o['eu']['plus'], o['eu']['minus'], None
        else:
            raise AssertionError('%s: a period needs a radius and neither catalog has one' % t['id'])
        P_s = m['value'] * 3600.0
        veq = 2.0 * math.pi * R * R_JUP_KM / P_s
        rel2 = (sym(m['err_plus'], m['err_minus']) / m['value']) ** 2 if m['err_plus'] is not None else 0.0
        if sym(R_plus, R_minus) is not None:
            rel2 += (sym(R_plus, R_minus) / R) ** 2
            veq_unc_note = None
        else:
            veq_unc_note = 'The catalog gives no uncertainty for the radius, so the uncertainty of v_eq covers the period only.'
        veq_err = veq * math.sqrt(rel2)
        veq_how = 'v_eq = 2π R / P'
        veq_alt = None
        if o['nasa'] is not None and o['eu'] is not None and differs(o['nasa']['value'], o['eu']['value']):
            veq_alt = 2.0 * math.pi * o['eu']['value'] * R_JUP_KM / P_s
        spin_rows = [dict(name='Rotation period P', value=fmt_err(m['value'], m['err_plus'], m['err_minus'], 2 if m['value'] < 100 else 1, 'h'),
                          basis='measured', source='%s (ADS)' % ads_cite(m['bibcode']), url=ADS_ABS % m['bibcode'], note=m['note'])]

    # --- the table of inputs
    rows.extend(spin_rows)
    rows.append(dict(name='Spin-axis inclination i', value=inc_txt, basis=inc_basis, source=inc_src, url=inc_url, note=inc_note))
    rows.append(dict(name='Equatorial speed v_eq', value='%s km/s' % (fmt_err(veq, veq_err, veq_err, 1) if veq_err else fmt(veq, 1)),
                     basis='derived', source=veq_how, url=None,
                     note=veq_unc_note or ('v sin i = %s km/s' % fmt(veq * sin_i, 1))))

    # --- catalog quantities, NASA first, Exoplanet.eu beside it
    labels = {'radius': 'Radius', 'mass': 'Mass', 'incl': 'Orbital inclination'}
    for q in ('radius', 'mass', 'incl'):
        c = cat[q]
        n, e, unit, nd = c['nasa'], c['eu'], c['unit'], c['nd']
        if n is None and e is None:
            continue
        used_in_veq = uses[q]
        if n is not None:
            when = ('%s, %s' % (n['ref'], n['pubdate'])) if n['pubdate'] else n['ref']
            src = 'NASA Exoplanet Archive, %s' % when + ('' if n['source'] == 'ps' else ' (composite table; no parameter set has it)')
            if n.get('tie'):
                valtxt = ' or '.join(fmt(v, nd) for v, _, _ in n['tie']) + ' ' + unit
                src += ' (two parameter sets from the same reference; none is the archive default)'
            else:
                valtxt = fmt_err(n['value'], n['plus'], n['minus'], nd, unit)
            url = ADS_ABS % n['bibcode'] if n['bibcode'] else None
        else:
            src, valtxt, url = 'not in NASA Exoplanet Archive', '–', None
        etxt = ('Exoplanet.eu %s' % fmt_err(e['value'], e['plus'], e['minus'], nd, unit)) if e is not None else 'Exoplanet.eu: no value'
        note = etxt + ' (updated %s, no reference published)' % e['updated'][:10] if e is not None else etxt
        if n is not None and e is not None and n['value'] is not None and differs(n['value'], e['value']):
            pct = 100.0 * abs(n['value'] - e['value']) / abs(n['value'])
            flag = '%s: NASA %s, Exoplanet.eu %s (%.0f %% apart)' % (labels[q], fmt(n['value'], nd), fmt(e['value'], nd), pct)
            if used_in_veq and q == 'radius':
                assert veq_alt is not None
                flag += '; with the Exoplanet.eu radius v_eq would be %s km/s instead of %s km/s' % (fmt(veq_alt, 1), fmt(veq, 1))
            if used_in_veq and q == 'incl':
                assert incl_alt is not None and veq_alt is not None
                flag += '; with the Exoplanet.eu inclination i would be %s deg and v_eq %s km/s' % (fmt(incl_alt, 1), fmt(veq_alt, 1))
            flags.append(dict(text=flag, affects=bool(used_in_veq)))
        rows.append(dict(name=labels[q] + (' (used)' if used_in_veq else ''), value=valtxt, basis='catalog', source=src, url=url, note=note))
        if n is None and e is not None and used_in_veq:
            flags.append(dict(text='%s: only Exoplanet.eu lists it, and it gives no reference' % labels[q], affects=True))

    # earlier measurements that are not used, shown for comparison
    for key2, m2 in spin_all.items():
        if m2['used']:
            continue
        if m2['bibcode'] == '2014arXiv1404.7506S' and t['id'] == 'beta-pic-b':   # Snellen et al. 2014, superseded
            rows.append(dict(name='Earlier v sin i (not used)', value=fmt_err(m2['value'], m2['err_plus'], m2['err_minus'], 1, 'km/s'),
                             basis='measured', source='%s (ADS)' % ads_cite(m2['bibcode']), url=ADS_ABS % m2['bibcode'], note=m2['note']))

    inc_ui = round(i_deg, 1)
    veq_ui = round(veq, 1)
    assert INC_RANGE[0] <= inc_ui <= INC_RANGE[1], '%s: i = %g outside the slider range %s' % (t['id'], inc_ui, INC_RANGE)
    assert VEQ_RANGE[0] <= veq_ui <= VEQ_RANGE[1], '%s: v_eq = %g outside the slider range %s' % (t['id'], veq_ui, VEQ_RANGE)
    return dict(id=t['id'], label=t['label'], kind=t['kind'], inc=inc_ui, veq=veq_ui, vsini=round(veq * sin_i, 1),
                incBasis=inc_basis, flags=flags, rows=rows,
                links=dict(nasa='https://exoplanetarchive.ipac.caltech.edu/overview/' + nasa_name.replace(' ', '%20'),
                           eu='https://exoplanet.eu/catalog/'))


selftest()
items = [build(t) for t in targets]
assert len({p['id'] for p in items}) == len(items)

js = ('/* Generated by presets/build_presets.py from presets/sources. Do not edit by hand. */\n'
      'window.SIM_PRESETS = %s;\n') % json.dumps(dict(retrievedUtc=retrieval['retrieved_utc'], items=items), ensure_ascii=False, indent=1)
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write(js)

print('%-30s %6s %8s %8s  %-9s  flags' % ('preset', 'i/deg', 'v_eq', 'v sin i', 'i basis'))
for p in items:
    print('%-30s %6.1f %8.1f %8.1f  %-9s  %d' % (p['label'][:30], p['inc'], p['veq'], p['vsini'], p['incBasis'], len(p['flags'])))
    for f in p['flags']:
        print('      %s: %s' % ('AFFECTS THE PRESET' if f['affects'] else 'info only', f['text']))
print('wrote', os.path.normpath(OUT))
