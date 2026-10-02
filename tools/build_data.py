"""Baut die Geodaten für public/data aus swisstopo-Rohdaten.

Rohdaten (nicht im Repo, Pfad über RAW, Standard ./raw):
  swissBOUNDARIES3D_1_5_LV95_LN02.gpkg      swissBOUNDARIES3D 2026-01
  swissTLMRegio_Product_LV95.gpkg           swissTLMRegio 2026
Das Höhenmodell swissALTIRegio wird direkt als Cloud-Optimized GeoTIFF gelesen.
tools/places.json: Wahrzeichen, Gipfel und Seen in LV95, geprüft mit dem Kantonsdienst von geo.admin.ch.

Ausgabe in public/data:
  hgt.bin     Höhenraster 250 m, zigzag-Delta, int16 zerlegt, gzip
  relief.jpg  Schummerung 4096 px (R = Licht, auf Seen Uferabstand)
  mask.png    R = Kantonsnummer * 9, G = Wald, B = Wasser
  geo.json    Raster, Kantone, Linien, Beschriftungen
"""
import gzip, json, math, os, sys, warnings
import numpy as np
import geopandas as gpd
import rasterio
from rasterio import features
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from PIL import Image
from scipy import ndimage
from shapely.geometry import box, Point, LineString, MultiLineString
from shapely.ops import unary_union, linemerge

warnings.filterwarnings('ignore')
RAW = os.environ.get('RAW', 'raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(OUT, exist_ok=True)
DEM = '/vsicurl/https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/swissaltiregio_2056_5728.tif'

E0, E1, N0, N1, STEP = 2480000, 2840000, 1070000, 1300000, 250
NX, NY = (E1 - E0) // STEP + 1, (N1 - N0) // STEP + 1
TW = 4096
TH = round(TW * (N1 - N0) / (E1 - E0))
PX = (E1 - E0) / TW  # Texturpixel in Metern

CODES = ['ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL', 'SH',
         'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'VD', 'VS', 'NE', 'GE', 'JU']
B3D = os.path.join(RAW, 'swissBOUNDARIES3D_1_5_LV95_LN02.gpkg')
TLM = os.path.join(RAW, 'swissTLMRegio_Product_LV95.gpkg')


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def read_dem(bounds, w, h, resampling=Resampling.bilinear):
    cache = os.path.join(RAW, 'dem_%d_%d_%d.npy' % (w, h, int(bounds[0])))
    if os.path.exists(cache):
        return np.load(cache)
    with rasterio.open(DEM) as src:
        win = from_bounds(*bounds, transform=src.transform)
        a = src.read(1, window=win, out_shape=(h, w), resampling=resampling, boundless=True, fill_value=np.nan)
    a = a.astype(np.float32)
    a[(a > 1e30) | (a < -500)] = np.nan
    if np.isnan(a).any():
        idx = ndimage.distance_transform_edt(np.isnan(a), return_distances=False, return_indices=True)
        a = a[tuple(idx)]
    np.save(cache, a)
    return a


# ---------------------------------------------------------------- Höhenraster
log('Höhenraster', NX, NY)
hb = (E0 - STEP / 2, N0 - STEP / 2, E1 + STEP / 2, N1 + STEP / 2)
H = read_dem(hb, NX, NY, Resampling.average)  # Zeile 0 = Norden
q = np.round(H * 2).astype(np.int64)
pred = np.zeros_like(q)
pred[0, 1:] = q[0, :-1]
pred[1:, 0] = q[:-1, 0]
pred[1:, 1:] = q[1:, :-1] + q[:-1, 1:] - q[:-1, :-1]
r = (q - pred).ravel()
zz = ((r << 1) ^ (r >> 63)).astype(np.uint64)
assert zz.max() < 65536
zz = zz.astype(np.uint16)
blob = np.concatenate([(zz & 255).astype(np.uint8), (zz >> 8).astype(np.uint8)]).tobytes()
open(os.path.join(OUT, 'hgt.bin'), 'wb').write(gzip.compress(blob, 9, mtime=0))

# ---------------------------------------------------------------- Vektoren
log('Vektoren')
kt = gpd.read_file(B3D, layer='tlm_kantonsgebiet')
kt = kt[kt.icc == 'CH'].copy()
kt['geometry'] = kt.geometry.force_2d()
kt = kt.dissolve(by='kantonsnummer', aggfunc='first').reset_index()
land = gpd.read_file(B3D, layer='tlm_landesgebiet')
land = land[land.icc == 'CH'].geometry.force_2d().union_all()
gem = gpd.read_file(B3D, layer='tlm_hoheitsgebiet', ignore_geometry=True)
gem = gem[(gem.objektart == 'Gemeindegebiet') & (gem.icc == 'CH')]
ngem = gem.groupby('kantonsnummer').size().to_dict()

lc = gpd.read_file(TLM, layer='tlmregio_landcover_landcover', columns=['objval'])
lc['geometry'] = lc.geometry.force_2d()
lakes = lc[lc.objval.isin(['See', 'Stausee'])].copy()
forest = lc[lc.objval == 'Wald']
lake_u = unary_union(lakes.geometry.values)

T = from_origin(E0, N1, PX, PX)


def raster(geoms, value=1):
    return features.rasterize(((g, value) for g in geoms), out_shape=(TH, TW), transform=T, all_touched=False, dtype=np.uint8)


# ---------------------------------------------------------------- Maske
log('Maske')
ids = np.zeros((TH, TW), np.uint8)
for _, k in kt.iterrows():
    ids = np.maximum(ids, features.rasterize([(k.geometry, int(k.kantonsnummer))], out_shape=(TH, TW), transform=T, dtype=np.uint8))
water = raster(lakes.geometry.values)
wood = raster(forest.geometry.values)
mask = np.dstack([ids * 9, wood * 255, water * 255]).astype(np.uint8)
Image.fromarray(mask, 'RGB').save(os.path.join(OUT, 'mask.png'), optimize=True)

# ---------------------------------------------------------------- Schummerung
log('Schummerung')
tb = (E0, N0, E1, N1)
Ht = read_dem(tb, TW, TH, Resampling.bilinear)
gy, gx = np.gradient(Ht * 1.6, PX)  # gy: nach Süden (Zeilen), gx: nach Osten


def lambert(az, alt):
    az, alt = math.radians(az), math.radians(alt)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    nx_, ny_, nz_ = -gx, gy, np.ones_like(gx)  # ny: Norden positiv
    n = np.sqrt(nx_ ** 2 + ny_ ** 2 + 1)
    return np.clip((nx_ * lx + ny_ * ly + nz_ * lz) / n, 0, 1)


L = 0.62 * lambert(315, 42) + 0.22 * lambert(270, 55) + 0.16 * lambert(350, 60)
flat = 0.62 * math.sin(math.radians(42)) + 0.22 * math.sin(math.radians(55)) + 0.16 * math.sin(math.radians(60))
rel = np.clip(0.69 * L / flat, 0, 1)
dist = ndimage.distance_transform_edt(water) * PX
depth = 175 * (1 - np.exp(-dist / 2200))
rel = np.where(water > 0, 1 - depth / 230, rel)
Image.fromarray(np.round(rel * 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'relief.jpg'), quality=80, optimize=True)

# ---------------------------------------------------------------- Linien
log('Linien')


def enc(geom, tol):
    """Linien als flache Integer-Arrays relativ zu E0/N0."""
    g = geom.simplify(tol, preserve_topology=False)
    out = []
    parts = getattr(g, 'geoms', [g])
    for p in parts:
        if p.is_empty:
            continue
        if p.geom_type in ('Polygon',):
            rings = [p.exterior] + list(p.interiors)
        elif p.geom_type in ('LineString', 'LinearRing'):
            rings = [p]
        else:
            continue
        for ring in rings:
            cs = np.round(np.asarray(ring.coords)[:, :2] - [E0, N0]).astype(int)
            if len(cs) >= 2:
                out.append(cs.ravel().tolist())
    return out


nat = enc(land.boundary, 60)
inner = unary_union([k.geometry.boundary for _, k in kt.iterrows()]).difference(land.boundary.buffer(30))
inner = linemerge(inner) if inner.geom_type == 'MultiLineString' else inner
cant_lines = enc(inner, 60)
big = lakes[lakes.geometry.area > 2.5e6]
shore = enc(unary_union(big.geometry.values).boundary.intersection(box(E0, N0, E1, N1)), 40)

fw = gpd.read_file(TLM, layer='tlmregio_hydrography_flowingwater', columns=['namn', 'klasse'])
fw['geometry'] = fw.geometry.force_2d()
RIVERS = ['Rhein', 'Le Rhône', 'Rhône', 'Aare', 'Reuss', 'Limmat', 'Inn', 'En', 'Ticino', 'Saane', 'La Sarine', 'Thur', 'Emme',
          'Linth', 'Le Doubs', 'Doubs', 'Birs', 'La Broye', 'Kander', 'Simme', 'Töss', 'Sihl', 'Maggia', 'Moesa', 'Hinterrhein',
          'Vorderrhein', 'Albula', 'Landquart', 'Glatt', 'Sitter', "L'Orbe", "L'Arve", 'La Venoge', 'Kleine Emme', 'Lorze',
          'Wigger', 'Suhre', 'Lütschine', 'Muota', 'Vispa', 'Plessur', 'Seez', 'Wutach', 'La Thielle', 'Zihl']
names_found = set(fw.namn.dropna()) & set(RIVERS)
log('Flüsse gefunden', sorted(names_found), 'fehlen', sorted(set(RIVERS) - names_found))
riv = fw[fw.namn.isin(RIVERS)]
riv = riv[riv.geometry.intersects(box(E0, N0, E1, N1))]
riv_g = unary_union(riv.geometry.values).difference(lake_u.buffer(20)).intersection(box(E0, N0, E1, N1))
rivers = enc(riv_g, 80)

# per Kanton: Umriss für die Auswahl
canton_rings = {}
for _, k in kt.iterrows():
    canton_rings[CODES[int(k.kantonsnummer) - 1]] = enc(k.geometry.boundary, 40)

# ---------------------------------------------------------------- Kantone
log('Kantone, Höhen')
cantons = []
with rasterio.open(DEM) as src:
    for _, k in kt.iterrows():
        nr = int(k.kantonsnummer)
        code = CODES[nr - 1]
        sel = ids == nr
        hs = Ht[sel]
        # tiefster Punkt aus dem 88-m-Raster, höchster nachgeschärft im 10-m-Raster
        cand = np.where(sel, Ht, -1)
        tops = []
        tmp = cand.copy()
        for _ in range(4):
            j, i = np.unravel_index(np.argmax(tmp), tmp.shape)
            if tmp[j, i] <= 0:
                break
            tops.append((E0 + (i + .5) * PX, N1 - (j + .5) * PX))
            tmp[max(0, j - 30):j + 30, max(0, i - 30):i + 30] = -1
        hmax, at_max = -1, None
        for (e, n) in tops:
            b = (e - 1500, n - 1500, e + 1500, n + 1500)
            win = from_bounds(*b, transform=src.transform)
            a = src.read(1, window=win).astype(np.float32)
            wt = src.window_transform(win)
            m = features.rasterize([(k.geometry, 1)], out_shape=a.shape, transform=wt, dtype=np.uint8)
            a = np.where((m > 0) & (a < 1e30), a, -1)
            jj, ii = np.unravel_index(np.argmax(a), a.shape)
            if a[jj, ii] > hmax:
                hmax = float(a[jj, ii]); at_max = (wt.c + (ii + .5) * 10, wt.f - (jj + .5) * 10)
        geom = k.geometry
        rp = geom.representative_point()
        # Beschriftung: Punkt mit grösstem Abstand zum Rand im grössten Teil
        big_part = max(getattr(geom, 'geoms', [geom]), key=lambda g: g.area)
        dm = features.rasterize([(big_part, 1)], out_shape=(TH, TW), transform=T, dtype=np.uint8)
        dt = ndimage.distance_transform_edt(dm)
        j, i = np.unravel_index(np.argmax(dt), dt.shape)
        at = [round(E0 + (i + .5) * PX), round(N1 - (j + .5) * PX)]
        bx = geom.bounds
        cantons.append({
            'id': nr, 'code': code, 'name': k['name'],
            'ha': round(geom.area / 1e4), 'ha_off': int(k.kantonsflaeche), 'lake_ha': int(k.see_flaeche or 0),
            'pop': int(k.einwohnerzahl), 'gem': int(ngem.get(nr, 0)),
            'hmin': int(round(float(np.percentile(hs, 0.02)))), 'hmax': int(math.floor(hmax)),
            'top': [round(at_max[0]), round(at_max[1])],
            'at': at, 'bb': [round(b) for b in bx],
        })
cantons.sort(key=lambda c: c['id'])
for c in cantons:
    log(c['code'], c['name'], c['ha'] / 100, c['pop'], c['gem'], c['hmin'], c['hmax'])

ch = {'ha': round(land.area / 1e4), 'hmin': min(c['hmin'] for c in cantons), 'hmax': max(c['hmax'] for c in cantons),
      'gem': sum(c['gem'] for c in cantons), 'pop': sum(c['pop'] for c in cantons)}
log('CH', ch)

# ---------------------------------------------------------------- Orte
REGION = {'VD': 'lemanique', 'VS': 'lemanique', 'GE': 'lemanique', 'BE': 'mittelland', 'FR': 'mittelland', 'SO': 'mittelland',
          'NE': 'mittelland', 'JU': 'mittelland', 'BS': 'nordwest', 'BL': 'nordwest', 'AG': 'nordwest', 'ZH': 'zuerich',
          'LU': 'zentral', 'UR': 'zentral', 'SZ': 'zentral', 'OW': 'zentral', 'NW': 'zentral', 'ZG': 'zentral',
          'GL': 'ost', 'SH': 'ost', 'AR': 'ost', 'AI': 'ost', 'SG': 'ost', 'GR': 'ost', 'TG': 'ost', 'TI': 'tessin'}
BIG_LAKES = {'Genfersee', 'Bodensee', 'Neuenburgersee', 'Lago Maggiore', 'Vierwaldstättersee', 'Zürichsee', 'Luganersee', 'Thunersee'}
BIG_PEAKS = {'Dufourspitze', 'Matterhorn', 'Piz Bernina', 'Säntis', 'Jungfrau', 'Eiger', 'Finsteraarhorn', 'Titlis', 'Pilatus', 'Tödi', 'Rigi'}
# amtliche, gerundete Gipfelhöhen; sonst Wert aus dem Höhendienst
PEAK_H = {'Dufourspitze': 4634, 'Matterhorn': 4478, 'Dom': 4545, 'Weisshorn': 4506, 'Finsteraarhorn': 4274, 'Jungfrau': 4158,
          'Eiger': 3967, 'Piz Bernina': 4049, 'Tödi': 3614, 'Titlis': 3238, 'Säntis': 2502, 'Grand Combin': 4314,
          'Rheinwaldhorn': 3402, 'Piz Kesch': 3418, 'Chasseral': 1607, 'Wildspitz': 1580, 'Rigi': 1797, 'Niesen': 2362}
LAKE_NAME = {'Lac de la Gruyère': 'Greyerzersee'}
# Grenzgipfel: zusätzlich im Kapitel der Nachbarregion zeigen
EXTRA_REGIONS = {'Rheinwaldhorn': ['tessin'], 'Jungfrau': ['lemanique'], 'Finsteraarhorn': ['mittelland'], 'Tödi': ['zentral'],
                 'Titlis': ['zentral'], 'Matterhorn': ['lemanique'], 'Dufourspitze': ['lemanique']}
kidx = kt.set_index('kantonsnummer')


def canton_at(e, n):
    pt = Point(e, n)
    for nr, k in kidx.iterrows():
        if k.geometry.contains(pt):
            return CODES[int(nr) - 1]
    return None


pp = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'places.json')
places = {}
if os.path.exists(pp):
    src = json.load(open(pp))
    places['marks'] = {code: [{'name': m['name'], 'E': m['E'], 'N': m['N']} for m in ms] for code, ms in src['landmarks'].items()}
    places['peaks'] = []
    for p in src['peaks']:
        code = canton_at(p['E'], p['N'])
        places['peaks'].append({'name': p['name'], 'E': p['E'], 'N': p['N'], 'h': PEAK_H.get(p['name'], p['h']),
                                'regions': sorted(set(([REGION[code]] if code else []) + EXTRA_REGIONS.get(p['name'], []))),
                                'big': p['name'] in BIG_PEAKS})
    places['lakes'] = []
    for p in src['lakes']:
        code = canton_at(p['E'], p['N'])
        places['lakes'].append({'name': LAKE_NAME.get(p['name'], p['name']), 'E': p['E'], 'N': p['N'],
                                'regions': [REGION[code]] if code else [], 'big': p['name'] in BIG_LAKES})
    log('Orte', {k: len(v) for k, v in places.items()})
geo = {
    'grid': {'E0': E0, 'E1': E1, 'N0': N0, 'N1': N1, 'nx': NX, 'ny': NY, 'step': STEP},
    'tex': [TW, TH], 'ch': ch, 'cantons': cantons,
    'lines': {'nation': nat, 'canton': cant_lines, 'shore': shore, 'rivers': rivers},
    'rings': canton_rings,
    'places': places,
}
json.dump(geo, open(os.path.join(OUT, 'geo.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
for f in os.listdir(OUT):
    log(f, os.path.getsize(os.path.join(OUT, f)))
