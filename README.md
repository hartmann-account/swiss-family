# swiss-family

„Schweizer Familien“: Relief der ganzen Schweiz mit allen 26 Kantonen, ihren Wappen, Farben und Wahrzeichen. Statische Seite, ausgeliefert über Cloudflare Workers (Static Assets), aufgebaut wie [zug-family](https://github.com/hartmann-account/zug-family).

Wer einen Kanton wählt (Kachel, Klick ins Relief oder Link wie `/#zh`), bekommt die Seite in den Farben dieses Kantons: Band, Akzente, Kantonsumriss und Modellsockel wechseln, die Kamera fliegt hin, die Wahrzeichen erscheinen im Relief.

```sh
npm install
npm run dev      # lokal unter http://localhost:8787
npm run deploy   # nach Cloudflare deployen
```

## Aufbau

- `public/index.html`: Seite und Stil
- `public/kantone.js`: Kantone mit Namen, Hauptort, Beitritt, Sprachen, Farben und Wahrzeichen-Texten
- `public/app.js`: Relief (three.js), Kamerafahrt, Beschriftungen, Kantonswahl
- `public/data/`: Höhenraster, Schummerung, Kantonsmaske, Linien und Orte (aus `tools/build_data.py`), Wappen
- `tools/build_data.py`: erzeugt `public/data` aus swisstopo-Daten; `tools/places.json` enthält die Koordinaten der Wahrzeichen, Gipfel und Seen

Daten neu erzeugen (Python 3 mit numpy, geopandas, rasterio, scipy, pillow):

```sh
mkdir raw   # swissBOUNDARIES3D (gpkg) und swissTLMRegio (gpkg) von data.geo.admin.ch hier entpacken
RAW=raw python3 tools/build_data.py
```

## Quellen

Bundesamt für Landestopografie swisstopo: swissALTIRegio, swissBOUNDARIES3D (Stand 2026), swissTLMRegio. Wappen von Wikimedia Commons (gemeinfrei).
