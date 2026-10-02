"""Baut die Punkt- und Routenebenen für die Kartenlegende.

Rohdaten (nicht im Repo, Pfad über RAW, Standard ./raw; fehlende Dateien werden von data.geo.admin.ch geladen):
  swissBOUNDARIES3D_1_5_LV95_LN02.gpkg      Landesgebiet zum Zuschneiden
  haltestellen-oev_2056_de.gpkg.zip         BAV öV-Haltestellen (ch.bav.haltestellen-oev)
  seilbahnen-bundeskonzession_2056_de.gpkg  BAV Seilbahnen mit Bundeskonzession
  wanderland_2056.gpkg                      ASTRA/SchweizMobil Wanderland
OpenStreetMap kommt über die Overpass API; die Antworten liegen danach in RAW/osm_<kat>.json (OSM_FRESH=1 lädt neu).
Höhen: swissALTIRegio einmal auf 40 m gemittelt (RAW/dem40.npy), bilinear abgetastet.
HTTPS-Zertifikate: CURL_CA_BUNDLE, falls gesetzt.

Ausgabe in public/data:
  poi.json     Punkte je Kategorie, LV95 relativ zu E0/N0 in Metern, Höhe in m ü. M.
  routes.json  nationale und regionale Wanderrouten, vereinfacht (25 m)
"""
import json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request, warnings, zipfile
from datetime import date
from email.utils import parsedate_to_datetime
import numpy as np
import geopandas as gpd
import shapely
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import box, LineString, MultiLineString
from shapely.ops import unary_union, linemerge

warnings.filterwarnings('ignore')
RAW = os.environ.get('RAW', 'raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
UA = 'swiss-family-build/1.0 (jonas@hartmann.id)'
CA = os.environ.get('CURL_CA_BUNDLE')
SSL = ssl.create_default_context(cafile=CA) if CA else ssl.create_default_context()
DEM = '/vsicurl/https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/swissaltiregio_2056_5728.tif'
GEO = 'https://data.geo.admin.ch/'
OVERPASS = os.environ.get('OVERPASS', 'https://overpass-api.de/api/interpreter,'
                          'https://maps.mail.ru/osm/tools/overpass/api/interpreter,'
                          'https://overpass.osm.ch/api/interpreter').split(',')

E0, E1, N0, N1 = 2480000, 2840000, 1070000, 1300000
DS = 40  # Höhenraster in Metern
DH, DW = (N1 - N0) // DS, (E1 - E0) // DS
B3D = os.path.join(RAW, 'swissBOUNDARIES3D_1_5_LV95_LN02.gpkg')
TODAY = str(date.today())


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, timeout=600):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL) as r:
        return r.read()


def raw_file(name, url):
    p = os.path.join(RAW, name)
    if not os.path.exists(p):
        log('lade', url)
        open(p, 'wb').write(fetch(url))
    return p


# ---------------------------------------------------------------- Grundlagen
def read_dem40():
    cache = os.path.join(RAW, 'dem40.npy')
    if os.path.exists(cache):
        return np.load(cache)
    a = np.full((DH, DW), np.nan, np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'), rasterio.open(DEM) as src:
        for r0 in range(0, DH, 250):  # in Streifen, sonst wird der Speicher knapp
            r1 = min(DH, r0 + 250)
            win = from_bounds(E0, N1 - r1 * DS, E1, N1 - r0 * DS, transform=src.transform)
            a[r0:r1] = src.read(1, window=win, out_shape=(r1 - r0, DW), resampling=Resampling.average,
                                boundless=True, fill_value=np.nan)
    a[(a > 1e30) | (a < -500)] = np.nan
    np.save(cache, a)
    return a


H40 = read_dem40()


def height(E, N):
    # Zellmitten liegen bei E0 + 20 + 40 i und N1 - 20 - 40 j
    fx = np.clip((np.asarray(E) - E0) / DS - 0.5, 0, DW - 1.001)
    fy = np.clip((N1 - np.asarray(N)) / DS - 0.5, 0, DH - 1.001)
    i, j = fx.astype(int), fy.astype(int)
    tx, ty = fx - i, fy - j
    h = (H40[j, i] * (1 - tx) + H40[j, i + 1] * tx) * (1 - ty) + (H40[j + 1, i] * (1 - tx) + H40[j + 1, i + 1] * tx) * ty
    return np.round(h).astype(int)


land = gpd.read_file(B3D, layer='tlm_landesgebiet')
land = land[land.icc == 'CH'].geometry.force_2d().union_all()
land200 = land.simplify(5).buffer(200)
shapely.prepare(land200)


def in_ch(E, N):
    return shapely.contains_xy(land200, np.asarray(E, float), np.asarray(N, float))


def dedupe(pts, d=30, join=None):
    """pts: Liste (E, N, Name, Rang); behält bei Nachbarn unter d Metern den Punkt mit Namen bzw. höherem Rang."""
    pts = sorted(pts, key=lambda p: (p[2] == '', -p[3], p[0], p[1]))
    tree = cKDTree([(p[0], p[1]) for p in pts]) if pts else None
    keep, gone = [], np.zeros(len(pts), bool)
    for k, p in enumerate(pts):
        if gone[k]:
            continue
        near = [m for m in tree.query_ball_point((p[0], p[1]), d) if m != k and not gone[m]]
        names = [p[2]]
        for m in near:
            gone[m] = True
            if join and pts[m][2] and pts[m][2] not in names:
                names.append(pts[m][2])
        keep.append((p[0], p[1], join.join(names) if join else p[2]))
    return keep


# ---------------------------------------------------------------- BAV: Bahnhöfe
def cat_bahn():
    z = raw_file('haltestellen-oev_2056_de.gpkg.zip',
                 GEO + 'ch.bav.haltestellen-oev/haltestellen-oev/haltestellen-oev_2056_de.gpkg.zip')
    with zipfile.ZipFile(z) as zf:
        inner = [n for n in zf.namelist() if n.endswith('.gpkg')][0]
    b = gpd.read_file('/vsizip/' + z + '/' + inner, layer='Betriebspunkt')
    # Haltestellen mit Zug oder Zahnradbahn; reine Standseilbahnen stehen schon bei den Bergbahnen
    vm = b.Verkehrsmittel_Bezeichnung.fillna('')
    ok = b.Betriebspunkttyp_Code.isin(['VP', 'VPG']) & vm.str.contains('Zug|Zahnradbahn')
    ok &= b.Gueltigkeit_EndeGueltigkeit.isna() | (b.Gueltigkeit_EndeGueltigkeit.astype(str) >= TODAY)
    ok &= b.Gueltigkeit_BeginnGueltigkeit.isna() | (b.Gueltigkeit_BeginnGueltigkeit.astype(str) <= TODAY)
    b = b[ok]
    log('  BAV Haltestellen Zug/Zahnradbahn:', len(b))
    return [(g.x, g.y, n.strip(), 0) for g, n in zip(b.geometry, b.Name)], None


# ---------------------------------------------------------------- BAV: Bergbahnen
def cat_seilbahn():
    f = raw_file('seilbahnen-bundeskonzession_2056_de.gpkg',
                 GEO + 'ch.bav.seilbahnen-bundeskonzession/seilbahnen-bundeskonzession/seilbahnen-bundeskonzession_2056_de.gpkg')
    an = gpd.read_file(f, layer='Anlage', ignore_geometry=True).set_index('xtf_id')
    st = gpd.read_file(f, layer='Station')
    an = an[an.EndeGueltigkeit.isna() | (an.EndeGueltigkeit.astype(str) >= TODAY)]
    st = st[st.rAnlage.isin(an.index)]
    log('  BAV Seilbahnstationen:', len(st), 'von', len(an), 'Anlagen')
    pts = []
    for g, a, t in zip(st.geometry, st.rAnlage, st.Stationstyp):
        pts.append((g.x, g.y, '%s, %s' % (an.at[a, 'AnlageName'].strip(), t), 0))
    return pts, ' · '  # nahe Stationen verschiedener Anlagen zusammenfassen


# ---------------------------------------------------------------- OSM
OSM = {
    'play': 'nwr[leisure=playground](area.a);',
    'bad': 'nwr[leisure~"^(water_park|bathing_place|swimming_area)$"](area.a);nwr[amenity=public_bath](area.a);'
           'nwr[leisure=sports_centre][sport~"(^|;)swimming(;|$)"](area.a);',
    'zoo': 'nwr[tourism=zoo](area.a);',
    'museum': 'nwr[tourism=museum](area.a);',
    'feuer': 'nwr[leisure=firepit](area.a);nwr[amenity=bbq](area.a);',
    'spital': 'nwr[amenity=hospital](area.a);',
    'camping': 'nwr[tourism=camp_site](area.a);',
    'aussicht': 'nwr[tourism=viewpoint][name](area.a);',
}
osm_dates, dead = [], set()
TO_LV95 = Transformer.from_crs('EPSG:4326', 'EPSG:2056', always_xy=True)


def overpass(key):
    cache = os.path.join(RAW, 'osm_%s.json' % key)
    if os.path.exists(cache) and not os.environ.get('OSM_FRESH'):
        return json.load(open(cache, encoding='utf-8'))
    q = '[out:json][timeout:600];area["ISO3166-1"="CH"][admin_level=2]->.a;(%s);out tags bb;' % OSM[key]
    for n in range(9):
        live = [u for u in OVERPASS if u not in dead] or OVERPASS
        url = live[n % len(live)]  # bei 429/504 zum nächsten Server, später zurück
        try:
            req = urllib.request.Request(url + '?' + urllib.parse.urlencode({'data': q}), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=900, context=SSL) as r:
                data, stamp = json.loads(r.read()), r.headers.get('Date', '')
            if 'error' in data.get('remark', '').lower():  # Zeitüberschreitung liefert sonst halbe Antworten
                raise RuntimeError(data['remark'])
            if not data['osm3s']['timestamp_osm_base'][:4].isdigit() or '-' not in data['osm3s']['timestamp_osm_base']:
                # overpass.osm.ch meldet nur eine Sequenznummer; der Server repliziert minütlich
                data['osm3s']['timestamp_osm_base'] = parsedate_to_datetime(stamp).strftime('%Y-%m-%dT%H:%M:%SZ')
            data['server'] = url
            json.dump(data, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
            time.sleep(5)
            return data
        except (urllib.error.URLError, OSError, RuntimeError, ValueError) as e:
            code = getattr(e, 'code', None)
            if code not in (429, 504) and not isinstance(e, RuntimeError):
                dead.add(url)  # Verbindung abgewiesen: für diesen Lauf nicht mehr fragen
            wait = 15 * 2 ** min(n // len(live), 3)
            log('  Overpass', url, code or '', str(e)[:100], '- neuer Versuch in', wait, 's')
            time.sleep(wait)
    raise SystemExit('Overpass nicht erreichbar: ' + key)


def osm_name(t):
    return (t.get('name:de') or t.get('name') or '').strip()


def cat_osm(key):
    data = overpass(key)
    osm_dates.append(data['osm3s']['timestamp_osm_base'][:10])
    log('  Overpass', key, len(data['elements']), 'Objekte, Stand', osm_dates[-1], data.get('server', ''))
    pts = []
    for el in data['elements']:
        t = el.get('tags', {})
        if t.get('access') in ('private', 'no'):
            continue
        if el['type'] == 'node':
            lon, lat, bb = el['lon'], el['lat'], None
        elif 'bounds' not in el:
            continue
        else:
            b = el['bounds']
            lon, lat = (b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2
            bb = (b['minlon'], b['minlat'], b['maxlon'], b['maxlat'])
        E, N = TO_LV95.transform(lon, lat)
        if bb:
            (ea, eb), (na, nb) = TO_LV95.transform([bb[0], bb[2]], [bb[1], bb[3]])
            bb = (ea, na, eb, nb)
        pts.append([E, N, osm_name(t), 1 if bb else 0, bb])
    # Punkte innerhalb einer Fläche derselben Kategorie (Gehege im Zoo, Becken in der Badi) gehören zu ihr
    areas = [p for p in pts if p[4] and (p[4][2] - p[4][0]) < 3000 and (p[4][3] - p[4][1]) < 3000]
    if areas:
        ab = np.array([p[4] for p in areas])
        tree = cKDTree(np.c_[(ab[:, 0] + ab[:, 2]) / 2, (ab[:, 1] + ab[:, 3]) / 2])
        drop = set()
        for p in pts:
            for m in tree.query_ball_point((p[0], p[1]), 2200):
                a = areas[m]
                if a is p or id(a) in drop:
                    continue
                x0, y0, x1, y1 = a[4]
                inner = p[4] is not None and (p[4][2] - p[4][0]) * (p[4][3] - p[4][1]) >= (x1 - x0) * (y1 - y0)
                if x0 <= p[0] <= x1 and y0 <= p[1] <= y1 and not inner:
                    if p[2] and not a[2]:
                        a[2] = p[2]
                    drop.add(id(p))
                    break
        n0 = len(pts)
        pts = [p for p in pts if id(p) not in drop]
        log('  in Flächen enthalten:', n0 - len(pts))
    return [tuple(p[:4]) for p in pts], None


# ---------------------------------------------------------------- Punkte
CATS = [
    ('bahn', 'Bahnhöfe', 'bav'), ('seilbahn', 'Bergbahnen', 'bav'), ('play', 'Spielplätze', 'osm'),
    ('bad', 'Badis & Badeplätze', 'osm'), ('zoo', 'Zoos & Tierparks', 'osm'), ('museum', 'Museen', 'osm'),
    ('feuer', 'Feuerstellen', 'osm'), ('spital', 'Spitäler', 'osm'), ('camping', 'Campingplätze', 'osm'),
    ('aussicht', 'Aussichtspunkte', 'osm'),
]
cats = {}
for key, label, src in CATS:
    log(label)
    pts, join = cat_bahn() if key == 'bahn' else cat_seilbahn() if key == 'seilbahn' else cat_osm(key)
    n0 = len(pts)
    pts = [p for p, ok in zip(pts, in_ch([p[0] for p in pts], [p[1] for p in pts])) if ok]
    n1 = len(pts)
    pts = dedupe(pts, 30, join)
    pts.sort(key=lambda p: (round(p[0]), round(p[1])))
    E = np.array([p[0] for p in pts]); N = np.array([p[1] for p in pts])
    h = height(E, N)
    xyz = []
    for e, n, z in zip(E, N, h):
        xyz += [int(round(e - E0)), int(round(n - N0)), int(z)]
    cats[key] = {'label': label, 'src': src, 'xyz': xyz, 'names': [p[2] for p in pts]}
    log('  %d -> Schweiz %d -> ohne Doppel %d (mit Namen %d)' % (n0, n1, len(pts), sum(1 for p in pts if p[2])))

poi = {'E0': E0, 'N0': N0,
       'sources': {'osm': '© OpenStreetMap-Mitwirkende (ODbL)', 'bav': 'Bundesamt für Verkehr BAV'},
       'date': max(osm_dates), 'cats': cats}
with open(os.path.join(OUT, 'poi.json'), 'w', encoding='utf-8') as f:
    json.dump(poi, f, separators=(',', ':'), ensure_ascii=False)

# ---------------------------------------------------------------- Wanderrouten
log('Wanderrouten')
wf = raw_file('wanderland_2056.gpkg', GEO + 'ch.astra.wanderland/wanderland/wanderland_2056.gpkg')
TOL = float(os.environ.get('ROUTE_TOL', 25))
rt = gpd.read_file(wf, layer='Route')
rt = rt[rt.Typ_TR.isin(['national', 'regional'])].copy()  # Typ_TR: national, regional, local, handicap
rt['geometry'] = rt.geometry.force_2d()
frame = box(E0, N0, E1, N1)


def parts(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, MultiLineString):
        return list(g.geoms)
    return [p for x in getattr(g, 'geoms', []) for p in parts(x)]


routes = []
for nr, grp in rt.groupby('NrR', sort=False):
    merged = linemerge(unary_union(list(grp.geometry)))  # Hin- und Rückweg zusammen, Abschnitte verbinden
    lines = []
    for ln in parts(merged):
        for p in parts(ln.simplify(TOL, preserve_topology=False).intersection(frame)):
            c = np.round(np.asarray(p.coords) - (E0, N0)).astype(int)
            c = c[np.r_[True, np.any(c[1:] != c[:-1], axis=1)]]
            if len(c) >= 2 and p.length >= 50:
                lines.append(c.ravel().tolist())
    lines.sort(key=len, reverse=True)
    r0 = grp.iloc[0]
    routes.append({'nr': str(nr), 'name': r0.NameR.strip(), 'typ': r0.Typ_TR, 'lines': lines})
routes.sort(key=lambda r: (r['typ'] != 'national', int(r['nr']) if r['nr'].isdigit() else 999, r['nr']))
with open(os.path.join(OUT, 'routes.json'), 'w', encoding='utf-8') as f:
    json.dump({'E0': E0, 'N0': N0, 'routes': routes}, f, separators=(',', ':'), ensure_ascii=False)
nv = sum(len(l) // 2 for r in routes for l in r['lines'])
log('  %d Routen, %d Linien, %d Punkte, Toleranz %g m' % (len(routes), sum(len(r['lines']) for r in routes), nv, TOL))
for fn in ('poi.json', 'routes.json'):
    log(fn, os.path.getsize(os.path.join(OUT, fn)), 'Bytes')
