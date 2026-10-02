"""Baut Höhenkacheln für die Nahansicht nach public/data/tiles.

Quelle: swissALTIRegio (10 m) als Cloud-Optimized GeoTIFF, direkt gelesen.
Rohdaten (nicht im Repo, Pfad über RAW, Standard ./raw):
  swissBOUNDARIES3D_1_5_LV95_LN02.gpkg      Landesgebiet für die Kachelauswahl

Kachelraster wie das WMTS-Raster von swisstopo in LV95, damit Luftbildkacheln genau passen:
  Ursprung OE/ON, Kachel (i, j) = 10240 m, j wächst nach Süden.
  257 x 257 Knoten im Abstand 40 m, Zeile 0 = Norden, Spalte 0 = Westen;
  Nachbarkacheln teilen ihre Randknoten. Ein Knoten ist das Mittel der 4 x 4
  DEM-Pixel um ihn (die 40-m-Übersicht des COG liegt einen halben Schritt
  versetzt und würde glätten, deshalb wird die volle Auflösung gelesen).

Ausgabe in public/data/tiles:
  {i}_{j}.bin   Höhen in 1 m, zigzag-Delta wie hgt.bin, int16 zerlegt, gzip
  index.json    Raster und Liste der Kacheln
"""
import gzip, json, os, random, sys, threading, time, warnings
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import geopandas as gpd
import rasterio
from rasterio.windows import Window
from rasterio.enums import Resampling
from scipy import ndimage
from shapely.geometry import box
from shapely.prepared import prep

warnings.filterwarnings('ignore')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
RAW = os.environ.get('RAW', 'raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'tiles')
DEM = '/vsicurl/https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/swissaltiregio_2056_5728.tif'
B3D = os.path.join(RAW, 'swissBOUNDARIES3D_1_5_LV95_LN02.gpkg')

OE, ON, T, N, STEP = 2420000, 1350000, 10240, 257, 40
E0, E1, N0, N1 = 2480000, 2840000, 1070000, 1300000
BUF = 3000
S = N - 1  # Schritte je Kachel


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def tile_box(i, j):
    return box(OE + i * T, ON - (j + 1) * T, OE + (i + 1) * T, ON - j * T)


# ---------------------------------------------------------------- Auswahl
t0 = time.time()
land = gpd.read_file(B3D, layer='tlm_landesgebiet')
land = land[land.icc == 'CH'].geometry.force_2d().union_all().buffer(BUF)
pl = prep(land)
ext = box(E0, N0, E1, N1)
tiles = []
for i in range((E0 - OE) // T, (E1 - OE) // T + 1):
    for j in range((ON - N1) // T, (ON - N0) // T + 1):
        b = tile_box(i, j)
        if b.intersection(ext).area > 0 and pl.intersects(b):
            tiles.append((i, j))
tiles.sort()
I0, I1 = min(t[0] for t in tiles), max(t[0] for t in tiles)
J0, J1 = min(t[1] for t in tiles), max(t[1] for t in tiles)
log('Kacheln', len(tiles), 'i', I0, I1, 'j', J0, J1)

# ---------------------------------------------------------------- Höhen lesen
# Alle Kacheln in ein gemeinsames Knotengitter, damit Ränder und Lückenfüllung übereinstimmen
GH, GW = (J1 - J0 + 1) * S + 1, (I1 - I0 + 1) * S + 1
cache = os.path.join(RAW, 'tiles_%d_%d_%d_%d.npy' % (I0, J0, GW, GH))
local = threading.local()


def read_tile(ij):
    i, j = ij
    if not hasattr(local, 'src'):
        local.src = rasterio.open(DEM, OVERVIEW_LEVEL='NONE')
    src = local.src
    px = src.transform.a
    col, row = ~src.transform * (OE + i * T - STEP / 2, ON - j * T + STEP / 2)
    size = (T + STEP) / px
    win = Window(round(col), round(row), round(size), round(size))
    for k in range(4):
        try:
            a = src.read(1, window=win, out_shape=(N, N), resampling=Resampling.average)
            return ij, a.astype(np.float32)
        except Exception as e:
            log('Wiederholung', ij, e)
            time.sleep(2 + 3 * k)
    raise RuntimeError('DEM nicht lesbar für %s' % (ij,))


if os.path.exists(cache):
    G = np.load(cache)
else:
    G = np.full((GH, GW), np.nan, np.float32)
    with ThreadPoolExecutor(8) as ex:
        for n, ((i, j), a) in enumerate(ex.map(read_tile, tiles)):
            y, x = (j - J0) * S, (i - I0) * S
            G[y:y + N, x:x + N] = a
            if n % 50 == 0:
                log('gelesen', n, '/', len(tiles), '%.0f s' % (time.time() - t0))
    G[(G > 1e30) | (G < -500)] = np.nan
    np.save(cache, G)
log('DEM gelesen %.0f s' % (time.time() - t0))

# Lücken (Nodata und Knoten ausserhalb der Auswahl) vom nächsten gültigen Knoten füllen
inside = np.zeros(G.shape, bool)
for i, j in tiles:
    y, x = (j - J0) * S, (i - I0) * S
    inside[y:y + N, x:x + N] = True
gaps = int((np.isnan(G) & inside).sum())
log('Lücken in der Auswahl', gaps)
if gaps:
    idx = ndimage.distance_transform_edt(np.isnan(G), return_distances=False, return_indices=True)
    G = G[tuple(idx)]

# ---------------------------------------------------------------- Kodieren
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.bin'):
        os.remove(os.path.join(OUT, f))


def sub(i, j):
    y, x = (j - J0) * S, (i - I0) * S
    return G[y:y + N, x:x + N]


def encode(H):
    q = np.round(H).astype(np.int64)
    pred = np.zeros_like(q)
    pred[0, 1:] = q[0, :-1]
    pred[1:, 0] = q[:-1, 0]
    pred[1:, 1:] = q[1:, :-1] + q[:-1, 1:] - q[:-1, :-1]
    r = (q - pred).ravel()
    zz = ((r << 1) ^ (r >> 63)).astype(np.uint64)
    assert zz.max() < 65536
    zz = zz.astype(np.uint16)
    blob = np.concatenate([(zz & 255).astype(np.uint8), (zz >> 8).astype(np.uint8)]).tobytes()
    return gzip.compress(blob, 9, mtime=0)


def decode(buf):
    zz = np.frombuffer(gzip.decompress(buf), np.uint8).astype(np.int64)
    zz = zz[:N * N] | (zz[N * N:] << 8)
    r = (zz >> 1) ^ -(zz & 1)
    # Der Prädiktor kehrt sich als doppelte Summe um
    return r.reshape(N, N).cumsum(0).cumsum(1)


total, lo, hi = 0, 1e9, -1e9
for i, j in tiles:
    H = sub(i, j)
    lo, hi = min(lo, float(H.min())), max(hi, float(H.max()))
    b = encode(H)
    total += len(b)
    open(os.path.join(OUT, '%d_%d.bin' % (i, j)), 'wb').write(b)
json.dump({'OE': OE, 'ON': ON, 'T': T, 'n': N, 'step': STEP, 'unit': 1, 'tiles': [list(t) for t in tiles]},
          open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
log('geschrieben', len(tiles), 'Kacheln, %.1f MB, Höhen %.1f .. %.1f m' % (total / 1e6, lo, hi))

# ---------------------------------------------------------------- Prüfen
D = {}
for i, j in tiles:
    D[i, j] = decode(open(os.path.join(OUT, '%d_%d.bin' % (i, j)), 'rb').read())
for i, j in random.Random(1).sample(tiles, 3):
    err = np.abs(D[i, j] - sub(i, j)).max()
    log('Kachel %d_%d: max. Abweichung %.3f m' % (i, j, err))
    assert err <= 0.5
pairs = 0
for i, j in tiles:
    if (i + 1, j) in D:
        assert (D[i, j][:, -1] == D[i + 1, j][:, 0]).all(), (i, j)
        pairs += 1
    if (i, j + 1) in D:
        assert (D[i, j][-1] == D[i, j + 1][0]).all(), (i, j)
        pairs += 1
log('Ränder gleich bei', pairs, 'Nachbarpaaren; fertig nach %.0f s' % (time.time() - t0))
