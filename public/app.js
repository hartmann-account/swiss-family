(function () {
'use strict';
var KT = window.KANTONE, KC = KT.C;
var $ = function (s) { return document.querySelector(s); };
var root = document.documentElement, body = document.body;
var statusEl = $('#status'), hudA = $('#hudA'), hudB = $('#hudB');
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TEST = !!window.SF_TEST;
var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
var narrowMQ = matchMedia('(max-width: 760px)');
if (!fine) body.classList.add('touch');
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function swiss(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '’'); }
function dec(x, d) { return x.toFixed(d == null ? 1 : d).replace('.', ','); }
function km2(ha) { return ha >= 100000 ? swiss(ha / 100) : dec(ha / 100); }
function km(m) { return m >= 100000 ? swiss(m / 1000) : dec(m / 1000); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function wappen(code) { return 'data/wappen/' + code + '.svg'; }
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v * f).toString(16)).slice(-2); }).join('');
}
/* LV95 nach WGS84, Näherungsformeln von swisstopo (Genauigkeit rund 1 m) */
function wgs(E, N) {
  var y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  var lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  var lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [lat * 100 / 36, lon * 100 / 36];
}
function geoAdminURL(E, N) { return 'https://map.geo.admin.ch/?lang=de&E=' + Math.round(E) + '&N=' + Math.round(N) + '&zoom=10&crosshair=marker'; }
function osmURL(E, N) { var w = wgs(E, N), a = w[0].toFixed(5), o = w[1].toFixed(5); return 'https://www.openstreetmap.org/?mlat=' + a + '&mlon=' + o + '#map=17/' + a + '/' + o; }

/* ---------------- Kantonsfarben als CSS ---------------- */
(function themeCSS() {
  var light = [], dark = [];
  Object.keys(KC).forEach(function (code) {
    var c = KC[code].color, f = c.flag, n = f.length, stops = [];
    for (var i = 0; i < n; i++) stops.push(f[i] + ' ' + (i / n * 100).toFixed(2) + '% ' + ((i + 1) / n * 100).toFixed(2) + '%');
    var flag = 'linear-gradient(90deg,' + stops.join(',') + ')';
    var isBlack = c.brand === '#141414';
    var sel = code === 'CH' ? ':root' : ':root[data-kanton="' + code + '"]';
    light.push(sel + '{--brand:' + c.brand + ';--brand-text:' + c.text + ';--on-brand:' + c.on + ';--flag:' + flag +
      ';--m-hi:' + c.brand + ';--m-line:' + c.brand + ';--m-side:' + c.brand + ';--m-side-2:' + (isBlack ? '#000000' : shade(c.brand, 0.55)) + '}');
    var dsel = code === 'CH' ? '' : '[data-kanton="' + code + '"]';
    var dk = '--brand:' + (isBlack ? '#E9E9E9' : c.brand) + ';--on-brand:' + (isBlack ? '#141414' : c.on) + ';--brand-text:' + c.textDark +
      ';--m-hi:' + (isBlack ? '#E9E9E9' : c.brand) + ';--m-line:' + (isBlack ? '#E9E9E9' : c.textDark) + ';--m-side:' + (isBlack ? '#2B2B2B' : shade(c.brand, 0.7)) + ';--m-side-2:#020305';
    dark.push(':root' + dsel + ':not([data-theme="light"]){' + dk + '}');
    dark.push('__D__:root' + dsel + '[data-theme="dark"]{' + dk + '}');
  });
  var css = light.join('\n') + '\n@media (prefers-color-scheme: dark){\n' + dark.filter(function (s) { return s.indexOf('__D__') < 0; }).join('\n') + '\n}\n' +
    dark.filter(function (s) { return s.indexOf('__D__') === 0; }).map(function (s) { return s.slice(5); }).join('\n');
  var st = document.createElement('style'); st.id = 'kantonfarben'; st.textContent = css; document.head.appendChild(st);
})();

/* ---------------- Symbole ---------------- */
var ICON = {
  kanton: 'M4 3h16v8c0 5.2-3.4 8.6-8 10-4.6-1.4-8-4.8-8-10zm2 2v6c0 4 2.4 6.7 6 7.9 3.6-1.2 6-3.9 6-7.9V5zm4.5 1.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6z',
  family: 'M7 2.5a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8zM17 4.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4zM4.5 8.6h5l1.6 6.4H9.6V22H6.4v-7H3zM14.6 10h4.8l1.6 5.4h-1.4V22h-2.6v-4h-1v4h-2.6v-6.6H12z',
  hike: 'M13.5 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 8.2l3-1.2 2.3 3.1 3 1.1-.7 1.9-3.6-1.3-.9-1.2-.8 3.7 2.2 2.4V22h-2v-5.4l-2.4-2.4-.9 3.8L6.4 22l-1.7-1.1 3.4-4.3 1.1-5.3-1.4.6V14h-2V10.6z',
  back: 'M10 3 5 8l5 5 1.4-1.4L7.8 8l3.6-3.6z',
  fly: 'M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18.5l-2 1.5V21.5l3.5-1 3.5 1V20l-2-1.5V13z',
  map: 'M9 3 3 5.2v15.6l6-2.2 6 2.2 6-2.2V3l-6 2.2zm1 2.2 4 1.5v12.1l-4-1.5zM5 6.6l3-1.1v12.1l-3 1.1zm11 .1 3-1.1v12.1l-3 1.1z',
  zoom: 'M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-1 2h2v2h2v2h-2v2H9v-2H7V9h2z',
  kirche: 'M11 1h2v2h2v2h-2v2.2l5 3.8V22h-4v-5a2 2 0 0 0-4 0v5H6V11l5-3.8V5H9V3h2z',
  burg: 'M3 21V8h3V5h2v3h3V5h2v3h3V5h2v3h3v13h-7v-5a2 2 0 0 0-4 0v5z',
  berg: 'M2 20 9 7l3.5 6 2.5-4L22 20z',
  wasser: 'M12 2s7 7.6 7 12.2A7 7 0 0 1 5 14.2C5 9.6 12 2 12 2zm-3.6 12.4a3.6 3.6 0 0 0 3.6 3.6v-2a1.6 1.6 0 0 1-1.6-1.6z',
  ort: 'M3 21V10l6-4 6 4v1h6v10zm4-2h2v-3H7zm4 0h2v-3h-2zm6 0h2v-3h-2z',
  denkmal: 'M10 2h4v4h-1v8h3l2 4v4H6v-4l2-4h3V6h-1z'
};
function svgIcon(k, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[k] + '"/></svg>'; }
function backBtn(label) { return '<button type="button" class="back" id="back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + ICON.back + '"/></svg>' + esc(label) + '</button>'; }

/* ---------------- Ebenen ---------------- */
var POICAT = [
  { k: 'bahn', label: 'Bahnhöfe', one: 'Bahnhof', far: 45000, color: '#D7141A', on: true },
  { k: 'play', label: 'Spielplätze', one: 'Spielplatz', far: 14000, color: '#F08A00', on: true },
  { k: 'bad', label: 'Badis & Badeplätze', one: 'Badi', far: 30000, color: '#0A8BD0', on: false },
  { k: 'zoo', label: 'Zoos & Tierparks', one: 'Zoo oder Tierpark', far: 45000, color: '#5E8C2B', on: false },
  { k: 'seilbahn', label: 'Bergbahnen', one: 'Bergbahn', far: 40000, color: '#7A4FB5', on: false },
  { k: 'feuer', label: 'Feuerstellen', one: 'Feuerstelle', far: 11000, color: '#D9531E', on: false },
  { k: 'museum', label: 'Museen', one: 'Museum', far: 28000, color: '#8A6A4A', on: false },
  { k: 'camping', label: 'Campingplätze', one: 'Campingplatz', far: 35000, color: '#2E7D4F', on: false },
  { k: 'aussicht', label: 'Aussichtspunkte', one: 'Aussichtspunkt', far: 24000, color: '#4B5568', on: false },
  { k: 'spital', label: 'Spitäler', one: 'Spital', far: 40000, color: '#1E5AA8', on: false }
];
var CATBY = {}; POICAT.forEach(function (c, i) { c.i = i; CATBY[c.k] = c; });
var LAYERS = { sat: true, trails: true, marks: true, borders: true, water: true, labels: true };
POICAT.forEach(function (c) { LAYERS[c.k] = c.on; });
try { var savedL = JSON.parse(localStorage.getItem('sf-layers') || 'null'); if (savedL) Object.keys(savedL).forEach(function (k) { if (k in LAYERS) LAYERS[k] = !!savedL[k]; }); } catch (e) {}
var layerHooks = [];
function setLayer(k, v) {
  LAYERS[k] = v;
  try { localStorage.setItem('sf-layers', JSON.stringify(LAYERS)); } catch (e) {}
  var inp = document.querySelector('#legend input[data-l="' + k + '"]'); if (inp) inp.checked = v;
  if (k === 'sat') $('#tSat').setAttribute('aria-pressed', String(v));
  layerHooks.forEach(function (f) { f(k, v); });
}

/* Symbole der Punktebenen: eine Leinwand 4 x 4 à 64 px */
var ICONS = (function () {
  var S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S * 4;
  var g = cv.getContext('2d');
  function glyph(k) {
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (k) {
      case 'bahn': g.rect(-11, -14, 22, 22); g.fill(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-8, -11, 16, 8); g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(-8, 10); g.lineTo(-12, 16); g.moveTo(8, 10); g.lineTo(12, 16); g.stroke(); break;
      case 'play': g.moveTo(-14, 14); g.lineTo(-8, -14); g.lineTo(8, -14); g.lineTo(14, 14); g.moveTo(-3, -14); g.lineTo(-3, 4); g.moveTo(3, -14); g.lineTo(3, 4); g.stroke();
        g.fillRect(-6, 4, 12, 4); break;
      case 'bad': for (var w = -1; w <= 1; w++) { g.moveTo(-15, w * 8); for (var x = -15; x <= 15; x += 2) g.lineTo(x, w * 8 + Math.sin(x / 3.2) * 3); } g.stroke(); break;
      case 'zoo': g.arc(0, 6, 8, 0, 7); g.fill(); [[-11, -4], [-4, -12], [4, -12], [11, -4]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill(); }); break;
      case 'seilbahn': g.moveTo(-16, -12); g.lineTo(16, -4); g.stroke(); g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -2); g.stroke(); g.fillRect(-9, -2, 18, 15); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-6, 1, 12, 5); break;
      case 'feuer': g.moveTo(0, -15); g.bezierCurveTo(12, -2, 10, 12, 0, 12); g.bezierCurveTo(-10, 12, -12, 0, -4, -6); g.bezierCurveTo(-3, 0, 0, 0, 0, -15); g.fill();
        g.beginPath(); g.moveTo(-12, 15); g.lineTo(12, 11); g.moveTo(-12, 11); g.lineTo(12, 15); g.stroke(); break;
      case 'museum': g.moveTo(-15, -6); g.lineTo(0, -15); g.lineTo(15, -6); g.closePath(); g.fill(); g.fillRect(-14, 10, 28, 4);
        [-10, -3.5, 3, 9.5].forEach(function (x) { g.fillRect(x, -5, 3.5, 14); }); break;
      case 'camping': g.moveTo(-16, 13); g.lineTo(0, -14); g.lineTo(16, 13); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo(-5, 13); g.lineTo(0, 3); g.lineTo(5, 13); g.fill(); break;
      case 'aussicht': g.arc(-7, 2, 7, 0, 7); g.arc(7, 2, 7, 0, 7); g.fill(); g.fillRect(-10, -10, 7, 10); g.fillRect(3, -10, 7, 10); break;
      case 'spital': g.font = '700 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 0, 2); break;
    }
  }
  var url = {};
  POICAT.forEach(function (c, i) {
    var x = (i % 4) * S + S / 2, y = Math.floor(i / 4) * S + S / 2;
    g.save(); g.translate(x, y);
    g.beginPath(); g.arc(0, 0, 27, 0, 7); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
    g.beginPath(); g.arc(0, 0, 23.5, 0, 7); g.fillStyle = c.color; g.fill();
    glyph(c.k); g.restore();
    var one = document.createElement('canvas'); one.width = one.height = S;
    one.getContext('2d').drawImage(cv, (i % 4) * S, Math.floor(i / 4) * S, S, S, 0, 0, S, S);
    url[c.k] = one.toDataURL();
  });
  return { canvas: cv, url: url };
})();

/* Gruppen der Wahrzeichen, nach Modelltyp */
var MGROUP = [
  { k: 'kirche', label: 'Kirchen & Klöster', ic: 'kirche', types: ['church', 'church-twin', 'cathedral', 'minster', 'basilica', 'monastery', 'chapel', 'chapel-hill', 'church-rock'] },
  { k: 'burg', label: 'Burgen & Schlösser', ic: 'burg', types: ['castle', 'castle-round', 'water-castle', 'manor', 'wall', 'tower', 'tower-clock'] },
  { k: 'berg', label: 'Berge & Gletscher', ic: 'berg', types: ['peak', 'peak-snow', 'matterhorn', 'peak-tower', 'peak-cablecar', 'peak-rail', 'observatory', 'glacier', 'ridge', 'cirque', 'cliff-lift'] },
  { k: 'wasser', label: 'Wasser & Schluchten', ic: 'wasser', types: ['lake', 'waterfall', 'fountain', 'dam', 'gorge', 'cave', 'confluence'] },
  { k: 'ort', label: 'Orte & Plätze', ic: 'ort', types: ['oldtown', 'gridtown', 'village', 'square', 'meadow', 'townhall', 'park', 'vineyard', 'hut'] },
  { k: 'denkmal', label: 'Bauwerke & Denkmäler', ic: 'denkmal', types: ['monument', 'monument-lion', 'monument-wall', 'tripoint', 'parliament', 'palace', 'museum', 'theatre', 'fossil', 'bridge-covered', 'bridge-stone', 'viaduct'] }
];
var GROUPOF = {}; MGROUP.forEach(function (g, i) { g.i = i; g.types.forEach(function (t) { GROUPOF[t] = i; }); });
var REGION_NAME = { lemanique: 'Genferseeregion', mittelland: 'Espace Mittelland', nordwest: 'Nordwestschweiz', zuerich: 'Zürich', zentral: 'Zentralschweiz', ost: 'Ostschweiz', tessin: 'Tessin' };
var REGION_ORDER = ['lemanique', 'mittelland', 'nordwest', 'zuerich', 'zentral', 'ost', 'tessin'];

/* ---------------- Daten laden ---------------- */
function fail(msg) {
  root.classList.add('noscene');
  statusEl.textContent = msg; hudA.textContent = 'Relief nicht verfügbar'; hudB.textContent = '';
}
function gunzip(buf) {
  var ds = new DecompressionStream('gzip');
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
}
function loadImage(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }

var D = null, BYCODE = {}, BYID = [], MARKS = {}, MARKLIST = [], MARKBY = {}, POIS = [], ROUTES = [], POIDATE = '';
var hgtP = fetch('data/hgt.bin').then(function (r) { if (!r.ok) throw new Error('hgt ' + r.status); return r.arrayBuffer(); });
hgtP.catch(function () {});
var poiP = getJSON('data/poi.json'), routesP = getJSON('data/routes.json');
poiP.catch(function () {}); routesP.catch(function () {});

/* Kanton eines Punkts: Begrenzungsrechteck, dann gerade/ungerade über alle Ringe (Löcher und Exklaven inbegriffen) */
var CPOLY = [];
function buildCantonIndex() {
  D.cantons.forEach(function (c) {
    var rings = (D.rings[c.code] || []).map(function (a) { var r = new Float64Array(a.length); for (var i = 0; i < a.length; i += 2) { r[i] = a[i] + D.grid.E0; r[i + 1] = a[i + 1] + D.grid.N0; } return r; });
    CPOLY.push({ code: c.code, bb: c.bb, rings: rings });
  });
}
function cantonAt(E, N) {
  for (var k = 0; k < CPOLY.length; k++) {
    var P = CPOLY[k], b = P.bb;
    if (E < b[0] || E > b[2] || N < b[1] || N > b[3]) continue;
    var inside = false;
    for (var r = 0; r < P.rings.length; r++) {
      var a = P.rings[r], n = a.length;
      for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
        var yi = a[i + 1], yj = a[j + 1];
        if ((yi > N) !== (yj > N) && E < (a[j] - a[i]) * (N - yi) / (yj - yi) + a[i]) inside = !inside;
      }
    }
    if (inside) return P.code;
  }
  return '';
}
function inChunks(n, fn, done) {
  var i = 0;
  (function step() { var end = Math.min(n, i + 2500); for (; i < end; i++) fn(i); if (i < n) setTimeout(step, 0); else if (done) done(); })();
}

var geoP = getJSON('data/geo.json');
geoP.then(function (g) {
  D = g;
  D.cantons.forEach(function (c) { BYCODE[c.code] = c; BYID[c.id] = c; });
  buildCantonIndex();
  var pm = (D.places && D.places.marks) || {};
  KT.ORDER.forEach(function (code) {
    MARKS[code] = (KC[code].marks || []).map(function (m, i) {
      var p = (pm[code] || []).filter(function (x) { return x.name === m[0]; })[0] || (pm[code] || [])[i];
      if (!p) return null;
      var type = (window.SFModels && window.SFModels.markType[code + ':' + i]) || 'monument';
      var it = { kind: 'mark', id: code.toLowerCase() + '-' + (i + 1), name: m[0], text: m[1], E: p.E, N: p.N, idx: i, code: code, type: type, grp: GROUPOF[type] != null ? GROUPOF[type] : 5 };
      MARKLIST.push(it); MARKBY[it.id] = it;
      return it;
    }).filter(Boolean);
  });
  $('#nMarks').textContent = MARKLIST.length;
  buildStrip();
  start();
  applyRoute();
  poiP.then(function (P) {
    POIDATE = P.date || '';
    POICAT.forEach(function (c) {
      var d = P.cats && P.cats[c.k]; if (!d) return;
      for (var i = 0, n = d.xyz.length / 3; i < n; i++) {
        POIS.push({ kind: 'poi', id: String(POIS.length), c: c.i, E: P.E0 + d.xyz[i * 3], N: P.N0 + d.xyz[i * 3 + 1], h: d.xyz[i * 3 + 2], name: (d.names && d.names[i]) || '', code: null });
      }
    });
    $('#nPoi').textContent = swiss(POIS.length);
    inChunks(POIS.length, function (i) { POIS[i].code = cantonAt(POIS[i].E, POIS[i].N); }, function () { POIS.ready = true; refreshMode('familien'); refreshMode('kantone'); });
    MAP.onPOI();
    refreshMode('familien');
    if (SELREQ && SELREQ.mode === 'familien') applyRoute();
  }).catch(function (e) { console.warn('Punkte', e); });
  routesP.then(function (Rt) {
    (Rt.routes || []).forEach(function (r, i) {
      var lines = r.lines.map(function (a) { var o = new Float64Array(a.length); for (var k = 0; k < a.length; k += 2) { o[k] = a[k] + Rt.E0; o[k + 1] = a[k + 1] + Rt.N0; } return o; });
      var len = 0, bb = [1e9, 1e9, -1e9, -1e9], seen = {};
      lines.forEach(function (a) {
        for (var k = 0; k < a.length; k += 2) {
          if (k) len += Math.hypot(a[k] - a[k - 2], a[k + 1] - a[k - 1]);
          bb[0] = Math.min(bb[0], a[k]); bb[1] = Math.min(bb[1], a[k + 1]); bb[2] = Math.max(bb[2], a[k]); bb[3] = Math.max(bb[3], a[k + 1]);
          if (k % 16 === 0) { var cc = cantonAt(a[k], a[k + 1]); if (cc) seen[cc] = (seen[cc] || 0) + 1; }
        }
      });
      ROUTES.push({ kind: 'route', id: String(i + 1), nr: String(r.nr), name: r.name, typ: r.typ, lines: lines, len: len, bb: bb,
        cantons: KT.ORDER.filter(function (c) { return seen[c]; }) });
    });
    ROUTES.sort(function (a, b) { return (a.typ === 'national' ? 0 : 1) - (b.typ === 'national' ? 0 : 1) || (parseInt(a.nr, 10) || 999) - (parseInt(b.nr, 10) || 999) || a.name.localeCompare(b.name, 'de'); });
    $('#nRoutes').textContent = ROUTES.length;
    MAP.onRoutes();
    refreshMode('wandern'); refreshMode('kantone');
    if (SELREQ && SELREQ.mode === 'wandern') applyRoute();
  }).catch(function (e) { console.warn('Routen', e); });
}).catch(function (e) { console.error(e); fail('Die Geodaten konnten nicht geladen werden.'); });

/* Schnittstelle zur Karte; start() füllt sie, ohne WebGL bleiben es leere Funktionen */
var MAP = {
  ready: false,
  flyCanton: function () {}, flyOverview: function () {}, flyHome: function () {}, flyMark: function () {}, flyPOI: function () {}, flyRoute: function () {}, flyKey: function () {},
  setRoute: function () {}, setHotPOI: function () {}, center: function () { return null; }, onPOI: function () {}, onRoutes: function () {},
  startFly: function () {}, stopFly: function () {}, flying: function () { return false; }, zoom: function () {}, north: function () {}
};

/* ---------------- Zustand ---------------- */
var MODE = 'home', SEL = null, SELREQ = null, selected = null, HOT = null, touring = false;
var panel = $('#panel'), phEl = $('#ph'), listEl = $('#list'), detailEl = $('#detail'), pscroll = $('#pscroll');
var filt = { kantone: { reg: '' }, wahrzeichen: { groups: MGROUP.map(function () { return true; }) }, wandern: { nat: true, reg: true }, familien: { shown: 120 } };
var MODEPATH = { home: '', kantone: 'kantone', wahrzeichen: 'wahrzeichen', familien: 'familien', wandern: 'wandern', info: 'info' };
var PATHMODE = {}; Object.keys(MODEPATH).forEach(function (k) { PATHMODE[MODEPATH[k]] = k; });
var MODETITLE = { home: '', kantone: 'Kantone', wahrzeichen: 'Wahrzeichen', familien: 'Für Familien', wandern: 'Wandern' };

/* ---------------- Kanton wählen: Farben, Wappen, Titel ---------------- */
function applyBrand(code) {
  if (code) root.setAttribute('data-kanton', code); else root.removeAttribute('data-kanton');
  var K = KC[code || 'CH'];
  $('#brandT').textContent = K.title; $('#homeT1').textContent = K.title;
  var tile = $('#markTile');
  if (code) { tile.className = 'mark wap'; tile.innerHTML = '<img src="' + wappen(code) + '" alt="">'; }
  else { tile.className = 'mark'; tile.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff"/></svg>'; }
  $('#homePillT').textContent = code ? 'Kanton ' + K.name + ' · ' + (K.sinceNote || 'im Bund seit ' + K.since) : 'Schweiz · 26 Kantone';
  var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = K.color.brand;
  Array.prototype.forEach.call(document.querySelectorAll('#wstrip button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.k || '') === (code || 'CH'))); });
  setTitle();
}
function setTitle() {
  var K = KC[selected ? selected.code : 'CH'], t = K.title + ' Familien';
  document.title = MODE === 'home' || !MODETITLE[MODE] ? t : MODETITLE[MODE] + ' · ' + t;
}
function setCanton(code, opts) {
  opts = opts || {};
  code = code && BYCODE[String(code).toUpperCase()] ? String(code).toUpperCase() : null;
  if ((selected ? selected.code : null) === code) return false;
  selected = code ? BYCODE[code] : null;
  filt.wahrzeichen.groups = MGROUP.map(function () { return true; });
  applyBrand(code);
  if (!opts.noRender && MODE !== 'home') { renderHead(); if (!SEL) renderList(); }
  if (!opts.noFly && !SEL) flyContext();
  if (!opts.noHash) syncHash();
  return true;
}
function buildStrip() {
  var el = $('#wstrip');
  el.innerHTML = '<span>Ihr Kanton</span>' + KT.ORDER.map(function (code) {
    return '<button type="button" data-k="' + code + '" aria-pressed="false" title="' + esc(KC[code].name) + '" aria-label="' + esc(KC[code].name) + '"><img src="' + wappen(code) + '" alt=""></button>';
  }).join('') + '<button type="button" data-k="CH" aria-pressed="true" title="Ganze Schweiz" aria-label="Ganze Schweiz"><img src="' + wappen('CH') + '" alt=""></button>';
  el.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    setCanton(b.dataset.k === 'CH' ? null : b.dataset.k, { noRender: true });
  });
}

/* ---------------- Adresse ---------------- */
function parseHash() {
  var raw = decodeURI(location.hash || '');
  var legacy = raw.match(/^#([a-z]{2})$/i);
  if (legacy && KC[legacy[1].toUpperCase()]) return { mode: 'kantone', id: legacy[1].toLowerCase(), q: {} };
  var h = raw.replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
  if (qi >= 0) { h.slice(qi + 1).split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) q[a[0]] = a[1] || ''; }); h = h.slice(0, qi); }
  var parts = h.split('/').filter(Boolean);
  return { mode: PATHMODE[parts[0] || ''] || 'home', id: parts[1] || null, q: q };
}
function hashFor(mode, id) {
  var p = MODEPATH[mode], h = '#/' + p + (p && id ? '/' + encodeURIComponent(id) : '');
  if (selected && !(mode === 'kantone' && id)) h += '?k=' + selected.code.toLowerCase();
  return h;
}
function go(mode, id, replace) {
  var h = hashFor(mode, id);
  if (location.hash === h) { applyRoute(); return; }
  if (replace) { history.replaceState(null, '', h); applyRoute(); } else location.hash = h;
}
function syncHash() { var h = hashFor(MODE, SEL ? SEL.id : null); if (location.hash !== h) history.replaceState(null, '', h); }
var lastRoute = '';
function applyRoute() {
  if (!D) return;
  var r = parseHash();
  if (r.mode === 'info') { if (!/\bm-\w/.test(body.className)) setMode('home', true); openInfo(); return; }
  closeInfo();
  if (touring) stopTour(true);
  if (MAP.flying()) MAP.stopFly();
  if ('k' in r.q) setCanton(r.q.k || null, { noRender: true, noFly: true, noHash: true });
  if (r.mode === 'kantone' && r.id) setCanton(r.id, { noRender: true, noFly: true, noHash: true });
  var changed = r.mode !== MODE;
  setMode(r.mode, changed);
  var it = r.id ? findItem(r.mode, r.id) : null;
  SELREQ = r.id && !it ? { mode: r.mode, id: r.id } : null;
  if (it) { if (!SEL || it.id !== SEL.id || it.kind !== SEL.kind) openItem(it); }
  else if (SEL) { closeDetail(); flyContext(); }
  else { renderHead(); renderList(); flyContext(); }
  syncHash();
  lastRoute = location.hash;
}
window.addEventListener('hashchange', applyRoute);
function findItem(mode, id) {
  if (mode === 'kantone') { var c = BYCODE[String(id).toUpperCase()]; return c ? { kind: 'kanton', id: c.code.toLowerCase(), c: c, code: c.code } : null; }
  if (mode === 'wahrzeichen') return MARKBY[id] || null;
  if (mode === 'familien') return POIS[+id] || null;
  if (mode === 'wandern') return ROUTES.filter(function (r) { return r.id === id; })[0] || null;
  return null;
}
function setMode(m, changed) {
  MODE = m;
  ['home', 'kantone', 'wahrzeichen', 'familien', 'wandern'].forEach(function (k) { body.classList.toggle('m-' + k, k === m); });
  Array.prototype.forEach.call(document.querySelectorAll('#tabs a'), function (a) { if (a.dataset.mode === m) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (changed) {
    if (SEL) closeDetail(true);
    pscroll.scrollTop = 0;
    filt.familien.shown = 120;
    if (m !== 'home') { showHint(); if (narrowMQ.matches && sheet === 'peek') setSheet('half'); }
  }
  setTitle();
}
function refreshMode(m) { if (MODE === m && !SEL) { renderHead(); renderList(); } else if (MODE === m && SEL && SEL.kind === 'kanton') { renderDetail(); } }
function flyContext() {
  if (MODE === 'home') { if (selected) MAP.flyCanton(selected, true); else MAP.flyHome(); return; }
  if (selected) MAP.flyCanton(selected); else MAP.flyOverview();
}

/* ---------------- Panel: Kopf je Bereich ---------------- */
function cantonSelect(id) {
  return '<label class="sr" for="' + id + '">Kanton</label><select id="' + id + '"><option value="">Ganze Schweiz</option>' +
    KT.ORDER.map(function (c) { return '<option value="' + c + '"' + (selected && selected.code === c ? ' selected' : '') + '>' + esc(KC[c].name) + '</option>'; }).join('') + '</select>';
}
function inSel(code) { return !selected || code === selected.code; }
function renderHead() {
  var h = '', K = selected ? KC[selected.code] : null;
  if (MODE === 'kantone') {
    h = '<span class="kicker">' + svgIcon('kanton') + 'Kantone</span><h2>26 Kantone, ' + swiss(D.ch.gem) + ' Gemeinden</h2>' +
      '<p class="intro">Fläche, Einwohner und Wahrzeichen. Ein gewählter Kanton färbt die Seite in seinen Farben.</p>' +
      '<div class="flt"><label class="sr" for="fReg">Region</label><select id="fReg"><option value="">Alle Regionen</option>' +
      REGION_ORDER.map(function (r) { return '<option value="' + r + '"' + (filt.kantone.reg === r ? ' selected' : '') + '>' + REGION_NAME[r] + '</option>'; }).join('') + '</select>' +
      (selected ? '<button type="button" class="chip" id="fAll">Ganze Schweiz</button>' : '') + '</div>';
  } else if (MODE === 'wahrzeichen') {
    var ms = MARKLIST.filter(function (m) { return inSel(m.code); });
    h = '<span class="kicker">' + svgIcon('star') + 'Wahrzeichen' + (K ? ' · ' + esc(K.name) : '') + '</span><h2>' + (K ? ms.length + ' Wahrzeichen im Kanton ' + esc(K.name) : MARKLIST.length + ' Wahrzeichen in 3D') + '</h2>' +
      '<p class="intro">Jedes Modell steht an seinem Ort und bewegt sich. Ein Klick fliegt hin, mit Luftbild.</p>' +
      '<div class="flt" id="chipsM" role="group" aria-label="Arten">' + MGROUP.map(function (g, i) {
        var n = ms.filter(function (m) { return m.grp === i; }).length;
        return n ? '<button type="button" class="chip" data-g="' + i + '" aria-pressed="' + filt.wahrzeichen.groups[i] + '">' + svgIcon(g.ic) + esc(g.label) + ' <small>' + n + '</small></button>' : '';
      }).join('') + '</div><div class="flt">' + cantonSelect('fK') + '</div>';
  } else if (MODE === 'familien') {
    var cnt = {}; POIS.forEach(function (p) { if (inSel(p.code)) cnt[p.c] = (cnt[p.c] || 0) + 1; });
    h = '<span class="kicker">' + svgIcon('family') + 'Für Familien' + (K ? ' · ' + esc(K.name) : '') + '</span><h2>Spielplätze, Badis, Bahnhöfe und mehr</h2>' +
      '<p class="intro">Wählen Sie, was die Karte zeigen soll. Die Liste zeigt ' + (K ? 'die Orte im Kanton.' : 'die Orte in der Nähe der Kartenmitte; mit einem Kanton alle Orte dort.') + '</p>' +
      '<div class="flt" id="chipsF" role="group" aria-label="Kategorien">' + POICAT.map(function (c, i) {
        return '<button type="button" class="chip" data-c="' + c.k + '" aria-pressed="' + !!LAYERS[c.k] + '"><img src="' + ICONS.url[c.k] + '" alt="">' + esc(c.label) + (POIS.length ? ' <small>' + swiss(cnt[i] || 0) + '</small>' : '') + '</button>';
      }).join('') + '</div><div class="flt">' + cantonSelect('fK') + '</div>';
  } else if (MODE === 'wandern') {
    var rs = ROUTES.filter(function (r) { return !selected || r.cantons.indexOf(selected.code) >= 0; });
    var nn = rs.filter(function (r) { return r.typ === 'national'; }).length;
    h = '<span class="kicker">' + svgIcon('hike') + 'Wandern' + (K ? ' · ' + esc(K.name) : '') + '</span><h2>' + (ROUTES.length ? rs.length + ' Wanderrouten' + (K ? ' im Kanton ' + esc(K.name) : ' von SchweizMobil') : 'Wanderrouten') + '</h2>' +
      '<p class="intro">Nationale und regionale Routen. Beim Heranzoomen zeigt die Karte das ganze Wanderwegnetz von swisstopo: gelb Wanderweg, rot Bergwanderweg, blau Alpinwanderweg.</p>' +
      '<div class="flt" id="chipsW" role="group" aria-label="Routen"><button type="button" class="chip" data-w="nat" aria-pressed="' + filt.wandern.nat + '">National <small>' + nn + '</small></button>' +
      '<button type="button" class="chip" data-w="reg" aria-pressed="' + filt.wandern.reg + '">Regional <small>' + (rs.length - nn) + '</small></button>' +
      '<button type="button" class="chip" data-w="trails" aria-pressed="' + !!LAYERS.trails + '">Wanderwege auf der Karte</button></div><div class="flt">' + cantonSelect('fK') + '</div>';
  }
  phEl.innerHTML = h;
  var fk = $('#fK'); if (fk) fk.addEventListener('change', function () { setCanton(fk.value || null); });
  var fr = $('#fReg'); if (fr) fr.addEventListener('change', function () { filt.kantone.reg = fr.value; renderList(); });
  var fa = $('#fAll'); if (fa) fa.addEventListener('click', function () { setCanton(null); });
  var cm = $('#chipsM'); if (cm) cm.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return; var i = +b.dataset.g, g = filt.wahrzeichen.groups;
    var all = g.every(Boolean); if (all) g.forEach(function (_, k) { g[k] = k === i; }); else { g[i] = !g[i]; if (!g.some(Boolean)) g.forEach(function (_, k) { g[k] = true; }); }
    Array.prototype.forEach.call(cm.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(g[+c.dataset.g])); });
    renderList();
  });
  var cf = $('#chipsF'); if (cf) cf.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return; setLayer(b.dataset.c, !LAYERS[b.dataset.c]); b.setAttribute('aria-pressed', String(LAYERS[b.dataset.c])); renderList();
  });
  var cw = $('#chipsW'); if (cw) cw.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return; var k = b.dataset.w;
    if (k === 'trails') setLayer('trails', !LAYERS.trails); else filt.wandern[k] = !filt.wandern[k];
    b.setAttribute('aria-pressed', String(k === 'trails' ? LAYERS.trails : filt.wandern[k])); renderList();
  });
}

/* ---------------- Panel: Listen ---------------- */
function itemBtn(id, pin, title, sub, side, cur) {
  return '<button type="button" class="it" data-id="' + esc(id) + '"' + (cur ? ' aria-current="true"' : '') + '>' + pin + '<span class="tx"><b>' + title + '</b><span>' + sub + '</span></span>' + (side ? '<span class="sh">' + side + '</span>' : '<span></span>') + '</button>';
}
function wPin(code) { return '<span class="pin wp"><img src="' + wappen(code) + '" alt=""></span>'; }
function catPin(c) { return '<span class="pin ic"><img src="' + ICONS.url[POICAT[c].k] + '" alt=""></span>'; }
function grpPin(g) { return '<span class="pin">' + svgIcon(MGROUP[g].ic) + '</span>'; }
function routePin(r) { return '<span class="pin nr' + (r.typ === 'national' ? ' nat' : '') + '">' + esc(r.nr) + '</span>'; }
function poiTitle(p) { return p.name || POICAT[p.c].one; }
function marksOf(code) { return MARKS[code] || []; }
var listCenter = null, lastListT = 0;
function renderList() {
  if (!D || MODE === 'home') { listEl.innerHTML = ''; return; }
  var h = '';
  if (MODE === 'kantone') {
    var regs = filt.kantone.reg ? [filt.kantone.reg] : REGION_ORDER;
    regs.forEach(function (r) {
      var cs = KT.REGIONS[r];
      h += '<div class="grp"><span>' + REGION_NAME[r] + '</span><span>' + cs.length + '</span></div>';
      cs.forEach(function (code) {
        var c = BYCODE[code], K = KC[code];
        h += itemBtn(code.toLowerCase(), wPin(code), esc(K.name), esc(K.capital.split(' (')[0]) + ' · ' + km2(c.ha) + ' km² · ' + swiss(c.pop) + ' Einw.', marksOf(code).length + ' ★', selected && selected.code === code);
      });
    });
  } else if (MODE === 'wahrzeichen') {
    var g = filt.wahrzeichen.groups, n = 0;
    KT.ORDER.forEach(function (code) {
      if (!inSel(code)) return;
      var ms = marksOf(code).filter(function (m) { return g[m.grp]; });
      if (!ms.length) return;
      h += '<div class="grp"><span><img src="' + wappen(code) + '" alt="">' + esc(KC[code].name) + '</span><span>' + ms.length + '</span></div>';
      ms.forEach(function (m) { n++; h += itemBtn(m.id, grpPin(m.grp), esc(m.name), esc(m.text), '', HOT && HOT.id === m.id); });
    });
    if (!n) h = '<p class="empty">Keine Wahrzeichen für diese Auswahl.</p>';
  } else if (MODE === 'familien') {
    if (!POIS.length) h = '<p class="empty">Die Orte werden geladen …</p>';
    else {
      var on = POICAT.map(function (c) { return !!LAYERS[c.k]; });
      if (!on.some(Boolean)) h = '<p class="empty">Wählen Sie oben mindestens eine Kategorie.</p>';
      else if (selected) {
        if (!POIS.ready) h = '<p class="empty">Die Orte werden den Kantonen zugeordnet …</p>';
        else {
          var vs = POIS.filter(function (p) { return on[p.c] && p.code === selected.code; });
          vs.sort(function (a, b) { return (b.name ? 1 : 0) - (a.name ? 1 : 0) || a.c - b.c || poiTitle(a).localeCompare(poiTitle(b), 'de'); });
          h += '<p class="count"><span>' + swiss(vs.length) + ' Orte im Kanton ' + esc(KC[selected.code].name) + '</span><span>' + (vs.length > filt.familien.shown ? 'die ersten ' + filt.familien.shown : '') + '</span></p>';
          vs.slice(0, filt.familien.shown).forEach(function (p) { h += itemBtn(p.id, catPin(p.c), esc(poiTitle(p)), esc(POICAT[p.c].one + ' · ' + swiss(p.h) + ' m ü. M.'), ''); });
          if (vs.length > filt.familien.shown) h += '<button type="button" class="more" id="moreF">Weitere ' + Math.min(200, vs.length - filt.familien.shown) + ' zeigen</button>';
          if (!vs.length) h += '<p class="empty">Keine Orte dieser Kategorien im Kanton.</p>';
        }
      } else {
        var c0 = MAP.center();
        if (!c0) h = '<p class="empty">Wählen Sie einen Kanton, um seine Orte zu sehen.</p>';
        else {
          listCenter = c0; lastListT = performance.now();
          var R = clamp(c0.d * 0.5, 3000, 40000), near = [];
          for (var i = 0; i < POIS.length; i++) {
            var p = POIS[i]; if (!on[p.c]) continue;
            var dd = Math.hypot(p.E - c0.E, p.N - c0.N); if (dd < R) near.push([dd, p]);
          }
          near.sort(function (a, b) { return a[0] - b[0]; });
          h += '<p class="count"><span>' + (near.length ? swiss(near.length) + ' Orte im Umkreis von ' + swiss(R / 1000) + ' km' : 'Keine Orte in der Nähe') + '</span><span>' + (near.length > 80 ? 'die nächsten 80' : '') + '</span></p>';
          near.slice(0, 80).forEach(function (q) { var p = q[1]; h += itemBtn(p.id, catPin(p.c), esc(poiTitle(p)), esc(POICAT[p.c].one + (p.code ? ' · ' + KC[p.code].name : '')), km(q[0]) + ' km'); });
          if (!near.length) h += '<p class="empty">Zoomen Sie näher an einen Ort heran oder wählen Sie einen Kanton.</p>';
        }
      }
    }
  } else if (MODE === 'wandern') {
    if (!ROUTES.length) h = '<p class="empty">Die Routen werden geladen …</p>';
    else {
      var cur = '';
      ROUTES.forEach(function (r) {
        if (selected && r.cantons.indexOf(selected.code) < 0) return;
        if (r.typ === 'national' ? !filt.wandern.nat : !filt.wandern.reg) return;
        var grp = r.typ === 'national' ? 'Nationale Routen' : 'Regionale Routen';
        if (grp !== cur) { h += '<div class="grp"><span>' + grp + '</span></div>'; cur = grp; }
        h += itemBtn(r.id, routePin(r), esc(r.name), esc(km(r.len) + ' km · ' + r.cantons.length + (r.cantons.length === 1 ? ' Kanton' : ' Kantone')), '');
      });
      if (!cur) h = '<p class="empty">Keine Routen für diese Auswahl.</p>';
    }
  }
  listEl.innerHTML = h;
  var mf = $('#moreF'); if (mf) mf.addEventListener('click', function () { filt.familien.shown += 200; renderList(); });
}
listEl.addEventListener('click', function (e) {
  var b = e.target.closest('.it'); if (!b) return;
  go(MODE, b.dataset.id);
});

/* ---------------- Panel: Detail ---------------- */
function factsHTML(rows) { return '<dl class="facts">' + rows.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd' + (f[2] ? ' class="t"' : '') + '>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>'; }
function linkHTML(items) { return '<ul class="links">' + items.map(function (l) { return '<li>' + (l.href ? '<a href="' + esc(l.href) + '"' + (/^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : '') + '>' + l.label + '</a>' : '<button type="button" data-act="' + l.act + '">' + l.label + '</button>') + '</li>'; }).join('') + '</ul>'; }
var FLYLBL = svgIcon('fly') + 'Hier frei fliegen', MAPLBL = 'Auf der Landeskarte';
function detailHTML(it) {
  var h = '';
  if (it.kind === 'kanton') {
    var c = it.c, code = c.code, K = KC[code], ms = marksOf(code);
    var nP = POIS.ready ? POIS.filter(function (p) { return p.code === code; }).length : null;
    var nR = ROUTES.filter(function (r) { return r.cantons.indexOf(code) >= 0; }).length;
    h += backBtn('Alle Kantone') +
      '<div class="dhead"><img src="' + wappen(code) + '" alt="Wappen ' + esc(K.name) + '"><div><h3>' + esc(K.name) + '</h3><p class="sub">' + esc(K.local) + '</p></div></div>' +
      '<div class="flagbar" aria-hidden="true"></div>' +
      factsHTML([['Hauptort', K.capital, 1], [K.sinceNote ? 'Kanton seit' : 'Im Bund seit', K.since], ['Amtssprache' + (K.lang.indexOf(',') > 0 ? 'n' : ''), K.lang, 1],
        ['Fläche', km2(c.ha) + ' km²'], ['Einwohner', swiss(c.pop)], ['Gemeinden', String(c.gem)], ['Höhenlage', c.hmin + '–' + swiss(c.hmax) + ' m']]) +
      '<div class="btns"><a href="' + esc(hashFor('wahrzeichen')) + '">' + svgIcon('star') + 'Wahrzeichen <small>' + ms.length + '</small></a>' +
      '<a href="' + esc(hashFor('familien')) + '">' + svgIcon('family') + 'Für Familien' + (nP != null ? ' <small>' + swiss(nP) + '</small>' : '') + '</a>' +
      '<a href="' + esc(hashFor('wandern')) + '">' + svgIcon('hike') + 'Wanderrouten' + (ROUTES.length ? ' <small>' + nR + '</small>' : '') + '</a></div>' +
      linkHTML([{ act: 'fly', label: FLYLBL }]) +
      '<p class="sec"><span>Wahrzeichen</span><span>' + ms.length + '</span></p><div class="list">' +
      ms.map(function (m) { return '<a class="it" href="#/wahrzeichen/' + m.id + '?k=' + code.toLowerCase() + '">' + grpPin(m.grp) + '<span class="tx"><b>' + esc(m.name) + '</b><span>' + esc(m.text) + '</span></span><span></span></a>'; }).join('') + '</div>';
  } else if (it.kind === 'mark') {
    var K2 = KC[it.code], g = MGROUP[it.grp];
    h += backBtn('Alle Wahrzeichen') +
      '<div class="dhead"><img src="' + wappen(it.code) + '" alt="Wappen ' + esc(K2.name) + '"><div><h3>' + esc(it.name) + '</h3><p class="sub">' + esc(g.label.split(' & ')[0].replace(/n$/, '')) + ' · Kanton ' + esc(K2.name) + '</p></div></div>' +
      '<p class="txt">' + esc(it.text) + '</p>' +
      factsHTML([['Kanton', K2.name, 1], ['Art', g.label, 1], ['Höhe', '<span data-h></span>', 1], ['Koordinaten LV95', swiss(it.E) + ' / ' + swiss(it.N)]]).replace('&lt;span data-h&gt;&lt;/span&gt;', '<span data-h>…</span>') +
      linkHTML([{ act: 'close', label: svgIcon('zoom') + 'Näher heran' }, { act: 'fly', label: FLYLBL }, { href: geoAdminURL(it.E, it.N), label: MAPLBL }]) +
      '<p class="note">Das Modell ist vereinfacht und nicht massstäblich; beim Heranzoomen zeigt das Luftbild den Ort.</p>';
  } else if (it.kind === 'poi') {
    var c3 = POICAT[it.c], K3 = it.code ? KC[it.code] : null;
    var L = [{ act: 'close', label: svgIcon('zoom') + 'Näher heran' }, { href: geoAdminURL(it.E, it.N), label: MAPLBL }];
    if (c3.k !== 'bahn' && c3.k !== 'seilbahn') L.push({ href: osmURL(it.E, it.N), label: 'In OpenStreetMap' });
    h += backBtn('Alle Orte') +
      '<div class="dhead"><img class="ico" src="' + ICONS.url[c3.k] + '" alt=""><div><h3>' + esc(poiTitle(it)) + '</h3><p class="sub">' + esc(c3.one + (K3 ? ' · Kanton ' + K3.name : '')) + '</p></div></div>' +
      factsHTML([['Kategorie', c3.one, 1], ['Kanton', K3 ? K3.name : '–', 1], ['Höhe', swiss(it.h) + ' m ü. M.'], ['Koordinaten LV95', swiss(it.E) + ' / ' + swiss(it.N)]]) +
      linkHTML(L) +
      '<p class="note">' + (c3.k === 'bahn' || c3.k === 'seilbahn' ? 'Quelle: Bundesamt für Verkehr BAV.' : 'Quelle: © OpenStreetMap-Mitwirkende' + (POIDATE ? ', Stand ' + POIDATE.split('-').reverse().join('.') : '') + '.' + (it.name ? '' : ' In den Daten ist kein Name eingetragen.')) + '</p>';
  } else if (it.kind === 'route') {
    h += backBtn('Alle Routen') +
      '<div class="dhead"><span class="it" style="padding:0;width:auto;grid-template-columns:36px">' + routePin(it) + '</span><div><h3>' + esc(it.name) + '</h3><p class="sub">' + (it.typ === 'national' ? 'Nationale Route ' : 'Regionale Route ') + esc(it.nr) + ' · SchweizMobil</p></div></div>' +
      factsHTML([['Länge auf der Karte', km(it.len) + ' km'], ['Kantone', String(it.cantons.length)], ['Art', it.typ === 'national' ? 'National' : 'Regional', 1]]) +
      '<p class="sec"><span>Durch die Kantone</span></p><div class="flt" style="margin-top:6px">' + it.cantons.map(function (code) { return '<a class="chip" href="#/kantone/' + code.toLowerCase() + '"><img src="' + wappen(code) + '" alt="" style="width:16px;height:19px;margin:0">' + esc(KC[code].name) + '</a>'; }).join('') + '</div>' +
      linkHTML([{ act: 'fly', label: FLYLBL }, { act: 'trails', label: LAYERS.trails ? 'Wanderwege ausblenden' : 'Wanderwege einblenden' }, { href: 'https://schweizmobil.ch/de/wanderland', label: 'Wanderland bei SchweizMobil' }]) +
      '<p class="note">Länge aus der vereinfachten Linie berechnet; Etappen, Höhenmeter und Varianten finden Sie bei SchweizMobil.</p>';
  }
  return h;
}
function renderDetail() { if (SEL) { detailEl.innerHTML = detailHTML(SEL); wireDetail(); } }
function wireDetail() {
  var b = $('#back'); if (b) b.addEventListener('click', backFromDetail);
  var hEl = detailEl.querySelector('[data-h]'); if (hEl && SEL && SEL.kind === 'mark') { var hh = MAP.heightAt ? MAP.heightAt(SEL.E, SEL.N) : null; hEl.textContent = hh != null ? swiss(hh) + ' m ü. M.' : '–'; }
}
detailEl.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-act]'); if (!b || !SEL) return;
  var a = b.dataset.act;
  if (a === 'fly') MAP.startFly(SEL);
  else if (a === 'close') { if (SEL.kind === 'mark') MAP.flyMark(SEL, true); else MAP.flyPOI(SEL, true); }
  else if (a === 'trails') { setLayer('trails', !LAYERS.trails); renderDetail(); }
});
function openItem(it) {
  if (SEL) closeDetail(true);
  SEL = it; SELREQ = null;
  panel.classList.add('has-detail'); listEl.hidden = true; detailEl.hidden = false;
  if (it.kind === 'kanton') setCanton(it.code, { noRender: true, noFly: true, noHash: true });
  else if ((it.kind === 'mark' || it.kind === 'poi') && it.code && selected && selected.code !== it.code) setCanton(it.code, { noRender: true, noFly: true, noHash: true });
  renderHead();
  detailEl.innerHTML = detailHTML(it); wireDetail();
  pscroll.scrollTop = 0;
  if (it.kind === 'kanton') MAP.flyCanton(it.c);
  else if (it.kind === 'mark') { HOT = it; MAP.flyMark(it); }
  else if (it.kind === 'poi') { MAP.setHotPOI(+it.id); MAP.flyPOI(it); }
  else if (it.kind === 'route') { MAP.setRoute(it); MAP.flyRoute(it); }
  if (narrowMQ.matches && sheet === 'peek') setSheet('half');
  setTitle();
}
function closeDetail(silent) {
  if (!SEL) return;
  var was = SEL; SEL = null; HOT = null;
  MAP.setHotPOI(-1);
  if (was.kind === 'route') MAP.setRoute(null);
  panel.classList.remove('has-detail'); detailEl.hidden = true; detailEl.innerHTML = ''; listEl.hidden = false;
  if (!silent) { renderHead(); renderList(); }
}
function backFromDetail() { go(MODE, null); }

/* ---------------- Blatt auf dem Handy ---------------- */
var sheet = 'half';
function sheetPx(s) {
  var top = parseFloat(getComputedStyle(root).getPropertyValue('--top')) || 54, vh = window.innerHeight;
  return s === 'peek' ? vh * 0.24 : s === 'full' ? vh - top - 14 - (parseFloat(getComputedStyle(root).getPropertyValue('--tabbar')) || 64) : vh * 0.46;
}
function setSheet(s) {
  sheet = s;
  panel.style.setProperty('--sheet', s === 'peek' ? '24svh' : s === 'full' ? 'calc(100svh - var(--top) - var(--tabbar) - 14px)' : '46svh');
}
(function sheetDrag() {
  var hd = $('#handle'), y0 = 0, h0 = 0, moved = 0, id = null;
  hd.addEventListener('pointerdown', function (e) { id = e.pointerId; y0 = e.clientY; h0 = panel.getBoundingClientRect().height; moved = 0; try { hd.setPointerCapture(id); } catch (er) {} panel.classList.add('dragging'); });
  hd.addEventListener('pointermove', function (e) {
    if (e.pointerId !== id) return; var dy = e.clientY - y0; moved = Math.max(moved, Math.abs(dy));
    panel.style.setProperty('--sheet', clamp(h0 - dy, sheetPx('peek') * 0.8, sheetPx('full')) + 'px');
  });
  function end(e) {
    if (e.pointerId !== id) return; id = null; panel.classList.remove('dragging');
    if (moved < 6) { setSheet(sheet === 'half' ? 'full' : sheet === 'full' ? 'peek' : 'half'); return; }
    var hNow = panel.getBoundingClientRect().height, best = 'half', bd = 1e9;
    ['peek', 'half', 'full'].forEach(function (s) { var d = Math.abs(sheetPx(s) - hNow); if (d < bd) { bd = d; best = s; } });
    setSheet(best);
  }
  hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
  hd.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(sheet === 'half' ? 'full' : sheet === 'full' ? 'peek' : 'half'); } });
})();

/* ---------------- Info ---------------- */
var infoDlg = $('#infoDlg'), infoFrom = null;
function openInfo() { if (!infoDlg.hidden) return; infoFrom = document.activeElement; infoDlg.hidden = false; $('#infoClose').focus(); }
function closeInfo() { if (infoDlg.hidden) return; infoDlg.hidden = true; if (infoFrom && infoFrom.focus) infoFrom.focus(); }
$('#infoClose').addEventListener('click', function () { if (lastRoute && lastRoute !== location.hash) history.back(); else go(MODE, SEL ? SEL.id : null, true); });
infoDlg.addEventListener('click', function (e) { if (e.target === infoDlg) $('#infoClose').click(); });
var hintEl = $('#hint'), hintShown = false;
function showHint() { if (hintShown || !fine || TEST) return; hintShown = true; hintEl.classList.add('on'); setTimeout(function () { hintEl.classList.remove('on'); }, 6000); }

/* ---------------- Ebenen-Fenster ---------------- */
var legend = $('#legend'), tLayers = $('#tLayers');
(function buildLegend() {
  function row(k, label, sw, sub) {
    return '<label class="lg-row"><span class="sw">' + sw + '</span><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><input type="checkbox" data-l="' + k + '"' + (LAYERS[k] ? ' checked' : '') + '><span class="tg" aria-hidden="true"></span></label>';
  }
  $('#legendBody').innerHTML =
    '<p class="lg-h">Karte</p>' +
    row('sat', 'Luftbild', '<i class="sw-sat"></i>', 'beim Heranzoomen') +
    row('trails', 'Wanderwege und Routen', '<i class="sw-trail"></i>') +
    row('marks', 'Wahrzeichen in 3D', '<i class="sw-mark"></i>') +
    row('borders', 'Grenzen', '<i class="sw-border"></i>') +
    row('water', 'Flüsse und Seeufer', '<i class="sw-water"></i>') +
    row('labels', 'Namen', '<i class="sw-label">Aa</i>') +
    '<p class="lg-h">Für Familien</p>' +
    POICAT.map(function (c) { return row(c.k, c.label, '<img src="' + ICONS.url[c.k] + '" alt="">'); }).join('');
  $('#legendBody').addEventListener('change', function (e) {
    var t = e.target; if (!t.dataset || !t.dataset.l) return;
    setLayer(t.dataset.l, t.checked);
    if (MODE === 'familien' || MODE === 'wandern') { renderHead(); if (!SEL) renderList(); }
  });
})();
function showLegend(v) { legend.classList.toggle('on', v); tLayers.setAttribute('aria-expanded', String(v)); if (v) $('#legendClose').focus(); }
tLayers.addEventListener('click', function () { showLegend(!legend.classList.contains('on')); });
$('#legendClose').addEventListener('click', function () { showLegend(false); tLayers.focus(); });
document.addEventListener('pointerdown', function (e) { if (legend.classList.contains('on') && !legend.contains(e.target) && !tLayers.contains(e.target)) showLegend(false); });
$('#tSat').addEventListener('click', function () { setLayer('sat', !LAYERS.sat); });
$('#tSat').setAttribute('aria-pressed', String(LAYERS.sat));

/* ---------------- Rundflug ---------------- */
var TOUR = [
  { key: 'schweiz', kick: 'Die Schweiz', title: '', text: '', hi: [] },
  { key: 'lemanique', kick: 'Genferseeregion', title: 'Vom Genfersee ins Rhonetal', text: 'Die Rhone entspringt am Rhonegletscher, durchfliesst das Wallis und mündet zwischen Le Bouveret und Villeneuve in den Genfersee. Im Kanton Genf verlässt sie die Schweiz. Im Wallis steht mit der Dufourspitze der höchste Gipfel des Landes, am Nordufer des Sees liegen zwischen Lausanne und Vevey die Rebterrassen des Lavaux.' },
  { key: 'mittelland', kick: 'Espace Mittelland', title: 'Vom Oberland bis an den Doubs', text: 'Die Region reicht von den Gletschern des Berner Oberlands über das Mittelland bis in die Ketten des Juras. Durch sie verläuft die Sprachgrenze: Bern und Freiburg sind zweisprachig, Neuenburg und Jura französischsprachig. In Bern tagen Bundesrat und Parlament.' },
  { key: 'nordwest', kick: 'Nordwestschweiz', title: 'Am Rheinknie', text: 'Bei Basel wendet sich der Rhein nach Norden. Am Dreiländereck treffen die Schweiz, Deutschland und Frankreich aufeinander. Im Aargau vereinigen sich Aare, Reuss und Limmat; die Gegend um Brugg heisst deshalb Wasserschloss der Schweiz.' },
  { key: 'zuerich', kick: 'Zürich', title: 'Ein Kanton als eigene Grossregion', text: 'Kein Kanton zählt mehr Einwohner. Er reicht vom Rhein im Norden über das Weinland bis ins Zürcher Oberland. Die Stadt Zürich liegt am Ausfluss der Limmat aus dem See.' },
  { key: 'zentral', kick: 'Zentralschweiz', title: 'Rund um den Vierwaldstättersee', text: 'Uri, Schwyz und Unterwalden schlossen sich zum ersten Bund der Eidgenossenschaft zusammen. Der Bundesbrief ist auf Anfang August 1291 datiert; die Überlieferung verlegt den Schwur auf das Rütli am Urnersee.' },
  { key: 'ost', kick: 'Ostschweiz', title: 'Vom Bodensee bis ins Engadin', text: 'Sieben Kantone, darunter Graubünden, der flächengrösste der Schweiz und der einzige mit drei Amtssprachen. Der Säntis überragt das Appenzellerland; im Süden erreicht die Region am Piz Bernina über 4000 m.' },
  { key: 'tessin', kick: 'Tessin', title: 'Südlich des Gotthards', text: 'Das Tessin ist der einzige Kanton mit Italienisch als alleiniger Amtssprache. Am Lago Maggiore liegt auf 193 m ü. M. der tiefste Punkt der Schweiz, keine 50 km Luftlinie vom Rheinwaldhorn auf 3402 m entfernt.' }
];
TOUR.forEach(function (s) { if (!s.hi) s.hi = KT.REGIONS[s.key] || []; });
var tourI = 0, tourT0 = 0, TOUR_DUR = 11000, tourPaused = false, capEl = $('#caption');
function startTour() {
  if (MAP.flying()) MAP.stopFly();
  TOUR[0].title = '26 Kantone auf ' + swiss(D.ch.ha / 100) + ' km²';
  TOUR[0].text = 'Vom Lago Maggiore auf ' + D.ch.hmin + ' m ü. M. bis zur Dufourspitze auf ' + D.ch.hmax + ' m. Die rote Linie ist die Landesgrenze, die gestrichelten Linien sind die Grenzen der Kantone nach swissBOUNDARIES3D, Stand 2026.';
  touring = true; body.classList.add('touring'); capEl.hidden = false;
  tourGo(0);
}
function tourGo(i) {
  tourI = clamp(i, 0, TOUR.length - 1); var s = TOUR[tourI];
  MAP.flyKey(s.key);
  $('#capKick').textContent = s.kick; $('#capTitle').textContent = s.title; $('#capText').textContent = s.text;
  $('#capW').innerHTML = s.hi.map(function (c) { return '<img src="' + wappen(c) + '" alt="" title="' + esc(KC[c].name) + '">'; }).join('');
  $('#capStep').textContent = (tourI + 1) + ' / ' + TOUR.length;
  $('#capPrev').disabled = tourI === 0; $('#capNext').textContent = tourI === TOUR.length - 1 ? 'Ende' : 'Weiter';
  tourT0 = performance.now();
}
function stepTour(now) {
  if (!touring) return;
  var u = clamp((now - tourT0) / TOUR_DUR, 0, 1);
  $('#capBar').style.width = (u * 100).toFixed(1) + '%';
  if (u >= 1 && !tourPaused) { if (tourI < TOUR.length - 1) tourGo(tourI + 1); else stopTour(); }
}
function stopTour(silent) {
  if (!touring) return;
  touring = false; body.classList.remove('touring'); capEl.hidden = true;
  if (!silent) flyContext();
}
$('#tourBtn').addEventListener('click', startTour);
$('#capPrev').addEventListener('click', function () { tourGo(tourI - 1); });
$('#capNext').addEventListener('click', function () { if (tourI < TOUR.length - 1) tourGo(tourI + 1); else stopTour(); });
$('#capStop').addEventListener('click', function () { stopTour(); });
capEl.addEventListener('pointerenter', function () { tourPaused = true; });
capEl.addEventListener('pointerleave', function () { tourPaused = false; tourT0 = Math.max(tourT0, performance.now() - TOUR_DUR * 0.6); });
$('#flyBtnHome').addEventListener('click', function () { MAP.startFly(null); });
$('#tFly').addEventListener('click', function () { if (MAP.flying()) MAP.stopFly(); else MAP.startFly(null); });
$('#flyExit').addEventListener('click', function () { MAP.stopFly(); });
$('#zoomIn').addEventListener('click', function () { MAP.zoom(0.5); });
$('#zoomOut').addEventListener('click', function () { MAP.zoom(2); });
$('#homeBtn').addEventListener('click', function () { if (touring) stopTour(true); if (selected && MODE !== 'home') MAP.flyCanton(selected); else MAP.flyOverview(); });
$('#northBtn').addEventListener('click', function () { MAP.north(); });
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (!infoDlg.hidden) { $('#infoClose').click(); return; }
  if (legend.classList.contains('on')) { showLegend(false); tLayers.focus(); return; }
  if (MAP.flying()) { if (!document.pointerLockElement) MAP.stopFly(); return; }
  if (touring) { stopTour(); return; }
  if (SEL) backFromDetail();
});

/* ---------------- Karte ---------------- */
function start() {
  if (!window.THREE) { fail('Die 3D-Bibliothek konnte nicht geladen werden.'); return; }
  if (typeof DecompressionStream === 'undefined') { fail('Dieser Browser kann die Geodaten nicht entpacken.'); return; }
  THREE.ColorManagement.enabled = false;

  var canvas = $('#scene');
  canvas.style.opacity = '0';
  canvas.style.transition = reduce ? 'none' : 'opacity 1.4s ease';
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail('WebGL ist in diesem Browser nicht verfügbar.'); return; }
  if (!renderer.capabilities.isWebGL2) { fail('Für das Relief braucht es WebGL 2.'); return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  var small = Math.min(screen.width, screen.height) < 700;

  /* ---------------- Geografie ---------------- */
  var G = D.grid, EC = (G.E0 + G.E1) / 2, NC = (G.N0 + G.N1) / 2, H0 = 190, VZ = 2.0;
  function X(E) { return E - EC; } function Z(N) { return NC - N; } function Y(h) { return (h - H0) * VZ; }
  var nx = G.nx, ny = G.ny, HT = new Float32Array(nx * ny);
  function hAt(E, N) {
    var fx = (E - G.E0) / G.step, fy = (G.N1 - N) / G.step;
    fx = clamp(fx, 0, nx - 1); fy = clamp(fy, 0, ny - 1);
    var i = Math.min(nx - 2, fx | 0), j = Math.min(ny - 2, fy | 0), tx = fx - i, ty = fy - j, k = j * nx + i;
    return (HT[k] * (1 - tx) + HT[k + 1] * tx) * (1 - ty) + (HT[k + nx] * (1 - tx) + HT[k + nx + 1] * tx) * ty;
  }
  function inGrid(E, N) { return E >= G.E0 && E <= G.E1 && N >= G.N0 && N <= G.N1; }
  var HALF_W = (G.E1 - G.E0) / 2, HALF_H = (G.N1 - G.N0) / 2;

  /* ---------------- Materialien ---------------- */
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 20, 2000000);
  camera.rotation.order = 'YXZ';
  // Licht nur für die 3D-Wahrzeichen; Relief und Linien haben eigene Shader
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1), sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-1, 1.6, -0.8); scene.add(hemi); scene.add(sun);
  // Himmel nur im Erkunden-Modus: Verlauf nach Blickhöhe, unten in die Nebelfarbe
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, transparent: false,
    uniforms: { uFog: null, uTop: { value: new THREE.Color('#5E9BD6') }, uMid: { value: new THREE.Color('#B9D3EC') }, uA: { value: 0 }, uDark: null },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: 'uniform vec3 uFog, uTop, uMid; uniform float uA, uDark; varying vec3 vD; void main(){ float y = vD.y;' +
      ' vec3 top = mix(uTop, vec3(0.03,0.05,0.10), uDark), mid = mix(uMid, vec3(0.07,0.10,0.17), uDark);' +
      ' vec3 c = mix(uFog, mid, smoothstep(-0.02, 0.10, y)); c = mix(c, top, smoothstep(0.10, 0.6, y)); gl_FragColor = vec4(c*uA, uA); }'
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.renderOrder = -20; sky.frustumCulled = false; sky.visible = false; scene.add(sky);
  var U = {
    uFog: { value: new THREE.Color() }, uFogNear: { value: 1e6 }, uFogFar: { value: 2e6 },
    uTime: { value: 0 }, uDark: { value: 0 }, uPx: { value: 0.001 }
  };
  skyMat.uniforms.uFog = U.uFog; skyMat.uniforms.uDark = U.uDark;
  var C = {}, CT = {};
  ['--paper', '--m-land', '--m-lit', '--m-shade', '--m-forest', '--m-out', '--m-water', '--m-water-deep', '--m-contour', '--m-hi',
   '--m-side', '--m-side-2', '--m-line', '--m-nation', '--m-cant', '--m-river', '--m-shore', '--m-route', '--m-route-sel', '--ink'
  ].forEach(function (k) { C[k] = new THREE.Color(); CT[k] = new THREE.Color(); });

  var COMMON_FRAG = [
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }'
  ].join('\n');

  var NK = 27;
  var terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uRelief: { value: null }, uMaskL: { value: null }, uMaskN: { value: null }, uHgt: { value: null },
      uHgtSize: { value: new THREE.Vector2(nx, ny) },
      uLand: { value: C['--m-land'] }, uLit: { value: C['--m-lit'] }, uShade: { value: C['--m-shade'] }, uForest: { value: C['--m-forest'] },
      uOut: { value: C['--m-out'] }, uWater: { value: C['--m-water'] }, uWaterDeep: { value: C['--m-water-deep'] },
      uContour: { value: C['--m-contour'] }, uHi: { value: C['--m-hi'] },
      uFocus: { value: 0.3 }, uContourA: { value: 0.3 }, uHover: { value: -1 }, uHiv: { value: new Array(NK).fill(0) }, uHiAny: { value: 0 },
      uFog: U.uFog, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uTime: U.uTime, uDark: U.uDark,
      uCov: { value: null }, uTileO: { value: new THREE.Vector3(2420000, 1350000, 10240) }, uEN: { value: new THREE.Vector2(EC, NC) }, uCovOn: { value: 0 }
    },
    vertexShader: [
      'varying vec2 vUv; varying vec3 vW; varying float vDist;',
      'void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vDist=distance(w.xyz,cameraPosition);',
      '  gl_Position=projectionMatrix*viewMatrix*w; }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uRelief; uniform sampler2D uMaskL; uniform sampler2D uMaskN; uniform sampler2D uHgt; uniform vec2 uHgtSize;',
      'uniform vec3 uLand, uLit, uShade, uForest, uOut, uWater, uWaterDeep, uContour, uHi, uFog;',
      'uniform float uFocus, uContourA, uHover, uTime, uFogNear, uFogFar, uDark, uHiAny; uniform float uHiv[' + NK + '];',
      'uniform sampler2D uCov; uniform vec3 uTileO; uniform vec2 uEN; uniform float uCovOn;',
      'varying vec2 vUv; varying vec3 vW; varying float vDist;',
      COMMON_FRAG,
      'void main(){',
      '  if(uCovOn > 0.5){',  // unter geladenen Nahkacheln liegt das Grundrelief nicht sichtbar
      '    vec2 en = vec2(vW.x + uEN.x, uEN.y - vW.z);',
      '    vec2 ij = floor(vec2((en.x - uTileO.x)/uTileO.z, (uTileO.y - en.y)/uTileO.z));',
      '    if(ij.x >= 0.0 && ij.x < 64.0 && ij.y >= 0.0 && ij.y < 32.0 && texture2D(uCov, (ij+0.5)/vec2(64.0,32.0)).r > 0.5) discard;',
      '  }',
      '  vec3 ml = texture2D(uMaskL, vUv).rgb;',
      '  float idf = floor(texture2D(uMaskN, vUv).r*255.0/9.0+0.5); int id = int(idf);',
      '  float inside = step(0.5, idf);',
      '  float rel = texture2D(uRelief, vUv).r;',
      '  float water = smoothstep(0.30, 0.70, ml.b);',
      '  float k = 1.0 + (rel/0.69 - 1.0)*1.6;',
      '  vec3 col = k < 1.0 ? mix(uShade, uLand, smoothstep(0.05, 1.0, k)) : mix(uLand, uLit, clamp((k-1.0)*1.6, 0.0, 1.0));',
      '  col = mix(col, col*uForest, ml.g*0.85);',
      '  vec2 uvH = (vUv*(uHgtSize-1.0)+0.5)/uHgtSize; float h = texture2D(uHgt, uvH).r;',
      '  float h100=h/100.0, w100=max(fwidth(h100),1e-5); float l100 = 1.0-clamp(abs(fract(h100-0.5)-0.5)/w100, 0.0, 1.0);',
      '  float h500=h/500.0, w500=max(fwidth(h500),1e-5); float l500 = 1.0-clamp(abs(fract(h500-0.5)-0.5)/(w500*1.3), 0.0, 1.0);',
      '  float cont = max(l100*0.10*(1.0-smoothstep(0.05,0.18,w100)), l500*0.34*(1.0-smoothstep(0.15,0.4,w500)))*(1.0-0.45*uDark);',
      '  col = mix(col, uContour, cont*uContourA*(0.2+0.8*inside)*(1.0-water));',
      '  float hv = 0.0; for(int i=0;i<' + NK + ';i++){ if(i==id) hv=uHiv[i]; }',
      '  float hov = (abs(idf-uHover)<0.5) ? inside : 0.0;',
      '  col = mix(col, uOut, clamp(uHiAny-hv, 0.0, 1.0)*0.42*inside*(1.0-water));',
      '  col = mix(col, uHi, clamp(hv*0.07+hov*0.12, 0.0, 0.3)*(1.0-water)*(0.55+0.45*clamp(k,0.0,1.0)));',
      '  float depth = (1.0-rel)*230.0;',
      '  vec3 wc = mix(uWater, uWaterDeep, smoothstep(0.0, 165.0, depth));',
      '  float n = noise(vW.xz*0.0012+vec2(uTime*0.018, uTime*0.011))*0.6 + noise(vW.xz*0.005-vec2(uTime*0.045))*0.4;',
      '  wc *= 0.95+n*0.1;',
      '  vec3 V = normalize(cameraPosition-vW);',
      '  wc = mix(wc, uLit, pow(1.0-clamp(V.y,0.0,1.0), 3.0)*0.32*(1.0-uDark*0.5));',
      '  col = mix(col, wc, water);',
      '  col = mix(col, uOut, uFocus*(1.0-inside)*0.55);',
      '  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  var sideMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uA: { value: C['--m-side'] }, uB: { value: C['--m-side-2'] }, uFog: U.uFog, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
    vertexShader: 'attribute float aT; varying float vT; varying float vDist; void main(){ vT=aT; vec4 w=modelMatrix*vec4(position,1.0); vDist=distance(w.xyz,cameraPosition); gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform vec3 uA,uB,uFog; uniform float uFogNear,uFogFar; varying float vT; varying float vDist; void main(){ vec3 c=mix(uA,uB,smoothstep(0.0,1.0,vT)); c=mix(c,uFog,smoothstep(uFogNear,uFogFar,vDist)*0.85); gl_FragColor=vec4(c,1.0); }'
  });

  var shadowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uC: { value: C['--ink'] }, uA: { value: 0.16 }, uS: { value: new THREE.Vector2(HALF_W, HALF_H) } },
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uC; uniform float uA; uniform vec2 uS; varying vec2 vP; void main(){ vec2 q=abs(vP)/uS; float d=length(max(q-0.8,0.0))*3.0; float a=(1.0-smoothstep(0.0,1.0,d))*uA; gl_FragColor=vec4(uC,a); }'
  });

  function ribbonMat(colorKey, widthPx, opacity, opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
      uniforms: {
        uColor: { value: C[colorKey] }, uWidth: { value: widthPx }, uOpacity: { value: opacity }, uDraw: { value: 1 },
        uDash: { value: opts.dash ? 1 : 0 }, uFlow: { value: opts.flow ? 1 : 0 },
        uPx: U.uPx, uTime: U.uTime, uFog: U.uFog, uFogNear: U.uFogNear, uFogFar: U.uFogFar
      },
      vertexShader: [
        'attribute vec3 aDir; attribute float aSide; attribute float aAlong; attribute float aM;',
        'uniform float uWidth; uniform float uPx;',
        'varying float vAlong; varying float vSide; varying float vDist; varying float vM; varying float vPxW;',
        'void main(){ vec4 w=modelMatrix*vec4(position,1.0); float dist=distance(w.xyz,cameraPosition);',
        '  float pxw=uPx*dist; float hw=uWidth*pxw*0.5+0.6;',
        '  w.xyz += aDir*aSide*hw; w.y += 6.0 + hw*1.2;',
        '  w.xyz += normalize(cameraPosition - w.xyz)*min(dist*0.012, 350.0);',
        '  vAlong=aAlong; vSide=aSide; vDist=dist; vM=aM; vPxW=pxw;',
        '  gl_Position=projectionMatrix*viewMatrix*w; }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor, uFog; uniform float uOpacity, uDraw, uDash, uFlow, uTime, uFogNear, uFogFar;',
        'varying float vAlong; varying float vSide; varying float vDist; varying float vM; varying float vPxW;',
        'void main(){',
        '  if(vAlong > uDraw) discard;',
        '  float a = 1.0 - smoothstep(0.55, 1.0, abs(vSide));',
        '  if(uDash > 0.5){ float per = vPxW*12.0; a *= step(fract(vM/per), 0.62); }',
        '  vec3 c = uColor;',
        '  if(uFlow > 0.5){ float pulse = smoothstep(0.8, 1.0, fract(vM/(vPxW*140.0) - uTime*0.5)); c = mix(c, vec3(1.0), pulse*0.4); }',
        '  c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vDist)*0.9);',
        '  gl_FragColor = vec4(c, a*uOpacity);',
        '}'
      ].join('\n')
    });
  }

  /* ---------------- Farben: CSS lesen, im Takt nachführen ---------------- */
  var themeFirst = true;
  function readTheme() {
    var cs = getComputedStyle(root);
    Object.keys(CT).forEach(function (k) {
      var v = cs.getPropertyValue(k).trim(); if (!v) return;
      CT[k].set(v);
    });
    U.uDark.value = parseFloat(cs.getPropertyValue('--m-dark')) || 0;
    shadowMat.uniforms.uA.value = U.uDark.value > 0.5 ? 0.35 : 0.15;
    if (themeFirst || reduce || TEST) { Object.keys(CT).forEach(function (k) { C[k].copy(CT[k]); }); themeFirst = false; }
  }
  function stepTheme(kf) {
    Object.keys(CT).forEach(function (k) { C[k].lerp(CT[k], kf); });
    U.uFog.value.copy(C['--paper']);
    shadowMat.uniforms.uC.value = U.uDark.value > 0.5 ? new THREE.Color(0, 0, 0) : C['--ink'];
  }
  readTheme(); stepTheme(1);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  new MutationObserver(readTheme).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-kanton', 'class', 'style'] });

  /* ---------------- Gelände ---------------- */
  function buildTerrain(stride) {
    var cols = Math.floor((nx - 1) / stride) + 1, rows = Math.floor((ny - 1) / stride) + 1;
    var pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
    for (var r = 0; r < rows; r++) {
      var j = Math.min(ny - 1, r * stride), N = G.N1 - j * G.step;
      for (var c = 0; c < cols; c++) {
        var i = Math.min(nx - 1, c * stride), E = G.E0 + i * G.step, k = r * cols + c;
        pos[k * 3] = X(E); pos[k * 3 + 1] = Y(HT[j * nx + i]); pos[k * 3 + 2] = Z(N);
        uv[k * 2] = (E - G.E0) / (G.E1 - G.E0); uv[k * 2 + 1] = (N - G.N0) / (G.N1 - G.N0);
      }
    }
    var idx = new Uint32Array((cols - 1) * (rows - 1) * 6), t = 0;
    for (r = 0; r < rows - 1; r++) for (c = 0; c < cols - 1; c++) {
      var a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx[t++] = a; idx[t++] = d; idx[t++] = b; idx[t++] = b; idx[t++] = d; idx[t++] = e;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    scene.add(new THREE.Mesh(geo, terrainMat));
    // Blockseiten
    var BOT = -3200, sp = [], st = [], si = [], vi = 0;
    function side(list) {
      for (var q = 0; q < list.length; q++) {
        var p = list[q]; sp.push(p[0], p[1], p[2], p[0], BOT, p[2]); st.push(0, 1);
        if (q > 0) { si.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi); }
        vi += 2;
      }
    }
    function edge(fixedRow, fixedCol) {
      var L = [];
      if (fixedRow !== null) for (var i = 0; i < nx; i += stride) L.push([X(G.E0 + i * G.step), Y(HT[fixedRow * nx + i]), Z(G.N1 - fixedRow * G.step)]);
      else for (var j = 0; j < ny; j += stride) L.push([X(G.E0 + fixedCol * G.step), Y(HT[j * nx + fixedCol]), Z(G.N1 - j * G.step)]);
      return L;
    }
    side(edge(0, null)); side(edge(ny - 1, null)); side(edge(null, 0)); side(edge(null, nx - 1));
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('aT', new THREE.Float32BufferAttribute(st, 1));
    sg.setIndex(si);
    scene.add(new THREE.Mesh(sg, sideMat));
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2.6, HALF_H * 2.6), shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(HALF_W * 0.02, BOT - 120, HALF_H * 0.03); shadow.renderOrder = -1;
    scene.add(shadow);
  }

  /* ---------------- Bänder (Grenzen, Flüsse) ---------------- */
  function toLines(arrs) {
    return arrs.map(function (a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push([a[i] + G.E0, a[i + 1] + G.N0]); return o; });
  }
  function buildRibbon(lines, mat, gapBetween) {
    var P = [], DIR = [], SIDE = [], AL = [], AM = [], IDX = [], base = 0, cum = 0, SEG = G.step * 0.5;
    lines.forEach(function (pts, li) {
      if (li > 0 && gapBetween) { var pe = lines[li - 1][lines[li - 1].length - 1]; cum += Math.hypot(pts[0][0] - pe[0], pts[0][1] - pe[1]); }
      var dp = [];
      for (var i = 0; i < pts.length; i++) {
        if (i > 0) {
          var a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / SEG);
          for (var s = 1; s < n; s++) dp.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]);
        }
        dp.push(pts[i]);
      }
      var m = dp.length; if (m < 2) return;
      for (i = 0; i < m; i++) {
        var p = dp[i], pr = dp[Math.max(0, i - 1)], nxp = dp[Math.min(m - 1, i + 1)];
        if (i > 0) cum += Math.hypot(p[0] - pr[0], p[1] - pr[1]);
        var tx = X(nxp[0]) - X(pr[0]), tz = Z(nxp[1]) - Z(pr[1]), tl = Math.hypot(tx, tz) || 1;
        var dx = -tz / tl, dz = tx / tl, y = Y(hAt(p[0], p[1]));
        for (var sd = -1; sd <= 1; sd += 2) { P.push(X(p[0]), y, Z(p[1])); DIR.push(dx, 0, dz); SIDE.push(sd); AM.push(cum); }
        if (i < m - 1) { var q = base + 2 * i; IDX.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      base += 2 * m;
    });
    for (var k = 0; k < AM.length; k++) AL.push(cum > 0 ? AM[k] / cum : 0);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(DIR, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(SIDE, 1));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(AL, 1));
    g.setAttribute('aM', new THREE.Float32BufferAttribute(AM, 1));
    g.setIndex(IDX); g.computeBoundingSphere();
    var mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
    scene.add(mesh); return mesh;
  }
  var R = {}, RING = {};
  function ringFor(code) {
    if (RING[code]) return RING[code];
    var m = buildRibbon(toLines(D.rings[code]), ribbonMat('--m-line', small ? 3 : 3.6, 0), true);
    m.renderOrder = 6; m.userData.o = 0; m.userData.draw = 0;
    return (RING[code] = m);
  }


  /* ---------------- Boden unter einem Punkt: Nahkachel, sonst Grundrelief ---------------- */
  var detail = null;
  function groundAt(E, N) {
    var h = detail ? detail.heightAt(E, N) : null;
    return h == null ? hAt(E, N) : h;
  }

  /* ---------------- Punktebenen (Spielplätze, Bahnhöfe …) ---------------- */
  var POI = null, poiOn = new Array(16).fill(0), POI_FAR = 45000, poiFar = new Array(16).fill(POI_FAR);
  POICAT.forEach(function (c, i) { poiFar[i] = c.far || POI_FAR; });
  var atlas = new THREE.CanvasTexture(ICONS.canvas); atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
  var poiMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uAtlas: { value: atlas }, uOn: { value: poiOn }, uFarC: { value: poiFar }, uPR: { value: 1 }, uHot: { value: -1 } },
    vertexShader: [
      'attribute float aCat; attribute float aId;',
      'uniform float uOn[16]; uniform float uFarC[16]; uniform float uPR; uniform float uHot;',
      'varying float vCat; varying float vA;',
      'void main(){',
      '  vec4 w = modelMatrix*vec4(position,1.0);',
      '  float dist = distance(w.xyz, cameraPosition);',
      '  float on = 0.0, uFar = 1.0; for(int i=0;i<16;i++){ if(abs(float(i)-aCat)<0.5){ on = uOn[i]; uFar = uFarC[i]; } }',
      '  vA = on*(1.0 - smoothstep(uFar*0.6, uFar, dist));',
      '  w.xyz += normalize(cameraPosition - w.xyz)*min(dist*0.02, 400.0);',
      '  w.y += min(dist*0.006, 120.0);',
      '  vCat = aCat;',
      '  gl_Position = projectionMatrix*viewMatrix*w;',
      '  float hot = abs(aId-uHot) < 0.5 ? 1.35 : 1.0;',
      '  gl_PointSize = vA > 0.002 ? uPR*hot*mix(30.0, 18.0, smoothstep(1500.0, uFar, dist)) : 0.0;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uAtlas; varying float vCat; varying float vA;',
      'void main(){',
      '  if(vA < 0.01) discard;',
      '  vec2 cell = vec2(mod(vCat, 4.0), floor(vCat/4.0));',
      '  vec2 uv = vec2((cell.x + gl_PointCoord.x)/4.0, 1.0 - (cell.y + gl_PointCoord.y)/4.0);',
      '  vec4 c = texture2D(uAtlas, uv);',
      '  if(c.a < 0.04) discard;',
      '  gl_FragColor = vec4(c.rgb, c.a*vA);',
      '}'
    ].join('\n')
  });
  function buildPOI() {
    if (POI || !POIS.length) return;
    var pos = new Float32Array(POIS.length * 3), cat = new Float32Array(POIS.length), ids = new Float32Array(POIS.length);
    for (var i = 0; i < POIS.length; i++) {
      var p = POIS[i]; pos[i * 3] = X(p.E); pos[i * 3 + 1] = Y(p.h) + 6; pos[i * 3 + 2] = Z(p.N); cat[i] = p.c; ids[i] = i;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCat', new THREE.BufferAttribute(cat, 1));
    g.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
    var pts = new THREE.Points(g, poiMat); pts.frustumCulled = false; pts.renderOrder = 9;
    scene.add(pts);
    POI = { pts: pts, list: POIS, pos: pos };
  }
  var pv = new THREE.Vector3();
  /* liegt zwischen Punkt und Kamera Gelände? */
  function hidden(x, y, z) {
    var cp = camera.position;
    for (var s = 1; s <= 10; s++) {
      var f = s / 11, px = x + (cp.x - x) * f, py = y + (cp.y - y) * f, pz = z + (cp.z - z) * f, E = px + EC, N = NC - pz;
      if (inGrid(E, N) && Y(groundAt(E, N)) > py + 12) return true;
    }
    return false;
  }
  function poiAt(cx, cy, W, H) {
    if (!POI) return null;
    var best = null, bd = 15 * 15, cp = camera.position;
    for (var i = 0; i < POI.list.length; i++) {
      var it = POI.list[i]; if (poiOn[it.c] < 0.5) continue;
      var x = POI.pos[i * 3], y = POI.pos[i * 3 + 1], z = POI.pos[i * 3 + 2];
      var dx = x - cp.x, dy = y - cp.y, dz = z - cp.z, d2 = dx * dx + dy * dy + dz * dz, fc = poiFar[it.c] * 0.8;
      if (d2 > fc * fc) continue;
      var dist = Math.sqrt(d2), lift = Math.min(dist * 0.02, 400) / (dist || 1);
      pv.set(x - dx * lift, y - dy * lift + Math.min(dist * 0.006, 120), z - dz * lift).project(camera);
      if (pv.z > 1) continue;
      var sx = (pv.x + 1) / 2 * W, sy = (1 - pv.y) / 2 * H;
      var e = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
      if (e < bd && !hidden(x, y, z)) { bd = e; best = { it: it, i: i, sx: sx, sy: sy }; }
    }
    return best;
  }

  /* ---------------- Wanderrouten SchweizMobil ---------------- */
  function routeLines(r) { return r.lines.map(function (a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }); }
  function buildRoutes() {
    if (R.routesNat || R.routesReg || !ROUTES.length) return;
    var nat = [], reg = [];
    ROUTES.forEach(function (r) { var L = routeLines(r); (r.typ === 'national' ? nat : reg).push.apply(r.typ === 'national' ? nat : reg, L); });
    if (reg.length) { R.routesReg = buildRibbon(reg, ribbonMat('--m-route', 1.4, 0)); R.routesReg.renderOrder = 5; }
    if (nat.length) { R.routesNat = buildRibbon(nat, ribbonMat('--m-route', small ? 2.2 : 2.6, 0)); R.routesNat.renderOrder = 5; }
  }
  var ROUTESEL = {}, routeSel = null;
  function routeRibbon(r) {
    if (ROUTESEL[r.id]) return ROUTESEL[r.id];
    var m = buildRibbon(routeLines(r), ribbonMat('--m-route-sel', small ? 4 : 4.6, 0, { flow: true }), true);
    m.renderOrder = 8; m.userData.o = 0; m.userData.draw = 0; m.visible = false;
    return (ROUTESEL[r.id] = m);
  }

  /* ---------------- 3D-Wahrzeichen ---------------- */
  var MODELS = [], ringGeo = new THREE.RingGeometry(0.78, 1, 56);
  function buildModels() {
    if (!window.SFModels || MODELS.length) return;
    Object.keys(MARKS).forEach(function (code) {
      var col = KC[code].color, brand = col.brand, accent = col.flag[1] || col.flag[0];
      if (accent.toUpperCase() === brand.toUpperCase()) accent = col.flag[0] !== brand ? col.flag[0] : '#FFFFFF';
      MARKS[code].forEach(function (m) {
        var type = window.SFModels.markType[code + ':' + m.idx] || 'monument', inst;
        try { inst = window.SFModels.create(type, { brand: brand, accent: accent, seed: m.idx * 7 + code.charCodeAt(0) + code.charCodeAt(1) }); }
        catch (e) { console.warn('Modell', code, m.name, e); return; }
        var holder = new THREE.Group(); holder.add(inst.group);
        var bb = new THREE.Box3().setFromObject(inst.group), size = new THREE.Vector3(); bb.getSize(size);
        var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(brand), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 1.5; ring.renderOrder = 7;
        var foot = Math.max(size.x, size.z) * 0.62 + 12; ring.scale.set(foot, foot, foot);
        holder.add(ring); holder.visible = false; scene.add(holder);
        MODELS.push({ m: m, code: code, holder: holder, inst: inst, ring: ring, foot: foot, h: Math.max(35, bb.max.y, Math.max(size.x, size.z) * 0.6), vis: 0, ph: (m.idx * 1.7 + code.charCodeAt(0)) % 6.28 });
      });
    });
  }
  function updateModels(t, dt, H) {
    if (!MODELS.length) return;
    var kpx = 2 * Math.tan(camera.fov * Math.PI / 360) / H, selCode = selected ? selected.code : null, far = MODE === 'wahrzeichen' || MODE === 'kantone' ? 400000 : 85000, kS = small ? 0.8 : 1;
    for (var i = 0; i < MODELS.length; i++) {
      var o = MODELS[i], m = o.m;
      var gx = X(m.E), gz = Z(m.N), dx = gx - camera.position.x, dz = gz - camera.position.z;
      var hd = Math.sqrt(dx * dx + dz * dz);
      var hot = !!(HOT && HOT.id === m.id);
      var mine = selCode === o.code, want = LAYERS.marks && ready && !touring && (hot || (mine ? hd < far : hd < (selCode ? 30000 : 85000))) ? 1 : 0;
      o.vis = lerp(o.vis, want, TEST ? 1 : 1 - Math.exp(-dt * 4));
      if (o.vis < 0.01) { if (o.holder.visible) o.holder.visible = false; continue; }
      var gy = Y(groundAt(m.E, m.N));
      o.holder.position.set(gx, gy, gz);
      var dist = camera.position.distanceTo(o.holder.position);
      var px = (hot ? 130 : mine ? 100 : selCode ? 70 : 88) * kS;
      var sc = Math.max(1.6, px * kpx * dist / o.h) * (0.3 + 0.7 * o.vis);
      o.holder.scale.set(sc, sc, sc);
      o.holder.visible = true;
      var pulse = reduce ? 0.35 : (t * 0.45 + o.ph / 6.28) % 1;
      o.ring.scale.setScalar(o.foot * (0.85 + pulse * 0.6));
      o.ring.material.opacity = (1 - pulse) * 0.55 * o.vis;
      try { if (!reduce || !o.posed) { o.inst.update(reduce ? 0 : t, reduce ? 0 : dt); o.posed = true; } } catch (e) {}
    }
  }

  /* ---------------- Beschriftungen ---------------- */
  var labelsEl = $('#labels'), LBL = [], LBL_ORDER = [], PRIO = { canton: 0, poi: 1, lake: 2, peak: 3 };
  function addLabel(text, kind, E, N, extra) {
    var el = document.createElement('div');
    el.className = 'lbl ' + kind;
    if (kind === 'peak') el.innerHTML = '<span>' + esc(text) + '</span><em>' + esc(extra.elev) + '</em>';
    else el.textContent = text;
    labelsEl.appendChild(el);
    var lift = kind === 'peak' ? 60 : kind === 'poi' ? 50 : 80;
    var L = { el: el, kind: kind, name: text, E: E, N: N, p: new THREE.Vector3(X(E), Y(hAt(E, N)) + lift, Z(N)), o: 0, occ: false, n: LBL.length, w: 0, hit: false };
    if (extra) Object.keys(extra).forEach(function (k) { L[k] = extra[k]; });
    el.__L = L;
    LBL.push(L); return L;
  }
  labelsEl.addEventListener('click', function (e) {
    var el = e.target.closest('.lbl.hit'); if (!el || !el.__L || !el.__L.mark) return;
    go('wahrzeichen', el.__L.mark.id);
  });

  /* ---------------- Kamera ---------------- */
  var DEG = Math.PI / 180;
  var HOMEV = { E: 2662000, N: 1176000, d: 470000, hd: -8, p: 36 };
  var OVERVIEW = { E: 2662000, N: 1184000, d: 420000, hd: 0, p: 50 };
  var KEYS = {
    schweiz:    { E: 2660000, N: 1184000, d: 440000, hd: 0, p: 58 },
    lemanique:  { E: 2578000, N: 1118000, d: 230000, hd: -10, p: 50 },
    mittelland: { E: 2592000, N: 1196000, d: 210000, hd: 8, p: 48 },
    nordwest:   { E: 2636000, N: 1255000, d: 100000, hd: 18, p: 46 },
    zuerich:    { E: 2692000, N: 1256000, d: 76000, hd: -12, p: 48 },
    zentral:    { E: 2678000, N: 1200000, d: 112000, hd: -28, p: 42 },
    ost:        { E: 2747000, N: 1215000, d: 210000, hd: 10, p: 48 },
    tessin:     { E: 2712000, N: 1112000, d: 115000, hd: 168, p: 38 }
  };
  var ex = { E: HOMEV.E, N: HOMEV.N, d: HOMEV.d, hd: HOMEV.hd, p: HOMEV.p }, cam = null, flight = null, lastInteract = 0;
  var topBar = document.querySelector('.top'), homeEl = $('#home');
  /* freie Fläche neben Panel, Startansicht oder Rundflug-Karte; offset* statt getBoundingClientRect, damit laufende Übergänge nicht stören */
  function freeArea(W, H) {
    var top = topBar.offsetHeight, x0 = 0, y0 = top, x1 = W, y1 = H, narrow = narrowMQ.matches;
    if (narrow) y1 = H - (parseFloat(getComputedStyle(root).getPropertyValue('--tabbar')) || 0);
    if (body.classList.contains('flying')) return { x0: 0, y0: narrow ? top : 0, x1: W, y1: y1 };
    if (touring) { if (narrow) y1 = capEl.offsetTop; else x0 = Math.min(W * 0.3, (capEl.offsetLeft + capEl.offsetWidth) * 0.6); }
    else if (MODE === 'home') y1 = Math.max(top + 120, homeEl.offsetTop + (homeEl.querySelector('.fade').offsetHeight || 0) * 0.6);
    else if (narrow) y1 = Math.max(top + 100, panel.offsetTop);
    else x0 = panel.offsetLeft + panel.offsetWidth;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function viewOffsets(W, H) { var a = freeArea(W, H); return { ox: ((a.x0 + a.x1) / 2 - W / 2) / W, oy: ((a.y0 + a.y1) / 2 - H / 2) / H }; }
  function fitFactor() {
    var W = window.innerWidth, H = window.innerHeight, a = freeArea(W, H), w = Math.max(1, a.x1 - a.x0), h = Math.max(1, a.y1 - a.y0), asp = w / h;
    var f = asp < 1.3 ? clamp(1.3 / asp, 1, 2.6) : 1;
    return f * clamp(Math.sqrt(H / h), 1, 1.45);
  }
  function fit(c) { var f = fitFactor(); return { E: c.E, N: c.N, d: c.d * (c.d < 4000 ? Math.min(f, 1.4) : f), hd: c.hd, p: c.p }; }
  /* Abstand, bei dem ein Rechteck (Breite w, Tiefe h in m) in die freie Fläche passt; Perspektive über den Zuschlag m */
  function fitBox(bb, hd, p, m, dmin) {
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight, a = freeArea(W, H), fw = Math.max(80, a.x1 - a.x0), fh = Math.max(80, a.y1 - a.y0);
    var w = bb[2] - bb[0], h = bb[3] - bb[1], th = hd * DEG, ew = Math.abs(w * Math.cos(th)) + Math.abs(h * Math.sin(th)), eh = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th));
    var k = H / (2 * Math.tan(camera.fov * DEG / 2));
    var d = Math.max(ew * k / fw, eh * Math.sin(p * DEG) * k / fh) * (m || 1.12);
    return { E: (bb[0] + bb[2]) / 2, N: (bb[1] + bb[3]) / 2, d: Math.max(d, dmin || 0), hd: hd, p: p };
  }
  function unionBB(codes) {
    var b = [1e9, 1e9, -1e9, -1e9];
    codes.forEach(function (c) { var q = BYCODE[c].bb; b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); });
    return b;
  }
  var CHBB = unionBB(KT.ORDER);
  function clampEx() { ex.E = clamp(ex.E, G.E0 + 1000, G.E1 - 1000); ex.N = clamp(ex.N, G.N0 + 1000, G.N1 - 1000); ex.d = clamp(ex.d, 250, 2400000); ex.p = clamp(ex.p, 8, 88); }
  function angLerp(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }
  function normHd(h) { return ((h % 360) + 540) % 360 - 180; }
  function flyTo(to) {
    if (to.hd == null) to.hd = ex.hd; if (to.p == null) to.p = ex.p;
    if (!cam) { ex.E = to.E; ex.N = to.N; ex.d = to.d; ex.hd = to.hd; ex.p = to.p; clampEx(); flight = null; return; }
    var from = { E: ex.E, N: ex.N, d: ex.d, hd: ex.hd, p: ex.p };
    var dist = Math.hypot(to.E - from.E, to.N - from.N);
    flight = { from: from, to: to, t0: performance.now(), dur: reduce || TEST ? 1 : clamp(900 + dist * 0.012 + Math.abs(Math.log(to.d / from.d)) * 300, 900, 2800),
      hop: clamp(dist / Math.min(from.d, to.d) * 0.3, 0, 1.4) };
  }
  function stepFlight(now) {
    if (!flight) return;
    var u = clamp((now - flight.t0) / flight.dur, 0, 1), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    var f = flight.from, t = flight.to, hop = flight.hop * Math.sin(Math.PI * e);
    ex.E = lerp(f.E, t.E, e); ex.N = lerp(f.N, t.N, e);
    ex.d = Math.exp(lerp(Math.log(f.d), Math.log(t.d), e)) * (1 + hop);
    ex.hd = angLerp(f.hd, t.hd, e); ex.p = lerp(f.p, t.p, e);
    if (u >= 1) flight = null;
  }
  function keepHd(h) { var n = normHd(ex.hd); return Math.abs(n) > 100 ? h : ex.hd; }
  function cantonView(c) { return fitBox(c.bb, keepHd(0), 48, 1.2, 22000); }
  function routeView(r) { return fitBox(r.bb, keepHd(0), 50, 1.18, 16000); }
  function placeCamera(c, W, H) {
    var th = c.hd * DEG, ph = c.p * DEG, cp = Math.cos(ph), sp = Math.sin(ph);
    var h = groundAt(c.E, c.N), tx = X(c.E), ty = Y(h), tz = Z(c.N);
    var px = tx - Math.sin(th) * cp * c.d, py = ty + sp * c.d, pz = tz + Math.cos(th) * cp * c.d;
    var gE = px + EC, gN = NC - pz, ground = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : -1000, minA = Math.min(300, 40 + c.d * 0.08);
    if (py < ground + minA) py = ground + minA;
    camera.position.set(px, py, pz);
    camera.lookAt(tx, ty, tz);
    camera.near = clamp(c.d * 0.012, 2, 6000); camera.far = c.d * 5 + 200000;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, -c.ox * W, -c.oy * H, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    U.uFogNear.value = c.d * 1.1; U.uFogFar.value = c.d * 3.6;
  }

  /* ---------------- Treffer am Boden ---------------- */
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ids = null, IDW = D.tex[0], IDH = D.tex[1], PXM = (G.E1 - G.E0) / IDW;
  function idAt(E, N) {
    if (!ids || !inGrid(E, N)) return 0;
    var c = Math.min(IDW - 1, Math.floor((E - G.E0) / PXM)), r = Math.min(IDH - 1, Math.floor((G.N1 - N) / PXM));
    return Math.round(ids[(r * IDW + c) * 4] / 9);
  }
  function setRay(cx, cy) { ndc.set(cx / window.innerWidth * 2 - 1, -(cy / (canvas.clientHeight || window.innerHeight)) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(cx, cy) {
    if (!cam) return null;
    setRay(cx, cy);
    var o = ray.ray.origin, d = ray.ray.direction, t = camera.near, prev = t, step = Math.max(12, (cam.d || 5000) / 320);
    for (var s = 0; s < 1800; s++) {
      var x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, E = x + EC, N = NC - z;
      if (inGrid(E, N) && y <= Y(hAt(E, N))) {
        var lo = prev, hi = t;
        for (var k = 0; k < 14; k++) { var m = (lo + hi) / 2, xm = o.x + d.x * m, ym = o.y + d.y * m, zm = o.z + d.z * m, Em = xm + EC, Nm = NC - zm;
          if (inGrid(Em, Nm) && ym <= Y(hAt(Em, Nm))) hi = m; else lo = m; }
        x = o.x + d.x * hi; z = o.z + d.z * hi; E = x + EC; N = NC - z;
        return { E: E, N: N, h: hAt(E, N) };
      }
      if (y < -4000) return null;
      prev = t; t += step;
    }
    return null;
  }
  function planeAt(cx, cy, h) {
    setRay(cx, cy);
    var o = ray.ray.origin, d = ray.ray.direction, yp = Y(h);
    if (Math.abs(d.y) < 1e-6) return null;
    var t = (yp - o.y) / d.y; if (t <= 0) return null;
    return { E: o.x + d.x * t + EC, N: NC - (o.z + d.z * t), h: h };
  }
  /* 3D-Wahrzeichen unter dem Zeiger: Abstand zur Strecke Fuss–Spitze im Bild */
  var mv0 = new THREE.Vector3(), mv1 = new THREE.Vector3();
  function modelAt(cx, cy, W, H) {
    var best = null, bd = 26 * 26;
    for (var i = 0; i < MODELS.length; i++) {
      var o = MODELS[i]; if (!o.holder.visible || o.vis < 0.5) continue;
      mv0.copy(o.holder.position).project(camera); if (mv0.z > 1) continue;
      mv1.copy(o.holder.position); mv1.y += o.h * o.holder.scale.y * 0.9; mv1.project(camera);
      var ax = (mv0.x + 1) / 2 * W, ay = (1 - mv0.y) / 2 * H, bx = (mv1.x + 1) / 2 * W, by = (1 - mv1.y) / 2 * H;
      var vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = clamp(((cx - ax) * vx + (cy - ay) * vy) / l2, 0, 1);
      var qx = ax + vx * t - cx, qy = ay + vy * t - cy, e = qx * qx + qy * qy;
      if (e < bd) { bd = e; best = o; }
    }
    return best;
  }

  /* ---------------- Bedienung der Karte: ziehen verschiebt, rechte Taste oder zwei Finger drehen, Rad oder zwei Finger zoomen ---------------- */
  var tip = $('#tip'), tipT = $('#tipT'), tipA = $('#tipA'), tipB = $('#tipB'), hoverId = 0, tapTip = 0;
  var ptr = { cx: -1, cy: -1, moved: false, over: false }, PTS = {}, drag = { mode: null, g: null, lx: 0, ly: 0, sx: 0, sy: 0, t0: 0, moved: 0 };
  function nPts() { return Object.keys(PTS).length; }
  function syncCamNow() { if (!cam) return; cam.E = ex.E; cam.N = ex.N; cam.d = ex.d; cam.hd = ex.hd; cam.p = ex.p; placeCamera(cam, window.innerWidth, canvas.clientHeight || window.innerHeight); }
  function panTo(cx, cy) {
    if (!drag.g) return;
    var p = planeAt(cx, cy, drag.g.h); if (!p) return;
    ex.E += drag.g.E - p.E; ex.N += drag.g.N - p.N; clampEx(); syncCamNow();
  }
  function pinchState() {
    var k = Object.keys(PTS), a = PTS[k[0]], b = PTS[k[1]];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  function beginPan(x, y) { drag.mode = 'pan'; drag.g = pick(x, y) || planeAt(x, y, groundAt(ex.E, ex.N)); }
  function interrupt() { lastInteract = performance.now(); if (touring) stopTour(true); flight = null; }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    if (!cam || pendingFly) { e.preventDefault(); return; }
    if (fly) { flyDown(e); return; }
    interrupt();
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    PTS[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = nPts();
    drag.lx = e.clientX; drag.ly = e.clientY;
    if (n === 1) {
      drag.sx = e.clientX; drag.sy = e.clientY; drag.t0 = performance.now(); drag.moved = 0;
      if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) drag.mode = 'rot';
      else if (e.pointerType !== 'mouse' || e.button === 0) beginPan(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') body.style.cursor = drag.mode === 'rot' ? 'move' : 'grabbing';
    } else if (n === 2) {
      drag.mode = 'pinch'; drag.moved = 99; drag.p0 = pinchState(); drag.d0 = ex.d; drag.hd0 = ex.hd; drag.pp0 = ex.p;
    }
    tip.classList.remove('on');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.moved = true; ptr.over = e.pointerType === 'mouse';
    if (fly) { flyMove(e); return; }
    if (!PTS[e.pointerId]) return;
    PTS[e.pointerId] = { x: e.clientX, y: e.clientY };
    lastInteract = performance.now();
    var dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
    if (drag.mode === 'pan' && nPts() === 1) panTo(e.clientX, e.clientY);
    else if (drag.mode === 'rot') { ex.hd -= dx * 0.25; ex.p = clamp(ex.p + dy * 0.2, 8, 88); }
    else if (drag.mode === 'pinch' && nPts() >= 2) {
      var s = pinchState();
      ex.d = clamp(drag.d0 * drag.p0.dist / Math.max(20, s.dist), 250, 2400000);
      ex.hd = drag.hd0 - (s.ang - drag.p0.ang) / DEG;
      ex.p = clamp(drag.pp0 + (s.my - drag.p0.my) * 0.2, 8, 88);
      clampEx(); syncCamNow();
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  function endPointer(e) {
    if (fly) { flyUp(e); return; }
    if (!PTS[e.pointerId]) return;
    delete PTS[e.pointerId];
    var n = nPts();
    if (n === 1 && drag.mode === 'pinch') { var k = Object.keys(PTS)[0]; drag.lx = PTS[k].x; drag.ly = PTS[k].y; beginPan(PTS[k].x, PTS[k].y); drag.moved = 99; return; }
    if (n > 0) return;
    var wasClick = drag.moved < 6 && performance.now() - drag.t0 < 500 && e.type === 'pointerup';
    drag.mode = null; drag.g = null; body.style.cursor = '';
    if (wasClick) mapClick(e.clientX, e.clientY, e.pointerType);
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', function () { ptr.over = false; ptr.moved = true; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (fly) { flyMul = clamp(flyMul * Math.exp(-clamp(dy, -240, 240) * 0.0016), 0.08, 25); return; }
    if (pendingFly) return;
    interrupt();
    if (e.ctrlKey) dy *= 3;
    zoomAt(e.clientX, e.clientY, Math.exp(clamp(dy, -240, 240) * 0.0016));
  }, { passive: false });
  function zoomAt(x, y, f) {
    var nd = clamp(ex.d * f, 250, 2400000), g = x != null ? pick(x, y) : null;
    if (g) { var k = 1 - nd / ex.d; ex.E += (g.E - ex.E) * k; ex.N += (g.N - ex.N) * k; }
    ex.d = nd; clampEx();
  }
  canvas.addEventListener('keydown', function (e) {
    if (fly || pendingFly) return;
    var k = e.key, step = ex.d * 0.12, th = ex.hd * DEG, fE = Math.sin(th), fN = Math.cos(th), rE = Math.cos(th), rN = -Math.sin(th), used = true;
    if (k === 'ArrowUp') { ex.E += fE * step; ex.N += fN * step; }
    else if (k === 'ArrowDown') { ex.E -= fE * step; ex.N -= fN * step; }
    else if (k === 'ArrowLeft') { ex.E -= rE * step; ex.N -= rN * step; }
    else if (k === 'ArrowRight') { ex.E += rE * step; ex.N += rN * step; }
    else if (k === '+' || k === '=') zoomAt(null, null, 0.7);
    else if (k === '-' || k === '_') zoomAt(null, null, 1.4);
    else if (k === 'q' || k === 'Q') ex.hd -= 10;
    else if (k === 'e' || k === 'E') ex.hd += 10;
    else if (k === 'PageUp') ex.p = clamp(ex.p + 6, 8, 88);
    else if (k === 'PageDown') ex.p = clamp(ex.p - 6, 8, 88);
    else used = false;
    if (used) { e.preventDefault(); interrupt(); clampEx(); }
  });
  function mapClick(x, y, type) {
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    var ph = poiAt(x, y, W, H);
    if (ph) { go('familien', String(ph.i)); return; }
    var mo = modelAt(x, y, W, H);
    if (mo) { go('wahrzeichen', mo.m.id); return; }
    var g = pick(x, y), id = g ? idAt(g.E, g.N) : 0;
    if (!id) return;
    var code = BYID[id].code;
    if (MODE === 'home' || MODE === 'kantone') { go('kantone', code.toLowerCase()); return; }
    if (SEL && SEL.kind === 'route') return;
    if (selected && selected.code === code) { if (SEL) go(MODE, null); return; }
    setCanton(code, { noHash: true, noFly: true, noRender: true });
    go(MODE, null);
  }

  /* ---------------- Freier Flug wie im Spiel: WASD und Maus, auf dem Handy Joystick ---------------- */
  var fly = null, pendingFly = false, keys = {}, flyMul = 1, joy = { x: 0, y: 0, id: null, sx: 0, sy: 0 }, lookT = { id: null, lx: 0, ly: 0 }, mlook = null;
  var joyEl = $('#joy'), joyKnob = $('#joyKnob'), flyKeysEl = $('#flyKeys');
  flyKeysEl.innerHTML = fine
    ? '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> fliegen · Klick fängt die Maus · <kbd>E</kbd>/<kbd>Q</kbd> steigen, sinken · <kbd>⇧</kbd> schnell · Rad Tempo · <kbd>Esc</kbd> Maus frei'
    : 'Links ziehen: fliegen · rechts ziehen: umschauen · ▲▼ steigen, sinken';
  function startFly(it) {
    if (!cam || fly) return;
    if (touring) stopTour(true);
    showLegend(false);
    body.classList.add('flying'); $('#tFly').setAttribute('aria-pressed', 'true');
    tip.classList.remove('on');
    var t = null;
    if (it && it.kind === 'kanton') { var v = cantonView(it.c); t = { E: v.E, N: v.N, d: clamp(v.d * 0.35, 9000, 40000), p: 14 }; }
    else if (it && it.E) t = { E: it.E, N: it.N, d: it.kind === 'route' ? 12000 : 4500, p: 14 };
    else if (cam.d > 30000 || ex.p > 40) t = { E: ex.E, N: ex.N, d: clamp(ex.d * 0.4, 6000, 26000), p: 14 };
    pendingFly = true;
    if (t) { t.hd = ex.hd; flyTo(t); }
  }
  function enterFly() {
    pendingFly = false;
    if (!body.classList.contains('flying')) return;
    camera.updateMatrixWorld(true);
    fly = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: -cam.hd * DEG, pitch: -cam.p * DEG, v: new THREE.Vector3() };
    // erster Blick leicht unter den Horizont statt steil nach unten
    fly.pitch = clamp(fly.pitch, -0.6, 0.2);
    keys = {}; flyMul = 1;
  }
  function stopFly() {
    if (!body.classList.contains('flying')) return;
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
    if (fly && cam) {
      var o = flyToOrbit();
      ex.E = cam.E = o.E; ex.N = cam.N = o.N; ex.d = cam.d = o.d; ex.hd = cam.hd = o.hd; ex.p = cam.p = o.p; clampEx();
    }
    fly = null; pendingFly = false; flight = null; keys = {}; mlook = null; joy.id = null; lookT.id = null; joyEl.hidden = true;
    body.classList.remove('flying'); $('#tFly').setAttribute('aria-pressed', 'false');
    LBL.forEach(function (L) { L.bw = 0; });
  }
  function flyToOrbit() {
    var cp = camera.position, pt = Math.max(-fly.pitch, 12 * DEG), c = Math.cos(pt);
    var dx = -Math.sin(fly.yaw) * c, dy = -Math.sin(pt), dz = -Math.cos(fly.yaw) * c, t = 0, step = Math.max(20, (cp.y - Y(groundAt(cp.x + EC, NC - cp.z))) / 40), hitT = -1;
    for (var s = 0; s < 4000 && t < 600000; s++) {
      t += step;
      var E = cp.x + dx * t + EC, N = NC - (cp.z + dz * t);
      if (cp.y + dy * t <= Y(inGrid(E, N) ? groundAt(E, N) : 400)) { hitT = t; break; }
    }
    if (hitT < 0) hitT = Math.max(800, (cp.y - Y(400)) / Math.sin(pt));
    var tE = cp.x + dx * hitT + EC, tN = NC - (cp.z + dz * hitT);
    var d = Math.hypot(cp.x - X(tE), cp.y - Y(groundAt(tE, tN)), cp.z - Z(tN));
    return { E: tE, N: tN, d: clamp(d, 300, 2400000), hd: -fly.yaw / DEG, p: clamp(pt / DEG, 8, 88) };
  }
  function flyDown(e) {
    if (e.pointerType === 'mouse') {
      if (fine && canvas.requestPointerLock && !document.pointerLockElement && e.button === 0) { try { var pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(function () {}); } catch (er) {} }
      mlook = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault(); return;
    }
    if (e.clientX < window.innerWidth * 0.45 && joy.id === null) {
      joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = joy.y = 0;
      joyEl.hidden = false; joyEl.style.transform = 'translate(' + (e.clientX - 60) + 'px,' + (e.clientY - 60) + 'px)'; joyKnob.style.transform = '';
    } else if (lookT.id === null) { lookT.id = e.pointerId; lookT.lx = e.clientX; lookT.ly = e.clientY; }
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
  }
  function flyMove(e) {
    if (!fly) return;
    if (e.pointerType === 'mouse') {
      if (document.pointerLockElement === canvas) { fly.yaw -= e.movementX * 0.0022; fly.pitch = clamp(fly.pitch - e.movementY * 0.0022, -1.5, 1.5); return; }
      if (!mlook || mlook.id !== e.pointerId) return;
      fly.yaw -= (e.clientX - mlook.lx) * 0.004; fly.pitch = clamp(fly.pitch - (e.clientY - mlook.ly) * 0.004, -1.5, 1.5);
      mlook.lx = e.clientX; mlook.ly = e.clientY; return;
    }
    if (e.pointerId === joy.id) {
      var jx = clamp((e.clientX - joy.sx) / 50, -1, 1), jy = clamp((e.clientY - joy.sy) / 50, -1, 1);
      joy.x = jx; joy.y = -jy; joyKnob.style.transform = 'translate(' + (jx * 34) + 'px,' + (jy * 34) + 'px)';
    } else if (e.pointerId === lookT.id) {
      fly.yaw -= (e.clientX - lookT.lx) * 0.005; fly.pitch = clamp(fly.pitch - (e.clientY - lookT.ly) * 0.005, -1.5, 1.5);
      lookT.lx = e.clientX; lookT.ly = e.clientY;
    }
  }
  function flyUp(e) {
    if (mlook && mlook.id === e.pointerId) mlook = null;
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.hidden = true; }
    if (e.pointerId === lookT.id) lookT.id = null;
  }
  function inField(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  window.addEventListener('keydown', function (e) {
    if (!fly || inField(e)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) { keys = {}; return; }
    var onCtl = e.target && e.target.closest && e.target.closest('button, a, select, input');
    if (onCtl && (e.code === 'Space' || e.code === 'Enter')) return;
    keys[e.code] = true;
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  ['flyUp', 'flyDown'].forEach(function (k) {
    var b = document.getElementById(k);
    b.addEventListener('pointerdown', function (e) { keys[k] = true; e.preventDefault(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { keys[k] = false; }); });
  });
  function stepFly(dt) {
    var cp = Math.cos(fly.pitch), fwd = new THREE.Vector3(-Math.sin(fly.yaw) * cp, Math.sin(fly.pitch), -Math.cos(fly.yaw) * cp);
    var right = new THREE.Vector3(Math.cos(fly.yaw), 0, -Math.sin(fly.yaw));
    var gE = fly.x + EC, gN = NC - fly.z, gY = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : Y(400), alt = Math.max(1, fly.y - gY);
    var sprint = keys.ShiftLeft || keys.ShiftRight ? 4 : 1;
    var speed = clamp(alt * 0.9, 25, 7000) * flyMul * sprint;
    var fIn = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
    var rIn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
    var uIn = (keys.KeyE || keys.Space || keys.flyUp ? 1 : 0) - (keys.KeyQ || keys.KeyC || keys.flyDown ? 1 : 0);
    var tgt = fwd.multiplyScalar(fIn).add(right.multiplyScalar(rIn)).add(new THREE.Vector3(0, uIn, 0));
    if (tgt.lengthSq() > 1) tgt.normalize();
    tgt.multiplyScalar(speed);
    fly.v.lerp(tgt, 1 - Math.exp(-dt * 5));
    fly.x += fly.v.x * dt; fly.y += fly.v.y * dt; fly.z += fly.v.z * dt;
    fly.x = clamp(fly.x, X(G.E0 - 20000), X(G.E1 + 20000)); fly.z = clamp(fly.z, Z(G.N1 + 20000), Z(G.N0 - 20000));
    gE = fly.x + EC; gN = NC - fly.z; gY = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : Y(400);
    fly.y = clamp(fly.y, gY + (small ? 70 : 36), Y(60000));
  }
  function placeFly(W, H) {
    camera.clearViewOffset();
    camera.position.set(fly.x, fly.y, fly.z);
    camera.rotation.set(fly.pitch, fly.yaw, 0, 'YXZ');
    var gE = fly.x + EC, gN = NC - fly.z, gY = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : 0, alt = Math.max(1, fly.y - gY);
    camera.near = clamp(alt * 0.02, 1.5, 400); camera.far = 1200000;
    camera.aspect = W / H; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    U.uFogNear.value = Math.max(22000, alt * 14); U.uFogFar.value = U.uFogNear.value * 4.5;
    var ahead = Math.min(alt * 2 + 2500, 25000);
    cam.E = gE - Math.sin(fly.yaw) * ahead; cam.N = gN + Math.cos(fly.yaw) * ahead; cam.d = alt * 1.4 + 1500;
    cam.hd = -fly.yaw / DEG; cam.p = -fly.pitch / DEG;
    ex.E = cam.E; ex.N = cam.N; ex.d = cam.d; ex.hd = cam.hd;
    return alt;
  }
  document.addEventListener('pointerlockchange', function () { if (!document.pointerLockElement) mlook = null; });

  /* ---------------- Tooltip ---------------- */
  function placeTip(x, y) {
    var W = window.innerWidth, tx = x + 18, ty = y + 18;
    if (tx > W - 300) tx = x - 300; if (ty > window.innerHeight - 100) ty = y - 100;
    tip.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; tip.classList.add('on');
  }
  function showPoiTip(hit) {
    var c = POICAT[hit.it.c];
    tipT.innerHTML = '<img src="' + ICONS.url[c.k] + '" alt="">' + esc(poiTitle(hit.it));
    tipA.textContent = hit.it.name ? c.one + (hit.it.code ? ' · ' + KC[hit.it.code].name : '') : 'ohne Namen in den Daten';
    tipB.textContent = swiss(hit.it.h) + ' m ü. M. · Klick für Details';
  }

  /* ---------------- Schnittstelle für die Oberfläche ---------------- */
  MAP.ready = true;
  MAP.flyHome = function () { var n = narrowMQ.matches; flyTo(fitBox(CHBB, HOMEV.hd, n ? 50 : HOMEV.p, n ? 0.98 : 1.04)); };
  MAP.flyOverview = function () { flyTo(fitBox(CHBB, keepHd(OVERVIEW.hd), OVERVIEW.p, 1.06)); };
  MAP.flyCanton = function (c, home) { var v = cantonView(c); if (home) { v.d *= 1.15; v.p = 46; } flyTo(v); };
  MAP.flyMark = function (m, close) { flyTo(fit({ E: m.E, N: m.N, d: close ? 2600 : 9000, hd: ex.hd, p: close ? 34 : 42 })); };
  MAP.flyPOI = function (p, close) { flyTo(fit({ E: p.E, N: p.N, d: close ? 1300 : 4200, hd: ex.hd, p: close ? 40 : 46 })); };
  MAP.flyRoute = function (r) { flyTo(routeView(r)); };
  MAP.flyKey = function (k) { var c = KEYS[k]; if (c) flyTo(fitBox(k === 'schweiz' ? CHBB : unionBB(KT.REGIONS[k]), c.hd, c.p, 1.1)); };
  MAP.setRoute = function (r) { routeSel = r ? routeRibbon(r) : null; if (routeSel) routeSel.userData.draw = 0; };
  MAP.setHotPOI = function (i) { hotPOI = i; poiMat.uniforms.uHot.value = i; };
  MAP.center = function () { return cam ? { E: ex.E, N: ex.N, d: ex.d } : null; };
  MAP.onPOI = function () { if (ready) buildPOI(); };
  MAP.onRoutes = function () { if (ready) buildRoutes(); };
  MAP.startFly = startFly; MAP.stopFly = stopFly;
  MAP.flying = function () { return body.classList.contains('flying'); };
  MAP.zoom = function (f) { interrupt(); flyTo({ E: ex.E, N: ex.N, d: clamp(ex.d * f, 250, 2400000), hd: ex.hd, p: ex.p }); };
  MAP.north = function () { interrupt(); flyTo({ E: ex.E, N: ex.N, d: ex.d, hd: 0, p: ex.p }); };
  MAP.heightAt = function (E, N) { return ready ? groundAt(E, N) : null; };
  layerHooks.push(function (k, v) { if (detail && (k === 'sat' || k === 'trails')) detail.set(k, v); });
  $('#pfootL').textContent = 'swisstopo · SchweizMobil · BAV · OSM';

  /* ---------------- Bildschleife ---------------- */
  var HUDtick = 0, tReady = 0, last = performance.now(), north = $('#north'), attribEl = $('#attrib'), ready = false, hotPOI = -1;
  var hiCur = new Array(NK).fill(0), cur = { focus: 0.6, cont: 0.45, cant: 0.6 };
  var tmpV = new THREE.Vector3(), LV = { borders: 1, water: 1, trails: 1 }, frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  var prCap = small ? 1.5 : 2, frameTimes = [], prLowered = false;
  function applyPR(W, H) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap, Math.sqrt(3.4e6 / (W * H)))); }
  function resize() {
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    applyPR(W, H);
    renderer.setSize(W, H, false);
    LBL.forEach(function (L) { L.bw = 0; });
  }
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  function frame(now) {
    var rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (!TEST && !prLowered && ready && rawDt > 0 && rawDt < 0.5) { frameTimes.push(rawDt); if (frameTimes.length > 90) { frameTimes.shift(); var avg = frameTimes.reduce(function (a, b) { return a + b; }, 0) / frameTimes.length; if (avg > 0.034) { prLowered = true; prCap = Math.max(1, prCap * 0.7); resize(); } } }
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    if (!reduce) U.uTime.value = now / 1000;
    stepFlight(now); stepTour(now);
    if (MODE === 'home' && !touring && !fly && !pendingFly && !drag.mode && !flight && now - lastInteract > 2500 && !reduce && !TEST) ex.hd += dt * 1.6;
    var off = viewOffsets(W, H);
    if (!cam) {
      cam = { E: ex.E, N: ex.N, d: ex.d, hd: ex.hd, p: ex.p, ox: off.ox, oy: off.oy };
      if (!reduce && !TEST) { cam.d *= 1.4; cam.hd -= 26; cam.p += 12; }
    }
    var cdt = Math.min(0.25, Math.max(0, rawDt)), kf = (TEST || drag.mode) ? 1 : 1 - Math.exp(-cdt * (flight ? 14 : 6)), ko = TEST ? 1 : 1 - Math.exp(-cdt * 6);
    stepTheme(TEST ? 1 : 1 - Math.exp(-dt * 4));
    var alt;
    if (fly) { stepFly(dt); alt = placeFly(W, H) / VZ; }
    else {
      cam.E = lerp(cam.E, ex.E, kf); cam.N = lerp(cam.N, ex.N, kf);
      cam.d = Math.exp(lerp(Math.log(cam.d), Math.log(ex.d), kf));
      cam.hd = angLerp(cam.hd, ex.hd, kf); cam.p = lerp(cam.p, ex.p, kf); cam.ox = lerp(cam.ox, off.ox, ko); cam.oy = lerp(cam.oy, off.oy, ko);
      placeCamera(cam, W, H);
      alt = camera.position.y / VZ + H0 - groundAt(camera.position.x + EC, NC - camera.position.z);
      // Übergabe an den freien Flug erst, wenn die Kamera am Ziel des Anflugs steht
      if (pendingFly && !flight && Math.abs(Math.log(cam.d / ex.d)) < 0.02 && Math.abs(cam.p - ex.p) < 0.6 && Math.hypot(cam.E - ex.E, cam.N - ex.N) < ex.d * 0.01) enterFly();
    }
    // Himmel: im Flug immer, sonst nur nah und flach geneigt
    var skyW = fly ? 1 : sstep(70000, 25000, cam.d) * sstep(58, 30, cam.p);
    var skyA = lerp(skyMat.uniforms.uA.value, skyW, TEST ? 1 : 1 - Math.exp(-dt * 3));
    skyMat.uniforms.uA.value = skyA; sky.visible = skyA > 0.01; sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.9 / 1000);
    var nowS = now / 1000;

    var home = MODE === 'home' && !touring;
    var tg = fly ? { focus: 1, cont: 0.6, cant: 1 } : home ? { focus: 0.6, cont: 0.45, cant: 0.6 } : touring ? { focus: 1, cont: 0.8, cant: 0.95 } : { focus: 1, cont: 0.7, cant: MODE === 'kantone' ? 1 : 0.85 };
    ['focus', 'cont', 'cant'].forEach(function (k) { cur[k] = lerp(cur[k], tg[k], ko); });
    var hiTarget = new Array(NK).fill(0);
    if (touring) TOUR[tourI].hi.forEach(function (c) { hiTarget[BYCODE[c].id] = 1; });
    else if (selected && !fly) hiTarget[selected.id] = 1;
    for (var i = 0; i < NK; i++) hiCur[i] = lerp(hiCur[i], hiTarget[i], ko);
    var TU = terrainMat.uniforms;
    TU.uFocus.value = cur.focus; TU.uContourA.value = cur.cont; TU.uHiv.value = hiCur; TU.uHiAny.value = Math.min(1, Math.max.apply(null, hiCur));
    var intro = (reduce || TEST) ? 1 : sstep(0, 1, (now - tReady) / 2600);
    var kl = TEST ? 1 : 1 - Math.exp(-dt * 6);
    LV.borders = lerp(LV.borders, LAYERS.borders ? 1 : 0, kl); LV.water = lerp(LV.water, LAYERS.water ? 1 : 0, kl); LV.trails = lerp(LV.trails, LAYERS.trails ? 1 : 0, kl);
    if (R.nation) { R.nation.material.uniforms.uDraw.value = ready ? intro : 0; R.nation.material.uniforms.uOpacity.value = LV.borders; R.nation.visible = LV.borders > 0.01; }
    if (R.cant) { R.cant.material.uniforms.uOpacity.value = 0.75 * Math.max(cur.cant, 0) * intro * LV.borders; R.cant.visible = LV.borders > 0.01; }
    if (R.rivers) { R.rivers.material.uniforms.uOpacity.value = 0.75 * LV.water; R.shore.material.uniforms.uOpacity.value = 0.55 * LV.water; R.rivers.visible = R.shore.visible = LV.water > 0.01; }
    var wand = MODE === 'wandern' && !touring;
    var routeA = LV.trails * (wand ? 1 : 1 - sstep(140000, 260000, cam.d)) * (touring ? 0 : 1);
    var selR = SEL && SEL.kind === 'route' ? 0.35 : 1;
    if (R.routesNat) { R.routesNat.material.uniforms.uOpacity.value = 0.9 * routeA * selR; R.routesNat.visible = routeA > 0.01; }
    if (R.routesReg) { var ra = routeA * (wand ? 1 - sstep(300000, 520000, cam.d) : 1 - sstep(60000, 110000, cam.d)); R.routesReg.material.uniforms.uOpacity.value = 0.75 * ra * selR; R.routesReg.visible = ra > 0.01; }
    Object.keys(ROUTESEL).forEach(function (k) {
      var m = ROUTESEL[k], on = m === routeSel ? 1 : 0;
      m.userData.o = lerp(m.userData.o, on, kl);
      m.userData.draw = on ? Math.min(1, m.userData.draw + dt * (reduce || TEST ? 99 : 0.55)) : m.userData.draw;
      m.material.uniforms.uOpacity.value = m.userData.o; m.material.uniforms.uDraw.value = m.userData.draw * 1.001;
      m.visible = m.userData.o > 0.01;
    });
    var hotCat = hotPOI >= 0 && POIS[hotPOI] ? POIS[hotPOI].c : -1;
    POICAT.forEach(function (c, ci) { poiOn[ci] = lerp(poiOn[ci], !touring && (LAYERS[c.k] || ci === hotCat) ? 1 : 0, kl); });
    poiMat.uniforms.uPR.value = renderer.getPixelRatio() * (small ? 0.9 : 1);
    if (tapTip && now > tapTip) { tapTip = 0; tip.classList.remove('on'); }
    labelsEl.style.visibility = LAYERS.labels ? '' : 'hidden';
    var dk = U.uDark.value > 0.5; hemi.intensity = dk ? 0.62 : 1.1; sun.intensity = dk ? 0.9 : 1.6;
    if (window.SFModels && window.SFModels.setLift && dk !== frame.dk) { window.SFModels.setLift(dk ? 0.2 : 0.35); frame.dk = dk; }
    if (detail) {
      frustum.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      detail.update({ E: cam.E, N: cam.N, cE: camera.position.x + EC, cN: NC - camera.position.z, cH: Math.max(0, alt), D: fly ? alt * 1.6 + 1500 : Math.min(cam.d, alt * 1.4 + cam.d * 0.3), frustum: frustum }, dt, now);
    }
    updateModels(nowS, dt, H);
    // Umriss des gewählten Kantons
    var ringOn = selected && !touring && !fly ? selected.code : null;
    if (ringOn) ringFor(ringOn);
    Object.keys(RING).forEach(function (code) {
      var m = RING[code], on = code === ringOn ? 1 : 0;
      m.userData.o = lerp(m.userData.o, on * LV.borders, ko);
      m.userData.draw = on ? Math.min(1, m.userData.draw + dt * (reduce || TEST ? 99 : 0.7)) : 0;
      m.material.uniforms.uOpacity.value = m.userData.o; m.material.uniforms.uDraw.value = m.userData.draw * 1.001;
      m.visible = m.userData.o > 0.01;
    });

    // Zeiger über der Karte
    if ((ptr.moved || (ptr.over && HUDtick % 4 === 0)) && !tapTip) {
      ptr.moved = false;
      var can = ready && ptr.over && fine && !drag.mode && !fly && !pendingFly;
      var ph = can ? poiAt(ptr.cx, ptr.cy, W, H) : null;
      if (hotPOI < 0) poiMat.uniforms.uHot.value = ph ? ph.i : -1;
      var mo = can && !ph ? modelAt(ptr.cx, ptr.cy, W, H) : null;
      var hit = can && !ph && !mo ? pick(ptr.cx, ptr.cy) : null;
      hoverId = hit ? idAt(hit.E, hit.N) : 0;
      TU.uHover.value = hoverId > 0 && !touring ? hoverId : -1;
      if (ph) { showPoiTip(ph); placeTip(ptr.cx, ptr.cy); body.style.cursor = 'pointer'; }
      else if (mo) {
        tipT.innerHTML = '<img src="' + wappen(mo.code) + '" alt="">' + esc(mo.m.name);
        tipA.textContent = mo.m.text; tipB.textContent = 'Kanton ' + KC[mo.code].name + ' · Klick für Details';
        placeTip(ptr.cx, ptr.cy); body.style.cursor = 'pointer';
      } else if (hit && hoverId > 0) {
        var c = BYID[hoverId];
        tipT.innerHTML = '<img src="' + wappen(c.code) + '" alt="">' + esc(KC[c.code].name);
        tipA.textContent = km2(c.ha) + ' km² · ' + swiss(c.pop) + ' Einw.';
        tipB.textContent = 'Hier ' + swiss(hit.h) + ' m ü. M.';
        placeTip(ptr.cx, ptr.cy); body.style.cursor = 'pointer';
      } else { tip.classList.remove('on'); if (!drag.mode) body.style.cursor = ''; }
    }

    // Beschriftungen: Sichtbarkeit nach Abstand, Verdeckung, Kollision nach Rang
    var placed = [], selCode = selected ? selected.code : null, dT = cam.d, hotId = HOT ? HOT.id : null;
    var tourHi = touring ? TOUR[tourI].hi : null;
    for (i = 0; i < LBL.length; i++) {
      var L = LBL[i], want_o = 0;
      if (fly) {
        var ldx = L.p.x - camera.position.x, ldz = L.p.z - camera.position.z, ld = Math.sqrt(ldx * ldx + ldz * ldz);
        if (L.kind === 'canton') want_o = sstep(9000, 26000, alt) * (1 - sstep(220000, 320000, ld));
        else if (L.kind === 'lake') want_o = 1 - sstep(90000, 160000, ld);
        else if (L.kind === 'peak') want_o = 1 - sstep(70000, 130000, ld);
        else want_o = (1 - sstep(45000, 70000, ld)) * (LAYERS.marks ? 1 : 0);
      } else {
        var gd = Math.hypot(L.E - cam.E, L.N - cam.N) / dT;
        if (L.kind === 'canton') {
          want_o = sstep(30000, 60000, dT);
          if (tourHi) want_o *= tourHi.length && tourHi.indexOf(L.code) < 0 ? 0.0 : 1;
          if (L.code === selCode && dT > 20000) want_o = Math.max(want_o, 1);
        } else if (L.kind === 'lake') want_o = (L.big ? 1 - sstep(380000, 560000, dT) : 1 - sstep(130000, 200000, dT)) * (1 - sstep(0.9, 1.3, gd));
        else if (L.kind === 'peak') want_o = (L.big ? 1 - sstep(300000, 460000, dT) : 1 - sstep(90000, 150000, dT)) * (1 - sstep(0.8, 1.2, gd)) * sstep(1500, 4000, dT);
        else {
          var near = (1 - sstep(70000, 110000, dT)) * (1 - sstep(0.9, 1.4, gd));
          if (L.code === selCode && (MODE === 'wahrzeichen' || MODE === 'kantone')) near = Math.max(near, 1 - sstep(300000, 420000, dT));
          if (L.mark.id === hotId) near = 1;
          want_o = LAYERS.marks && !touring ? near : 0;
        }
      }
      if (L.kind === 'poi') { var isOn = L.mark.id === hotId; if (isOn !== L.on) { L.on = isOn; L.el.classList.toggle('on', isOn); L.bw = 0; } }
      want_o = sstep(0.3, 0.8, want_o);
      if (!ready) want_o = 0;
      tmpV.copy(L.p).project(camera);
      var vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.08 && Math.abs(tmpV.y) < 1.08;
      if (want_o > 0.01 && vis && (HUDtick + L.n) % 5 === 0) {
        L.occ = false;
        for (var s = 1; s <= 9; s++) {
          var f = s / 10 * 0.92, px = lerp(L.p.x, camera.position.x, f), py = lerp(L.p.y, camera.position.y, f), pz = lerp(L.p.z, camera.position.z, f);
          var E = px + EC, N = NC - pz;
          if (inGrid(E, N) && Y(groundAt(E, N)) > py + 10) { L.occ = true; break; }
        }
      }
      if (!vis || L.occ) want_o = 0;
      L.sx = (tmpV.x + 1) / 2 * W; L.sy = (1 - tmpV.y) / 2 * H; L.want = want_o;
    }
    for (i = 0; i < LBL_ORDER.length; i++) {
      L = LBL_ORDER[i];
      if (L.want > 0.01) {
        if (!L.bw) { L.el.style.opacity = '0'; L.el.style.transform = 'translate3d(-9999px,0,0)'; L.bw = L.el.offsetWidth; L.bh = L.el.offsetHeight; }
        var left = (L.kind === 'peak' || L.kind === 'poi') ? L.sx - 5 : L.sx - L.bw / 2, tries = L.kind === 'canton' ? [0, -15, 15] : [0], ok = false;
        if (L.kind === 'poi' && L.on) tries = [0];
        for (var tr = 0; tr < tries.length && !ok; tr++) {
          var top = L.sy - L.bh / 2 + tries[tr], hitL = false;
          for (var q = 0; q < placed.length; q++) { var P = placed[q]; if (left < P[2] + 6 && left + L.bw + 6 > P[0] && top < P[3] + 2 && top + L.bh + 2 > P[1]) { hitL = true; break; } }
          if (!hitL || L.on) { ok = true; L.dy = lerp(L.dy || 0, tries[tr], TEST ? 1 : 1 - Math.exp(-dt * 8)); placed.push([left, top, left + L.bw, top + L.bh]); }
        }
        if (!ok) L.want = 0;
      }
      L.o = TEST ? L.want : lerp(L.o, L.want, 1 - Math.exp(-dt * 6));
      var clickable = L.kind === 'poi' && L.o > 0.5 && !fly;
      if (clickable !== L.hit) { L.hit = clickable; L.el.classList.toggle('hit', clickable); }
      if (L.o < 0.01) { if (L.w !== 0) { L.el.style.opacity = '0'; L.w = 0; } continue; }
      var offT = (L.kind === 'peak' || L.kind === 'poi') ? 'translate(-5px,-50%)' : 'translate(-50%,-50%)';
      L.el.style.transform = 'translate3d(' + L.sx.toFixed(1) + 'px,' + (L.sy + (L.dy || 0)).toFixed(1) + 'px,0) ' + offT;
      L.el.style.opacity = L.o.toFixed(3); L.w = 1;
    }

    // Liste der Orte in der Nähe nachführen, wenn die Karte ruht
    if (MODE === 'familien' && !SEL && !selected && listCenter && !drag.mode && !flight && !fly && now - lastListT > 700 &&
        (Math.hypot(ex.E - listCenter.E, ex.N - listCenter.N) > listCenter.d * 0.18 || Math.abs(Math.log(ex.d / listCenter.d)) > 0.35)) renderList();

    // HUD
    HUDtick++;
    if (ready && HUDtick % 4 === 0) {
      var st = detail ? detail.stats() : null;
      if (fly) {
        var fE = fly.x + EC, fN = NC - fly.z, fid = idAt(fE, fN), v = Math.hypot(fly.v.x, fly.v.z, fly.v.y / VZ);
        hudA.textContent = swiss(fly.y / VZ + H0) + ' m ü. M. · ' + swiss(alt) + ' m über Grund';
        hudB.textContent = (fid ? KC[BYID[fid].code].name + ' · ' : '') + swiss(v * 3.6) + ' km/h · Tempo ×' + dec(flyMul, 1);
      } else {
        var hh = groundAt(cam.E, cam.N), id = idAt(cam.E, cam.N);
        hudA.textContent = swiss(cam.E) + ' / ' + swiss(cam.N);
        hudB.textContent = (id ? KC[BYID[id].code].name + ' · ' : '') + swiss(hh) + ' m ü. M.' + (st && LAYERS.sat && st.tiles ? ' · Luftbild' : '');
      }
      attribEl.classList.toggle('on', !!(st && st.tiles && (LAYERS.sat || LAYERS.trails)));
    }
    north.style.transform = 'rotate(' + (-cam.hd).toFixed(1) + 'deg)';

    renderer.render(scene, camera);
    if (!TEST) requestAnimationFrame(frame);
  }
  if (TEST) {
    window.__frame = function () { frame(performance.now()); return true; }; window.__R = R; window.__RING = RING;
    window.__dbg = { cam: function () { return cam; }, ex: function () { return ex; }, detail: function () { return detail && detail.stats(); }, models: function () { return MODELS.length; }, poi: function () { return POI && POI.list.length; },
      set: function (o) { flight = null; Object.keys(o).forEach(function (k) { ex[k] = o[k]; if (cam) cam[k] = o[k]; }); },
      fly: function (o) { if (fly) Object.keys(o).forEach(function (k) { fly[k] = o[k]; }); return fly; }, flying: function () { return !!fly; }, pending: function () { return pendingFly; },
      click: function (x, y) { mapClick(x, y, 'mouse'); } };
  }

  /* ---------------- Start ---------------- */
  (async function boot() {
    try {
      statusEl.textContent = 'Relief wird aufgebaut …';
      resize();
      var buf = await hgtP;
      var raw = await gunzip(buf);
      var n = nx * ny, lo = raw.subarray(0, n), hi = raw.subarray(n, 2 * n), q = new Int32Array(n);
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
        var k = j * nx + i, zz = lo[k] | (hi[k] << 8), r = (zz >>> 1) ^ -(zz & 1), p = 0;
        if (j === 0) { if (i > 0) p = q[k - 1]; } else if (i === 0) p = q[k - nx]; else p = q[k - 1] + q[k - nx] - q[k - nx - 1];
        q[k] = p + r; HT[k] = q[k] * 0.5;
      }
      var hd = new Uint16Array(n);
      for (j = 0; j < ny; j++) { var rr = ny - 1 - j; for (i = 0; i < nx; i++) hd[rr * nx + i] = THREE.DataUtils.toHalfFloat(HT[j * nx + i]); }
      var hTex = new THREE.DataTexture(hd, nx, ny, THREE.RedFormat, THREE.HalfFloatType);
      hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
      terrainMat.uniforms.uHgt.value = hTex;

      var imgs = await Promise.all([loadImage('data/relief.jpg'), loadImage('data/mask.png')]);
      var relTex = new THREE.Texture(imgs[0]);
      relTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); relTex.needsUpdate = true;
      var mL = new THREE.Texture(imgs[1]); mL.needsUpdate = true; mL.generateMipmaps = false; mL.minFilter = THREE.LinearFilter;
      var mN = new THREE.Texture(imgs[1]); mN.needsUpdate = true; mN.generateMipmaps = false; mN.minFilter = mN.magFilter = THREE.NearestFilter;
      terrainMat.uniforms.uRelief.value = relTex; terrainMat.uniforms.uMaskL.value = mL; terrainMat.uniforms.uMaskN.value = mN;
      var cv = document.createElement('canvas'); cv.width = IDW; cv.height = IDH;
      var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(imgs[1], 0, 0);
      ids = cx.getImageData(0, 0, IDW, IDH).data;
      await tick();

      buildTerrain(small ? 2 : 1);
      if (window.SFDetail) {
        detail = window.SFDetail({ THREE: THREE, scene: scene, renderer: renderer, small: small, G: G, X: X, Y: Y, Z: Z, VZ: VZ, H0: H0, EC: EC, NC: NC, gunzip: gunzip, uniforms: terrainMat.uniforms });
        detail.set('sat', LAYERS.sat); detail.set('trails', LAYERS.trails);
        terrainMat.uniforms.uCov.value = detail.covTex; terrainMat.uniforms.uCovOn.value = 1;
      }
      var Ls = D.lines;
      R.shore = buildRibbon(toLines(Ls.shore), ribbonMat('--m-shore', 1.0, 0.55));
      R.rivers = buildRibbon(toLines(Ls.rivers), ribbonMat('--m-river', 1.5, 0.75));
      R.cant = buildRibbon(toLines(Ls.canton), ribbonMat('--m-cant', 1.4, 0, { dash: true }));
      R.nation = buildRibbon(toLines(Ls.nation), ribbonMat('--m-nation', small ? 2.6 : 3.2, 1), true);
      R.shore.renderOrder = 1; R.rivers.renderOrder = 2; R.cant.renderOrder = 3; R.nation.renderOrder = 4;

      D.cantons.forEach(function (c) { addLabel(KC[c.code].name, 'canton', c.at[0], c.at[1], { code: c.code }); });
      var PL = D.places || {};
      (PL.lakes || []).forEach(function (l) { addLabel(l.name, 'lake', l.E, l.N, { big: !!l.big }); });
      (PL.peaks || []).forEach(function (pk) { addLabel(pk.name, 'peak', pk.E, pk.N, { big: !!pk.big, elev: swiss(pk.h) }); });
      MARKLIST.forEach(function (m) { addLabel(m.name, 'poi', m.E, m.N, { code: m.code, mark: m }); });
      LBL_ORDER = LBL.slice().sort(function (a, b) { return PRIO[a.kind] - PRIO[b.kind] || a.n - b.n; });
      buildModels();

      ready = true; tReady = performance.now();
      buildPOI(); buildRoutes();
      canvas.style.opacity = '1';
      statusEl.textContent = '';
      hudA.textContent = '';
      resize();
      if (!TEST) requestAnimationFrame(frame);
    } catch (err) {
      console.error(err);
      fail('Das Relief konnte nicht aufgebaut werden.');
    }
  })();
}
})();
