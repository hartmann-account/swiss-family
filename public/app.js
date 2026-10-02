(function () {
'use strict';
var KT = window.KANTONE, KC = KT.C;
var $ = function (s) { return document.querySelector(s); };
var root = document.documentElement;
var statusEl = $('#status'), hudA = $('#hudA'), hudB = $('#hudB');
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TEST = !!window.SF_TEST;
var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function swiss(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '’'); }
function dec(x, d) { return x.toFixed(d == null ? 1 : d).replace('.', ','); }
function km2(ha) { return ha >= 100000 ? swiss(ha / 100) : dec(ha / 100); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function wappen(code) { return 'data/wappen/' + code + '.svg'; }
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v * f).toString(16)).slice(-2); }).join('');
}

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

var D = null, BYCODE = {}, BYID = [], MARKS = {};
var hgtP = fetch('data/hgt.bin').then(function (r) { if (!r.ok) throw new Error('hgt ' + r.status); return r.arrayBuffer(); });
hgtP.catch(function () {});
function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
var poiP = getJSON('data/poi.json'), routesP = getJSON('data/routes.json');
poiP.catch(function () {}); routesP.catch(function () {});
var geoP = fetch('data/geo.json').then(function (r) { if (!r.ok) throw new Error('geo ' + r.status); return r.json(); });

geoP.then(function (g) {
  D = g;
  D.cantons.forEach(function (c) { BYCODE[c.code] = c; BYID[c.id] = c; });
  var pm = (D.places && D.places.marks) || {};
  KT.ORDER.forEach(function (code) {
    MARKS[code] = (KC[code].marks || []).map(function (m, i) {
      var p = (pm[code] || []).filter(function (x) { return x.name === m[0]; })[0] || (pm[code] || [])[i];
      return p ? { name: m[0], text: m[1], E: p.E, N: p.N, idx: i, code: code } : null;
    }).filter(Boolean);
  });
  fillText();
  start();
}).catch(function (e) { console.error(e); fail('Die Geodaten konnten nicht geladen werden.'); });

/* ---------------- Texte aus den Daten ---------------- */
var tilesEl = $('#tiles'), detailEl = $('#detail');
function fillText() {
  var ch = D.ch;
  $('#chH').textContent = '26 Kantone auf ' + swiss(ch.ha / 100) + ' km²';
  $('#chP').textContent = 'Vom Lago Maggiore auf ' + ch.hmin + ' m ü. M. bis zur Dufourspitze auf ' + ch.hmax + ' m. Die Linien zeigen die Landesgrenze und die Grenzen der Kantone nach swissBOUNDARIES3D, Stand 2026.';
  $('#chFacts').innerHTML = [['Fläche', swiss(ch.ha / 100) + ' km²'], ['Höhenlage', ch.hmin + '–' + swiss(ch.hmax) + ' m'], ['Einwohner', swiss(ch.pop)],
    ['Kantone', '26'], ['Gemeinden', swiss(ch.gem)]].map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('[data-rows]'), function (ul) {
    ul.innerHTML = KT.REGIONS[ul.dataset.rows].map(function (code) {
      var c = BYCODE[code];
      return '<li><span><img src="' + wappen(code) + '" alt="">' + KC[code].name + '</span><span>' + km2(c.ha) + ' km² · ' + swiss(c.pop) + ' Einw.</span></li>';
    }).join('');
  });
  tilesEl.innerHTML = KT.ORDER.map(function (code) {
    return '<button type="button" data-k="' + code + '" aria-pressed="false" title="' + esc(KC[code].name) + '" aria-label="' + esc(KC[code].name) + '"><img src="' + wappen(code) + '" alt="">' + code + '</button>';
  }).join('') + '<button type="button" class="all" data-k="CH" aria-pressed="true" title="Ganze Schweiz" aria-label="Ganze Schweiz"><img src="' + wappen('CH') + '" alt="">CH</button>';
  renderDetail();
}
function renderDetail() {
  var code = selected ? selected.code : null;
  if (!code) {
    detailEl.innerHTML = '<p class="sel">Für Familien in allen 26 Kantonen. Wählen Sie oben einen Kanton.</p>';
    return;
  }
  var K = KC[code], c = BYCODE[code];
  var marks = MARKS[code] || [];
  detailEl.innerHTML =
    '<div class="dhead"><img src="' + wappen(code) + '" alt="Wappen ' + esc(K.name) + '"><div><h3>' + esc(K.name) + '</h3><p>' + esc(K.local) + '</p></div></div>' +
    '<div class="flagbar" aria-hidden="true"></div>' +
    '<dl class="facts">' +
    [['Hauptort', K.capital], [K.sinceNote ? 'Kanton seit' : 'Im Bund seit', K.since], ['Amtssprache' + (K.lang.indexOf(',') > 0 ? 'n' : ''), K.lang],
     ['Fläche', km2(c.ha) + ' km²'], ['Einwohner', swiss(c.pop)], ['Gemeinden', String(c.gem)], ['Höhenlage', c.hmin + '–' + swiss(c.hmax) + ' m']]
      .map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') +
    '</dl>' +
    '<button type="button" class="xgo" data-x="1"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.8 5.2 9 9 5.2 10.8 7 7z" fill="currentColor"/></svg>' + esc(K.name) + ' in 3D erkunden</button>' +
    '<p class="kicker" style="margin:18px 0 0">Wahrzeichen</p>' +
    '<ul class="marks">' + marks.map(function (m, i) {
      return '<li><button type="button" data-m="' + i + '" aria-pressed="' + (selMark === i ? 'true' : 'false') + '"><b>' + esc(m.name) + '</b><small>' + esc(m.text) + '</small></button></li>';
    }).join('') + '</ul>';
}

/* ---------------- Auswahl und Farbwechsel ---------------- */
var selected = null, selMark = -1;
function applyBrand(code) {
  if (code && code !== 'CH') root.setAttribute('data-kanton', code); else root.removeAttribute('data-kanton');
  var K = KC[code || 'CH'];
  var t = K.title + ' Familien';
  $('#heroT').textContent = t; $('#markT').textContent = K.title; $('#sig').textContent = t;
  document.title = t;
  ['#heroW', '#markW', '#pickW'].forEach(function (s) { $(s).src = wappen(code || 'CH'); });
  $('#heroE').textContent = code && code !== 'CH' ? 'Kanton ' + K.name + ' · ' + (K.sinceNote || 'im Bund seit ' + K.since) : 'Schweiz · 46° 48′ N · 8° 14′ O';
  $('#pickT').textContent = code && code !== 'CH' ? K.name : 'Kanton wählen';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = K.color.brand;
}
function selectCanton(code, opts) {
  opts = opts || {};
  var c = code && code !== 'CH' ? BYCODE[code] : null;
  selected = c; selMark = -1;
  applyBrand(c ? c.code : null);
  Array.prototype.forEach.call(tilesEl.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', (c ? c.code : 'CH') === b.dataset.k ? 'true' : 'false'); });
  renderDetail();
  if (!opts.noHash) { try { history.replaceState(null, '', c ? '#' + c.code.toLowerCase() : location.pathname + location.search); } catch (e) {} }
  if (window.__onSelect) window.__onSelect(c);
  if (opts.scroll && !inFinale()) document.getElementById('kantone').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}
tilesEl.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-k]'); if (!b) return;
  var code = b.dataset.k;
  selectCanton(code === 'CH' || (selected && selected.code === code) ? null : code, { scroll: true });
});
var exploreAt = function () {};
detailEl.addEventListener('click', function (e) {
  if (e.target.closest('button[data-x]') && selected) { setExplore(true, 'orbit'); exploreAt(selected); return; }
  var b = e.target.closest('button[data-m]'); if (!b) return;
  var i = +b.dataset.m;
  selMark = selMark === i ? -1 : i;
  Array.prototype.forEach.call(detailEl.querySelectorAll('button[data-m]'), function (x) { x.setAttribute('aria-pressed', +x.dataset.m === selMark ? 'true' : 'false'); });
});
function hashCanton() { var h = location.hash.replace('#', '').toUpperCase(); return KC[h] && h !== 'CH' ? h : null; }
window.addEventListener('hashchange', function () { var h = hashCanton(); if (h && D) selectCanton(h, { noHash: true }); });
function inFinale() { var y = window.scrollY + window.innerHeight * 0.5; return y > anchorY('kantone') - window.innerHeight * 0.45; }

/* ---------------- Ebenen (Legende) ---------------- */
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
var LAYERS = { sat: true, trails: true, marks: true, borders: true, water: true, labels: true };
POICAT.forEach(function (c) { LAYERS[c.k] = c.on; });
try { var savedL = JSON.parse(localStorage.getItem('sf-layers') || 'null'); if (savedL) Object.keys(savedL).forEach(function (k) { if (k in LAYERS) LAYERS[k] = !!savedL[k]; }); } catch (e) {}
var onLayer = function () {};
function setLayer(k, v) {
  LAYERS[k] = v;
  try { localStorage.setItem('sf-layers', JSON.stringify(LAYERS)); } catch (e) {}
  var inp = document.querySelector('#legend input[data-l="' + k + '"]'); if (inp) inp.checked = v;
  onLayer(k, v);
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

/* Legende aufbauen */
(function legend() {
  var el = $('#legendBody'); if (!el) return;
  function row(k, label, sw) {
    return '<label class="lg-row"><input type="checkbox" data-l="' + k + '"' + (LAYERS[k] ? ' checked' : '') + '><span class="lg-sw">' + sw + '</span><span>' + label + '</span></label>';
  }
  el.innerHTML =
    '<p class="lg-h">Karte</p>' +
    row('sat', 'Luftbild (Nahansicht)', '<i class="sw-sat"></i>') +
    row('trails', 'Wanderwege', '<i class="sw-trail"></i>') +
    row('marks', 'Wahrzeichen in 3D', '<i class="sw-mark"></i>') +
    row('borders', 'Grenzen', '<i class="sw-border"></i>') +
    row('water', 'Flüsse und Seeufer', '<i class="sw-water"></i>') +
    row('labels', 'Namen', '<i class="sw-label">Aa</i>') +
    '<p class="lg-h">Für Familien unterwegs</p>' +
    POICAT.map(function (c) { return row(c.k, c.label, '<img src="' + ICONS.url[c.k] + '" alt="">'); }).join('');
  el.addEventListener('change', function (e) { var t = e.target; if (t.dataset && t.dataset.l) setLayer(t.dataset.l, t.checked); });
  var btn = $('#layersBtn'), panel = $('#legend');
  function show(v) { panel.hidden = !v; btn.setAttribute('aria-expanded', v ? 'true' : 'false'); }
  btn.addEventListener('click', function () { show(panel.hidden); });
  $('#legendClose').addEventListener('click', function () { show(false); btn.focus(); });
})();

/* Erkunden: freie Kamera statt Scroll-Erzählung */
var EXP = { on: false, mode: 'orbit' };
var onExplore = function () {};
function setExplore(on, mode) {
  if (mode) EXP.mode = mode;
  if (on !== EXP.on) {
    EXP.on = on;
    root.classList.toggle('exploring', on);
    $('#exploreBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('#exploreBtn').querySelector('span').textContent = on ? 'Zurück zur Geschichte' : 'Karte erkunden';
    if (!on && document.pointerLockElement) document.exitPointerLock();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#modeSeg button'), function (b) { b.setAttribute('aria-pressed', b.dataset.mode === EXP.mode ? 'true' : 'false'); });
  root.classList.toggle('fly-touch', EXP.on && EXP.mode === 'fly' && !fine);
  var help = $('#explHelp'); clearTimeout(setExplore.t);
  if (EXP.on) { help.hidden = false; setExplore.t = setTimeout(function () { help.hidden = true; }, 7000); } else help.hidden = true;
  $('#keysOrbit').hidden = EXP.mode !== 'orbit'; $('#keysFly').hidden = EXP.mode !== 'fly';
  onExplore();
}
$('#exploreBtn').addEventListener('click', function () { setExplore(!EXP.on); });
$('#modeSeg').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (b) setExplore(true, b.dataset.mode); });
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && EXP.on && !document.pointerLockElement) setExplore(false);
});

/* ---------------- Szene ---------------- */
var anchors = [];
function measure() {
  anchors = Array.prototype.map.call(document.querySelectorAll('[data-cam]'), function (s) {
    var r = s.getBoundingClientRect();
    return { key: s.dataset.cam, y: r.top + window.scrollY + r.height * 0.5, el: s };
  });
}
function anchorY(key) { for (var i = 0; i < anchors.length; i++) if (anchors[i].key === key) return anchors[i].y; return 0; }

function start() {
  var h0 = hashCanton(); if (h0) selectCanton(h0, { noHash: true });
  if (!window.THREE) { fail('Die 3D-Bibliothek konnte nicht geladen werden. Die Texte bleiben lesbar.'); return; }
  if (typeof DecompressionStream === 'undefined') { fail('Dieser Browser kann die Geodaten nicht entpacken. Die Texte bleiben lesbar.'); return; }
  THREE.ColorManagement.enabled = false;

  var canvas = $('#scene');
  canvas.style.opacity = '0';
  canvas.style.transition = reduce ? 'none' : 'opacity 1.4s ease';
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail('WebGL ist in diesem Browser nicht verfügbar. Die Texte bleiben lesbar.'); return; }
  if (!renderer.capabilities.isWebGL2) { fail('Für das Relief braucht es WebGL 2. Die Texte bleiben lesbar.'); return; }
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
   '--m-side', '--m-side-2', '--m-line', '--m-nation', '--m-cant', '--m-river', '--m-shore', '--m-route', '--ink'
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
  function buildPOI(P) {
    var pos = [], cat = [], ids = [], list = [];
    POICAT.forEach(function (c, ci) {
      var d = P.cats && P.cats[c.k]; if (!d) return;
      for (var i = 0, n = d.xyz.length / 3; i < n; i++) {
        var E = P.E0 + d.xyz[i * 3], N = P.N0 + d.xyz[i * 3 + 1], h = d.xyz[i * 3 + 2];
        pos.push(X(E), Y(h) + 6, Z(N)); cat.push(ci); ids.push(list.length);
        list.push({ c: ci, E: E, N: N, h: h, name: (d.names && d.names[i]) || '' });
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCat', new THREE.Float32BufferAttribute(cat, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1));
    var pts = new THREE.Points(g, poiMat); pts.frustumCulled = false; pts.renderOrder = 9;
    scene.add(pts);
    POI = { pts: pts, list: list, pos: new Float32Array(pos), date: P.date };
  }
  var pv = new THREE.Vector3();
  function poiAt(cx, cy, W, H) {
    if (!POI) return null;
    var best = null, bd = 15 * 15, cp = camera.position;
    for (var i = 0; i < POI.list.length; i++) {
      var it = POI.list[i]; if (poiOn[it.c] < 0.5) continue;
      var x = POI.pos[i * 3], y = POI.pos[i * 3 + 1], z = POI.pos[i * 3 + 2];
      var dx = x - cp.x, dy = y - cp.y, dz = z - cp.z, d2 = dx * dx + dy * dy + dz * dz, fc = poiFar[it.c] * 0.8;
      if (d2 > fc * fc) continue;
      pv.set(x, y, z).project(camera);
      if (pv.z > 1) continue;
      var sx = (pv.x + 1) / 2 * W, sy = (1 - pv.y) / 2 * H - Math.min(Math.sqrt(d2) * 0.006, 120) / (U.uPx.value * Math.sqrt(d2) || 1);
      var e = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
      if (e < bd) { bd = e; best = { it: it, i: i, sx: sx, sy: sy }; }
    }
    return best;
  }

  /* ---------------- Wanderrouten SchweizMobil ---------------- */
  function buildRoutes(Rt) {
    var nat = [], reg = [];
    (Rt.routes || []).forEach(function (r) {
      var L = r.lines.map(function (a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push([a[i] + Rt.E0, a[i + 1] + Rt.N0]); return o; });
      (r.typ === 'national' ? nat : reg).push.apply(r.typ === 'national' ? nat : reg, L);
    });
    if (reg.length) { R.routesReg = buildRibbon(reg, ribbonMat('--m-route', 1.4, 0)); R.routesReg.renderOrder = 5; }
    if (nat.length) { R.routesNat = buildRibbon(nat, ribbonMat('--m-route', small ? 2.2 : 2.6, 0, { dash: false })); R.routesNat.renderOrder = 5; }
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
        MODELS.push({ m: m, code: code, holder: holder, inst: inst, ring: ring, foot: foot, h: Math.max(35, size.y, Math.max(size.x, size.z) * 0.6), vis: 0, ph: (m.idx * 1.7 + code.charCodeAt(0)) % 6.28 });
      });
    });
  }
  function updateModels(t, dt, H) {
    if (!MODELS.length) return;
    var kpx = 2 * Math.tan(camera.fov * Math.PI / 360) / H, selCode = selected ? selected.code : null;
    for (var i = 0; i < MODELS.length; i++) {
      var o = MODELS[i], m = o.m;
      var gx = X(m.E), gz = Z(m.N), dx = gx - camera.position.x, dz = gz - camera.position.z;
      var hd = Math.sqrt(dx * dx + dz * dz);
      var want = LAYERS.marks && ready && hd < 85000 ? 1 : 0;
      o.vis = lerp(o.vis, want, TEST ? 1 : 1 - Math.exp(-dt * 4));
      if (o.vis < 0.01) { if (o.holder.visible) o.holder.visible = false; continue; }
      var gy = Y(groundAt(m.E, m.N));
      o.holder.position.set(gx, gy, gz);
      var dist = camera.position.distanceTo(o.holder.position);
      var hot = selCode === o.code && selMark === m.idx;
      var px = hot ? 130 : selCode === o.code ? 104 : 92;
      var sc = Math.max(1.6, px * kpx * dist / o.h) * (0.3 + 0.7 * o.vis);
      o.holder.scale.set(sc, sc, sc);
      o.holder.visible = true;
      var pulse = (t * 0.45 + o.ph / 6.28) % 1;
      o.ring.scale.setScalar(o.foot * (0.85 + pulse * 0.6));
      o.ring.material.opacity = (1 - pulse) * 0.55 * o.vis;
      try { o.inst.update(t, dt); } catch (e) {}
    }
  }

  /* ---------------- Beschriftungen ---------------- */
  var labelsEl = $('#labels'), LBL = [], LBL_ORDER = [], PRIO = { canton: 0, poi: 1, lake: 2, peak: 3 };
  function addLabel(text, kind, E, N, sections, sub, elev, extra) {
    var el = document.createElement('div');
    el.className = 'lbl ' + kind;
    if (kind === 'canton') el.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    else if (kind === 'peak') el.innerHTML = '<span>' + esc(text) + '</span><em>' + elev + '</em>';
    else el.textContent = text;
    labelsEl.appendChild(el);
    var lift = kind === 'peak' ? 60 : kind === 'poi' ? 50 : 80;
    var L = { el: el, kind: kind, name: text, p: new THREE.Vector3(X(E), Y(hAt(E, N)) + lift, Z(N)), s: sections, o: 0, occ: false, n: LBL.length, w: 0 };
    if (extra) Object.keys(extra).forEach(function (k) { L[k] = extra[k]; });
    LBL.push(L); return L;
  }
  function regionOf(code) { return KC[code] && KC[code].region; }

  /* ---------------- Kamerafahrt ---------------- */
  var KEYS = {
    hero:       { E: 2662000, N: 1172000, d: 600000, hd: -14, p: 38, ox: 0.04, oy: -0.2 },
    schweiz:    { E: 2660000, N: 1184000, d: 640000, hd: 0, p: 60, ox: 0.18, oy: 0.02 },
    lemanique:  { E: 2578000, N: 1118000, d: 270000, hd: -10, p: 50, ox: 0.17, oy: 0.03 },
    mittelland: { E: 2592000, N: 1196000, d: 240000, hd: 8, p: 48, ox: 0.17, oy: 0.03 },
    nordwest:   { E: 2636000, N: 1255000, d: 105000, hd: 18, p: 46, ox: 0.17, oy: 0.03 },
    zuerich:    { E: 2692000, N: 1256000, d: 78000, hd: -12, p: 48, ox: 0.17, oy: 0.03 },
    zentral:    { E: 2678000, N: 1200000, d: 118000, hd: -28, p: 42, ox: 0.17, oy: 0.03 },
    ost:        { E: 2747000, N: 1215000, d: 235000, hd: 10, p: 48, ox: 0.17, oy: 0.03 },
    tessin:     { E: 2712000, N: 1112000, d: 125000, hd: 168, p: 38, ox: 0.17, oy: 0.03 },
    kantone:    { E: 2660000, N: 1184000, d: 600000, hd: 6, p: 56, ox: 0.24, oy: 0.02 }
  };
  var HI = { hero: [], schweiz: [], kantone: [] };
  Object.keys(KT.REGIONS).forEach(function (r) { HI[r] = KT.REGIONS[r]; });
  var PAR = {
    hero: { focus: 0.35, cont: 0.2, cant: 0.25 }, schweiz: { focus: 1, cont: 0.7, cant: 1 }, kantone: { focus: 1, cont: 0.7, cant: 1 }
  };
  Object.keys(KT.REGIONS).forEach(function (r) { PAR[r] = { focus: 1, cont: 0.8, cant: 0.9 }; });
  PAR.explore = { focus: 1, cont: 0.6, cant: 1 }; HI.explore = [];

  function cantonKey(c) {
    var size = Math.sqrt(c.ha * 10000), cx = (c.bb[0] + c.bb[2]) / 2, cy = (c.bb[1] + c.bb[3]) / 2;
    return { E: (c.at[0] + cx) / 2, N: (c.at[1] + cy) / 2, d: clamp(size * 2.9, 26000, 280000), hd: 8 + (c.id * 37) % 50 - 25, p: 50, ox: 0.2, oy: 0.03 };
  }
  function markKey(m) { return { E: m.E, N: m.N, d: 17000, hd: 10, p: 42, ox: 0.2, oy: 0.04 }; }
  function story() {
    var y = window.scrollY + window.innerHeight * 0.5, i = 0;
    while (i < anchors.length - 1 && y >= anchors[i + 1].y) i++;
    if (i >= anchors.length - 1) return { a: anchors.length - 1, b: anchors.length - 1, t: 0, y: y };
    var A = anchors[i], B = anchors[i + 1];
    return { a: i, b: i + 1, t: clamp((y - A.y) / (B.y - A.y), 0, 1), y: y };
  }
  function angLerp(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }
  function keyFor(k) {
    if (k === 'kantone' && selected) {
      var ms = MARKS[selected.code];
      if (selMark >= 0 && ms && ms[selMark]) return markKey(ms[selMark]);
      return cantonKey(selected);
    }
    return KEYS[k];
  }
  function portraitAdjust(c) {
    var asp = window.innerWidth / window.innerHeight, narrow = window.innerWidth < 760;
    var f = asp < 1.25 ? clamp(1.25 / asp, 1, 2.3) : 1;
    var isHero = c === KEYS.hero;
    return { E: c.E, N: c.N, d: c.d * f, hd: c.hd, p: c.p, ox: narrow ? (isHero ? 0.1 : 0) : c.ox, oy: narrow ? (isHero ? -0.13 : -0.2) : c.oy };
  }
  function desiredCam(st) {
    var A = portraitAdjust(keyFor(anchors[st.a].key)), B = portraitAdjust(keyFor(anchors[st.b].key));
    var t = sstep(0.16, 0.84, st.t);
    var sep = Math.hypot(A.E - B.E, A.N - B.N), hop = clamp(sep / Math.min(A.d, B.d) * 0.22, 0, 0.9) * Math.sin(Math.PI * t);
    var d = Math.exp(lerp(Math.log(A.d), Math.log(B.d), t)) * (1 + hop);
    return { E: lerp(A.E, B.E, t), N: lerp(A.N, B.N, t), d: d, hd: angLerp(A.hd, B.hd, t), p: lerp(A.p, B.p, t) - hop * 6, ox: lerp(A.ox, B.ox, t), oy: lerp(A.oy, B.oy, t), t: t };
  }
  var cam = null, ptr = { x: 0, y: 0, sx: 0, sy: 0, cx: -1, cy: -1, moved: false, over: false }, drag = { on: false, hd: 0, p: 0, lx: 0, ly: 0, id: null };
  function placeCamera(c, W, H) {
    var th = c.hd * Math.PI / 180, ph = c.p * Math.PI / 180, cp = Math.cos(ph), sp = Math.sin(ph);
    var h = groundAt(c.E, c.N), tx = X(c.E), ty = Y(h), tz = Z(c.N);
    var px = tx - Math.sin(th) * cp * c.d, py = ty + sp * c.d, pz = tz + Math.cos(th) * cp * c.d;
    var gE = px + EC, gN = NC - pz, ground = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : -1000;
    if (py < ground + Math.min(300, 40 + c.d * 0.08)) py = ground + Math.min(300, 40 + c.d * 0.08);
    camera.position.set(px, py, pz);
    camera.lookAt(tx, ty, tz);
    camera.near = clamp(c.d * 0.012, 2, 6000); camera.far = c.d * 5 + 200000;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, -c.ox * W, -c.oy * H, W, H);
    camera.updateProjectionMatrix();
    U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    U.uFogNear.value = c.d * 1.1; U.uFogFar.value = c.d * 3.6;
  }

  /* ---------------- Picking ---------------- */
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ids = null, IDW = D.tex[0], IDH = D.tex[1], PXM = (G.E1 - G.E0) / IDW;
  function idAt(E, N) {
    if (!ids || !inGrid(E, N)) return 0;
    var c = Math.min(IDW - 1, Math.floor((E - G.E0) / PXM)), r = Math.min(IDH - 1, Math.floor((G.N1 - N) / PXM));
    return Math.round(ids[(r * IDW + c) * 4] / 9);
  }
  function pick(cx, cy) {
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var o = ray.ray.origin, d = ray.ray.direction, t = camera.near, prev = t, step = Math.max(18, cam.d / 320);
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

  /* ---------------- Bedienung ---------------- */
  var tip = $('#tip'), tipT = $('#tipT'), tipA = $('#tipA'), tipB = $('#tipB'), hoverId = 0;
  function overUI(el) { return el && el.closest && el.closest('.card, .nav, button, a, .tip, .legend, .xbar, label, input, .lbl.poi'); }
  window.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX / window.innerWidth * 2 - 1; ptr.y = e.clientY / window.innerHeight * 2 - 1;
    ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.moved = true; ptr.over = e.pointerType === 'mouse' && !overUI(e.target);
    if (drag.on && e.pointerId === drag.id) {
      drag.hd -= (e.clientX - drag.lx) * 0.18; drag.p = clamp(drag.p + (e.clientY - drag.ly) * 0.12, -22, 26);
      drag.lx = e.clientX; drag.ly = e.clientY;
    }
  }, { passive: true });
  document.addEventListener('pointerleave', function () { ptr.over = false; });
  window.addEventListener('pointerdown', function (e) {
    if (EXP.on || e.pointerType !== 'mouse' || e.button !== 0 || overUI(e.target)) return;
    e.preventDefault();
    drag.on = true; drag.id = e.pointerId; drag.lx = e.clientX; drag.ly = e.clientY; drag.sx = e.clientX; drag.sy = e.clientY;
    document.body.style.cursor = 'grabbing';
  });
  window.addEventListener('pointerup', function (e) {
    if (!drag.on) return;
    drag.on = false; document.body.style.cursor = '';
    var moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (moved < 5 && hoverId > 0 && inFinale()) selectCanton(BYID[hoverId].code);
  });


  /* ---------------- Erkunden: Umkreisen und freier Flug ---------------- */
  var DEG = Math.PI / 180, orbit = null, fly = null, keys = {}, flyMul = 1, tapTip = 0;
  var gesture = null, touchPts = {}, joy = { x: 0, y: 0, id: null, sx: 0, sy: 0 }, lookT = { id: null, lx: 0, ly: 0 };
  var joyEl = $('#joy'), joyKnob = $('#joyKnob');
  function clampEN(o) { o.E = clamp(o.E, G.E0 + 2000, G.E1 - 2000); o.N = clamp(o.N, G.N0 + 2000, G.N1 - 2000); }
  function flyToOrbit() {
    // Blickpunkt am Boden in Bildmitte; ohne Treffer ein Punkt vor der Kamera
    var W = window.innerWidth, H = window.innerHeight, hit = pick(W / 2, H / 2), cp = camera.position;
    var E, N, d;
    if (hit) { E = hit.E; N = hit.N; d = cp.distanceTo(new THREE.Vector3(X(E), Y(hit.h), Z(N))); }
    else { var f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); E = cp.x + EC + f.x * 3000; N = NC - (cp.z + f.z * 3000); d = 3000; }
    var o = { E: E, N: N, d: clamp(d, 300, 900000), hd: -fly.yaw / DEG, p: clamp(-fly.pitch / DEG, 4, 89) };
    clampEN(o); return o;
  }
  onExplore = function () {
    if (!cam) return;
    if (EXP.on) {
      if (!orbit) orbit = { E: cam.E, N: cam.N, d: cam.d, hd: cam.hd, p: cam.p };
      if (EXP.mode === 'fly' && !fly) {
        fly = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: -cam.hd * DEG, pitch: -cam.p * DEG, v: new THREE.Vector3() };
      } else if (EXP.mode === 'orbit' && fly) {
        orbit = flyToOrbit(); fly = null;
        cam.E = orbit.E; cam.N = orbit.N; cam.d = orbit.d; cam.hd = orbit.hd; cam.p = orbit.p; cam.ox = 0; cam.oy = 0;
      }
      $('#explHelp').hidden = false;
    } else {
      if (fly) { var o = flyToOrbit(); cam.E = o.E; cam.N = o.N; cam.d = o.d; cam.hd = o.hd; cam.p = o.p; cam.ox = 0; cam.oy = 0; }
      orbit = null; fly = null; keys = {}; gesture = null; joy.id = null; joyEl.hidden = true;
      LBL.forEach(function (L) { L.bw = 0; });
    }
  };
  exploreAt = function (c) {
    if (!cam) return;
    if (!orbit) onExplore();
    if (fly) setExplore(true, 'orbit');
    var k = cantonKey(c);
    orbit.E = k.E; orbit.N = k.N; orbit.d = Math.min(k.d * 0.55, 60000); orbit.p = 42; orbit.hd = k.hd;
  };
  function inField(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  window.addEventListener('keydown', function (e) {
    if (!EXP.on || inField(e)) return;
    keys[e.code] = true;
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    if (e.code === 'KeyF' && !e.repeat && EXP.mode === 'fly' && e.shiftKey) setExplore(true, 'orbit');
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  canvas.addEventListener('contextmenu', function (e) { if (EXP.on) e.preventDefault(); });
  window.addEventListener('wheel', function (e) {
    if (!EXP.on || overUI(e.target)) return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (EXP.mode === 'orbit') orbit.d = clamp(orbit.d * Math.exp(dy * 0.0012), 250, 900000);
    else flyMul = clamp(flyMul * Math.exp(-dy * 0.0012), 0.08, 25);
  }, { passive: false });
  canvas.addEventListener('dblclick', function (e) {
    if (!EXP.on || EXP.mode !== 'orbit') return;
    var hit = pick(e.clientX, e.clientY); if (!hit) return;
    orbit.E = hit.E; orbit.N = hit.N; orbit.d = Math.min(orbit.d, 6000);
  });
  function exploreDown(e) {
    if (!EXP.on || overUI(e.target)) return;
    if (e.pointerType === 'mouse') {
      if (EXP.mode === 'fly') {
        if (fine && canvas.requestPointerLock && !document.pointerLockElement) { try { canvas.requestPointerLock(); } catch (er) {} }
        gesture = { kind: 'look', id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY };
      } else {
        gesture = { kind: (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rot', id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY };
      }
      e.preventDefault();
      return;
    }
    // Touch
    touchPts[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
    if (EXP.mode === 'fly') {
      if (e.clientX < window.innerWidth * 0.42 && joy.id === null) {
        joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = joy.y = 0;
        joyEl.hidden = false; joyEl.style.transform = 'translate(' + (e.clientX - 60) + 'px,' + (e.clientY - 60) + 'px)'; joyKnob.style.transform = '';
      } else if (lookT.id === null) { lookT.id = e.pointerId; lookT.lx = e.clientX; lookT.ly = e.clientY; }
    }
    e.preventDefault();
  }
  function exploreMove(e) {
    if (!EXP.on) return;
    if (e.pointerType === 'mouse') {
      var locked = document.pointerLockElement === canvas;
      if (EXP.mode === 'fly' && locked) { fly.yaw -= e.movementX * 0.0022; fly.pitch = clamp(fly.pitch - e.movementY * 0.0022, -1.5, 1.5); return; }
      if (!gesture || gesture.id !== e.pointerId) return;
      var dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly; gesture.lx = e.clientX; gesture.ly = e.clientY;
      if (EXP.mode === 'fly') { fly.yaw -= dx * 0.004; fly.pitch = clamp(fly.pitch - dy * 0.004, -1.5, 1.5); }
      else if (gesture.kind === 'rot') { orbit.hd -= dx * 0.28; orbit.p = clamp(orbit.p + dy * 0.22, 4, 89); }
      else panBy(dx, dy);
      return;
    }
    var tp = touchPts[e.pointerId]; if (!tp) return;
    var px = tp.x, py = tp.y; tp.x = e.clientX; tp.y = e.clientY;
    if (EXP.mode === 'fly') {
      if (e.pointerId === joy.id) {
        var jx = clamp((e.clientX - joy.sx) / 50, -1, 1), jy = clamp((e.clientY - joy.sy) / 50, -1, 1);
        joy.x = jx; joy.y = -jy; joyKnob.style.transform = 'translate(' + (jx * 34) + 'px,' + (jy * 34) + 'px)';
      } else if (e.pointerId === lookT.id) { fly.yaw -= (e.clientX - px) * 0.005; fly.pitch = clamp(fly.pitch - (e.clientY - py) * 0.005, -1.5, 1.5); }
      return;
    }
    var idsT = Object.keys(touchPts);
    if (idsT.length === 1) { orbit.hd -= (e.clientX - px) * 0.3; orbit.p = clamp(orbit.p + (e.clientY - py) * 0.24, 4, 89); }
    else if (idsT.length >= 2) {
      var a = touchPts[idsT[0]], b = touchPts[idsT[1]];
      var dNow = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (gesture && gesture.kind === 'pinch') {
        if (gesture.d > 0 && dNow > 0) orbit.d = clamp(orbit.d * gesture.d / dNow, 250, 900000);
        panBy(mx - gesture.mx, my - gesture.my);
      }
      gesture = { kind: 'pinch', d: dNow, mx: mx, my: my };
    }
  }
  function exploreUp(e) {
    if (!EXP.on) return;
    if (e.pointerType === 'mouse') {
      if (gesture && gesture.id === e.pointerId) {
        var moved = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
        if (moved < 5 && !document.pointerLockElement) tapAt(e.clientX, e.clientY);
      }
      gesture = null; return;
    }
    var tp = touchPts[e.pointerId];
    if (tp && Math.hypot(tp.x - tp.sx, tp.y - tp.sy) < 8 && Object.keys(touchPts).length === 1 && e.pointerId !== joy.id) tapAt(e.clientX, e.clientY);
    delete touchPts[e.pointerId];
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.hidden = true; }
    if (e.pointerId === lookT.id) lookT.id = null;
    if (Object.keys(touchPts).length < 2 && gesture && gesture.kind === 'pinch') gesture = null;
  }
  ['flyUp', 'flyDown'].forEach(function (k) {
    var b = document.getElementById(k); if (!b) return;
    b.addEventListener('pointerdown', function (e) { keys[k] = true; e.preventDefault(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { keys[k] = false; }); });
  });
  window.addEventListener('pointerdown', exploreDown);
  window.addEventListener('pointermove', exploreMove, { passive: true });
  window.addEventListener('pointerup', exploreUp);
  window.addEventListener('pointercancel', exploreUp);
  function panBy(dx, dy) {
    var th = orbit.hd * DEG, k = 0.536 * orbit.d / window.innerHeight;
    var fE = Math.sin(th), fN = Math.cos(th), rE = Math.cos(th), rN = -Math.sin(th);
    orbit.E -= (rE * dx - fE * dy) * k; orbit.N -= (rN * dx - fN * dy) * k; clampEN(orbit);
  }
  function showPoiTip(hit) {
    var c = POICAT[hit.it.c];
    tipT.innerHTML = '<img src="' + ICONS.url[c.k] + '" alt="">' + esc(hit.it.name || c.one);
    tipA.textContent = hit.it.name ? c.one : 'ohne Namen in den Daten';
    tipB.textContent = swiss(hit.it.h) + ' m ü. M. · ' + swiss(hit.it.E) + ' / ' + swiss(hit.it.N);
    var tx = hit.sx + 16, ty = hit.sy + 16;
    if (tx > window.innerWidth - 250) tx = hit.sx - 250; if (ty > window.innerHeight - 90) ty = hit.sy - 90;
    tip.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; tip.classList.add('on');
  }
  function tapAt(x, y) {
    var hit = poiAt(x, y, window.innerWidth, window.innerHeight);
    if (hit) { showPoiTip(hit); poiMat.uniforms.uHot.value = hit.i; tapTip = performance.now() + 4000;
      if (EXP.mode === 'orbit') { orbit.E = hit.it.E; orbit.N = hit.it.N; orbit.d = Math.min(orbit.d, 4000); } return; }
  }
  labelsEl.addEventListener('click', function (e) {
    var el = e.target.closest('.lbl.poi'); if (!el || !el.__L || !EXP.on) return;
    var L = el.__L, m = MARKS[L.code][L.mi];
    if (EXP.mode === 'fly') setExplore(true, 'orbit');
    orbit.E = m.E; orbit.N = m.N; orbit.d = 2600; orbit.p = 32;
  });
  function stepExplore(dt) {
    if (EXP.mode === 'orbit') {
      var th = orbit.hd * DEG, mv = orbit.d * 0.9 * dt * (keys.ShiftLeft || keys.ShiftRight ? 2.5 : 1);
      var fE = Math.sin(th), fN = Math.cos(th), rE = Math.cos(th), rN = -Math.sin(th);
      var f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      var r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      orbit.E += (fE * f + rE * r) * mv; orbit.N += (fN * f + rN * r) * mv;
      if (keys.KeyQ) orbit.hd -= 70 * dt; if (keys.KeyE) orbit.hd += 70 * dt;
      if (keys.KeyR || keys.PageUp) orbit.d = Math.max(250, orbit.d * Math.exp(-dt * 1.4));
      if (keys.KeyF || keys.PageDown) orbit.d = Math.min(900000, orbit.d * Math.exp(dt * 1.4));
      clampEN(orbit);
      return { E: orbit.E, N: orbit.N, d: orbit.d, hd: orbit.hd, p: orbit.p, ox: 0, oy: 0, t: 0 };
    }
    // freier Flug
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
    fly.y = clamp(fly.y, gY + 18, Y(60000));
    return null;
  }
  function placeFly(W, H) {
    camera.clearViewOffset();
    camera.position.set(fly.x, fly.y, fly.z);
    camera.rotation.set(fly.pitch, fly.yaw, 0, 'YXZ');
    var gE = fly.x + EC, gN = NC - fly.z, gY = inGrid(gE, gN) ? Y(groundAt(gE, gN)) : 0, alt = Math.max(1, fly.y - gY);
    camera.near = clamp(alt * 0.02, 1.5, 400); camera.far = 1200000;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    U.uFogNear.value = Math.max(22000, alt * 14); U.uFogFar.value = U.uFogNear.value * 4.5;
    // für Kantonsanzeige, Nahkacheln und HUD: Punkt am Boden vor der Kamera
    var ahead = Math.min(alt * 2 + 2500, 25000);
    cam.E = gE - Math.sin(fly.yaw) * ahead; cam.N = gN + Math.cos(fly.yaw) * ahead; cam.d = alt * 1.4 + 1500;
    cam.hd = -fly.yaw / DEG; cam.p = -fly.pitch / DEG; cam.alt = alt;
    return alt;
  }

  /* ---------------- Bildschleife ---------------- */
  var HUDtick = 0, tReady = 0, last = performance.now(), navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav a')),
      prog = $('#prog'), mark = $('#mark'), north = $('#north'), docH = 1, ready = false, hiCur = new Array(NK).fill(0), cur = { focus: 0.35, cont: 0.2, cant: 0.25 };
  var tmpV = new THREE.Vector3(), LV = { borders: 1, water: 1, trails: 1 };
  var prCap = small ? 1.5 : 2, frameTimes = [], prLowered = false;
  function applyPR(W, H) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap, Math.sqrt(3.4e6 / (W * H)))); }
  function resize() {
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    applyPR(W, H);
    renderer.setSize(W, H, false);
    measure();
    LBL.forEach(function (L) { L.bw = 0; });
    docH = document.documentElement.scrollHeight;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  window.__onSelect = function () { LBL.forEach(function (L) { L.bw = 0; }); };

  function frame(now) {
    var rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (!TEST && !prLowered && ready && rawDt > 0 && rawDt < 0.5) { frameTimes.push(rawDt); if (frameTimes.length > 90) { frameTimes.shift(); var avg = frameTimes.reduce(function (a, b) { return a + b; }, 0) / frameTimes.length; if (avg > 0.034) { prLowered = true; prCap = Math.max(1, prCap * 0.7); resize(); } } }
    var W = window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    if (!reduce) U.uTime.value = now / 1000;
    var st = story(), want = desiredCam(st);
    var keyA = anchors[st.a].key, keyB = anchors[st.b].key, tb = want.t;
    var heroW = keyA === 'hero' ? 1 - tb : 0;
    if (EXP.on && cam && !orbit && !fly) onExplore();
    var XP = EXP.on && cam && (orbit || fly);
    if (XP) { keyA = keyB = 'explore'; tb = 0; heroW = 0; }
    ptr.sx = lerp(ptr.sx, fine && !XP ? ptr.x : 0, 1 - Math.exp(-dt * 2.5)); ptr.sy = lerp(ptr.sy, fine && !XP ? ptr.y : 0, 1 - Math.exp(-dt * 2.5));
    if (!drag.on && (!inFinale() || XP)) { drag.hd *= Math.exp(-dt * 1.2); drag.p *= Math.exp(-dt * 1.2); }
    if (XP) { var ew = stepExplore(dt); if (ew) want = ew; }
    else {
      want.hd += ptr.sx * 4 + drag.hd + (reduce ? 0 : Math.sin(now / 1000 * 0.09) * 7 * heroW);
      want.p = clamp(want.p - ptr.sy * 2.5 + drag.p, 12, 82);
    }
    if (!cam) { cam = { E: want.E, N: want.N, d: want.d, hd: want.hd, p: want.p, ox: want.ox, oy: want.oy };
      if (!reduce && !TEST && st.a === 0 && st.t < 0.05) { cam.d *= 1.4; cam.hd -= 24; cam.p += 12; } }
    var kf = TEST ? 1 : 1 - Math.exp(-dt * 3.2), kc = XP ? (TEST ? 1 : 1 - Math.exp(-dt * 9)) : kf;
    stepTheme(TEST ? 1 : 1 - Math.exp(-dt * 4));
    var alt = 0;
    if (XP && fly) alt = placeFly(W, H) / VZ;
    else {
      cam.E = lerp(cam.E, want.E, kc); cam.N = lerp(cam.N, want.N, kc);
      cam.d = Math.exp(lerp(Math.log(cam.d), Math.log(want.d), kc));
      cam.hd = angLerp(cam.hd, want.hd, kc); cam.p = lerp(cam.p, want.p, kc); cam.ox = lerp(cam.ox, want.ox, kc); cam.oy = lerp(cam.oy, want.oy, kc);
      placeCamera(cam, W, H);
      alt = camera.position.y / VZ + H0 - groundAt(camera.position.x + EC, NC - camera.position.z);
    }
    var skyA = lerp(skyMat.uniforms.uA.value, XP ? 1 : 0, TEST ? 1 : 1 - Math.exp(-dt * 3));
    skyMat.uniforms.uA.value = skyA; sky.visible = skyA > 0.01; sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.9 / 1000);
    camera.updateMatrixWorld();
    var nowS = now / 1000;

    // Parameter je Kapitel
    var pa = PAR[keyA] || PAR.explore, pb = PAR[keyB] || PAR.explore;
    ['focus', 'cont', 'cant'].forEach(function (k) { cur[k] = lerp(cur[k], lerp(pa[k], pb[k], tb), kf); });
    var hiTarget = new Array(NK).fill(0);
    (HI[keyA] || []).forEach(function (c) { hiTarget[BYCODE[c].id] += 1 - tb; });
    (HI[keyB] || []).forEach(function (c) { hiTarget[BYCODE[c].id] += tb; });
    var finW = XP ? 1 : (keyA === 'kantone' ? 1 - tb : 0) + (keyB === 'kantone' ? tb : 0);
    if (selected) hiTarget[selected.id] = Math.max(hiTarget[selected.id], finW);
    for (var i = 0; i < NK; i++) hiCur[i] = lerp(hiCur[i], hiTarget[i], kf);
    var TU = terrainMat.uniforms;
    TU.uFocus.value = cur.focus; TU.uContourA.value = cur.cont; TU.uHiv.value = hiCur; TU.uHiAny.value = Math.min(1, Math.max.apply(null, hiCur));
    var intro = (reduce || TEST) ? 1 : sstep(0, 1, (now - tReady) / 2600);
    var kl = TEST ? 1 : 1 - Math.exp(-dt * 6);
    LV.borders = lerp(LV.borders, LAYERS.borders ? 1 : 0, kl); LV.water = lerp(LV.water, LAYERS.water ? 1 : 0, kl); LV.trails = lerp(LV.trails, LAYERS.trails ? 1 : 0, kl);
    if (R.nation) { R.nation.material.uniforms.uDraw.value = ready ? intro : 0; R.nation.material.uniforms.uOpacity.value = LV.borders; R.nation.visible = LV.borders > 0.01; }
    if (R.cant) { R.cant.material.uniforms.uOpacity.value = 0.75 * Math.max(cur.cant, 0) * intro * LV.borders; R.cant.visible = LV.borders > 0.01; }
    if (R.rivers) { R.rivers.material.uniforms.uOpacity.value = 0.75 * LV.water; R.shore.material.uniforms.uOpacity.value = 0.55 * LV.water; R.rivers.visible = R.shore.visible = LV.water > 0.01; }
    var routeA = LV.trails * (1 - sstep(140000, 260000, cam.d));
    if (R.routesNat) { R.routesNat.material.uniforms.uOpacity.value = 0.9 * routeA; R.routesNat.visible = routeA > 0.01; }
    if (R.routesReg) { var ra = routeA * (1 - sstep(60000, 110000, cam.d)); R.routesReg.material.uniforms.uOpacity.value = 0.75 * ra; R.routesReg.visible = ra > 0.01; }
    POICAT.forEach(function (c, ci) { poiOn[ci] = lerp(poiOn[ci], LAYERS[c.k] ? 1 : 0, kl); });
    poiMat.uniforms.uPR.value = renderer.getPixelRatio();
    if (tapTip && now > tapTip) { tapTip = 0; poiMat.uniforms.uHot.value = -1; tip.classList.remove('on'); }
    labelsEl.style.visibility = LAYERS.labels ? '' : 'hidden';
    var dk = U.uDark.value > 0.5; hemi.intensity = dk ? 0.62 : 1.1; sun.intensity = dk ? 0.9 : 1.6;
    if (window.SFModels && window.SFModels.setLift && dk !== frame.dk) { window.SFModels.setLift(dk ? 0.2 : 0.35); frame.dk = dk; }
    if (detail) {
      var fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      detail.update({ E: cam.E, N: cam.N, cE: camera.position.x + EC, cN: NC - camera.position.z, cH: Math.max(0, alt), D: XP && fly ? alt * 1.6 + 1500 : Math.min(cam.d, alt * 1.4 + cam.d * 0.3), frustum: fr }, dt, now);
    }
    updateModels(nowS, dt, H);
    // Umriss des gewählten Kantons
    Object.keys(RING).forEach(function (code) {
      var m = RING[code], on = selected && selected.code === code ? 1 : 0;
      m.userData.o = lerp(m.userData.o, on * Math.max(finW, 0.35) * LV.borders, kf);
      m.userData.draw = on ? Math.min(1, m.userData.draw + dt * (reduce || TEST ? 99 : 0.7)) : 0;
      m.material.uniforms.uOpacity.value = m.userData.o; m.material.uniforms.uDraw.value = m.userData.draw * 1.001;
      m.visible = m.userData.o > 0.01;
    });
    if (selected) ringFor(selected.code);

    // Hover
    if ((ptr.moved || drag.on || (ptr.over && HUDtick % 4 === 0)) && !tapTip) {
      ptr.moved = false;
      var ph = (ready && ptr.over && fine && !(gesture && XP) && !document.pointerLockElement) ? poiAt(ptr.cx, ptr.cy, W, H) : null;
      poiMat.uniforms.uHot.value = ph ? ph.i : -1;
      var hit = (ready && ptr.over && fine && !ph && !(XP && fly) && !document.pointerLockElement) ? pick(ptr.cx, ptr.cy) : null;
      if (ph) { showPoiTip(ph); document.body.style.cursor = 'pointer'; hit = null; }
      hoverId = hit ? idAt(hit.E, hit.N) : 0;
      TU.uHover.value = hoverId > 0 ? hoverId : -1;
      if (hit && hoverId > 0 && !drag.on) {
        var c = BYID[hoverId];
        tipT.innerHTML = '<img src="' + wappen(c.code) + '" alt="">' + esc(KC[c.code].name);
        tipA.textContent = km2(c.ha) + ' km² · ' + swiss(c.pop) + ' Einw.';
        tipB.textContent = 'Hier ' + Math.round(hit.h) + ' m · ' + swiss(hit.E) + ' / ' + swiss(hit.N);
        var tx = ptr.cx + 18, ty = ptr.cy + 18;
        if (tx > W - 240) tx = ptr.cx - 240; if (ty > window.innerHeight - 90) ty = ptr.cy - 90;
        tip.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
        tip.classList.add('on');
        document.body.style.cursor = inFinale() ? 'pointer' : '';
      } else if (!ph) { tip.classList.remove('on'); if (!drag.on) document.body.style.cursor = ''; }
    }

    // Beschriftungen: Sichtbarkeit, Verdeckung, Kollision nach Rang
    var wA = 1 - tb, wB = tb, placed = [], selCode = selected ? selected.code : null;
    for (i = 0; i < LBL.length; i++) {
      var L = LBL[i], want_o = 0;
      if (XP) {
        var ldx = L.p.x - camera.position.x, ldz = L.p.z - camera.position.z, ld = Math.sqrt(ldx * ldx + ldz * ldz);
        if (L.kind === 'canton') want_o = sstep(9000, 26000, alt) * (1 - sstep(220000, 320000, ld));
        else if (L.kind === 'lake') want_o = 1 - sstep(90000, 160000, ld);
        else if (L.kind === 'peak') want_o = 1 - sstep(70000, 130000, ld);
        else want_o = (1 - sstep(45000, 70000, ld)) * (LAYERS.marks ? 1 : 0.85);
      } else {
      if (L.s.indexOf(keyA) >= 0) want_o += wA;
      if (L.s.indexOf(keyB) >= 0) want_o += wB;
      }
      if (XP) { /* im Erkunden-Modus zählt nur die Nähe */ }
      else if (L.code && L.code === selCode) {
        if (L.kind === 'poi' || L.kind === 'canton') want_o = Math.max(want_o, finW);
      } else if (L.kind === 'poi' && selCode) want_o *= 1 - finW;
      if (L.kind === 'poi') { var isOn = L.code === selCode && L.mi === selMark; if (isOn !== L.on) { L.on = isOn; L.el.classList.toggle('on', isOn); L.bw = 0; } }
      want_o = sstep(0.35, 0.85, want_o);
      if (!ready) want_o = 0;
      tmpV.copy(L.p).project(camera);
      var vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.08 && Math.abs(tmpV.y) < 1.08;
      if (want_o > 0.01 && vis && (HUDtick + L.n) % 5 === 0) {
        L.occ = false;
        for (var s = 1; s <= 9; s++) {
          var f = s / 10 * 0.7, px = lerp(L.p.x, camera.position.x, f), py = lerp(L.p.y, camera.position.y, f), pz = lerp(L.p.z, camera.position.z, f);
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
        for (var tr = 0; tr < tries.length && !ok; tr++) {
          var top = L.sy - L.bh / 2 + tries[tr], hitL = false;
          for (var q = 0; q < placed.length; q++) { var P = placed[q]; if (left < P[2] + 6 && left + L.bw + 6 > P[0] && top < P[3] + 2 && top + L.bh + 2 > P[1]) { hitL = true; break; } }
          if (!hitL) { ok = true; L.dy = lerp(L.dy || 0, tries[tr], TEST ? 1 : 1 - Math.exp(-dt * 8)); placed.push([left, top, left + L.bw, top + L.bh]); }
        }
        if (!ok) L.want = 0;
      }
      L.o = TEST ? L.want : lerp(L.o, L.want, 1 - Math.exp(-dt * 6));
      if (L.o < 0.01) { if (L.w !== 0) { L.el.style.opacity = '0'; L.w = 0; } continue; }
      var off = (L.kind === 'peak' || L.kind === 'poi') ? 'translate(-5px,-50%)' : 'translate(-50%,-50%)';
      L.el.style.transform = 'translate3d(' + L.sx.toFixed(1) + 'px,' + (L.sy + (L.dy || 0)).toFixed(1) + 'px,0) ' + off;
      L.el.style.opacity = L.o.toFixed(3); L.w = 1;
    }

    // HUD, Fortschritt, Navigation
    HUDtick++;
    if (ready && HUDtick % 4 === 0) {
      if (XP && fly) {
        var fE = fly.x + EC, fN = NC - fly.z, fid = idAt(fE, fN), v = fly.v.length() / 1;
        hudA.textContent = swiss(fly.y / VZ + H0) + ' m ü. M. · ' + swiss(alt) + ' m über Grund';
        hudB.textContent = (fid ? KC[BYID[fid].code].name + ' · ' : '') + swiss(v * 3.6) + ' km/h · Tempo ×' + dec(flyMul, 1);
      } else {
        var hh = groundAt(cam.E, cam.N), id = idAt(cam.E, cam.N);
        hudA.textContent = swiss(cam.E) + ' / ' + swiss(cam.N);
        hudB.textContent = (id ? KC[BYID[id].code].name + ' · ' : '') + Math.round(hh) + ' m ü. M.' + (detail && LAYERS.sat && detail.stats().tiles ? ' · Luftbild' : '');
      }
    }
    north.style.transform = 'rotate(' + (-cam.hd).toFixed(1) + 'deg)';
    var pr = clamp(window.scrollY / Math.max(1, docH - window.innerHeight), 0, 1);
    prog.style.transform = 'scaleX(' + pr.toFixed(4) + ')';
    mark.classList.toggle('on', window.scrollY > window.innerHeight * 0.55);
    var active = XP ? '' : st.t < 0.5 ? keyA : keyB;
    for (i = 0; i < navLinks.length; i++) navLinks[i].classList.toggle('on', navLinks[i].dataset.for === active);

    renderer.render(scene, camera);
    if (!TEST) requestAnimationFrame(frame);
  }
  if (TEST) { window.__frame = function () { frame(performance.now()); return true; }; window.__R = R; window.__RING = RING;
    window.__dbg = { cam: function () { return cam; }, detail: function () { return detail && detail.stats(); }, models: function () { return MODELS.length; }, poi: function () { return POI && POI.list.length; },
      orbit: function (o) { Object.keys(o).forEach(function (k) { orbit[k] = o[k]; }); }, fly: function (o) { if (fly) Object.keys(o).forEach(function (k) { fly[k] = o[k]; }); return fly; } }; }

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

      D.cantons.forEach(function (c) {
        var secs = ['schweiz', 'kantone'], reg = regionOf(c.code); if (reg) secs.push(reg);
        addLabel(KC[c.code].name, 'canton', c.at[0], c.at[1], secs, null, null, { code: c.code });
      });
      var PL = D.places || {};
      (PL.lakes || []).forEach(function (l) {
        var secs = l.big ? ['schweiz', 'kantone'] : [];
        (l.regions || []).forEach(function (r) { secs.push(r); });
        addLabel(l.name, 'lake', l.E, l.N, secs);
      });
      (PL.peaks || []).forEach(function (pk) {
        var secs = pk.big ? ['schweiz'] : []; (pk.regions || []).forEach(function (r) { secs.push(r); });
        addLabel(pk.name, 'peak', pk.E, pk.N, secs, null, swiss(pk.h));
      });
      Object.keys(MARKS).forEach(function (code) {
        MARKS[code].forEach(function (m, mi) {
          addLabel(m.name, 'poi', m.E, m.N, [regionOf(code)], null, null, { code: code, mi: mi });
        });
      });
      LBL_ORDER = LBL.slice().sort(function (a, b) { return PRIO[a.kind] - PRIO[b.kind] || a.n - b.n; });
      LBL.forEach(function (L) { L.el.__L = L; });
      poiP.then(buildPOI).catch(function (e) { console.warn('Punkte', e); });
      routesP.then(buildRoutes).catch(function (e) { console.warn('Routen', e); });
      buildModels();
      onLayer = function (k, v) { if (detail && (k === 'sat' || k === 'trails')) detail.set(k, v); };

      ready = true; tReady = performance.now();
      canvas.style.opacity = '1';
      statusEl.textContent = '';
      hudA.textContent = '';
      resize();
      if (!TEST) requestAnimationFrame(frame);
    } catch (err) {
      console.error(err);
      fail('Das Relief konnte nicht aufgebaut werden. Die Texte bleiben lesbar.');
    }
  })();
}
})();
