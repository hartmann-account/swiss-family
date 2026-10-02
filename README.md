# swiss-family

„Schweizer Familien“: Relief der ganzen Schweiz mit allen 26 Kantonen, ihren Wappen, Farben und Wahrzeichen. Statische Seite, ausgeliefert über Cloudflare Workers (Static Assets), aufgebaut wie [zug-family](https://github.com/hartmann-account/zug-family).

Wer einen Kanton wählt (Kachel, Klick ins Relief oder Link wie `/#zh`), bekommt die Seite in den Farben dieses Kantons: Band, Akzente, Kantonsumriss und Modellsockel wechseln, die Kamera fliegt hin, die Wahrzeichen erscheinen im Relief.

**Karte erkunden** schaltet die Scroll-Erzählung ab und gibt die Kamera frei:

- *Umkreisen*: Ziehen dreht 360°, rechte Maustaste oder Shift verschiebt, Mausrad zoomt, Doppelklick setzt den Blickpunkt. Tastatur: W A S D, Q/E drehen, R/F zoomen.
- *Frei fliegen*: Klick fängt die Maus (Pointer Lock), Blick 360° mit der Maus, W A S D fliegen, E/Leertaste hoch, Q/C runter, Shift schneller, Mausrad ändert das Tempo, Esc gibt die Maus frei. Auf Touch-Geräten: linker Daumen fliegt, rechter blickt, Knöpfe für hoch/runter.

Beim Heranzoomen lädt die Seite 40-m-Höhenkacheln und legt das Luftbild SWISSIMAGE und das Wanderwegnetz live aus dem WMTS von swisstopo darüber. Die **Ebenen**-Legende blendet Luftbild, Wanderwege, 3D-Wahrzeichen, Grenzen, Gewässer, Namen und die Punktebenen ein und aus: Bahnhöfe, Bergbahnen, Spielplätze, Badis, Zoos und Tierparks, Museen, Feuerstellen, Campingplätze, Aussichtspunkte und Spitäler.

```sh
npm install
npm run dev      # lokal unter http://localhost:8787
npm run deploy   # nach Cloudflare deployen
```

## Aufbau

- `public/index.html`: Seite und Stil
- `public/kantone.js`: Kantone mit Namen, Hauptort, Beitritt, Sprachen, Farben und Wahrzeichen-Texten
- `public/app.js`: Relief (three.js), Kamerafahrt, Beschriftungen, Kantonswahl, Ebenen, Erkunden-Modus
- `public/detail.js`: Nahansicht mit Höhenkacheln, Luftbild und Wanderwegen
- `public/models.js`: 3D-Wahrzeichen (prozedurale, animierte Modelle)
- `public/data/`: Höhenraster, Schummerung, Kantonsmaske, Linien und Orte (aus `tools/build_data.py`), Wappen
- `tools/build_data.py`: erzeugt Relief, Maske, Linien und Orte aus swisstopo-Daten; `tools/places.json` enthält die Koordinaten der Wahrzeichen, Gipfel und Seen
- `tools/build_tiles.py`: erzeugt die Höhenkacheln `public/data/tiles` (10'240 m, 257 × 257 Punkte à 40 m, im WMTS-Raster LV95)
- `tools/build_poi.py`: erzeugt `public/data/poi.json` (BAV, OpenStreetMap über Overpass) und `public/data/routes.json` (SchweizMobil/ASTRA)

Daten neu erzeugen (Python 3 mit numpy, geopandas, rasterio, scipy, pillow):

```sh
mkdir raw   # swissBOUNDARIES3D (gpkg) und swissTLMRegio (gpkg) von data.geo.admin.ch hier entpacken
RAW=raw python3 tools/build_data.py
```

## Quellen

Bundesamt für Landestopografie swisstopo: swissALTIRegio, swissBOUNDARIES3D (Stand 2026), swissTLMRegio, SWISSIMAGE und Wanderwege (WMTS). Bundesamt für Verkehr: Haltestellen öV, Seilbahnen mit Bundeskonzession. ASTRA/SchweizMobil: Wanderland. © OpenStreetMap-Mitwirkende (ODbL): Spielplätze, Badis, Zoos, Museen, Feuerstellen, Campingplätze, Aussichtspunkte, Spitäler. Wappen von Wikimedia Commons (gemeinfrei).
