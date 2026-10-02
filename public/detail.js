/* Nahansicht: 40-m-Höhenkacheln (public/data/tiles) mit Luftbild SWISSIMAGE und Wanderwegen
   aus dem WMTS von swisstopo. Kachelraster = WMTS-Raster LV95 (Ursprung 2'420'000 / 1'350'000),
   eine Kachel = 10'240 m = 4 x 4 WMTS-Kacheln bei 10 m/px. */
window.SFDetail = function (ctx) {
  'use strict';
  var THREE = window.THREE;
  var X = ctx.X, Y = ctx.Y, Z = ctx.Z, VZ = ctx.VZ;
  var WMTS = 'https://wmts.geo.admin.ch/1.0.0/';
  var LAYER_SAT = 'ch.swisstopo.swissimage', LAYER_TRAIL = 'ch.swisstopo.swisstlm3d-wanderwege';
  var RES = { 19: 20, 20: 10, 21: 5 };
  var CW = 64, CH = 32; // Abdeckungsraster
  var IDX = null, HAVE = {}, OE = 2420000, ON = 1350000, T = 10240, NS = 257, STEP = 40, UNIT = 1;
  var tiles = {}, heightCache = {}, cacheOrder = [];
  var cov = new Uint8Array(CW * CH * 4);
  var covTex = new THREE.DataTexture(cov, CW, CH, THREE.RGBAFormat, THREE.UnsignedByteType);
  covTex.magFilter = covTex.minFilter = THREE.NearestFilter; covTex.needsUpdate = true;
  var state = { sat: true, trails: true };
  var shared = ctx.uniforms; // gemeinsame Uniform-Objekte des Grundreliefs
  var uSatOn = { value: 1 }, uTrailOn = { value: 1 };
  var maxAniso = ctx.renderer.capabilities.getMaxAnisotropy();
  var group = new THREE.Group(); ctx.scene.add(group);

  fetch('data/tiles/index.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j) return;
    IDX = j; OE = j.OE; ON = j.ON; T = j.T; NS = j.n; STEP = j.step; UNIT = j.unit || 1;
    j.tiles.forEach(function (t) { HAVE[t[0] + '_' + t[1]] = true; });
  }).catch(function () {});

  /* ---------- Shader ---------- */
  var NK = 27;
  var VERT = [
    'attribute vec2 aT;',
    'uniform vec4 uGrid;', // E0, N0, E1-E0, N1-N0
    'uniform vec2 uEN;',
    'varying vec2 vUv; varying vec2 vT; varying vec3 vW; varying vec3 vN; varying float vH; varying float vDist;',
    'uniform float uVZ, uH0;',
    'void main(){',
    '  vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normal; vT = aT;',
    '  float E = w.x + uEN.x, N = uEN.y - w.z;',
    '  vUv = vec2((E-uGrid.x)/uGrid.z, (N-uGrid.y)/uGrid.w);',
    '  vH = w.y/uVZ + uH0; vDist = distance(w.xyz, cameraPosition);',
    '  gl_Position = projectionMatrix*viewMatrix*w; }'
  ].join('\n');
  var FRAG = [
    'uniform sampler2D uMaskL; uniform sampler2D uMaskN; uniform sampler2D uSat; uniform sampler2D uTrail;',
    'uniform vec3 uLand, uLit, uShade, uForest, uOut, uWater, uWaterDeep, uContour, uHi, uFog, uSun;',
    'uniform float uFocus, uContourA, uHover, uFogNear, uFogFar, uDark, uHiAny, uSatOn, uTrailOn, uSatA, uTrailA;',
    'uniform float uHiv[' + NK + '];',
    'varying vec2 vUv; varying vec2 vT; varying vec3 vW; varying vec3 vN; varying float vH; varying float vDist;',
    'void main(){',
    '  vec3 ml = texture2D(uMaskL, vUv).rgb;',
    '  float idf = floor(texture2D(uMaskN, vUv).r*255.0/9.0+0.5); int id = int(idf);',
    '  float inside = step(0.5, idf);',
    '  vec3 n = normalize(vN);',
    '  float lam = max(dot(n, uSun), 0.0);',
    '  float k = 1.0 + (lam/uSun.y - 1.0)*1.25;',
    '  vec3 col = k < 1.0 ? mix(uShade, uLand, smoothstep(0.05, 1.0, k)) : mix(uLand, uLit, clamp((k-1.0)*1.6, 0.0, 1.0));',
    '  float water = smoothstep(0.30, 0.70, ml.b);',
    '  col = mix(col, col*uForest, ml.g*0.85);',
    '  float h100=vH/100.0, w100=max(fwidth(h100),1e-5); float l100 = 1.0-clamp(abs(fract(h100-0.5)-0.5)/w100, 0.0, 1.0);',
    '  float h20=vH/20.0, w20=max(fwidth(h20),1e-5); float l20 = 1.0-clamp(abs(fract(h20-0.5)-0.5)/w20, 0.0, 1.0);',
    '  float cont = max(l20*0.08*(1.0-smoothstep(0.05,0.2,w20)), l100*0.22*(1.0-smoothstep(0.1,0.35,w100)))*(1.0-0.45*uDark);',
    '  col = mix(col, uContour, cont*uContourA*(1.0-water));',
    '  col = mix(col, mix(uWater, uWaterDeep, 0.35), water);',
    '  vec4 s = texture2D(uSat, vT);',
    '  float sa = s.a*uSatOn*uSatA;',
    '  vec3 sat = s.rgb*(0.9 + 0.22*clamp(k, 0.0, 1.6)/1.6)*(1.0-0.38*uDark);',
    '  col = mix(col, sat, sa);',
    '  float hv = 0.0; for(int i=0;i<' + NK + ';i++){ if(i==id) hv=uHiv[i]; }',
    '  float hov = (abs(idf-uHover)<0.5) ? inside : 0.0;',
    '  float keep = 1.0 - 0.65*sa;',
    '  col = mix(col, uOut, clamp(uHiAny-hv, 0.0, 1.0)*0.42*inside*(1.0-water)*keep);',
    '  col = mix(col, uHi, clamp(hv*0.07+hov*0.12, 0.0, 0.3)*(1.0-water)*keep);',
    '  col = mix(col, uOut, uFocus*(1.0-inside)*0.5*keep);',
    '  vec4 tr = texture2D(uTrail, vT);',
    '  col = mix(col, tr.rgb, clamp(tr.a*1.15, 0.0, 1.0)*uTrailOn*uTrailA);',
    '  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var EMPTY = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); EMPTY.needsUpdate = true;
  var SUN = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();
  function makeMat() {
    var u = {
      uSat: { value: EMPTY }, uTrail: { value: EMPTY }, uSatA: { value: 0 }, uTrailA: { value: 0 },
      uSatOn: uSatOn, uTrailOn: uTrailOn, uSun: { value: SUN },
      uGrid: { value: new THREE.Vector4(ctx.G.E0, ctx.G.N0, ctx.G.E1 - ctx.G.E0, ctx.G.N1 - ctx.G.N0) },
      uEN: { value: new THREE.Vector2(ctx.EC, ctx.NC) }, uVZ: { value: VZ }, uH0: { value: ctx.H0 }
    };
    ['uMaskL', 'uMaskN', 'uLand', 'uLit', 'uShade', 'uForest', 'uOut', 'uWater', 'uWaterDeep', 'uContour', 'uHi', 'uFog',
     'uFocus', 'uContourA', 'uHover', 'uFogNear', 'uFogFar', 'uDark', 'uHiAny', 'uHiv'].forEach(function (k) { u[k] = shared[k]; });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
  }

  /* ---------- Höhen ---------- */
  function decode(raw) {
    var n = NS * NS, lo = raw.subarray(0, n), hi = raw.subarray(n, 2 * n), q = new Int32Array(n), h = new Float32Array(n);
    for (var j = 0; j < NS; j++) for (var i = 0; i < NS; i++) {
      var k = j * NS + i, zz = lo[k] | (hi[k] << 8), r = (zz >>> 1) ^ -(zz & 1), p = 0;
      if (j === 0) { if (i > 0) p = q[k - 1]; } else if (i === 0) p = q[k - NS]; else p = q[k - 1] + q[k - NS] - q[k - NS - 1];
      q[k] = p + r; h[k] = q[k] * UNIT;
    }
    return h;
  }
  function loadHeights(key) {
    if (heightCache[key]) return Promise.resolve(heightCache[key]);
    return fetch('data/tiles/' + key + '.bin').then(function (r) { if (!r.ok) throw new Error(key); return r.arrayBuffer(); })
      .then(ctx.gunzip).then(function (raw) {
        var h = decode(raw); heightCache[key] = h; cacheOrder.push(key);
        while (cacheOrder.length > 90) delete heightCache[cacheOrder.shift()];
        return h;
      });
  }
  function heightAt(E, N) {
    var i = Math.floor((E - OE) / T), j = Math.floor((ON - N) / T), h = heightCache[i + '_' + j];
    if (!h) return null;
    var fx = (E - OE - i * T) / STEP, fy = (ON - j * T - N) / STEP;
    var c = Math.min(NS - 2, fx | 0), r = Math.min(NS - 2, fy | 0), tx = fx - c, ty = fy - r, k = r * NS + c;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + NS] * (1 - tx) + h[k + NS + 1] * tx) * ty;
  }

  /* ---------- Geometrie mit Schürze gegen Ritzen ---------- */
  function buildGeometry(i, j, h) {
    var n = NS, Ew = OE + i * T, Nn = ON - j * T, nv = n * n, skirt = 4 * (n - 1);
    var pos = new Float32Array((nv + skirt) * 3), nor = new Float32Array((nv + skirt) * 3), tuv = new Float32Array((nv + skirt) * 2);
    var inv = 1 / (2 * STEP);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var k = r * n + c, E = Ew + c * STEP, N = Nn - r * STEP;
      pos[k * 3] = X(E); pos[k * 3 + 1] = Y(h[k]); pos[k * 3 + 2] = Z(N);
      var hl = h[r * n + Math.max(0, c - 1)], hr = h[r * n + Math.min(n - 1, c + 1)];
      var hu = h[Math.max(0, r - 1) * n + c], hd = h[Math.min(n - 1, r + 1) * n + c];
      var dx = (hr - hl) * inv * VZ, dz = (hd - hu) * inv * VZ, L = Math.sqrt(dx * dx + 1 + dz * dz);
      nor[k * 3] = -dx / L; nor[k * 3 + 1] = 1 / L; nor[k * 3 + 2] = -dz / L;
      tuv[k * 2] = c / (n - 1); tuv[k * 2 + 1] = 1 - r / (n - 1);
    }
    var idx = [], q = nv, ring = [];
    for (var c2 = 0; c2 < n - 1; c2++) ring.push(c2);
    for (var r2 = 0; r2 < n - 1; r2++) ring.push(r2 * n + n - 1);
    for (c2 = n - 1; c2 > 0; c2--) ring.push((n - 1) * n + c2);
    for (r2 = n - 1; r2 > 0; r2--) ring.push(r2 * n);
    var drop = 400 * VZ;
    ring.forEach(function (k, m) {
      pos[q * 3] = pos[k * 3]; pos[q * 3 + 1] = pos[k * 3 + 1] - drop; pos[q * 3 + 2] = pos[k * 3 + 2];
      nor[q * 3] = nor[k * 3]; nor[q * 3 + 1] = nor[k * 3 + 1]; nor[q * 3 + 2] = nor[k * 3 + 2];
      tuv[q * 2] = tuv[k * 2]; tuv[q * 2 + 1] = tuv[k * 2 + 1];
      var k2 = ring[(m + 1) % ring.length], q2 = nv + (m + 1) % ring.length;
      idx.push(k, q, k2, k2, q, q2);
      q++;
    });
    var I = new Uint32Array((n - 1) * (n - 1) * 6 + idx.length), t = 0;
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) {
      var a = r * n + c, b = a + 1, d = a + n, e = d + 1;
      I[t++] = a; I[t++] = d; I[t++] = b; I[t++] = b; I[t++] = d; I[t++] = e;
    }
    for (var s = 0; s < idx.length; s++) I[t++] = idx[s];
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(tuv, 2));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    g.computeBoundingSphere();
    return g;
  }

  /* ---------- Bildkacheln ---------- */
  var queue = [], inflight = 0, MAXQ = 10;
  function pump() {
    queue.sort(function (a, b) { return a.prio - b.prio; });
    while (inflight < MAXQ && queue.length) {
      var job = queue.shift();
      if (job.tile.dead) continue;
      inflight++;
      (function (job) {
        var im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
        im.onload = function () { inflight--; if (!job.tile.dead && job.layer.level === job.level) { job.layer.cx.drawImage(im, job.x, job.y, job.s, job.s); job.layer.dirty = true; } pump(); };
        im.onerror = function () { inflight--; pump(); };
        im.src = job.url;
      })(job);
    }
  }
  function requestLayer(tile, kind, level, prio) {
    var L = tile[kind];
    if (L && L.level >= level) return;
    var res = RES[level], per = T / (256 * res), size = kind === 'trail' ? 1024 : Math.min(2048, per * 256);
    if (!L) {
      var cv = document.createElement('canvas'); cv.width = cv.height = size;
      var tex = new THREE.CanvasTexture(cv); tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
      L = tile[kind] = { cv: cv, cx: cv.getContext('2d'), tex: tex, level: level, dirty: false };
      tile.mat.uniforms[kind === 'sat' ? 'uSat' : 'uTrail'].value = tex;
    } else {
      // höhere Stufe: Leinwand vergrössern, alten Inhalt hochskalieren
      var old = L.cv, cv2 = document.createElement('canvas'); cv2.width = cv2.height = size;
      var cx2 = cv2.getContext('2d'); cx2.imageSmoothingEnabled = true; cx2.drawImage(old, 0, 0, size, size);
      L.tex.dispose(); L.cv = cv2; L.cx = cx2; L.level = level;
      L.tex = new THREE.CanvasTexture(cv2); L.tex.anisotropy = maxAniso;
      tile.mat.uniforms[kind === 'sat' ? 'uSat' : 'uTrail'].value = L.tex;
    }
    var layer = kind === 'sat' ? LAYER_SAT : LAYER_TRAIL, ext = kind === 'sat' ? 'jpeg' : 'png';
    var c0 = tile.i * per, r0 = tile.j * per, cell = size / per;
    for (var r = 0; r < per; r++) for (var c = 0; c < per; c++) {
      queue.push({ tile: tile, layer: L, level: level, x: c * cell, y: r * cell, s: cell, prio: prio + (kind === 'trail' ? 0.5 : 0),
        url: WMTS + layer + '/default/current/2056/' + level + '/' + (c0 + c) + '/' + (r0 + r) + '.' + ext });
    }
    pump();
  }

  /* ---------- Kacheln verwalten ---------- */
  function setCov(i, j, v) { if (i >= 0 && i < CW && j >= 0 && j < CH) { var o = (j * CW + i) * 4; cov[o] = v; covTex.needsUpdate = true; } }
  function addTile(i, j, key) {
    var tile = tiles[key] = { i: i, j: j, key: key, mesh: null, mat: makeMat(), sat: null, trail: null, dead: false, ready: false, used: 0 };
    loadHeights(key).then(function (h) {
      if (tile.dead) return;
      tile.mesh = new THREE.Mesh(buildGeometry(i, j, h), tile.mat);
      tile.mesh.renderOrder = 0;
      group.add(tile.mesh); tile.ready = true; setCov(i, j, 255);
    }).catch(function () { tile.failed = true; });
    return tile;
  }
  function dropTile(tile) {
    tile.dead = true; setCov(tile.i, tile.j, 0);
    if (tile.mesh) { group.remove(tile.mesh); tile.mesh.geometry.dispose(); }
    ['sat', 'trail'].forEach(function (k) { if (tile[k]) tile[k].tex.dispose(); });
    tile.mat.dispose();
    delete tiles[tile.key];
  }

  var lastSel = 0, active = 0;
  function update(view, dt, now) {
    // view: { E, N (Blickpunkt), cE, cN, cH (Kamera), D (Abstand Kamera–Boden), frustum }
    uSatOn.value += ((state.sat ? 1 : 0) - uSatOn.value) * Math.min(1, dt * 5);
    uTrailOn.value += ((state.trails ? 1 : 0) - uTrailOn.value) * Math.min(1, dt * 5);
    Object.keys(tiles).forEach(function (k) {
      var t = tiles[k];
      ['sat', 'trail'].forEach(function (kind) { var L = t[kind]; if (L && L.dirty) { L.tex.needsUpdate = true; L.dirty = false; } });
      var u = t.mat.uniforms;
      if (t.sat) u.uSatA.value = Math.min(1, u.uSatA.value + dt * 1.6);
      if (t.trail) u.uTrailA.value = Math.min(1, u.uTrailA.value + dt * 1.6);
    });
    if (!IDX) return;
    if (now - lastSel < 250) return;
    lastSel = now;
    var want = [];
    if (view.D < 75000) {
      var R = Math.min(48000, Math.max(14000, view.D * 1.25));
      var i0 = Math.floor((view.E - R - OE) / T), i1 = Math.floor((view.E + R - OE) / T);
      var j0 = Math.floor((ON - view.N - R) / T), j1 = Math.floor((ON - view.N + R) / T);
      for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
        var key = i + '_' + j; if (!HAVE[key]) continue;
        var cE = OE + (i + 0.5) * T, cN = ON - (j + 0.5) * T;
        var dF = Math.hypot(cE - view.E, cN - view.N);
        if (dF > R + T * 0.71) continue;
        var dC = Math.hypot(Math.hypot(cE - view.cE, cN - view.cN), view.cH);
        var box = new THREE.Box3(new THREE.Vector3(X(cE - T / 2), -2000, Z(cN + T / 2)), new THREE.Vector3(X(cE + T / 2), 12000, Z(cN - T / 2)));
        var vis = !view.frustum || view.frustum.intersectsBox(box);
        if (!vis && dC > T * 1.2) continue;
        want.push({ i: i, j: j, key: key, d: dC, vis: vis });
      }
      want.sort(function (a, b) { return a.d - b.d; });
      want = want.slice(0, ctx.small ? 14 : 30);
    }
    var keep = {};
    var hiCount = 0;
    want.forEach(function (w, rank) {
      keep[w.key] = true;
      var t = tiles[w.key] || addTile(w.i, w.j, w.key);
      var lvl = w.d < 5500 && hiCount < 3 ? 21 : w.d < 22000 ? 20 : 19;
      if (lvl === 21) hiCount++;
      if (t.ready) {
        if (state.sat) requestLayer(t, 'sat', lvl, rank);
        // feinere Stufe verkleinert zeichnen: schmalere Wege
        if (state.trails && w.d < 30000) requestLayer(t, 'trail', w.d < 14000 ? 21 : 20, rank + 2);
      }
    });
    Object.keys(tiles).forEach(function (k) { if (!keep[k]) dropTile(tiles[k]); });
    active = want.length;
    // überzählige Bildaufträge verwerfen
    queue = queue.filter(function (q) { return !q.tile.dead; });
  }

  return {
    update: update,
    heightAt: heightAt,
    covTex: covTex,
    cov: { OE: function () { return OE; }, ON: function () { return ON; }, T: function () { return T; } },
    set: function (k, v) { state[k] = v; },
    stats: function () { return { tiles: Object.keys(tiles).length, active: active, queue: queue.length, inflight: inflight }; }
  };
};
