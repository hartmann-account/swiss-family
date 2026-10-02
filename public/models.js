/* Wahrzeichen als kleine, animierte Low-Poly-Modelle (three.js r160, globales THREE).

Alles prozedural aus Grundkörpern, ohne Texturen aus dem Netz (nur kleine Canvas-Texturen für
Fahnen, Zifferblätter und Wasser). Ursprung am Boden in der Mitte der Grundfläche, +Y oben, Meter.
Fundamente reichen unter den Boden, damit Modelle auch am Hang nicht schweben.
Statische Teile eines Modells sind ein einziges Mesh mit Vertexfarben (gecacht je Typ, Farben, Seed);
Bewegtes (Fahnen, Zeiger, Bahnen, Boote, Wasser, Partikel) sind eigene, kleine Objekte.

  SFModels.create(typ, { brand, accent, seed }) -> { group, update(t, dt) }   t in Sekunden
  SFModels.markType['ZH:0']                     -> Typ für KANTONE.C.ZH.marks[0]
  SFModels.setLift(v)                           Aufhellung der Schattenseiten (Standard 0.35, nachts kleiner)
Testseite: tools/models_gallery.html
*/
window.SFModels = (function () {
  'use strict';
  var T = null, PI = Math.PI, TAU = PI * 2, H2 = PI / 2;
  var P = {
    wall: '#EDE6DA', wall2: '#D9CFC0', sand: '#D8C8A8', stone: '#BDB4A6', stone2: '#A39A8C',
    rock: '#8C8479', rock2: '#7A7268', rock3: '#9C9488', lime: '#B9B1A4',
    slate: '#5B4A42', tile: '#9C4A32', tile2: '#B05A3C', copper: '#6FA58C',
    wood: '#8A5A3A', woodD: '#5E3D29', woodL: '#B98A5E',
    water: '#3A8DCB', grass: '#5E8C4A', grass2: '#6E9A52', grassD: '#4A7340', conifer: '#2F5A3A', conifer2: '#3B6B42',
    snow: '#F2F5F7', snow2: '#E1E9EF', ice: '#CFE6F2', ice2: '#A9D0E6',
    win: '#3E3C42', winL: '#F2D27A', dark: '#2A2726', metal: '#B8BEC4', steel: '#7C8A94', gold: '#D9A93A',
    bronze: '#5E6B58', red: '#D52B1E', white: '#FFFFFF', skin: '#E2B48F', path: '#CDBB98', soil: '#9A8A60', vine: '#4F7A3A'
  };
  var TIME = { value: 0 }, VIEW_H = { value: 800 }, LIFT = { value: .35 };
  var GEO = {}, MAT = {}, TEX = {}, STATIC = {}, COL = {};
  var V, V2, W, M4, Q, E, SC, PO, UP, VA, VB;

  function init() {
    if (T) return;
    T = window.THREE;
    V = new T.Vector3(); V2 = new T.Vector2(); W = new T.Matrix4(); M4 = new T.Matrix4(); Q = new T.Quaternion();
    E = new T.Euler(); SC = new T.Vector3(); PO = new T.Vector3(); UP = new T.Vector3(0, 1, 0);
    VA = new T.Vector3(); VB = new T.Vector3();
  }

  /* ---------- Zufall, Farben ---------- */
  function rng(seed) {
    var a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function color(c) { return COL[c] || (COL[c] = new T.Color(c)); }
  function shade(c, f) { var k = c + '*' + f; return COL[k] ? k : (COL[k] = color(c).clone().multiplyScalar(f), k); }

  /* ---------- Einheitskörper (nicht indiziert, nur Positionen) ---------- */
  function mat(x, y, z, sx, sy, sz, ry, rx, rz) {
    E.set(rx || 0, ry || 0, rz || 0, 'YXZ'); Q.setFromEuler(E);
    PO.set(x, y, z); SC.set(sx, sy, sz);
    return M4.compose(PO, Q, SC);
  }
  function G(k) {
    var g = GEO[k];
    if (g) return g;
    var p = k.split(':'), n = +p[1] || 8, a = +p[2];
    switch (p[0]) {
      case 'box': g = new T.BoxGeometry(1, 1, 1).translate(0, .5, 0); break;
      case 'cyl': g = new T.CylinderGeometry(1, 1, 1, n).translate(0, .5, 0); break;
      case 'frus': g = new T.CylinderGeometry(a, 1, 1, n).translate(0, .5, 0); break;
      case 'cone': g = new T.ConeGeometry(1, 1, n).translate(0, .5, 0); break;
      case 'pyr': g = new T.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(PI / 4).translate(0, .5, 0); break;
      case 'sqfr': g = new T.CylinderGeometry(+p[1] * Math.SQRT1_2, Math.SQRT1_2, 1, 4).rotateY(PI / 4).translate(0, .5, 0); break;
      case 'ico': g = new T.IcosahedronGeometry(1, 0); break;
      case 'oct': g = new T.OctahedronGeometry(1, 0); break;
      case 'sph': g = new T.SphereGeometry(1, n, Math.max(3, n >> 1)); break;
      case 'dome': g = new T.SphereGeometry(1, n, Math.max(2, n >> 2), 0, TAU, 0, H2); break;
      case 'quad': g = new T.PlaneGeometry(1, 1).translate(0, .5, 0); break;
      case 'gable': g = roofGeo(.5); break;
      case 'hip': g = roofGeo(+p[1] * .5); break;
      case 'door': g = doorGeo(+p[1]); break;
      case 'arch': g = archGeo(+p[1], +p[2], +p[3]); break;
      case 'torus': g = new T.TorusGeometry(1, a || .25, 4, n); break;
    }
    if (g.index) g = g.toNonIndexed();
    for (var at in g.attributes) if (at !== 'position') g.deleteAttribute(at);
    return (GEO[k] = g);
  }
  // Satteldach (r = .5) oder Walmdach (r < .5): First entlang x, Grundfläche 1 x 1, Höhe 1
  function roofGeo(r) {
    var A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [.5, 0, .5], D = [-.5, 0, .5], R1 = [-r, 1, 0], R2 = [r, 1, 0];
    var f = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2, A, B, C, A, C, D], a = [];
    f.forEach(function (v) { a.push(v[0], v[1], v[2]); });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(a, 3)); return g;
  }
  // Rundbogenöffnung als Fläche (Breite 1, Rechteck bis k, darüber Halbkreis), zeigt nach +z
  function doorGeo(k) {
    var s = new T.Shape(); s.moveTo(-.5, 0); s.lineTo(.5, 0); s.lineTo(.5, k); s.absarc(0, k, .5, 0, PI, false); s.lineTo(-.5, 0);
    return new T.ShapeGeometry(s, 4);
  }
  // Bogenfeld zwischen zwei halben Pfeilern: Spannweite s, Pfeiler p, Höhe h über dem Kämpfer, Tiefe 1
  function archGeo(s, p, h) {
    var o = s / 2 + p / 2, sh = new T.Shape();
    sh.moveTo(-o, 0); sh.lineTo(-s / 2, 0); sh.absarc(0, 0, s / 2, PI, 0, true); sh.lineTo(o, 0); sh.lineTo(o, h); sh.lineTo(-o, h); sh.lineTo(-o, 0);
    return new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -.5);
  }

  /* ---------- Sammler für statische Teile ---------- */
  function Builder() { this.p = []; this.c = []; this.m = new T.Matrix4(); this.st = []; }
  Builder.prototype = {
    at: function (x, y, z, ry, s) { this.st.push(this.m.clone()); this.m.multiply(mat(x, y, z, s || 1, s || 1, s || 1, ry || 0)); return this; },
    end: function () { this.m = this.st.pop(); return this; },
    put: function (g, m, c) {
      var a = g.attributes.position.array, p = this.p, cc = this.c, k = color(c), flip;
      W.multiplyMatrices(this.m, m); flip = W.determinant() < 0;
      for (var i = 0; i < a.length; i += 9) {
        for (var j = 0; j < 3; j++) {
          var o = i + (flip && j ? (3 - j) * 3 : j * 3);
          V.set(a[o], a[o + 1], a[o + 2]).applyMatrix4(W);
          p.push(V.x, V.y, V.z); cc.push(k.r, k.g, k.b);
        }
      }
      return this;
    },
    // Dreieck aus lokalen Punkten; mit hint wird die Vorderseite in Richtung hint gedreht
    tri: function (a, b, c, col, hint) {
      if (hint) {
        VA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); VB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); VA.cross(VB);
        if (VA.x * hint[0] + VA.y * hint[1] + VA.z * hint[2] < 0) { var t = b; b = c; c = t; }
      }
      var k = color(col), p = this.p, cc = this.c;
      [a, b, c].forEach(function (q) { V.set(q[0], q[1], q[2]).applyMatrix4(this.m); p.push(V.x, V.y, V.z); cc.push(k.r, k.g, k.b); }, this);
      return this;
    },
    quad4: function (a, b, c, d, col, hint) { return this.tri(a, b, c, col, hint).tri(a, c, d, col, hint); },
    box: function (x, y, z, w, h, d, c, ry) { return this.put(G('box'), mat(x, y, z, w, h, d, ry), c); },
    cyl: function (x, y, z, r, h, c, n, ry) { return this.put(G('cyl:' + (n || 8)), mat(x, y, z, r, h, r, ry), c); },
    frus: function (x, y, z, r0, r1, h, c, n, ry) { return this.put(G('frus:' + (n || 8) + ':' + (r1 / r0).toFixed(2)), mat(x, y, z, r0, h, r0, ry), c); },
    cone: function (x, y, z, r, h, c, n, ry) { return this.put(G('cone:' + (n || 8)), mat(x, y, z, r, h, r, ry), c); },
    pyr: function (x, y, z, w, h, d, c, ry) { return this.put(G('pyr'), mat(x, y, z, w, h, d, ry), c); },
    sqfr: function (x, y, z, w, h, d, top, c, ry) { return this.put(G('sqfr:' + top.toFixed(2)), mat(x, y, z, w, h, d, ry), c); },
    gable: function (x, y, z, l, h, d, c, ry) { return this.put(G('gable'), mat(x, y, z, l, h, d, ry), c); },
    hip: function (x, y, z, l, h, d, c, ry, k) { return this.put(G('hip:' + (k == null ? .5 : k).toFixed(2)), mat(x, y, z, l, h, d, ry), c); },
    ball: function (x, y, z, r, c, n) { return this.put(G(n ? 'sph:' + n : 'ico'), mat(x, y, z, r, r, r), c); },
    ell: function (x, y, z, rx, ry_, rz, c, ry, n) { return this.put(G(n ? 'sph:' + n : 'ico'), mat(x, y, z, rx, ry_, rz, ry), c); },
    dome: function (x, y, z, r, h, c, n) { return this.put(G('dome:' + (n || 8)), mat(x, y, z, r, h, r), c); },
    quad: function (x, y, z, w, h, c, ry) { return this.put(G('quad'), mat(x, y, z, w, h, 1, ry), c); },
    door: function (x, y, z, w, h, c, ry) { var k = Math.max(0, Math.round((h / w - .5) * 4) / 4); return this.put(G('door:' + k.toFixed(2)), mat(x, y, z, w, w, 1, ry), c); },
    disc: function (x, y, z, r, c, ry) { return this.put(G('cyl:12'), mat(x, y, z, r, .5, r, ry, H2), c); },
    arch: function (x, y, z, s, p, h, t, c, ry) { return this.put(G('arch:' + s.toFixed(1) + ':' + p.toFixed(1) + ':' + h.toFixed(1)), mat(x, y, z, 1, 1, t, ry), c); },
    // Balken von a nach b mit Kantenlänge t
    beam: function (a, b, t, c) {
      VA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); var l = VA.length(); VA.divideScalar(l || 1);
      Q.setFromUnitVectors(UP, VA); PO.set(a[0], a[1], a[2]); SC.set(t, l, t);
      return this.put(G('box'), M4.compose(PO, Q, SC), c);
    },
    geometry: function () {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
      g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    },
    mesh: function () { return new T.Mesh(this.geometry(), vcMat()); }
  };

  /* ---------- Materialien ---------- */
  // Alle Materialien hellen ihre Schattenseiten etwas auf (uLift * Grundfarbe), damit die kleinen Modelle
  // unter dem Nordwestlicht der Karte lesbar bleiben; die Stärke lässt sich über SFModels.setLift ändern.
  function std(o, wave) {
    o.flatShading = true; o.roughness = o.roughness == null ? .85 : o.roughness; o.metalness = 0;
    var m = new T.MeshStandardMaterial(o);
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uLift = LIFT;
      sh.fragmentShader = 'uniform float uLift;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uLift;');
      if (wave) wave(sh);
    };
    m.customProgramCacheKey = function () { return wave ? 'sf-flag' : 'sf-lift'; };
    return m;
  }
  function vcMat() { return MAT.vc || (MAT.vc = std({ vertexColors: true })); }
  function solid(c) { return MAT['s' + c] || (MAT['s' + c] = std({ color: c })); }
  function canvasTex(key, w, h, draw) {
    if (TEX[key]) return TEX[key];
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    var t = new T.CanvasTexture(cv); t.anisotropy = 4;
    return (TEX[key] = t);
  }

  /* ---------- Fahnen: Tuch wird im Vertex-Shader bewegt ---------- */
  function flagGeo() { return GEO.flag || (GEO.flag = new T.PlaneGeometry(1, 1, 8, 3).translate(.5, -.5, 0)); }
  function flagTex(kind, a, b, c) {
    return canvasTex('flag|' + kind + '|' + a + '|' + b + '|' + c, 64, 64, function (x, w, h) {
      x.fillStyle = a; x.fillRect(0, 0, w, h);
      if (kind === 'canton') { x.fillStyle = b; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(0, h); x.fill(); }
      else if (kind === 'ch') { x.fillStyle = '#FFFFFF'; x.fillRect(26, 13, 12, 38); x.fillRect(13, 26, 38, 12); }
      else if (kind === 'h') { x.fillStyle = b; x.fillRect(0, h / 3, w, h / 3); x.fillStyle = c || a; x.fillRect(0, h * 2 / 3, w, h / 3 + 1); }
      else if (kind === 'v') { x.fillStyle = b; x.fillRect(w / 3, 0, w / 3, h); x.fillStyle = c || a; x.fillRect(w * 2 / 3, 0, w / 3 + 1, h); }
      else if (kind === 'un') { x.strokeStyle = '#FFFFFF'; x.lineWidth = 4; x.beginPath(); x.arc(32, 32, 15, 0, TAU); x.stroke(); x.fillStyle = '#FFFFFF'; x.fillRect(30, 17, 4, 30); x.fillRect(17, 30, 30, 4); }
      else if (kind === 'pennant') {
        x.clearRect(0, 0, w, h); x.fillStyle = a; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h / 2); x.lineTo(0, h); x.fill();
        x.fillStyle = b; x.beginPath(); x.moveTo(0, h * .36); x.lineTo(w * .7, h / 2); x.lineTo(0, h * .64); x.fill();
      }
    });
  }
  function flagMat(kind, a, b, c) {
    var key = 'f|' + kind + '|' + a + '|' + b + '|' + c;
    if (MAT[key]) return MAT[key];
    var m = std({ map: flagTex(kind, a, b, c), side: T.DoubleSide, alphaTest: kind === 'pennant' ? .5 : 0 }, function (sh) {
      sh.uniforms.uTime = TIME;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 sfO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
        'float sfP = sfO.x * 0.013 + sfO.z * 0.021, sfK = position.x;',
        'transformed.z += (sin(sfK * 6.0 - uTime * 5.0 + sfP) * 0.07 + sin(sfK * 2.5 - uTime * 2.1 + sfP) * 0.05) * sfK;',
        'transformed.y += sin(sfK * 4.0 - uTime * 3.3 + sfP) * 0.02 * sfK;'
      ].join('\n'));
    });
    return (MAT[key] = m);
  }
  // Fahne mit Mast: Fuss bei (x, y, z), Masthöhe h, Tuchbreite w
  function flag(ctx, x, y, z, h, w, kind, a, b, c, ry) {
    kind = kind || 'canton';
    if (kind === 'canton' || kind === 'pennant') { a = a || ctx.brand; b = b || ctx.accent; }
    if (kind === 'ch') a = P.red;
    if (kind === 'un') a = '#4B92DB';
    ctx.b.cyl(x, y, z, Math.max(.18, w * .035), h + w * .06, P.metal, 5);
    var f = new T.Mesh(flagGeo(), flagMat(kind, a, b, c));
    var asp = kind === 'ch' ? 1 : kind === 'pennant' ? .34 : .66;
    f.scale.set(w, w * asp, w); f.position.set(x, y + h, z); f.rotation.y = ry == null ? ctx.wind : ry;
    ctx.g.add(f);
    return f;
  }

  /* ---------- Uhren ---------- */
  function clockMat(face, mark) {
    var key = 'clock|' + face + '|' + mark;
    if (MAT[key]) return MAT[key];
    var t = canvasTex(key, 64, 64, function (x) {
      x.fillStyle = mark; x.beginPath(); x.arc(32, 32, 32, 0, TAU); x.fill();
      x.fillStyle = face; x.beginPath(); x.arc(32, 32, 28, 0, TAU); x.fill();
      x.fillStyle = mark;
      for (var i = 0; i < 12; i++) { x.save(); x.translate(32, 32); x.rotate(i * TAU / 12); x.fillRect(-1.5, -27, 3, i % 3 ? 5 : 9); x.restore(); }
    });
    return (MAT[key] = std({ map: t }));
  }
  // Zifferblatt mit Zeigern, Mitte (x, y, z), Radius r, Blickrichtung ry (0 = +z)
  function clock(ctx, x, y, z, r, ry, face, mark, hand, speed) {
    var g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
    var d = new T.Mesh(GEO.circle || (GEO.circle = new T.CircleGeometry(1, 20)), clockMat(face || '#F4F1E8', mark || '#2A2726'));
    d.scale.set(r, r, 1); d.position.z = .25; g.add(d);
    var hg = GEO.hand || (GEO.hand = new T.BoxGeometry(1, 1, 1).translate(0, .4, 0));
    var hh = new T.Mesh(hg, solid(hand || P.dark)), mh = new T.Mesh(hg, solid(hand || P.dark));
    hh.scale.set(r * .14, r * .62, .3); hh.position.z = .55;
    mh.scale.set(r * .09, r * .95, .3); mh.position.z = .8;
    g.add(hh, mh); ctx.g.add(g);
    var off = ctx.rnd() * 40;
    ctx.A.push(function (t) { var a = (t + off) * (speed || 1) * .35; mh.rotation.z = -a; hh.rotation.z = -a / 12 - 1.2; });
    return g;
  }

  /* ---------- Wasser ---------- */
  function waterTex(flow) {
    return canvasTex(flow ? 'flow' : 'water', 128, 128, function (x, w, h) {
      var r = rng(flow ? 7 : 3);
      x.fillStyle = '#DADADA'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < (flow ? 70 : 40); i++) {
        var px = r() * w, py = r() * h, l = flow ? 20 + r() * 40 : 8 + r() * 20;
        x.fillStyle = r() < .6 ? '#FFFFFF' : '#C2C2C2'; x.globalAlpha = .7;
        x.fillRect(px, py, l, flow ? 1.5 : 2); x.fillRect(px - w, py, l, flow ? 1.5 : 2);
      }
      x.globalAlpha = 1;
    });
  }
  function waterMat(flow) {
    var k = flow ? 'wflow' : 'wlake';
    if (MAT[k]) return MAT[k];
    var t = waterTex(flow); t.wrapS = t.wrapT = T.RepeatWrapping;
    return (MAT[k] = std({ color: '#47A0DE', map: t, roughness: .4 }));
  }
  function animateShared(t) {
    if (TEX.water) TEX.water.offset.set(t * .006, t * .011);
    if (TEX.flow) TEX.flow.offset.set(-t * .3, 0);
  }
  // Wasserfläche aus Dreiecken; jedes Dreieck wird nach oben gedreht. uv in Metern / 30
  function waterMesh(ctx, pos, uv, flow) {
    for (var i = 0; i < pos.length; i += 9) {
      var cy = (pos[i + 5] - pos[i + 2]) * (pos[i + 6] - pos[i]) - (pos[i + 3] - pos[i]) * (pos[i + 8] - pos[i + 2]);
      if (cy < 0) {
        for (var j = 0; j < 3; j++) { var t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; }
        var k = i / 9 * 6;
        for (j = 0; j < 2; j++) { t = uv[k + 2 + j]; uv[k + 2 + j] = uv[k + 4 + j]; uv[k + 4 + j] = t; }
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    var m = new T.Mesh(g, waterMat(flow)); ctx.g.add(m); return m;
  }
  function waterRect(ctx, x0, z0, x1, z1, y, flow, along) {
    var p = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], uv = [];
    for (var i = 0; i < p.length; i += 3) along === 'z' ? uv.push(p[i + 2] / 30, p[i] / 30) : uv.push(p[i] / 30, p[i + 2] / 30);
    return waterMesh(ctx, p, uv, flow);
  }
  // Polygon aus Punkten [x, z] als Fächer um den Schwerpunkt
  function waterPoly(ctx, pts, y) {
    var cx = 0, cz = 0, p = [], uv = [];
    pts.forEach(function (q) { cx += q[0] / pts.length; cz += q[1] / pts.length; });
    for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; p.push(cx, y, cz, a[0], y, a[1], b[0], y, b[1]); }
    for (i = 0; i < p.length; i += 3) uv.push(p[i] / 30, p[i + 2] / 30);
    return waterMesh(ctx, p, uv, false);
  }
  // Fluss als Band entlang einer Mittellinie [[x, z, Breite], ...]; fliesst vom ersten zum letzten Punkt
  function river(ctx, line, y) {
    var p = [], uv = [], s = 0, L = [], R = [], S = [];
    for (var i = 0; i < line.length; i++) {
      var a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      var nx = -dz / l, nz = dx / l, w = line[i][2] / 2;
      if (i) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      L.push([line[i][0] + nx * w, line[i][1] + nz * w]); R.push([line[i][0] - nx * w, line[i][1] - nz * w]); S.push(s);
    }
    for (i = 0; i < line.length - 1; i++) {
      [[L[i], S[i], 1], [R[i], S[i], 0], [R[i + 1], S[i + 1], 0], [L[i], S[i], 1], [R[i + 1], S[i + 1], 0], [L[i + 1], S[i + 1], 1]].forEach(function (v) {
        p.push(v[0][0], y, v[0][1]); uv.push(v[1] / 30, v[2] * line[0][2] / 30);
      });
    }
    return waterMesh(ctx, p, uv, true);
  }

  /* ---------- Partikel: Bahn im Vertex-Shader, Grösse in Metern ---------- */
  var PVERT = [
    'uniform float uTime; uniform float uVH; uniform float uSize; uniform vec4 uP;',
    'attribute vec4 aSeed; varying float vA;',
    'void main() {',
    '  vec3 p = position; float a = 1.0, sz = 1.0, ph = fract(aSeed.x + uTime / uP.w);',
    '  /*BODY*/',
    '  vA = a;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_PointSize = max(1.0, uSize * sz * length(modelMatrix[0].xyz) * projectionMatrix[1][1] * uVH * 0.5 / max(1.0, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var PFRAG = 'uniform vec3 uColor; uniform float uOpacity; varying float vA;\n' +
    'void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(uColor, uOpacity * vA * (1.0 - d * 3.2)); }';
  var PBODY = {
    // uP: Höhe, Abdrift x, Streuung, Periode
    jet: 'float H = uP.x * (0.78 + 0.22 * aSeed.y), an = aSeed.z * 6.2832, r = uP.z * ph * ph * (0.3 + aSeed.w);' +
         'p += vec3(cos(an) * r + uP.y * ph * ph, 4.0 * H * ph * (1.0 - ph), sin(an) * r); a = 1.0 - smoothstep(0.8, 1.0, ph); sz = 0.6 + 1.6 * ph;',
    // uP: Fallhöhe, Vorwärtsweg, -, Periode
    fall: 'p += vec3((aSeed.y - 0.5) * 3.0 * ph, -uP.x * ph * ph, uP.y * ph * (0.7 + 0.6 * aSeed.z));' +
          'a = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.85, 1.0, ph)); sz = 0.7 + 0.8 * ph;',
    // uP: Streuung x, Steighöhe, Streuung z, Periode
    mist: 'p += vec3((aSeed.y - 0.5) * uP.x * ph, uP.y * ph, (aSeed.z - 0.5) * uP.z * ph); a = sin(ph * 3.1416); sz = 0.8 + 1.6 * ph;',
    // uP: Steighöhe, Drift x, Drift z, Periode
    smoke: 'p += vec3(uP.y * ph * ph + (aSeed.y - 0.5) * 3.0 * ph, uP.x * ph, uP.z * ph * ph + (aSeed.z - 0.5) * 3.0 * ph);' +
           'a = sin(ph * 3.1416) * (1.0 - 0.5 * ph); sz = 0.5 + 2.0 * ph;',
    // uP: Fallhöhe, -, -, Periode
    drip: 'float q = max(0.0, (ph - 0.3) / 0.7); p.y -= uP.x * q * q; a = 1.0 - smoothstep(0.9, 1.0, ph); sz = 0.8;',
    // uP: Länge x, Steigen, Streuung z, Periode
    cloud: 'p += vec3(uP.x * ph, uP.y * ph + sin(ph * 6.0 + aSeed.y * 6.0) * 2.0, (aSeed.z - 0.5) * uP.z * ph);' +
           'a = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.55, 1.0, ph)); sz = 0.8 + 2.2 * ph;',
    // uP: Sprunghöhe, Drift x, -, Periode
    spray: 'p += vec3(uP.y * ph, uP.x * 4.0 * ph * (1.0 - ph), (aSeed.y - 0.5) * 2.0 * ph); a = 1.0 - ph; sz = 0.6 + ph;'
  };
  // bases: Startpunkte [[x, y, z], ...] oder Funktion(i, rnd) -> [x, y, z]
  function particles(ctx, kind, n, bases, size, col, opacity, prm) {
    var g = new T.BufferGeometry(), pos = new Float32Array(n * 3), sd = new Float32Array(n * 4), r = rng(n * 131 + kind.length);
    for (var i = 0; i < n; i++) {
      var b = typeof bases === 'function' ? bases(i, r) : bases[i % bases.length];
      pos[i * 3] = b[0]; pos[i * 3 + 1] = b[1]; pos[i * 3 + 2] = b[2];
      for (var j = 0; j < 4; j++) sd[i * 4 + j] = r();
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new T.BufferAttribute(sd, 4));
    g.computeBoundingSphere(); g.boundingSphere.radius += Math.max(prm[0], prm[1], prm[2]) * 1.2;
    var m = new T.ShaderMaterial({
      uniforms: { uTime: TIME, uVH: VIEW_H, uSize: { value: size }, uP: { value: new T.Vector4().fromArray(prm) },
                  uColor: { value: color(col).clone() }, uOpacity: { value: opacity } },
      vertexShader: PVERT.replace('/*BODY*/', PBODY[kind]), fragmentShader: PFRAG, transparent: true, depthWrite: false
    });
    var pts = new T.Points(g, m);
    pts.onBeforeRender = function (rd) { rd.getDrawingBufferSize(V2); VIEW_H.value = V2.y; };
    ctx.g.add(pts);
    return pts;
  }

  /* ---------- Gelände ---------- */
  // Berg aus Ringen [Höhenanteil, Radiusanteil]; paint(fy, ny, rnd) gibt die Farbe je Fläche
  function mountain(ctx, o) {
    var b = ctx.b, rnd = o.rnd || ctx.rnd, n = o.n || 9, R = o.r, H = o.h, sx = o.sx || 1, sz = o.sz || 1;
    var rings = o.rings || [[0, 1], [.26, .74], [.5, .48], [.72, .27], [.88, .11]];
    var jit = o.jit == null ? .13 : o.jit, pts = [], up = [], skirt = o.skirt == null ? 20 : o.skirt, x0 = o.x || 0, z0 = o.z || 0;
    var paint = o.paint || paintRock;
    for (var j = 0; j < rings.length; j++) {
      var ring = [], f = rings[j][0], rr = rings[j][1], tw = j ? (rnd() - .5) * .25 : 0;
      for (var i = 0; i < n; i++) {
        var th = TAU * i / n + (o.rot || 0) + (j ? tw + (rnd() - .5) * .2 : 0);
        var ridge = o.ridges && i % 2 ? o.ridges : 1;
        var rad = R * rr * ridge * (1 + (rnd() - .5) * 2 * jit * (j ? 1 : .4));
        var fb = Math.pow(f, o.bend || 1);
        ring.push([x0 + Math.sin(th) * rad * sx + (o.lx || 0) * fb, j ? H * f * (1 + (rnd() - .5) * .06) : 0, z0 + Math.cos(th) * rad * sz + (o.lz || 0) * fb]);
      }
      pts.push(ring);
    }
    var apex = [x0 + (o.lx || 0), H, z0 + (o.lz || 0)];
    function face(a, c, d) {
      VA.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); VB.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); VA.cross(VB).normalize();
      var cy = (a[1] + c[1] + d[1]) / 3, col = paint(cy / H, VA.y, rnd, cy);
      b.tri(a, c, d, col); if (VA.y > .02) up.push([a, c, d]);
    }
    for (j = 0; j < pts.length - 1; j++) {
      for (i = 0; i < n; i++) {
        var a = pts[j][i], c = pts[j][(i + 1) % n], d = pts[j + 1][(i + 1) % n], e = pts[j + 1][i];
        face(a, c, d); face(a, d, e);
      }
    }
    var last = pts[pts.length - 1];
    if (o.flat) {
      var cy = 0, cx = 0, cz = 0; last.forEach(function (q) { cx += q[0] / n; cy += q[1] / n; cz += q[2] / n; });
      apex = [cx, cy, cz];
    }
    for (i = 0; i < n; i++) face(last[i], last[(i + 1) % n], apex);
    if (skirt) for (i = 0; i < n; i++) {
      a = pts[0][i]; c = pts[0][(i + 1) % n];
      b.quad4([a[0], -skirt, a[2]], [c[0], -skirt, c[2]], c, a, o.skirtCol || paint(0, .3, rnd, 0));
    }
    // Höhe der Oberfläche an (x, z), 0 ausserhalb
    function heightAt(x, z) {
      var best = -1e9;
      for (var k = 0; k < up.length; k++) {
        var t = up[k], A = t[0], B = t[1], C = t[2];
        var d0 = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
        if (Math.abs(d0) < 1e-9) continue;
        var l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d0;
        var l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d0, l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) best = Math.max(best, l1 * A[1] + l2 * B[1] + l3 * C[1]);
      }
      return best < -1e8 ? 0 : best;
    }
    return { heightAt: heightAt, apex: apex, top: apex[1] };
  }
  function paintRock(fy, ny, r) { return ny > .62 && fy < .55 ? (r() < .5 ? P.grass : P.grass2) : (r() < .5 ? P.rock : P.rock2); }
  function paintAlpine(snow, grass) {
    return function (fy, ny, r) {
      if (fy > snow && ny > .5 - (fy - snow) * 1.4) return r() < .8 ? P.snow : P.snow2;
      if (fy < grass && ny > .5) return r() < .5 ? P.grass : P.grass2;
      return r() < .5 ? P.rock : (r() < .5 ? P.rock2 : P.rock3);
    };
  }
  function paintGreen(fy, ny, r) { return ny > .35 ? (r() < .4 ? P.grass : r() < .6 ? P.grass2 : P.grassD) : (r() < .5 ? P.rock3 : P.rock); }
  function paintForest(fy, ny, r) { return ny > .3 ? (r() < .5 ? P.grassD : r() < .5 ? '#3F6638' : P.grass) : P.rock; }

  // Felswand mit unregelmässiger Front, Front zeigt im lokalen System nach +z.
  // o: x0, x1, z (Front), d (Tiefe), h, nx, ny, jit (Versatz der Front), over (Überhang oben), top (Farbe oben), ledge (Farbe flacher Stellen)
  function rockWall(c, o) {
    var b = c.b, r = c.rnd, nx = o.nx || Math.max(3, Math.round((o.x1 - o.x0) / 12)), ny = o.ny || Math.max(2, Math.round(o.h / 13));
    var cols = o.cols || [P.rock, P.rock2, P.rock3], jit = o.jit == null ? 2.5 : o.jit, sk = o.skirt == null ? 15 : o.skirt, F = [], i, j;
    var zb = o.z - o.d, tj = o.topJit == null ? 3 : o.topJit;
    for (j = 0; j <= ny; j++) {
      var row = [], f = j / ny;
      for (i = 0; i <= nx; i++) {
        var edge = i === 0 || i === nx, dx = (o.x1 - o.x0) / nx, pf = 1 - (o.ends || 0) * Math.pow(1 - Math.sin(PI * i / nx), 2);
        row.push([o.x0 + dx * i + (edge ? 0 : (r() - .5) * dx * .5),
          j === 0 ? -sk : (j === ny ? o.h + (edge ? 0 : (r() - .5) * tj) : o.h * f + (r() - .5) * o.h / ny * .4) * pf,
          o.z + (o.over || 0) * f * f + (j ? (r() - .5) * 2 * jit : 0)]);
      }
      F.push(row);
    }
    function face(a, e, g) {
      VA.set(e[0] - a[0], e[1] - a[1], e[2] - a[2]); VB.set(g[0] - a[0], g[1] - a[1], g[2] - a[2]); VA.cross(VB).normalize();
      if (VA.z < 0) VA.negate();
      b.tri(a, e, g, VA.y > .55 ? (o.ledge || P.grassD) : pick(r, cols), [0, 0, 1]);
    }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var A = F[j][i], E = F[j][i + 1], Gq = F[j + 1][i + 1], H = F[j + 1][i];
      face(A, E, Gq); face(A, Gq, H);
    }
    var T0 = F[ny];
    for (i = 0; i < nx; i++) {
      var p = T0[i], q = T0[i + 1];
      b.quad4(p, q, [q[0], q[1], zb], [p[0], p[1], zb], o.top || P.grassD, [0, 1, 0]);
      b.quad4([p[0], p[1], zb], [q[0], q[1], zb], [q[0], -sk, zb], [p[0], -sk, zb], cols[0], [0, 0, -1]);
    }
    [[0, -1], [nx, 1]].forEach(function (e) {
      for (j = 0; j < ny; j++) { var a = F[j][e[0]], g = F[j + 1][e[0]]; b.quad4(a, g, [g[0], g[1], zb], [a[0], a[1], zb], cols[1], [e[1], 0, 0]); }
    });
    return T0;
  }

  /* ---------- Bausteine ---------- */
  // Fensterreihen auf allen vier Seiten eines Blocks (Mitte x/z, Grösse w x d, Drehung ry)
  function wins(b, x, z, w, d, ry, ys, wh, nx, nz, c, ww) {
    c = c || P.win; b.at(x, 0, z, ry);
    for (var k = 0; k < ys.length; k++) {
      var y = ys[k], i;
      for (i = 0; i < nx; i++) {
        var u = (i + .5) / nx * w - w / 2, a = ww || Math.min(2.2, w / nx * .42);
        b.quad(u, y, d / 2 + .2, a, wh, c, 0); b.quad(-u, y, -d / 2 - .2, a, wh, c, PI);
      }
      for (i = 0; i < nz; i++) {
        var v = (i + .5) / nz * d - d / 2, e = ww || Math.min(2.2, d / nz * .42);
        b.quad(w / 2 + .2, y, -v, e, wh, c, H2); b.quad(-w / 2 - .2, y, v, e, wh, c, -H2);
      }
    }
    b.end();
  }
  // Fenster nur auf der Vorderseite (+z im lokalen System)
  function winRow(b, x, y, z, w, n, wh, c, ry, ww) {
    b.at(x, 0, z, ry);
    for (var i = 0; i < n; i++) b.quad((i + .5) / n * w - w / 2, y, .2, ww || Math.min(2.2, w / n * .42), wh, c || P.win, 0);
    b.end();
  }
  // Haus: Block mit Satteldach (First entlang der Breite w), Fenster je Geschoss
  function house(b, x, y, z, w, d, h, rh, wall, roof, ry, o) {
    o = o || {};
    b.at(x, y, z, ry);
    b.box(0, -10, 0, w, h + 10, d, wall);
    if (o.hip) b.hip(0, h, 0, w + 1, rh, d + 1, roof, 0, o.hip); else b.gable(0, h, 0, w + 1.2, rh, d + 1.2, roof);
    var fl = Math.max(1, Math.floor((h - 1) / 3.4)), ys = [];
    for (var i = 0; i < fl; i++) ys.push(1.1 + i * 3.4);
    if (!o.noWin) wins(b, 0, 0, w, d, 0, ys, 1.7, Math.max(1, Math.round(w / 3.4)), o.side ? Math.max(1, Math.round(d / 4)) : 0, o.win);
    if (o.chimney) b.box(w * .25, h + rh * .35, -d * .2, 1.2, rh * .8, 1.2, P.stone2);
    b.end();
  }
  function tree(b, x, y, z, h, r, kind) {
    var s = h * (.8 + r() * .4);
    if (kind === 'd') {
      b.box(x, y - 2, z, s * .09, s * .45 + 2, s * .09, P.woodD);
      b.ell(x, y + s * .62, z, s * .33, s * .36, s * .33, pick(r, [P.grass, P.grass2, P.grassD, '#6B8F3E']), r() * PI);
    } else {
      b.box(x, y - 2, z, s * .08, s * .22 + 2, s * .08, P.woodD);
      b.cone(x, y + s * .15, z, s * .27, s * .55, r() < .5 ? P.conifer : P.conifer2, 6, r());
      b.cone(x, y + s * .45, z, s * .19, s * .55, r() < .5 ? P.conifer2 : P.conifer, 6, r());
    }
  }
  // Bäume streuen: n Stück im Rechteck, Höhe aus hAt, Ausschluss über skip(x, z)
  function trees(ctx, n, x0, z0, x1, z1, h, kind, hAt, skip, maxY) {
    var r = ctx.rnd, tries = 0;
    for (var i = 0; i < n && tries < n * 8; tries++) {
      var x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (skip && skip(x, z)) continue;
      var y = hAt ? hAt(x, z) : 0;
      if (maxY != null && y > maxY) continue;
      tree(ctx.b, x, y, z, h, r, kind === 'mix' ? (r() < .5 ? 'c' : 'd') : kind); i++;
    }
  }
  function person(b, x, y, z, h, c, head, ry) {
    b.sqfr(x, y, z, h * .3, h * .78, h * .22, .62, c, ry);
    b.put(G('oct'), mat(x, y + h * .87, z, h * .12, h * .13, h * .12, ry || 0), head || P.skin);
  }
  // Standbild: Beine, Rumpf, Kopf, Arme; pose 'tell' mit Armbrust auf der Schulter
  function statue(b, x, y, z, h, c, ry, pose) {
    b.at(x, y, z, ry);
    b.box(-h * .07, 0, 0, h * .1, h * .47, h * .12, c); b.box(h * .07, 0, 0, h * .1, h * .47, h * .12, c);
    b.sqfr(0, h * .2, 0, h * .3, h * .32, h * .2, .7, c);            // Mantelsaum
    b.sqfr(0, h * .44, 0, h * .24, h * .34, h * .16, 1.35, c);       // Rumpf
    b.ball(0, h * .86, 0, h * .075, c, 6);
    if (pose === 'tell') {
      b.beam([-h * .17, h * .75, 0], [-h * .2, h * .46, h * .04], h * .07, c);
      b.beam([h * .17, h * .76, 0], [h * .12, h * .95, -h * .02], h * .07, c);
      b.beam([h * .06, h * .6, -h * .06], [h * .22, h * 1.06, -h * .1], h * .05, c);
      b.box(h * .22, h * 1.0, -h * .1, h * .3, h * .04, h * .04, c, .4);
    } else if (pose === 'spear') {
      b.beam([-h * .17, h * .75, 0], [-h * .3, h * .5, h * .1], h * .07, c);
      b.beam([h * .17, h * .75, 0], [h * .26, h * 1.0, h * .05], h * .07, c);
      b.beam([h * .3, -0.0, h * .05], [h * .24, h * 1.35, h * .05], h * .04, c);
    } else {
      b.beam([-h * .17, h * .75, 0], [-h * .2, h * .46, h * .03], h * .07, c);
      b.beam([h * .17, h * .75, 0], [h * .2, h * .46, h * .03], h * .07, c);
    }
    b.end();
  }
  // Ziegeldach mit Muster: First entlang x, fn(i, j, Seite) -> Farbe
  function tileRoof(b, x, y, z, l, h, d, nx, ny, fn, ry) {
    b.at(x, y, z, ry);
    for (var s = 0; s < 2; s++) {
      var sg = s ? -1 : 1;
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
        var xa = sg * (-l / 2 + i * l / nx), xb = sg * (-l / 2 + (i + 1) * l / nx);
        var ya = h * j / ny, yb = h * (j + 1) / ny, za = sg * d / 2 * (1 - j / ny), zb = sg * d / 2 * (1 - (j + 1) / ny);
        b.quad4([xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], fn(i, j, s));
      }
    }
    var c0 = fn(0, 0, 0);
    b.tri([-l / 2, 0, -d / 2], [-l / 2, 0, d / 2], [-l / 2, h, 0], c0, [-1, 0, 0]);
    b.tri([l / 2, 0, d / 2], [l / 2, 0, -d / 2], [l / 2, h, 0], c0, [1, 0, 0]);
    b.end();
  }
  // Pyramidendach mit Muster: Grundfläche w x d, Höhe h, fn(Seite, Reihe) -> Farbe
  function tilePyr(b, x, y, z, w, h, d, rows, fn) {
    var cn = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    for (var s = 0; s < 4; s++) {
      var A = cn[s], B = cn[(s + 1) % 4];
      for (var j = 0; j < rows; j++) {
        var f0 = j / rows, f1 = (j + 1) / rows;
        var a0 = [x + A[0] * (1 - f0), y + h * f0, z + A[1] * (1 - f0)], b0 = [x + B[0] * (1 - f0), y + h * f0, z + B[1] * (1 - f0)];
        var a1 = [x + A[0] * (1 - f1), y + h * f1, z + A[1] * (1 - f1)], b1 = [x + B[0] * (1 - f1), y + h * f1, z + B[1] * (1 - f1)];
        var hint = [(A[0] + B[0]) / 2, 1, (A[1] + B[1]) / 2], c = fn(s, j);
        if (j === rows - 1) b.tri(a0, b0, b1, c, hint); else b.quad4(a0, b0, b1, a1, c, hint);
      }
    }
  }
  // Zinnen entlang einer Strecke
  function merlons(b, ax, az, bx, bz, y, n, w, h, t, c) {
    var ry = Math.atan2(-(bz - az), bx - ax);
    for (var i = 0; i < n; i++) { var f = (i + .5) / n; b.box(ax + (bx - ax) * f, y, az + (bz - az) * f, w, h, t, c, ry); }
  }
  // Rundturm mit Kegeldach
  function roundTower(b, x, y, z, r, h, wall, roofH, roof, n) {
    b.cyl(x, y - 8, z, r, h + 8, wall, n || 8);
    if (roofH) b.cone(x, y + h, z, r * 1.15, roofH, roof, n || 8);
  }
  function tower(b, x, y, z, w, h, wall, roofH, roof, ry) {
    b.box(x, y - 8, z, w, h + 8, w, wall, ry);
    if (roofH) b.pyr(x, y + h, z, w + 1, roofH, w + 1, roof, ry);
  }

  /* ---------- Bewegung ---------- */
  function Path(pts, closed) {
    this.p = pts.map(function (q) { return new T.Vector3(q[0], q[1], q[2]); });
    if (closed) this.p.push(this.p[0].clone());
    this.s = [0];
    for (var i = 1; i < this.p.length; i++) this.s.push(this.s[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.len = this.s[this.s.length - 1]; this.closed = closed;
  }
  Path.prototype.at = function (s, out) {
    s = this.closed ? ((s % this.len) + this.len) % this.len : Math.max(0, Math.min(this.len, s));
    var i = 1; while (i < this.s.length - 1 && this.s[i] < s) i++;
    var f = (s - this.s[i - 1]) / ((this.s[i] - this.s[i - 1]) || 1);
    return out.copy(this.p[i - 1]).lerp(this.p[i], f);
  };
  // Objekt mit Vorderseite +x zwischen zwei Punkten ausrichten
  function orient(o, front, back) {
    o.position.copy(front).add(back).multiplyScalar(.5);
    var dx = front.x - back.x, dy = front.y - back.y, dz = front.z - back.z, l = Math.sqrt(dx * dx + dz * dz);
    o.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, l), 'YZX');
  }
  function pingpong(t, period) { var f = (t / period) % 1; f = f < .5 ? f * 2 : 2 - f * 2; return f * f * (3 - 2 * f); }
  function part(fn) { var b = new Builder(); fn(b); return b.mesh(); }

  // Boot: 'row' Ruderboot, 'sail' Segelboot in Kantonsfarben, 'steamer' Dampfschiff
  function boat(ctx, kind) {
    var c = ctx;
    return part(function (b) {
      if (kind === 'steamer') {
        b.put(G('hip:0.70'), mat(0, 1.6, 0, 34, -3.2, 7, 0), P.white);
        b.box(0, 1.6, 0, 30, 1.4, 6.6, P.white); b.box(-2, 3, 0, 20, 2.6, 5.4, '#F4EFE4');
        wins(b, -2, 0, 20, 5.4, 0, [3.6], 1.2, 8, 0);
        b.box(-2, 5.6, 0, 21, .5, 6, P.dark);
        b.cyl(2, 6, 0, .9, 4, c.accent === '#FFFFFF' ? '#E2B13C' : c.accent, 8); b.cyl(-4, 6, 0, .9, 4, c.brand, 8);
        b.box(14.5, 2.5, 0, .3, 2, .3, P.dark);
      } else if (kind === 'barge') {
        b.box(0, -.5, 0, 40, 3, 7, '#3A3F44'); b.box(15, 2.5, 0, 6, 3.4, 6, P.white); b.box(15, 5.9, 0, 6.6, .4, 6.6, P.dark);
        for (var i = 0; i < 4; i++) b.box(-14 + i * 6.4, 2.5, 0, 6, 2.6, 5.6, pick(c.rnd, ['#C8432E', '#2C6FA8', '#D9A93A', '#3E7D4F']));
      } else {
        b.put(G('hip:0.55'), mat(0, 1, 0, 8, -1.4, 2.6, 0), kind === 'sail' ? P.white : P.wood);
        b.box(0, 1, 0, 7, .5, 2.2, kind === 'sail' ? P.white : P.woodL);
        if (kind === 'sail') {
          b.cyl(.6, 1.5, 0, .15, 9, P.dark, 4);
          b.tri([.8, 2.2, 0], [.8, 10.5, 0], [4.6, 2.2, 0], c.brand, [0, 0, 1]);
          b.tri([.8, 2.2, 0], [4.6, 2.2, 0], [.8, 10.5, 0], c.brand, [0, 0, -1]);
          b.tri([.4, 3, 0], [.4, 9.6, 0], [-2.6, 3, 0], c.accent, [0, 0, 1]);
          b.tri([.4, 3, 0], [-2.6, 3, 0], [.4, 9.6, 0], c.accent, [0, 0, -1]);
        } else {
          person(b, -1.4, 1.4, 0, 2.2, '#4A6A8A', null); person(b, 1.8, 1.4, 0, 2.4, '#6B4630', null);
          b.beam([-1.4, 2.6, 1.4], [-.2, 1.2, 2.6], .18, P.woodD); b.beam([-1.4, 2.6, -1.4], [-.2, 1.2, -2.6], .18, P.woodD);
        }
      }
    });
  }
  // Vogel mit Flügelschlag; fliegt im Kreis um (x, z) in Höhe y
  function bird(ctx, x, y, z, rad, speed, span, col) {
    var g = new T.Group(), c = col || '#2E2B2A';
    var body = part(function (b) { b.ell(0, 0, 0, span * .2, span * .07, span * .07, c); b.cone(-span * .2, 0, 0, span * .06, span * .14, c, 4, 0); });
    var wg = part(function (b) { b.box(0, -span * .015, 0, span * .2, span * .03, span * .5, c); });
    var w1 = new T.Group(), w2 = new T.Group(), m1 = wg, m2 = new T.Mesh(wg.geometry, wg.material);
    m1.position.z = span * .25; m2.position.z = -span * .25; w1.add(m1); w2.add(m2);
    g.add(body, w1, w2); ctx.g.add(g);
    var ph = ctx.rnd() * TAU;
    ctx.A.push(function (t) {
      var a = ph + t * speed / rad;
      g.position.set(x + Math.cos(a) * rad, y + Math.sin(t * .7 + ph) * 3, z + Math.sin(a) * rad);
      var sg = speed > 0 ? 1 : -1;
      g.rotation.set(-.3 * sg, Math.atan2(-Math.cos(a) * sg, -Math.sin(a) * sg), 0, 'YZX');
      var f = Math.sin(t * 7 + ph) * .55; w1.rotation.x = -f; w2.rotation.x = f;
    });
    return g;
  }

  /* ---------- weitere Helfer ---------- */
  // fn(ox, oz, ry) für die vier Seiten eines quadratischen Körpers mit halber Breite hw
  function faces4(hw, fn) { for (var s = 0; s < 4; s++) { var ry = s * H2; fn(Math.sin(ry) * hw, Math.cos(ry) * hw, ry, s); } }
  // Dynamische Teile in einem verschobenen, gedrehten Rahmen bauen
  function inFrame(c, x, y, z, ry, fn, s) {
    var g = new T.Group(), g0 = c.g; g.position.set(x, y, z); g.rotation.y = ry || 0; g.scale.setScalar(s || 1); g0.add(g);
    c.g = g; c.b.at(x, y, z, ry, s); fn(); c.b.end(); c.g = g0;
    return g;
  }
  // Quader entlang der Strecke p -> q (Breite w quer, Höhe h, Unterkante auf der Strecke)
  function seg(b, p, q, w, h, col) {
    var dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dy, dz), lh = Math.hypot(dx, dz);
    E.set(0, Math.atan2(-dz, dx), Math.atan2(dy, lh), 'YZX'); Q.setFromEuler(E);
    PO.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); SC.set(l, h, w);
    return b.put(G('box'), M4.compose(PO, Q, SC), col);
  }
  // Boot auf einer Ellipse um (cx, cz) mit Periode in Sekunden
  function sail(c, m, cx, cz, rx, rz, period, y) {
    c.g.add(m); var ph = c.rnd() * TAU;
    c.A.push(function (t) {
      var a = ph + t / period * TAU, dx = -Math.sin(a) * rx, dz = Math.cos(a) * rz;
      m.position.set(cx + Math.cos(a) * rx, (y || .5) + Math.sin(t * 1.6 + ph) * .2, cz + Math.sin(a) * rz);
      m.rotation.set(Math.sin(t * 1.2) * .05, Math.atan2(-dz, dx), Math.sin(t * 1.7) * .03, 'YZX');
    });
    return m;
  }
  // Pendelfahrt entlang einer Strecke: Fahrzeug (Vorderseite +x) zwischen Anfang und Ende
  function shuttle(c, m, path, period, half, phase) {
    c.g.add(m); var a = new T.Vector3(), q = new T.Vector3();
    c.A.push(function (t) {
      var s = half + pingpong(t + (phase || 0) * period, period) * (path.len - 2 * half);
      var f = ((t + (phase || 0) * period) / period) % 1 < .5;
      path.at(s + (f ? half : -half), a); path.at(s - (f ? half : -half), q);
      orient(m, a, q);
    });
  }
  function rhbCar(col, loco) {
    return part(function (b) {
      b.box(0, .7, 0, 12.6, 3.3, 3, col); b.box(0, 4, 0, 12.4, .5, 2.6, '#5E6166');
      wins(b, 0, 0, 12.6, 3, 0, [2], 1.2, 6, 0, '#2E3338');
      b.box(-4.5, 0, 0, 2.6, .8, 2.4, P.dark); b.box(4.5, 0, 0, 2.6, .8, 2.4, P.dark);
      if (loco) { b.beam([0, 4.5, 0], [1.4, 5.9, 0], .15, P.dark); b.beam([1.4, 5.9, 0], [0, 6.5, 0], .15, P.dark); b.box(0, 6.5, 0, .3, .15, 2.2, P.dark); }
    });
  }

  var TYPES = {};

  /* ---------- Kirchen ---------- */
  TYPES.church = function (c) {
    var b = c.b, roof = c.rnd() < .5 ? P.tile : P.slate;
    b.box(2, -8, 0, 34, 22, 16, P.wall); b.gable(2, 14, 0, 36, 11, 18, roof);
    b.cyl(19, -8, 0, 7.6, 20, P.wall, 8); b.cone(19, 12, 0, 8.3, 7.5, roof, 8);
    wins(b, 2, 0, 34, 16, 0, [4], 6.5, 4, 0, P.win, 1.8);
    b.box(-20, -8, 0, 10, 54, 10, P.wall2); b.box(-20, 40, 0, 10.8, 1, 10.8, P.stone);
    faces4(5.2, function (ox, oz, ry) { b.door(-20 + ox, 33, oz, 2.4, 5, P.dark, ry); });
    b.door(-25.2, 0, 0, 3, 5, P.woodD, -H2);
    b.pyr(-20, 41, 0, 11, 26, 11, P.slate); b.ball(-20, 67.3, 0, .8, P.gold);
    flag(c, -20, 67.5, 0, 4, 9.6, 'pennant');
    clock(c, -20, 26, 5, 3.2, 0); clock(c, -25, 26, 0, 3.2, -H2);
  };

  TYPES['church-twin'] = function (c) {
    var b = c.b;
    b.box(6, -8, 0, 44, 28, 24, P.wall); b.gable(6, 20, 0, 46, 10, 26, P.tile);
    b.box(32, -8, 0, 10, 24, 16, P.wall); b.gable(32, 16, 0, 11, 7, 17.4, P.tile);
    wins(b, 6, 0, 44, 24, 0, [11], 5, 5, 0, P.win, 1.6);
    b.box(-21, -8, 0, 8, 38, 6, P.wall); b.door(-25.2, 0, 0, 3.4, 6, P.woodD, -H2);
    [-8, 8].forEach(function (z) {
      b.box(-21, -8, z, 11, 52, 11, P.wall); b.box(-21, 44, z, 11.6, .8, 11.6, P.stone);
      faces4(5.7, function (ox, oz, ry) { b.door(-21 + ox, 15, z + oz, 1.6, 3.4, P.dark, ry); b.door(-21 + ox, 24, z + oz, 1.6, 3.4, P.dark, ry); });
      b.cyl(-21, 44.8, z, 5, 11, P.wall, 8);
      for (var i = 0; i < 8; i++) { var a = (i + .5) / 8 * TAU; b.door(-21 + Math.sin(a) * 4.82, 48, z + Math.cos(a) * 4.82, 1.3, 3.6, P.dark, a); }
      b.frus(-21, 55.8, z, 5.5, .5, 9, P.slate, 8); b.cone(-21, 64.6, z, .9, 3.6, P.slate, 6);
      clock(c, -21, 36, z + Math.sign(z) * 5.7, 3.3, z > 0 ? 0 : PI);
      flag(c, -21, 68, z, 3, 7.2, 'pennant');
    });
  };

  TYPES.cathedral = function (c) {
    var b = c.b, st = '#D8CDB8', st2 = '#C4B79E';
    b.box(0, -8, 0, 54, 36, 20, st); b.gable(0, 28, 0, 56, 15, 22, P.slate);
    [-1, 1].forEach(function (s) {
      b.box(0, -8, s * 14, 54, 22, 8, st2); b.gable(0, 14, s * 14, 55, 4, 9, P.slate);
      for (var x = -22; x <= 22; x += 11) if (Math.abs(x - 14) > 6) { b.box(x, -8, s * 18.6, 2, 25, 2.6, st2); b.pyr(x, 17, s * 18.6, 2, 3, 2.6, st2); }
    });
    winRow(b, 0, 3, 18, 54, 6, 7, P.win, 0, 1.8); winRow(b, 0, 3, -18, 54, 6, 7, P.win, PI, 1.8);
    winRow(b, 0, 18, 10, 54, 7, 7.5, P.win, 0, 1.6); winRow(b, 0, 18, -10, 54, 7, 7.5, P.win, PI, 1.6);
    b.box(14, -8, 0, 11, 36, 44, st); b.gable(14, 28, 0, 46, 15, 13, P.slate, H2);
    b.cyl(30, -8, 0, 10, 36, st, 8); b.cone(30, 28, 0, 10.8, 13, P.slate, 8);
    // Westturm mit Laterne und Helm
    b.box(-33, -8, 0, 15, 70, 15, st); b.box(-33, 62, 0, 16, 1.2, 16, st2);
    faces4(7.7, function (ox, oz, ry) { b.door(-33 + ox, 42, oz, 2.8, 11, P.dark, ry); });
    b.door(-40.7, 0, 0, 5, 9, P.dark, -H2); b.disc(-40.6, 21, 0, 4, '#4B4E5A', -H2);
    b.cyl(-33, 63.2, 0, 6.2, 10, st, 8);
    for (var i = 0; i < 8; i++) { var a = (i + .5) / 8 * TAU; b.door(-33 + Math.sin(a) * 5.95, 65, Math.cos(a) * 5.95, 1.8, 5.5, P.dark, a); }
    b.cone(-33, 73.2, 0, 6.6, 32, st2, 8); b.ball(-33, 105.6, 0, .9, P.gold);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.cone(-33 + q[0] * 6.6, 63.2, q[1] * 6.6, 1.3, 11, st2, 4); });
    flag(c, -33, 106, 0, 4, 8, 'pennant');
    // Laterne des Nachtwächters
    var lm = std({ color: '#3A2E1E', emissive: '#FFB347', emissiveIntensity: 1 });
    var lamp = part(function (lb) { faces4(7.75, function (ox, oz, ry) { lb.quad(-33 + ox, 51, oz, 2.4, 3.2, P.white, ry); }); });
    lamp.material = lm; c.g.add(lamp);
    c.A.push(function (t) { lm.emissiveIntensity = .55 + .45 * Math.abs(Math.sin(t * 2.3) * Math.sin(t * 5.1 + 1)); });
  };

  TYPES.minster = function (c) {
    var b = c.b, red = '#B4584A', red2 = '#9C4A3E', pat = ['#3F6B4F', '#D9B44A', '#7A2E28', '#2F3B3A'];
    b.box(2, -8, 0, 50, 34, 22, red);
    tileRoof(b, 2, 26, 0, 52, 15, 24, 13, 4, function (i, j) { return j % 2 ? (i % 2 ? pat[2] : pat[3]) : (i % 2 ? pat[0] : pat[1]); });
    [-1, 1].forEach(function (s) { b.box(2, -8, s * 14.5, 50, 22, 7, red2); b.gable(2, 14, s * 14.5, 51, 4, 8, P.tile); });
    winRow(b, 2, 3, 18, 50, 6, 6, P.win, 0, 1.8); winRow(b, 2, 3, -18, 50, 6, 6, P.win, PI, 1.8);
    winRow(b, 2, 17, 11, 50, 6, 6, P.win, 0, 1.6); winRow(b, 2, 17, -11, 50, 6, 6, P.win, PI, 1.6);
    b.cyl(29, -8, 0, 10, 34, red, 8); b.cone(29, 26, 0, 10.8, 12, pat[3], 8);
    b.box(-27, -8, 0, 9, 40, 7, red); b.gable(-27, 32, 0, 9.4, 7, 7.4, red2);
    b.door(-31.7, 0, 0, 4, 8, P.dark, -H2); b.disc(-31.6, 21, 0, 2.6, '#4B4E5A', -H2);
    [-8, 8].forEach(function (z) {
      b.box(-27, -8, z, 9.5, 64, 9.5, red); b.box(-27, 56, z, 10.2, 1, 10.2, red2);
      faces4(4.95, function (ox, oz, ry) { b.door(-27 + ox, 22, z + oz, 1.8, 5, P.dark, ry); b.door(-27 + ox, 38, z + oz, 2, 7, P.dark, ry); });
      b.cyl(-27, 57, z, 4.2, 9, red, 8);
      for (var i = 0; i < 8; i += 2) { var a = (i + .5) / 8 * TAU; b.door(-27 + Math.sin(a) * 4.08, 59, z + Math.cos(a) * 4.08, 1.2, 4.5, P.dark, a); }
      b.cone(-27, 66, z, 4.6, 20, red2, 8); b.ball(-27, 86.2, z, .6, P.gold);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.cone(-27 + q[0] * 4.4, 57, z + q[1] * 4.4, .9, 7, red2, 4); });
      flag(c, -27, 86.5, z, 3, 7.2, 'pennant');
    });
    clock(c, -27, 47, 12.95, 2.8, 0);
  };

  TYPES.basilica = function (c) {
    var b = c.b, w = P.wall, w2 = P.wall2;
    b.box(4, -8, 0, 60, 14, 32, w2);
    for (var k = 0; k < 5; k++) { var x0 = -38 + k * 1.5; b.box((x0 - 26) / 2, -8, 0, -26 - x0, 8 + (k + 1) * 1.2, 30 - k, w2); }
    for (var z = -12; z <= 12; z += 4.8) b.cyl(-23, 6, z, 1.1, 14, w, 8);
    b.box(-21, 20, 0, 8, 2.4, 29, w2); b.gable(-21, 22.4, 0, 8.6, 6, 30, w2);
    b.box(6, 6, 0, 46, 24, 28, w); b.gable(6, 30, 0, 47, 7, 29.4, P.slate);
    b.door(-17.2, 6, 0, 4, 7, P.woodD, -H2);
    wins(b, 6, 0, 46, 28, 0, [12, 21], 4.5, 6, 0, P.win, 1.8);
    b.cyl(10, 30, 0, 8.5, 8, w, 12);
    for (var i = 0; i < 12; i += 2) { var a = (i + .5) / 12 * TAU; b.quad(10 + Math.sin(a) * 8.65, 32, Math.cos(a) * 8.65, 1.8, 3.5, P.win, a); }
    b.dome(10, 38, 0, 9, 10, P.copper, 12); b.cyl(10, 47.5, 0, 1.8, 4, w, 8); b.cone(10, 51.5, 0, 2.2, 4, P.copper, 8);
    b.box(34, -8, 0, 10, 66, 10, w); b.box(34, 58, 0, 10.8, 1, 10.8, w2);
    faces4(5.2, function (ox, oz, ry) { b.door(34 + ox, 51, oz, 2, 4.5, P.dark, ry); });
    b.cyl(34, 59, 0, 4.2, 6, w, 8); b.dome(34, 65, 0, 4.6, 5, P.copper, 8); b.cone(34, 69.5, 0, .8, 5, P.copper, 6);
    clock(c, 34, 42, 5.2, 3.2, 0); clock(c, 39.2, 42, 0, 3.2, H2);
    flag(c, 34, 74.5, 0, 3, 7.2, 'pennant');
  };

  TYPES.monastery = function (c) {
    var b = c.b, w = P.wall, roof = c.rnd() < .5 ? P.tile : P.slate, zc = -24;
    b.box(-9, -8, zc, 42, 32, 20, w); b.gable(-9, 24, zc, 44, 11, 22, roof);
    b.cyl(12, -8, zc, 9, 30, w, 8); b.cone(12, 22, zc, 9.8, 8, roof, 8);
    wins(b, -9, zc, 42, 20, 0, [5, 14], 5, 6, 0, P.win, 1.8);
    b.box(-33, -8, zc, 9, 38, 9.2, w); b.gable(-33, 30, zc, 9.6, 6, 9.6, P.wall2);
    b.door(-37.7, 0, zc, 3.6, 6.5, P.woodD, -H2);
    [zc - 9, zc + 9].forEach(function (z) {
      b.box(-33, -8, z, 9, 50, 9, w); b.box(-33, 42, z, 9.6, .8, 9.6, P.wall2);
      faces4(4.7, function (ox, oz, ry) { b.door(-33 + ox, 24, z + oz, 1.6, 4, P.dark, ry); });
      b.cyl(-33, 42.8, z, 3.6, 4, w, 8); b.ell(-33, 49.5, z, 4.2, 3.6, 4.2, P.copper, 0, 8);
      b.cone(-33, 52.5, z, 1.2, 5, P.copper, 6); b.ball(-33, 57.9, z, .6, P.gold);
      clock(c, -37.7, 34, z, 2.8, -H2);
      flag(c, -33, 58.2, z, 3, 7.2, 'pennant');
    });
    // Konventbau um den Hof
    var d = 11, h = 18, ys = [2, 7, 12];
    [-6.5, 30.5].forEach(function (z) { b.box(12, -8, z, 52, h + 8, d, w); b.hip(12, h, z, 53, 6, 12, roof, 0, .86); wins(b, 12, z, 52, d, 0, ys, 2.2, 10, 0); });
    [-8.5, 32.5].forEach(function (x) { b.box(x, -8, 12, d, h + 8, 26, w); b.gable(x, h, 12, 27, 6, 12, roof, H2); wins(b, x, 12, d, 26, 0, ys, 2.2, 0, 5); });
    b.box(12, -1, 12, 30, 1.4, 26, P.grass);
    b.cyl(12, .4, 12, 2.6, .9, P.stone, 8); tree(b, 4, .4, 6, 10, c.rnd, 'd'); tree(b, 20, .4, 18, 9, c.rnd, 'd');
  };

  TYPES.chapel = function (c) {
    var b = c.b, r = c.rnd;
    var m = mountain(c, { x: 0, z: -42, r: 50, sx: 1.2, sz: .6, h: 60, n: 10, rings: [[0, 1], [.3, .72], [.62, .42], [.88, .14]], paint: paintForest });
    trees(c, 16, -56, -66, 56, -14, 13, 'c', m.heightAt, function (x, z) { return m.heightAt(x, z) < 4; });
    b.box(0, -10, -6, 64, 12, 14, P.rock);
    for (var i = 0; i < 9; i++) b.box(-30 + i * 7.5 + r() * 2, -4, 1 + r() * 2, 6.5, 4.5 + r() * 2.5, 4.5, pick(r, [P.rock, P.rock2, P.rock3]), r());
    inFrame(c, 0, 0, -6, 0, function () {
      b.box(0, -2, 0, 15, 11, 8, P.wall); b.gable(0, 9, 0, 16, 5, 9.4, P.tile);
      for (var k = -1; k <= 1; k++) b.door(k * 4.4, 1.6, 4.2, 3.2, 5.2, P.dark);
      b.box(-4.5, 12, 0, 1.8, 3.4, 1.8, P.wall); b.pyr(-4.5, 15.4, 0, 2.3, 4, 2.3, P.slate);
      flag(c, -4.5, 19.4, 0, 2.5, 5.6, 'pennant');
    }, 1.4);
    waterRect(c, -60, 1, 60, 56, .5, false);
    var bt = boat(c, 'row'); c.g.add(bt);
    c.A.push(function (t) {
      bt.position.set(16 + Math.sin(t * .15) * 12, .2 + Math.sin(t * 1.7) * .25, 24 + Math.cos(t * .15) * 7);
      bt.rotation.set(Math.sin(t * 1.3) * .06, .5 + Math.cos(t * .15) * .5, Math.sin(t * 1.1) * .05, 'YZX');
    });
  };

  TYPES['chapel-hill'] = function (c) {
    var b = c.b, r = c.rnd;
    var m = mountain(c, { x: 0, z: -24, r: 62, h: 36, n: 11, rings: [[0, 1], [.35, .78], [.7, .5], [.95, .22]], flat: true, paint: paintGreen, jit: .07 });
    var hx = -4, hz = 10, y = m.heightAt(hx, hz);
    inFrame(c, hx, y, hz, .3, function () {
      b.box(0, -8, 0, 12, 15, 7, P.wall); b.gable(0, 7, 0, 13, 4.5, 8.2, P.slate);
      winRow(b, 0, 2.4, 3.5, 12, 3, 2.8, P.win, 0, 1.2); b.door(6.2, 0, 0, 1.6, 2.8, P.woodD, H2);
      b.box(-7.6, -8, 0, 3.8, 24, 3.8, P.wall);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.box(-7.6 + q[0] * 1.6, 16, q[1] * 1.6, .5, 3.2, .5, P.wall); });
      b.box(-7.6, 19.2, 0, 4.2, .6, 4.2, P.wall); b.cone(-7.6, 19.8, 0, 2.9, 9, P.slate, 8);
      b.box(9, -8, -1.5, 4.4, 12.2, 4.4, P.wood); b.gable(9, 4.2, -1.5, 5, 2.2, 5.2, P.woodD);
      var bell = part(function (bb) { bb.cone(0, -2, 0, 1, 1.5, P.gold, 8); bb.box(0, -.6, 0, .25, .6, .25, P.dark); });
      bell.position.set(-7.6, 19, 0); c.g.add(bell);
      c.A.push(function (t) { bell.rotation.z = Math.sin(t * 2.4) * .5; });
      flag(c, -7.6, 28.8, 0, 2.4, 5.4, 'pennant');
    });
    trees(c, 16, -60, -60, 60, 56, 11, 'mix', m.heightAt, function (x, z) { return Math.hypot(x - hx, z - hz) < 16; });
  };

  TYPES['church-rock'] = function (c) {
    var b = c.b, r = c.rnd, w = '#E8D3A6';
    var m = mountain(c, { r: 44, h: 44, n: 9, rings: [[0, 1], [.3, .8], [.62, .62], [.9, .52]], flat: true, jit: .1,
      paint: function (fy, ny, rr) { return ny > .8 ? P.grass : (rr() < .5 ? P.rock3 : P.rock); } });
    var y1 = m.top + 2.5;
    b.cyl(0, m.top - 8, 0, 22, 10.5, P.stone2, 12);
    b.box(-2, y1 - 4, -1, 26, 18, 11, w); b.gable(-2, y1 + 14, -1, 27, 6, 12.4, P.tile);
    b.box(-2, y1 - 4, 7.5, 26, 10, 5, w); b.box(-2, y1 + 6, 7.5, 27, .8, 5.6, P.tile);
    for (var i = 0; i < 5; i++) b.door(-12 + i * 5, y1, 10.2, 3, 4.8, P.dark);
    winRow(b, -2, y1 + 8, -6.5, 26, 5, 3, P.win, PI, 1.4);
    b.box(10, y1 - 4, -8, 6, 34, 6, w); b.pyr(10, y1 + 30, -8, 6.8, 6, 6.8, P.tile);
    faces4(3.2, function (ox, oz, ry) { b.door(10 + ox, y1 + 25, -8 + oz, 1.6, 3, P.dark, ry); });
    clock(c, 10, y1 + 19, -4.8, 2.2, 0);
    flag(c, 10, y1 + 36, -8, 3, 6.4, 'pennant');
    trees(c, 12, -48, -48, 48, 48, 10, 'd', m.heightAt, null, 22);
  };

  /* ---------- Burgen und Schlösser ---------- */
  TYPES.castle = function (c) {
    var b = c.b, r = c.rnd, style = Math.floor(r() * 3), roof = r() < .6 ? P.tile : P.slate, w = P.wall2;
    var hill = mountain(c, { r: 58, h: 16, n: 11, rings: [[0, 1], [.45, .9], [.85, .72]], flat: true, paint: paintGreen, jit: .06 });
    var y0 = hill.top - 1, X = 28, Z = 21, wh = 12;
    b.box(0, y0 - 6, -Z, 2 * X, wh + 6, 3, w); b.box(0, y0 - 6, Z, 2 * X, wh + 6, 3, w);
    b.box(-X, y0 - 6, 0, 3, wh + 6, 2 * Z, w); b.box(X, y0 - 6, 0, 3, wh + 6, 2 * Z, w);
    merlons(b, -X, Z, X, Z, y0 + wh, 9, 2.6, 2.2, 3, w); merlons(b, -X, -Z, X, -Z, y0 + wh, 9, 2.6, 2.2, 3, w);
    merlons(b, X, -Z, X, Z, y0 + wh, 6, 2.6, 2.2, 3, w); merlons(b, -X, -Z, -X, Z, y0 + wh, 6, 2.6, 2.2, 3, w);
    [[-X, -Z], [X, -Z], [X, Z], [-X, Z]].forEach(function (q) { roundTower(b, q[0], y0, q[1], 5.2, 18, P.wall, 9, roof, 8); b.ball(q[0], y0 + 27.3, q[1], .7, c.accent); });
    var kx = -10, kz = -6, kw = 15, kh = 38, top;
    b.box(kx, y0 - 6, kz, kw, kh + 6, kw, P.wall);
    faces4(kw / 2 + .2, function (ox, oz, ry) { b.quad(kx + ox, y0 + 16, kz + oz, 1.4, 2.8, P.win, ry); b.quad(kx + ox, y0 + 27, kz + oz, 1.4, 2.8, P.win, ry); });
    if (style === 0) { b.pyr(kx, y0 + kh, kz, kw + 1.4, 16, kw + 1.4, roof); top = y0 + kh + 15.5; }
    else if (style === 1) {
      b.hip(kx, y0 + kh, kz, kw + 1, 12, kw + 1, roof, 0, .2); top = y0 + kh + 11.8;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.cyl(kx + q[0] * kw / 2, y0 + kh - 7, kz + q[1] * kw / 2, 2.3, 10, P.wall, 8); b.cone(kx + q[0] * kw / 2, y0 + kh + 3, kz + q[1] * kw / 2, 2.8, 7, roof, 8); });
    } else {
      [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) { merlons(b, kx + q[0] * kw / 2, kz + q[1] * kw / 2, kx + q[2] * kw / 2, kz + q[3] * kw / 2, y0 + kh, 4, 2.2, 2.4, 1.6, P.wall); });
      top = y0 + kh;
    }
    flag(c, kx, top, kz, 9, 9, 'canton');
    house(b, 11, y0, -11, 26, 12, 16, 9, P.wall, roof, 0, { side: true });
    b.box(10, y0 - 6, Z, 9, 22, 6, w); b.pyr(10, y0 + 16, Z, 9.6, 6, 6.6, roof); b.door(10, y0, Z + 3.2, 4, 6.5, P.dark);
    flag(c, X, y0 + 27.6, Z, 3, 6.4, 'pennant'); flag(c, -X, y0 + 27.6, -Z, 3, 6.4, 'pennant');
    trees(c, 12, -60, -60, 60, 60, 11, 'd', hill.heightAt, function (x, z) { return Math.abs(x) < 36 && Math.abs(z) < 29; }, y0 - 2);
  };

  TYPES['castle-round'] = function (c) {
    var b = c.b, r = c.rnd, w = P.wall2;
    var hill = mountain(c, { r: 58, h: 12, n: 12, rings: [[0, 1], [.5, .85], [.9, .6]], flat: true, paint: paintGreen, jit: .05 });
    var y0 = hill.top - 1, i;
    for (var k = 0; k < 6; k++) for (i = 0; i < 4; i++) {
      var z = 33 + k * 4, x = -27 + i * 13 + (k % 2) * 3, y = hill.heightAt(x, z);
      if (y > .5) b.box(x, y - .6, z, 11, 2, 1.2, P.vine);
    }
    b.cyl(0, y0 - 6, 0, 26, 24, w, 16); b.cyl(0, y0 + 18, 0, 24.6, .4, P.grass2, 16);
    for (i = 0; i < 16; i++) { var a = (i + .5) / 16 * TAU; b.box(Math.sin(a) * 25, y0 + 18, Math.cos(a) * 25, 3.4, 2.4, 1.4, w, a); }
    for (i = 0; i < 16; i += 2) { a = (i + .5) / 16 * TAU; b.quad(Math.sin(a) * 25.75, y0 + 7, Math.cos(a) * 25.75, 1.6, 2.2, P.dark, a); }
    var tx = -14, tz = -16;
    b.box(tx, y0 - 6, tz, 10, 48, 10, P.wall); b.box(tx, y0 + 42, tz, 10.8, .8, 10.8, w);
    faces4(5.2, function (ox, oz, ry) { b.quad(tx + ox, y0 + 30, tz + oz, 1.4, 2.6, P.win, ry); b.quad(tx + ox, y0 + 36, tz + oz, 1.4, 2.6, P.win, ry); });
    b.pyr(tx, y0 + 42.8, tz, 11.4, 10, 11.4, P.tile); b.box(tx, y0 + 50.5, tz, 1.6, 2.4, 1.6, P.wall); b.cone(tx, y0 + 52.9, tz, 1.3, 3, P.slate, 4);
    tree(b, 6, y0 + 18, 4, 11, r, 'd'); tree(b, -2, y0 + 18, 12, 10, r, 'd'); tree(b, 12, y0 + 18, -8, 9, r, 'd');
    flag(c, tx, y0 + 55.9, tz, 4, 8, 'canton');
    trees(c, 10, -60, -60, 60, 60, 10, 'd', hill.heightAt, function (x, z) { return Math.hypot(x, z) < 34 || z > 28; }, y0 - 2);
  };

  TYPES['water-castle'] = function (c) {
    var b = c.b, r = c.rnd, w = P.wall, roof = P.tile, y0 = 4;
    waterRect(c, -60, -22, 60, 58, .5, false);
    b.box(0, -10, -42, 120, 12, 40, P.grass);
    for (var i = 0; i < 10; i++) b.box(-54 + i * 12 + r() * 3, -3, -22.5 + r(), 9, 4.5 + r() * 2, 4, pick(r, [P.rock, P.rock3]), r() * .4);
    trees(c, 12, -58, -60, 58, -28, 11, 'mix', function () { return 2; });
    mountain(c, { x: 0, z: 4, r: 36, sx: 1, sz: .62, h: 5, n: 12, rings: [[0, 1], [.7, .95]], flat: true, jit: .06, skirt: 8,
      paint: function (fy, ny, rr) { return rr() < .5 ? P.rock : P.rock3; } });
    b.box(0, y0 - 6, 1, 12, 40, 12, w); b.pyr(0, y0 + 34, 1, 12.8, 11, 12.8, roof);
    faces4(6.2, function (ox, oz, ry) { b.quad(ox, y0 + 26, 1 + oz, 1.2, 2.6, P.win, ry); });
    b.box(-4, y0 - 6, 12, 48, 22, 9, w); b.gable(-4, y0 + 16, 12, 49, 8, 10.4, roof);
    winRow(b, -4, y0 + 8, 16.5, 48, 9, 2.2, P.win, 0, 1.4);
    [-24, -8, 12].forEach(function (x) { roundTower(b, x, y0, 17.2, 3.3, 19, w, 8, roof, 8); });
    b.box(1, y0 - 6, -10, 46, 18, 3.5, w); b.gable(1, y0 + 12, -10, 46, 3, 4.6, roof);
    [-18, 4, 22].forEach(function (x) { roundTower(b, x, y0, -11, 4.4, 16, w, 7, roof, 8); });
    b.box(-28, y0 - 6, 2, 10, 20, 20, w); b.hip(-28, y0 + 14, 2, 20.6, 7, 10.6, roof, H2, .6);
    b.box(27, y0 - 6, 3, 14, 24, 22, w); b.hip(27, y0 + 18, 3, 14.6, 9, 22.6, roof, 0, .5);
    winRow(b, 27, y0 + 10, 14, 14, 3, 2.4, P.win, 0, 1.4);
    b.box(-11, 2.5, -17, 4, .8, 11, P.wood); b.gable(-11, 5.6, -17, 11, 2, 5, roof, H2);
    b.box(-12.8, 3.3, -17, .3, 2.3, 10, P.woodD); b.box(-9.2, 3.3, -17, .3, 2.3, 10, P.woodD);
    flag(c, 0, y0 + 44.5, 1, 6, 8, 'canton');
    flag(c, 12, y0 + 27.2, 17.2, 3, 6.4, 'pennant'); flag(c, 22, y0 + 23.2, -11, 3, 6.4, 'pennant');
    var st = boat(c, 'steamer'); st.scale.setScalar(.75);
    sail(c, st, 0, 44, 40, 7, 70, .2);
  };

  TYPES.manor = function (c) {
    var b = c.b, r = c.rnd, roof = P.slate;
    b.box(0, -1, 22, 74, 1.4, 34, P.grass);
    b.box(-18, .4, 22, 3, 1.6, 26, P.grassD); b.box(18, .4, 22, 3, 1.6, 26, P.grassD); b.box(0, .4, 32, 30, 1.4, 2.4, P.grassD);
    b.box(0, .4, 14, 4, .12, 18, P.path);
    b.box(0, -8, -8, 36, 25, 18, P.wall); b.hip(0, 17, -8, 37.4, 17, 19.4, roof, 0, .5);
    [3, 8, 13].forEach(function (y) {
      for (var i = 0; i < 8; i++) {
        var x = -15.75 + i * 4.5; if (Math.abs(x) < 3) continue;
        b.quad(x, y, 1.2, 1.6, 2.6, P.win); b.quad(x - 1.4, y, 1.12, 1.1, 2.6, c.brand); b.quad(x + 1.4, y, 1.12, 1.1, 2.6, c.brand);
      }
      winRow(b, 0, y, -17, 36, 8, 2.6, P.win, PI, 1.6);
    });
    b.cyl(0, -8, 1.6, 3.6, 34, P.wall, 8); b.cone(0, 26, 1.6, 4.2, 9, roof, 8); b.ball(0, 35.3, 1.6, .5, P.gold);
    b.door(0, 0, 5.4, 2.4, 4, P.woodD);
    for (var k = 0; k < 4; k++) b.quad(Math.sin(k * H2) * 3.65, 10 + k * 3.5, 1.6 + Math.cos(k * H2) * 3.65, .9, 1.8, P.win, k * H2);
    b.cyl(0, .4, 26, 4, .9, P.stone, 12);
    var pts = []; for (k = 0; k < 12; k++) pts.push([Math.sin(k / 12 * TAU) * 3.5, 26 + Math.cos(k / 12 * TAU) * 3.5]);
    waterPoly(c, pts, 1.15);
    particles(c, 'jet', 80, [[0, 1.2, 26]], .55, '#E6F2FA', .8, [4, 0, .8, 2.2]);
    flag(c, 0, 35.6, 1.6, 4, 6, 'canton');
    [[-30, 10], [30, 12], [-28, 34], [29, 33]].forEach(function (q) { tree(b, q[0], .4, q[1], 12, r, 'd'); });
  };

  /* ---------- Türme, Mauern, Brücken ---------- */
  function astroMat() {
    return MAT.astro || (MAT.astro = std({ map: canvasTex('astro', 64, 64, function (x) {
      x.fillStyle = '#D9A93A'; x.beginPath(); x.arc(32, 32, 32, 0, TAU); x.fill();
      x.fillStyle = '#1E2A4A'; x.beginPath(); x.arc(32, 32, 28, 0, TAU); x.fill();
      x.fillStyle = '#141414'; x.beginPath(); x.arc(32, 32, 28, .3, PI - .3); x.fill();
      x.strokeStyle = '#D9A93A'; x.lineWidth = 3; x.beginPath(); x.arc(38, 27, 15, 0, TAU); x.stroke();
      x.fillStyle = '#F2D27A'; x.beginPath(); x.arc(20, 16, 4, 0, TAU); x.fill();
    }) }));
  }
  TYPES['tower-clock'] = function (c) {
    var b = c.b, w = '#E2D6C0';
    b.box(0, -8, 0, 13, 32, 11, P.wall2); b.box(0, 24, 0, 11.6, 14, 10, w); b.box(0, 38, 0, 12.6, 1, 11, P.stone);
    b.door(0, 0, 5.7, 5.6, 8, P.dark, 0); b.door(0, 0, -5.7, 5.6, 8, P.dark, PI);
    winRow(b, 0, 20, 5.5, 13, 2, 2.2, P.win, 0, 1.2);
    tilePyr(b, 0, 39, 0, 12.6, 15, 11, 5, function (s, j) { return (s + j) % 2 ? c.brand : c.accent; });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.box(q[0] * 1.3, 48, q[1] * 1.3, .4, 4.2, .4, P.dark); });
    b.pyr(0, 52, 0, 3.6, 3, 3.6, P.slate); b.ball(0, 55.4, 0, .6, P.gold);
    clock(c, 0, 31, 5.2, 4, 0, '#1E2A4A', P.gold, P.gold); clock(c, 0, 31, -5.2, 4, PI, '#1E2A4A', P.gold, P.gold);
    var astro = new T.Mesh(GEO.circle, astroMat()); astro.position.set(0, 14, 5.75); astro.scale.set(3.4, 3.4, 1); c.g.add(astro);
    var bell = part(function (bb) { bb.cone(0, -1.4, 0, .9, 1.3, P.gold, 8); });
    bell.position.set(0, 51.4, 0); c.g.add(bell);
    var fig = part(function (bb) { person(bb, 0, 0, 0, 2.4, P.gold, P.gold); bb.beam([.4, 1.8, 0], [1.4, 2.6, 0], .25, P.dark); });
    fig.position.set(1.7, 47.8, 2.2); c.g.add(fig);
    c.A.push(function (t) {
      astro.rotation.z = t * .12;
      var k = Math.max(0, Math.sin(t * 3)); fig.position.y = 47.8 + k * .8; fig.rotation.z = -k * .3; bell.rotation.z = Math.sin(t * 3) * .15;
    });
    flag(c, 0, 55.6, 0, 3, 6.4, 'pennant');
  };

  TYPES.tower = function (c) {
    var b = c.b;
    b.box(0, -8, 0, 13, 14, 13, P.stone); b.box(0, -8, 0, 11.4, 44, 11.4, P.wall);
    b.door(0, 0, 6.7, 5, 7, P.dark, 0); b.door(0, 0, -6.7, 5, 7, P.dark, PI);
    faces4(5.9, function (ox, oz, ry) {
      b.quad(ox, 12, oz, .9, 2.4, P.dark, ry); b.quad(ox, 19, oz, .9, 2.4, P.dark, ry);
      b.quad(ox, 26.4, oz, 11.4, 1.2, c.brand, ry); b.quad(ox, 27.6, oz, 11.4, .6, c.accent, ry);
    });
    clock(c, 0, 32, 5.9, 2.6, 0);
    b.box(0, 36, 0, 12.2, .8, 12.2, P.stone); b.pyr(0, 36.8, 0, 13, 16, 13, P.tile); b.ball(0, 53, 0, .7, P.gold);
    flag(c, 0, 53.2, 0, 4, 6, 'canton');
  };

  TYPES['bridge-covered'] = function (c) {
    var b = c.b, r = c.rnd;
    river(c, [[-60, 0, 64], [60, 0, 64]], .5);
    b.box(0, -8, -44, 120, 10, 24, P.stone); b.box(0, -8, 44, 120, 10, 24, P.stone);
    var paint = ['#EDE6DA', '#E9D4A8', '#E7BBA8', '#C9D9C9', '#F0DDB8'];
    [-52, -38, -24, 26, 40, 54].forEach(function (x) { house(b, x, 2, -48, 12, 10, 12 + r() * 6, 6, pick(r, paint), P.tile, 0); });
    var pts = [[-28, -36], [-10, -8], [8, 8], [22, 36]];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], e = pts[i + 1], L = Math.hypot(e[0] - a[0], e[1] - a[1]), ang = Math.atan2(-(e[1] - a[1]), e[0] - a[0]);
      b.at((a[0] + e[0]) / 2, 0, (a[1] + e[1]) / 2, ang);
      b.box(0, 4.4, 0, L + .8, .8, 4.6, P.woodD);
      b.box(0, 5.2, 2.15, L, 1.2, .3, P.wood); b.box(0, 5.2, -2.15, L, 1.2, .3, P.wood);
      b.box(0, 6.4, 2.4, L * .96, .6, .5, '#D9473A'); b.box(0, 6.4, -2.4, L * .96, .6, .5, '#D9473A');
      var n = Math.max(2, Math.round(L / 6));
      for (var k = 0; k <= n; k++) {
        var x = -L / 2 + k * L / n;
        b.box(x, 5.2, 2.1, .35, 3.2, .35, P.woodD); b.box(x, 5.2, -2.1, .35, 3.2, .35, P.woodD);
        b.cyl(x, -6, 1.8, .35, 10.4, P.woodD, 5); b.cyl(x, -6, -1.8, .35, 10.4, P.woodD, 5);
      }
      b.gable(0, 8.4, 0, L + .8, 2.6, 5.8, P.tile);
      b.end();
    }
    var wx = -4, wz = -27;
    b.cyl(wx, -6, wz, 7, 36, '#C4A57A', 8); b.cyl(wx, 30, wz, 7.4, .8, P.stone, 8); b.cone(wx, 30.8, wz, 7.6, 10, P.tile, 8);
    for (i = 0; i < 8; i += 2) { var q = (i + .5) / 8 * TAU; b.quad(wx + Math.sin(q) * 6.67, 18, wz + Math.cos(q) * 6.67, .9, 2.2, P.dark, q); b.quad(wx + Math.sin(q) * 6.67, 24, wz + Math.cos(q) * 6.67, .9, 2.2, P.dark, q); }
    flag(c, wx, 40.8, wz, 4, 7, 'canton');
  };

  TYPES['bridge-stone'] = function (c) {
    var b = c.b, st = P.stone, st2 = '#ADA393';
    river(c, [[0, -60, 46], [0, 60, 46]], .5);
    [-1, 1].forEach(function (s) {
      b.at(s * 23, 0, 0, -s * H2);
      rockWall(c, { x0: -60, x1: 60, z: 0, d: 37, h: 7.6, nx: 8, ny: 2, jit: 1.2, top: P.grass, ledge: P.grass });
      b.end();
      b.box(s * 38, 7.6, 0, 30, 2.4, 6, st2);
      trees(c, 9, s > 0 ? 28 : -58, -56, s > 0 ? 58 : -28, 56, 11, 'd', function () { return 7.6; }, function (x, z) { return Math.abs(z) < 7; });
    });
    var s = 14, p = 3.4, ys = 1.5, yd = 10;
    for (var k = -1; k <= 1; k++) b.arch(k * (s + p), ys, 0, s, p, yd - ys, 7, st, 0);
    [-1.5, -.5, .5, 1.5].forEach(function (f) { b.box(f * (s + p), -4, 0, p, ys + 4, 7, st); b.cyl(f * (s + p), -4, -3.5, p / 2, ys + 5, st2, 6); });
    b.box(0, yd, 3.2, 60, 1.2, .6, st2); b.box(0, yd, -3.2, 60, 1.2, .6, st2); b.box(0, yd, 0, 60, .15, 5.8, '#8E8A84');
    var car = part(function (bb) {
      bb.box(0, .5, 0, 6.4, 2.2, 2.5, c.brand); bb.box(.3, 2.7, 0, 5, 1, 2.4, '#3E4A55'); bb.box(.3, 3.7, 0, 5.2, .3, 2.5, c.brand);
      [[-2, -1.1], [-2, 1.1], [2, -1.1], [2, 1.1]].forEach(function (q) { bb.box(q[0], 0, q[1], 1.1, .9, .4, P.dark); });
    });
    c.g.add(car);
    c.A.push(function (t) {
      var f = (t / 18) % 1, up = f < .5, s2 = up ? f * 2 : 2 - f * 2;
      car.position.set(-50 + s2 * 100, yd + .15, up ? 1.4 : -1.4); car.rotation.set(0, up ? 0 : PI, 0);
    });
  };

  TYPES.viaduct = function (c) {
    var b = c.b, r = c.rnd, st = '#CDC3B2', st2 = '#B5AA97';
    var R = 76, cz = 72, a0 = -.5, a1 = .5, yd = 58, ys = 45, n = 5, da = (a1 - a0) / n, span = R * da, pier = 4, k;
    function pt(a) { return [Math.sin(a) * R, cz - Math.cos(a) * R]; }
    b.box(0, -6, 0, 120, 6.3, 120, P.grass);
    river(c, [[-8, -60, 9], [0, -20, 9], [6, 20, 10], [2, 60, 10]], .5);
    trees(c, 16, -58, -58, 58, 58, 10, 'c', function () { return .3; }, function (x, z) { return Math.abs(x - 2) < 12 || z > -14 && z < 22 && Math.abs(x) < 46; });
    for (k = 0; k < n; k++) { var am = a0 + da * (k + .5), q = pt(am); b.arch(q[0], ys, q[1], span - pier, pier, yd - ys, 7, st, -am); }
    for (k = 1; k < n; k++) { var ak = a0 + da * k; q = pt(ak); b.sqfr(q[0], -6, q[1], 6, ys + 6, 10, .68, st2, -ak); }
    for (k = 0; k < n; k++) {
      am = a0 + da * (k + .5); q = pt(am);
      b.at(q[0], 0, q[1], -am);
      b.box(0, yd, 3.2, span + .3, 1.3, .6, st2); b.box(0, yd, -3.2, span + .3, 1.3, .6, st2);
      b.box(0, yd, 0, span + .3, .35, 5.8, '#6E6A64');
      b.box(0, yd + .35, .75, span + .3, .2, .2, P.steel); b.box(0, yd + .35, -.75, span + .3, .2, .2, P.steel);
      b.box(-span / 2, yd, 3.6, .35, 7.5, .35, P.steel); b.box(-span / 2 + .2, yd + 7, 2, .3, .3, 3.6, P.steel);
      b.end();
    }
    // Hänge an beiden Enden, Tunnelportal mit Mauerwerk
    [[a0, -1, yd + 24, 14], [a1, 1, yd + 42, 16]].forEach(function (e) {
      var p = pt(e[0]), tx = Math.cos(e[0]) * e[1], tz = Math.sin(e[0]) * e[1];
      var hill = mountain(c, { x: p[0] + tx * e[3], z: p[1] + tz * e[3], r: 22, h: e[2], n: 9, rings: [[0, 1], [.4, .86], [.75, .55], [.92, .25]],
        paint: e[1] < 0 ? paintForest : paintRock, jit: .1 });
      b.at(p[0], 0, p[1], Math.atan2(-tx, -tz));
      b.box(0, yd - 4, -2, 10, 14, 4.4, st2); b.box(0, yd + 10, -1.8, 11, 1, 4.8, st);
      b.door(0, yd - .2, .45, 6, 7.4, '#1C1A19');
      b.end();
      if (e[1] < 0) trees(c, 8, p[0] - 30, p[1] - 22, p[0] + 2, p[1] + 22, 12, 'c', hill.heightAt, function (x, z) { return hill.heightAt(x, z) < 8; });
    });
    var pts = [], p0 = pt(a0), p1 = pt(a1);
    pts.push([p0[0] - Math.cos(a0) * 22, yd + .5, p0[1] - Math.sin(a0) * 22]);
    for (k = 0; k <= 12; k++) { q = pt(a0 + (a1 - a0) * k / 12); pts.push([q[0], yd + .5, q[1]]); }
    pts.push([p1[0] + Math.cos(a1) * 22, yd + .5, p1[1] + Math.sin(a1) * 22]);
    var path = new Path(pts), cars = [], A = new T.Vector3(), B = new T.Vector3();
    for (k = 0; k < 4; k++) { var m = rhbCar('#C41E2B', k === 0); c.g.add(m); cars.push(m); }
    c.A.push(function (t) {
      var s = (t * 11) % (path.len + 4 * 13.6);
      for (var i = 0; i < cars.length; i++) {
        var f = s - i * 13.6;
        cars[i].visible = f > 0 && f - 12.6 < path.len;
        if (cars[i].visible) { path.at(f, A); path.at(f - 12.6, B); orient(cars[i], A, B); }
      }
    });
  };

  /* ---------- Denkmäler ---------- */
  TYPES.monument = function (c) {
    var b = c.b, r = c.rnd;
    inFrame(c, 0, 0, 0, 0, function () {
      b.box(0, -1, 0, 44, 1.4, 44, '#CFC8BC');
      b.box(0, -6, 0, 16, 7.4, 16, P.wall2); b.box(0, 1.4, 0, 12, 1.4, 12, P.stone);
      b.box(0, 2.8, 0, 7.4, 9, 6.4, P.stone); b.box(0, 11.8, 0, 8.4, .9, 7.4, P.wall2);
      b.quad(0, 5, 3.4, 4.5, 2.6, '#6E6656');
      statue(b, -1, 12.7, 0, 11, P.bronze, -.2, 'tell'); statue(b, 2.6, 12.7, 1.4, 6.2, P.bronze, .3);
      flag(c, -15, .4, -12, 18, 7, 'ch'); flag(c, 15, .4, -12, 18, 7, 'canton');
      [[-17, 14], [17, 15], [-18, -18], [18, -17]].forEach(function (q) { tree(b, q[0], .4, q[1], 13, r, 'd'); });
    }, 1.6);
  };

  TYPES['monument-lion'] = function (c) {
    var b = c.b, r = c.rnd, sa = '#C9B996', sa2 = '#B5A47F';
    b.box(0, -6, -10, 34, 44, 20, sa); b.box(0, 38, -10, 34, .6, 20, P.grassD);
    rockWall(c, { x0: -44, x1: -16, z: -.5, d: 20, h: 38, nx: 3, ny: 3, cols: [sa2, sa, '#A8987A'] });
    rockWall(c, { x0: 16, x1: 44, z: -.5, d: 20, h: 38, nx: 3, ny: 3, cols: [sa2, sa, '#A8987A'] });
    trees(c, 12, -40, -24, 40, -4, 12, 'd', function () { return 38; });
    b.door(0, 3.5, .2, 27, 15, '#6A5E4C');
    var lion = part(function (lb) {
      lb.ell(0, 0, 0, 6.6, 2.5, 2.8, sa); lb.ell(-6, .7, .3, 3.1, 3.3, 3.1, sa2); lb.ell(-8.3, -.4, 1.2, 1.7, 1.5, 1.5, sa);
      lb.box(-7.6, -2.5, 2.2, 4.2, 1, 1.6, sa); lb.box(4.4, -2.5, 2, 3.6, 1, 1.4, sa);
      lb.beam([6.2, -.2, .2], [9.6, -1.8, 1.4], .7, sa);
      lb.ell(2.6, -.4, 3, 2.2, 2.2, .5, P.red); lb.box(2.6, -1.3, 3.5, .5, 1.8, .2, P.white); lb.box(2.6, -.5, 3.5, 1.8, .5, .2, P.white);
      lb.beam([.8, 1.2, 1.5], [-2.4, 5.2, -1], .35, '#6B5A40');
    });
    lion.position.set(1, 8.2, 2.6); lion.scale.setScalar(1.4); c.g.add(lion);
    b.box(0, -1, 8, 76, 1.8, 1.2, P.stone); b.box(-37.5, -1, 22, 1.2, 1.8, 28, P.stone); b.box(37.5, -1, 22, 1.2, 1.8, 28, P.stone); b.box(0, -1, 36, 76, 1.8, 1.2, P.stone);
    b.box(0, -3, 22, 74, 2.4, 27, P.stone2);
    waterRect(c, -37, 8.6, 37, 35.4, .3, false);
    b.box(0, -1, 45, 90, 1.4, 18, P.grass);
    var rings = [];
    for (var k = 0; k < 3; k++) {
      var m = new T.MeshBasicMaterial({ color: '#E8F4FB', transparent: true, opacity: .6, depthWrite: false });
      var g = new T.Mesh(GEO.ring || (GEO.ring = new T.RingGeometry(.86, 1, 24).rotateX(-H2)), m);
      g.position.set(-20 + k * 18 + r() * 6, .45, 15 + r() * 15); c.g.add(g); rings.push(g);
    }
    c.A.push(function (t) {
      var s = 1 + Math.sin(t * 1.1) * .03; lion.scale.set(1.4, 1.4 * s, 1.4 * (1 + (s - 1) * .6));
      for (var i = 0; i < rings.length; i++) { var f = (t / 4 + i / 3) % 1; rings[i].scale.setScalar(.5 + f * 6); rings[i].material.opacity = .6 * (1 - f); }
    });
  };

  function textMat(text) {
    var k = 'text|' + text;
    return MAT[k] || (MAT[k] = std({ map: canvasTex(k, 256, 32, function (x, w, h) {
      x.fillStyle = '#C9C0AC'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#3E3A33'; x.font = 'bold 22px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 1);
    }) }));
  }
  TYPES['monument-wall'] = function (c) {
    var b = c.b, r = c.rnd, st = '#CFC6B4', st2 = '#BDB3A0', fig = '#E4DECF';
    b.box(0, -1, -24, 120, 2.8, 48, P.grass); b.box(0, -1, 34, 120, 2.8, 32, P.grass);
    b.box(0, -1, 9, 120, 1.3, 18, P.stone2);
    waterRect(c, -60, 1, 60, 17, .8, false);
    b.box(0, -6, -3, 104, 18, 4, st); b.box(0, 12, -3, 36, 4, 4.4, st2);
    var tx = new T.Mesh(GEO.plane || (GEO.plane = new T.PlaneGeometry(1, 1)), textMat('POST TENEBRAS LUX'));
    tx.scale.set(28, 2.4, 1); tx.position.set(0, 14, -.55); c.g.add(tx);
    b.box(0, 1.8, -.2, 32, 2.2, 3.8, st2);
    [-11, -3.7, 3.7, 11].forEach(function (x) { statue(b, x, 4, .2, 9, fig, 0); });
    [-46, -36, -26, 26, 36, 46].forEach(function (x) { b.box(x, 1.8, -.4, 3.4, 1.6, 2.6, st2); statue(b, x, 3.4, -.2, 5.6, fig, 0); });
    for (var i = 0; i < 11; i++) tree(b, -50 + i * 10, 1.8, -18 - r() * 16, 15, r, 'd');
    bird(c, 0, 34, -10, 28, 9, 4); bird(c, 10, 40, -6, 20, -8, 4); bird(c, -8, 30, -14, 24, 10, 4);
  };

  TYPES.tripoint = function (c) {
    var b = c.b, r = c.rnd;
    river(c, [[-60, 25, 70], [60, 25, 70]], .5);
    b.box(0, -8, -35, 120, 10, 50, '#B9B4AA');
    b.box(0, -6, 2, 14, 8, 26, P.stone); b.cyl(0, -6, 15, 7, 8, P.stone, 3);
    b.cyl(0, 2, 12, 2.8, 1.6, P.stone2, 12); b.frus(0, 3.6, 12, 2, .05, 30, P.metal, 8);
    for (var k = 0; k < 3; k++) { var a = k * TAU / 3; b.box(Math.sin(a) * 2, 3.6, 12 + Math.cos(a) * 2, .35, 10, 3.6, P.metal, a + H2); }
    flag(c, -7, 2, 2, 17, 7.5, 'ch'); flag(c, 0, 2, 0, 17, 7.5, 'h', '#141414', '#DD0000', '#FFCE00'); flag(c, 7, 2, 2, 17, 7.5, 'v', '#0055A4', '#FFFFFF', '#EF4135');
    [-50, -40].forEach(function (x) { b.cyl(x, -6, -40, 5, 38, '#D7D2C8', 12); });
    b.box(-45, 32, -40, 20, 5, 9, '#C4BFB4');
    for (var i = 0; i < 4; i++) for (var j = 0; j < 2; j++) for (var l = 0; l < 2; l++)
      b.box(14 + i * 9.6, 2 + l * 2.6, -26 - j * 3, 9, 2.6, 2.6, pick(r, ['#C8432E', '#2C6FA8', '#D9A93A', '#3E7D4F', '#7A7F86']));
    b.box(34, 2, -14, 2.2, 28, 2.2, '#D9A93A');
    var jib = part(function (jb) { jb.box(6, 0, 0, 26, 1.6, 1.6, '#D9A93A'); jb.box(-5, -1.5, 0, 4, 3, 2.4, P.dark); jb.box(0, 1.6, 0, 2.2, 2.2, 2.2, '#D9A93A'); jb.beam([16, -14, 0], [16, 0, 0], .2, P.dark); });
    jib.position.set(34, 30, -14); c.g.add(jib);
    var barge = boat(c, 'barge'); c.g.add(barge);
    c.A.push(function (t) {
      jib.rotation.y = Math.sin(t * .2) * .9;
      var f = (t / 44) % 1, up = f < .5, s = up ? f * 2 : 2 - f * 2;
      barge.position.set(-38 + s * 76, .5 + Math.sin(t * 1.3) * .1, up ? 48 : 36); barge.rotation.y = up ? 0 : PI;
    });
  };

  /* ---------- Mauern und Bauten der Städte ---------- */
  TYPES.wall = function (c) {
    var b = c.b, r = c.rnd, w = P.wall2, roof = P.tile;
    var hill = mountain(c, { r: 64, sz: .55, h: 18, n: 12, rings: [[0, 1], [.5, .75], [.85, .4]], flat: true, paint: paintGreen, jit: .05 });
    var X = [-50, -25, 0, 25, 50];
    for (var i = 0; i < 4; i++) for (var k = 0; k < 3; k++) {
      var xm = X[i] + (k + .5) * 25 / 3, y = hill.heightAt(xm, 0);
      b.box(xm, y - 6, 0, 25 / 3 + .4, 16, 2.6, w); b.gable(xm, y + 10, 0, 25 / 3 + .4, 1.6, 3.4, P.slate);
    }
    X.forEach(function (x, i) {
      var y = hill.heightAt(x, 0);
      if (i === 0) { roundTower(b, x, y, 0, 5, 24, w, 10, roof, 10); flag(c, x, y + 34, 0, 3, 6.4, 'pennant'); }
      else if (i === 2) {
        tower(b, x, y, 0, 9, 30, w, 14, P.slate); clock(c, x, y + 23, 4.7, 3, 0); clock(c, x, y + 23, -4.7, 3, PI);
        flag(c, x, y + 44, 0, 3, 6.4, 'pennant');
      } else if (i === 3) {
        b.box(x, y - 8, 0, 8, 34, 8, w);
        [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) { merlons(b, x + q[0] * 4, q[1] * 4, x + q[2] * 4, q[3] * 4, y + 26, 3, 1.8, 2, 1.2, w); });
        statue(b, x, y + 26, 0, 4, '#4A4F55', 0, 'spear'); flag(c, x + 2.6, y + 26, 2.6, 6, 4, 'canton');
      } else { var h = 26 + r() * 4; tower(b, x, y, 0, 8.5, h, w, 13, roof); flag(c, x, y + h + 12.6, 0, 3, 6.4, 'pennant'); }
      faces4(i === 0 ? 5.1 : 4.6, function (ox, oz, ry) { b.quad(x + ox, y + 12, oz, .9, 2.2, P.dark, ry); b.quad(x + ox, y + 19, oz, .9, 2.2, P.dark, ry); });
    });
    trees(c, 8, -56, 8, 56, 32, 10, 'd', hill.heightAt);
  };

  TYPES.parliament = function (c) {
    var b = c.b, sa = '#DCCDAE', sa2 = '#C9B791', cu = P.copper;
    b.box(0, -8, 4, 112, 10, 50, P.stone);
    b.box(0, 2, 0, 32, 26, 30, sa); b.box(0, 2, 15.6, 22, 20, 2.4, sa2);
    for (var x = -9; x <= 9; x += 3.6) b.cyl(x, 2, 17.6, .9, 18, sa, 8);
    b.gable(0, 22, 16, 4, 6, 24, sa2, H2); b.box(0, 28, 0, 33, 1.2, 31, sa2);
    b.cyl(0, 29.2, 0, 10, 6, sa, 12);
    for (var i = 0; i < 12; i++) { var a = (i + .5) / 12 * TAU; b.quad(Math.sin(a) * 10.05, 30.4, Math.cos(a) * 10.05, 1.4, 3, P.win, a); }
    b.dome(0, 35.2, 0, 10.5, 13, cu, 12); b.cyl(0, 47.6, 0, 2.2, 4, sa, 8); b.cone(0, 51.6, 0, 2.6, 3.5, cu, 8);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { b.box(q[0] * 13, 29.2, q[1] * 12, 4, 3, 4, sa); b.dome(q[0] * 13, 32.2, q[1] * 12, 2.6, 3.6, cu, 8); });
    wins(b, 0, 0, 32, 30, 0, [6, 12, 18], 2.8, 6, 6, P.win, 1.4);
    [-1, 1].forEach(function (s) {
      b.box(s * 35, 2, 0, 38, 20, 24, sa); b.hip(s * 35, 22, 0, 39, 8, 25, cu, 0, .6);
      b.box(s * 35, 2, 0, 10, 24, 26, sa2); b.pyr(s * 35, 26, 0, 11, 6, 27, cu);
      wins(b, s * 35, 0, 38, 24, 0, [6, 11, 16], 2.6, 8, 4, P.win, 1.4);
      flag(c, s * 35, 32, 0, 5, 6, 'canton');
    });
    flag(c, 0, 55, 0, 6, 7, 'ch');
  };

  TYPES.palace = function (c) {
    var b = c.b, r = c.rnd, tr = '#E8E2D2', tr2 = '#D6CEBB';
    b.box(0, -1, 34, 120, 1.4, 52, '#D8D2C6'); b.box(0, .4, 28, 60, .2, 16, P.grass);
    b.box(0, -8, -16, 110, 30, 20, tr); b.box(0, 22, -16, 110.6, 1, 20.6, tr2);
    b.box(0, -8, -20, 36, 38, 26, tr); b.box(0, 30, -20, 36.6, 1, 26.6, tr2);
    winRow(b, 0, 23.5, -7, 36, 8, 5, '#5A6E7E', 0, 2.4);
    [-1, 1].forEach(function (s) { b.box(s * 48, -8, 6, 14, 26, 44, tr); b.box(s * 48, 18, 6, 14.6, 1, 44.6, tr2); wins(b, s * 48, 6, 14, 44, 0, [3, 8, 13], 2.6, 0, 9, P.win, 1.5); });
    wins(b, 0, -16, 110, 20, 0, [3, 8, 13, 18], 2.6, 22, 0, P.win, 1.6);
    var cols = ['#D52B1E', '#FFFFFF', '#0055A4', '#009246', '#FFCE00', '#141414', '#EF3340', '#2D6CC0', '#F4A300', '#5B2C83'];
    for (var i = 0; i < 13; i++) {
      var x = -36 + i * 6;
      if (i === 6) { flag(c, x, .4, 46, 17, 6.5, 'un'); continue; }
      var a = pick(r, cols), d = pick(r, cols), e = pick(r, cols);
      while (d === a) d = pick(r, cols); while (e === d) e = pick(r, cols);
      flag(c, x, .4, 46, 14, 5.5, r() < .5 ? 'h' : 'v', a, d, e);
    }
    var cx = 50, cz = 44, wd = '#8C5A38';
    [[-1, -1, 7], [1, -1, 7], [-1, 1, 7], [1, 1, 3.6]].forEach(function (q) { b.box(cx + q[0] * 3, .4, cz + q[1] * 3, 1, q[2], 1, wd); });
    b.cone(cx + 3, 4, cz + 3, .5, 1.2, wd, 5); b.box(cx + 3, 5.8, cz + 3, 1, 1.6, 1, wd);
    b.box(cx, 7.4, cz, 7.4, 1, 7.4, wd); b.box(cx - 3, 8.4, cz - 3, 1, 7, 1, wd); b.box(cx + 3, 8.4, cz - 3, 1, 7, 1, wd);
    b.box(cx, 13, cz - 3, 7, 1.2, 1, wd); b.box(cx, 10.6, cz - 3, 7, .8, .8, wd);
  };

  TYPES.townhall = function (c) {
    var b = c.b, red = '#B83A2E', red2 = '#9E3026';
    b.box(-4, -8, 0, 34, 28, 16, red);
    [-12, -4, 4].forEach(function (x) { b.door(x, 0, 8.2, 6, 8, '#4A1A14'); });
    b.box(-4, 19.6, 0, 34.6, .8, 16.6, P.gold);
    winRow(b, -4, 11, 8, 34, 7, 3.4, P.win, 0, 1.8); winRow(b, -4, 11, -8, 34, 7, 3.4, P.win, PI, 1.8);
    winRow(b, -4, 15.4, 8, 34, 7, .4, P.gold, 0, 2.2);
    tileRoof(b, -4, 20.4, 0, 35, 10, 17, 10, 4, function (i, j) { return (i + j) % 2 ? c.brand : (j % 2 ? '#3F6B4F' : c.accent); });
    b.box(-4, 20, 6.8, 9, 7, 2.6, red); b.gable(-4, 27, 6.6, 3, 4, 9.6, red2, H2);
    clock(c, -4, 23.6, 8.1, 2.4, 0, '#F4F1E8', P.dark, P.gold);
    b.box(17, -8, 2, 8, 50, 8, red); b.box(17, 42, 2, 8.8, 1, 8.8, P.gold); b.cone(17, 43, 2, 5, 16, red2, 8); b.ball(17, 59.3, 2, .9, P.gold);
    faces4(4.2, function (ox, oz, ry) { b.quad(17 + ox, 30, 2 + oz, 1.2, 4, P.win, ry); b.quad(17 + ox, 21, 2 + oz, 1.2, 3, P.win, ry); });
    clock(c, 17, 36, 6.2, 2.6, 0, '#F4F1E8', P.dark, P.gold);
    [[-21.5, 8.2], [13.5, 8.2], [-21.5, -8.2], [13.5, -8.2]].forEach(function (q) { b.cone(q[0], 20.4, q[1], .8, 4, P.gold, 4); });
    flag(c, 17, 59.6, 2, 4, 6, 'canton');
  };

  TYPES.museum = function (c) {
    var b = c.b, r = c.rnd, w = P.wall, w2 = P.wall2;
    inFrame(c, 0, 0, 0, 0, function () {
    b.box(0, -8, 0, 44, 11.2, 22, w2);
    for (var k = 0; k < 4; k++) b.box(0, -8, 11 + (4 - k) * .7, 16, 8 + (k + 1) * .8, (4 - k) * 1.4, w2);
    [-6, -2, 2, 6].forEach(function (x) { b.cyl(x, 3.2, 9.4, .8, 10, w, 8); });
    b.box(0, 13.2, 8, 15, 1.6, 4, w2); b.gable(0, 14.8, 8, 4, 4.5, 15.6, w2, H2);
    b.box(0, -2, -2, 40, 18, 18, w); b.hip(0, 16, -2, 41, 6, 19, P.slate, 0, .7);
    wins(b, 0, -2, 40, 18, 0, [5.5, 10.5], 2.6, 8, 3, P.win, 1.5);
    b.door(0, 3.2, 7.2, 3, 5, P.woodD);
    b.quad(-14, 5, 7.25, 3, 8, c.brand); b.quad(14, 5, 7.25, 3, 8, c.brand);
    b.quad(-14, 9, 7.3, 3, 1, c.accent); b.quad(14, 9, 7.3, 3, 1, c.accent);
    flag(c, -16, 3.2, 12, 13, 6, 'canton'); flag(c, 16, 3.2, 12, 13, 6, 'ch');
    [[-26, 14], [26, 15], [-24, -16], [25, -17]].forEach(function (q) { tree(b, q[0], 0, q[1], 13, r, 'd'); });
    }, 1.4);
  };

  var PAINT = ['#EDE6DA', '#E9D4A8', '#E7BBA8', '#C9D9C9', '#F0DDB8', '#D9C2A6', '#E3CBD6', '#D3DCE6'];
  // Häuserzeile entlang x von x0 bis x1, Mitte z, Tiefe d; facing: +1 Front nach +z, -1 nach -z
  function row(b, r, x0, x1, z, d, hMin, hVar, facing, roofs) {
    var x = x0;
    while (x < x1) {
      var w = 7 + r() * 4; if (x + w > x1) break;
      var h = hMin + r() * hVar, xc = x + w / 2, wall = pick(r, PAINT), roof = pick(r, roofs || [P.tile, P.tile2, '#8E3E2C']);
      if (r() < .4) {
        house(b, xc, 0, z, d, w, h, 4 + r() * 2, wall, roof, H2, { noWin: true });
        var fl = []; for (var k = 0; k < Math.floor((h - 1) / 3.4); k++) fl.push(1.1 + k * 3.4);
        wins(b, xc, z, d, w, H2, fl, 1.7, 0, Math.max(1, Math.round(w / 3.4)));
      } else house(b, xc, 0, z, w, d, h, 5 + r() * 2, wall, roof, facing > 0 ? 0 : PI);
      x += w + .3;
    }
  }
  TYPES.oldtown = function (c) {
    var b = c.b, r = c.rnd;
    b.box(0, -1, 0, 120, 1.3, 104, '#CEC5B6');
    row(b, r, -50, 52, -9.5, 11, 9, 7, 1); row(b, r, -50, 52, 9.5, 11, 9, 7, -1);
    row(b, r, -48, -12, -29, 11, 8, 5, 1); row(b, r, -48, 50, 29, 11, 8, 5, -1);
    b.box(16, -8, -31, 26, 22, 12, P.wall); b.gable(16, 14, -31, 27, 9, 13.2, P.tile);
    winRow(b, 16, 4, -25, 26, 4, 5.5, P.win, 0, 1.6);
    b.box(0, -8, -31, 7, 40, 7, P.wall); b.cone(0, 32, -31, 4.8, 18, P.slate, 8);
    faces4(3.7, function (ox, oz, ry) { b.door(ox, 24, -31 + oz, 1.4, 3, P.dark, ry); });
    clock(c, 0, 19, -27.3, 2.2, 0);
    flag(c, 0, 50, -31, 3, 6.4, 'pennant');
    b.box(-56, -8, 0, 8, 30, 10, P.wall2); b.pyr(-56, 22, 0, 8.8, 10, 10.8, P.tile);
    b.door(-51.8, 0, 0, 4.5, 6.5, P.dark, H2); b.door(-60.2, 0, 0, 4.5, 6.5, P.dark, -H2);
    flag(c, -56, 31.6, 0, 4, 6, 'canton');
    b.cyl(20, .3, 0, 2.6, 1, P.stone, 8); b.cyl(20, 1.3, 0, .4, 4, P.stone, 6); statue(b, 20, 5.3, 0, 2.4, c.brand, 0, 'spear');
  };

  TYPES.gridtown = function (c) {
    var b = c.b, r = c.rnd;
    b.box(0, -1, 0, 120, 1.3, 112, '#CBC4B8');
    for (var k = 0; k < 5; k++) {
      var z = -46 + k * 19;
      [[-54, -20], [-16, 16], [20, 54]].forEach(function (blk, j) {
        if (k >= 3 && j === 1) return;
        var x = blk[0];
        while (x < blk[1] - 6) {
          var L = Math.min(blk[1] - x, 12 + r() * 10), h = 10 + r() * 6, xc = x + L / 2;
          b.box(xc, -8, z, L, h + 8, 11, pick(r, PAINT)); b.gable(xc, h, z, L + .6, 3.4, 12, pick(r, [P.tile, P.slate, P.tile2]));
          var n = Math.max(2, Math.round(L / 3.2)), fl = Math.floor((h - 1) / 3.3);
          for (var f = 0; f < fl; f++) { winRow(b, xc, 1.2 + f * 3.3, 5.5, L, n, 1.7, P.win, 0, 1.2); winRow(b, xc, 1.2 + f * 3.3, -5.5, L, n, 1.7, P.win, PI, 1.2); }
          x += L + .4;
        }
      });
    }
    b.box(0, .3, 36, 10, 3, 6, P.stone);
    b.put(G('cyl:20'), mat(0, 18, 34.6, 14, 3.2, 14, 0, H2), P.gold);
    b.cyl(0, 31.6, 36.2, 1.6, 3, P.gold, 8);
    b.put(G('torus:12:0.22'), mat(0, 37, 36.2, 2.6, 2.6, 2.6), P.gold);
    clock(c, 0, 18, 37.6, 12.4, 0, '#F7F4EC', P.dark, P.dark, 4);
    [[-30, 34], [30, 34], [-42, 40], [42, 40]].forEach(function (q) { tree(b, q[0], .3, q[1], 11, r, 'd'); });
  };

  TYPES.village = function (c) {
    var b = c.b, r = c.rnd;
    var hill = mountain(c, { z: -18, r: 62, sz: .85, h: 18, n: 12, rings: [[0, 1], [.5, .7], [.85, .35]], flat: true, paint: paintGreen, jit: .05 });
    var spots = [[-36, 10], [-12, 16], [12, 12], [34, 16], [-26, -18], [2, -16], [26, -12]], smoke = [];
    spots.forEach(function (q, i) {
      var y = hill.heightAt(q[0], q[1]), ry = (r() - .5) * .4, wall = pick(r, [P.wall, '#E9D4A8', P.woodL]);
      house(b, q[0], y, q[1], 11, 12, 8, 6.5, wall, pick(r, [P.slate, P.tile]), ry, { side: true, chimney: true });
      var cx = 11 * .25, cz = -12 * .2;
      if (i < 4) smoke.push([q[0] + cx * Math.cos(ry) + cz * Math.sin(ry), y + 8 + 6.5 * 1.15, q[1] - cx * Math.sin(ry) + cz * Math.cos(ry)]);
    });
    particles(c, 'smoke', 100, smoke, 2.4, '#EDEDED', .55, [16, 6, 2, 6]);
    var fy = hill.heightAt(0, 34), cols = ['#D52B1E', '#0055A4', '#009246', '#FFCE00', '#141414', '#EF3340', '#2D6CC0'];
    flag(c, -12, fy, 34, 12, 4.5, 'ch');
    for (var i = 1; i < 6; i++) flag(c, -12 + i * 5, fy, 34, 12, 4.5, r() < .5 ? 'h' : 'v', pick(r, cols), '#FFFFFF', pick(r, cols));
    b.beam([20, fy, 30], [21.5, fy + 5, 30], .3, P.wood); b.beam([23, fy, 30], [21.5, fy + 5, 30], .3, P.wood);
    b.beam([20, fy, 36], [21.5, fy + 5, 36], .3, P.wood); b.beam([23, fy, 36], [21.5, fy + 5, 36], .3, P.wood);
    b.box(21.5, fy + 5, 33, .3, .3, 6.4, P.wood);
    trees(c, 16, -60, -60, 60, 50, 10, 'mix', hill.heightAt, function (x, z) {
      for (var k = 0; k < spots.length; k++) if (Math.hypot(x - spots[k][0], z - spots[k][1]) < 11) return true;
      return Math.abs(z - 33) < 6 && Math.abs(x) < 26;
    });
  };

  TYPES.square = function (c) {
    var b = c.b, r = c.rnd;
    b.box(0, -1, 0, 100, 1.4, 76, '#CFC8BC');
    for (var x = -40; x <= 40; x += 16) house(b, x, .4, -31, 14, 12, 14 + r() * 4, 7, pick(r, [P.wall, '#E2D3B5', '#D9C9AE', '#E9D4A8']), P.slate, 0, { hip: .6 });
    [-1, 1].forEach(function (s) { for (var z = -14; z <= 26; z += 14) house(b, s * 43, .4, z, 12, 12, 12 + r() * 4, 6.5, pick(r, PAINT), pick(r, [P.slate, P.tile]), -s * H2); });
    tower(b, 47, .4, -31, 6, 30, P.wall, 12, P.slate); clock(c, 47, 24, -27.8, 2, 0);
    b.box(0, .4, -14, 12, 3.4, 7, P.woodD); b.box(0, 3.8, -10.6, 12, 1.2, .3, P.wood); b.box(0, .4, -9.4, 3, 1.8, 2.4, P.woodD);
    person(b, -2, 3.8, -14, 2.2, P.dark); person(b, 2, 3.8, -14, 2.2, P.dark);
    flag(c, 0, 3.8, -16.5, 22, 11, 'canton');
    var figs = [], dress = ['#2F3238', '#3A3F4A', '#5A3A2E', '#2E3A2E', '#4A4038'];
    for (var k = 0; k < 3; k++) {
      var rad = 12 + k * 4.5, cnt = 12 + k * 4;
      for (var i = 0; i < cnt; i++) {
        var phi = -1.3 + i / (cnt - 1) * 2.6, px = Math.sin(phi) * rad, pz = -14 + Math.cos(phi) * rad;
        person(b, px, .4, pz, 2.6, pick(r, dress), P.skin, phi); figs.push([px, pz, phi]);
      }
    }
    var arms = new T.InstancedMesh(GEO.arm || (GEO.arm = new T.BoxGeometry(.34, 1.4, .34).translate(0, .7, 0)), solid('#3A3F4A'), figs.length);
    arms.frustumCulled = false; c.g.add(arms);
    var o = new T.Object3D();
    c.A.push(function (t) {
      for (var i = 0; i < figs.length; i++) {
        var f = figs[i], up = Math.max(0, Math.min(1, Math.sin(t * .7 - f[2] * 1.2) * 2));
        o.position.set(f[0], 2.45, f[1]); o.rotation.set(0, f[2], 0); o.translateX(.45); o.rotateZ(-(1 - up) * 2.7);
        o.updateMatrix(); arms.setMatrixAt(i, o.matrix);
      }
      arms.instanceMatrix.needsUpdate = true;
    });
  };

  TYPES.meadow = function (c) {
    var b = c.b, r = c.rnd;
    var hill = mountain(c, { z: -44, r: 64, sz: .62, h: 50, n: 11, rings: [[0, 1], [.3, .75], [.65, .45], [.9, .2]], paint: paintForest });
    b.box(0, -6, 5, 120, 7, 30, P.grass2);
    waterRect(c, -60, 20, 60, 58, .5, false);
    house(b, -18, 1, 0, 12, 9, 7, 6, P.woodL, P.slate, 0, { side: true });
    flag(c, 12, 1, 6, 20, 9, 'ch');
    b.box(30, -1, 24, 3, 1.5, 12, P.wood);
    trees(c, 22, -58, -66, 58, -8, 14, 'mix', hill.heightAt, function (x, z) { return hill.heightAt(x, z) < 1; });
    [[-40, 8], [-32, 14], [40, 4], [46, 12], [-50, -2]].forEach(function (q) { tree(b, q[0], 1, q[1], 12, r, 'd'); });
    sail(c, boat(c, 'steamer'), 0, 42, 42, 7, 70, .2);
  };

  /* ---------- Berge ---------- */
  function summit(c, a, kind) {
    var b = c.b;
    b.box(a[0], a[1] - 4, a[2], .9, 12, .9, P.dark); b.box(a[0], a[1] + 4.6, a[2], 5, .9, .9, P.dark);
    flag(c, a[0] + 3.4, a[1] - 3, a[2] + 1.6, 8, 7, kind || 'canton');
  }
  TYPES.peak = function (c) {
    var m = mountain(c, { r: 58, h: 116, n: 9, paint: paintAlpine(2, .42) });
    summit(c, m.apex);
    trees(c, 14, -60, -60, 60, 60, 12, 'c', m.heightAt, null, 26);
  };
  TYPES['peak-snow'] = function (c) {
    var p = paintAlpine(.3, .12);
    mountain(c, { x: -34, z: -16, r: 30, h: 78, n: 8, paint: p });
    mountain(c, { x: 32, z: -12, r: 28, h: 66, n: 8, paint: p });
    summit(c, mountain(c, { r: 48, h: 132, n: 9, paint: p }).apex);
  };
  TYPES.matterhorn = function (c) {
    var m = mountain(c, { r: 58, h: 146, n: 8, ridges: .72, jit: .06, lx: -12, lz: 4, bend: 2.6,
      rings: [[0, 1], [.07, .84], [.18, .6], [.34, .42], [.52, .29], [.7, .18], [.84, .1], [.94, .05]],
      paint: function (fy, ny, r) {
        if (fy < .12 && ny > .3) return r() < .6 ? P.snow : P.ice;
        if (ny > .42 || (ny > .2 && r() < .3)) return r() < .75 ? P.snow : P.snow2;
        return r() < .5 ? '#6E655C' : '#81776C';
      } });
    var a = m.apex;
    summit(c, a, 'ch');
    particles(c, 'cloud', 150, function (i, r) { return [a[0] + 3 + (r() - .5) * 4, a[1] - 5 - r() * 16, a[2] + (r() - .5) * 8]; }, 6, '#FFFFFF', .32, [62, 10, 18, 11]);
  };

  TYPES['peak-tower'] = function (c) {
    var b = c.b;
    var m = mountain(c, { r: 58, h: 62, n: 10, rings: [[0, 1], [.3, .78], [.6, .5], [.86, .24]], flat: true, paint: paintForest, jit: .1 });
    var a = m.apex, y0 = a[1] - .5;
    trees(c, 28, -58, -58, 58, 58, 12, 'c', m.heightAt, function (x, z) { return Math.hypot(x - a[0], z - a[2]) < 14; });
    var tx = a[0] - 4, tz = a[2] + 3, H = 34, st = P.steel, cn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    function hw(y) { return 5 - 2.6 * (y - y0) / H; }
    cn.forEach(function (q) { b.beam([tx + q[0] * 5, y0 - 3, tz + q[1] * 5], [tx + q[0] * 2.4, y0 + H, tz + q[1] * 2.4], .55, st); });
    for (var k = 0; k < 4; k++) {
      var ya = y0 + k * H / 4, yb = y0 + (k + 1) * H / 4, wa = hw(ya), wb = hw(yb);
      for (var s = 0; s < 4; s++) {
        var p = cn[s], q = cn[(s + 1) % 4];
        b.beam([tx + p[0] * wa, ya, tz + p[1] * wa], [tx + q[0] * wb, yb, tz + q[1] * wb], .3, st);
        b.beam([tx + q[0] * wa, ya, tz + q[1] * wa], [tx + p[0] * wb, yb, tz + p[1] * wb], .3, st);
      }
    }
    b.box(tx, y0 + H, tz, 7, .6, 7, st);
    cn.forEach(function (q) { b.box(tx + q[0] * 3.2, y0 + H + .6, tz + q[1] * 3.2, .25, 2.6, .25, st); });
    b.pyr(tx, y0 + H + 3.2, tz, 7.4, 2.2, 7.4, P.slate);
    flag(c, tx, y0 + H + 5.4, tz, 4, 5, 'canton');
    var mx = a[0] + 7, mz = a[2] - 5;
    for (k = 0; k < 6; k++) b.cyl(mx, y0 - 2 + k * 8, mz, 1.2 - k * .12, 10, k % 2 ? P.red : P.white, 6);
    b.cyl(mx, y0 + 46, mz, .25, 9, P.metal, 4);
    var lamp = new T.Mesh(G('ico'), new T.MeshBasicMaterial({ color: '#FF3B30' }));
    lamp.scale.setScalar(1.1); lamp.position.set(mx, y0 + 55.6, mz); c.g.add(lamp);
    c.A.push(function (t) { lamp.visible = (t % 1.6) < .55; });
    house(c.b, a[0] - 3, y0, a[2] - 13, 14, 9, 6, 4, P.wall, P.tile, 0, { side: true });
  };

  // Seillinie von A nach B; wo das Gelände zu nah kommt, wird eine Stütze eingefügt
  function cableLine(c, hAt, A, B, clear) {
    var pts = [A, B];
    for (var it = 0; it < 3; it++) {
      var best = 0, bi = -1, bp = null;
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1];
        for (var k = 2; k < 29; k++) {
          var f = k / 30, x = p[0] + (q[0] - p[0]) * f, z = p[2] + (q[2] - p[2]) * f, y = p[1] + (q[1] - p[1]) * f, g = hAt(x, z) + clear - y;
          if (g > best) { best = g; bi = i; bp = [x, hAt(x, z) + clear + 3, z]; }
        }
      }
      if (bi < 0) break;
      pts.splice(bi + 1, 0, bp);
      var gy = hAt(bp[0], bp[2]);
      c.b.beam([bp[0], gy - 4, bp[2]], [bp[0], bp[1] + 1, bp[2]], 1.4, P.steel);
      var dx = B[0] - A[0], dz = B[2] - A[2];
      c.b.box(bp[0], bp[1] + .4, bp[2], .8, .8, 7, P.steel, Math.atan2(-dz, dx));
    }
    return pts;
  }
  TYPES['peak-cablecar'] = function (c) {
    var b = c.b;
    var m = mountain(c, { x: -10, z: -10, r: 50, h: 112, n: 9, flat: true, paint: paintAlpine(.66, .3), rings: [[0, 1], [.26, .74], [.5, .48], [.72, .27], [.9, .13]] });
    var a = m.apex, y0 = a[1];
    b.box(a[0], y0 - 6, a[2], 12, 14, 10, '#D9D6CF'); wins(b, a[0], a[2], 12, 10, 0, [y0 + 3], 2.6, 4, 3, '#5E7E92', 2.2);
    b.box(a[0] + 3.5, y0 + 8, a[2] - 2.5, .7, 14, .7, P.metal); b.box(a[0] + 3.5, y0 + 18, a[2] - 2.5, 3, .4, .4, P.metal);
    var rest = part(function (rb) {
      rb.cyl(0, 0, 0, 7.5, 3.4, '#E4E1DA', 12);
      for (var i = 0; i < 12; i++) { var q = (i + .5) / 12 * TAU; rb.quad(Math.sin(q) * 7.5, .8, Math.cos(q) * 7.5, 3, 1.8, '#5E7E92', q); }
      rb.cone(0, 3.4, 0, 8, 1.6, P.metal, 12); rb.box(6.4, 3.2, 0, 1.4, 1.4, 1.4, c.brand);
    });
    rest.position.set(a[0], y0 + 8, a[2]); c.g.add(rest);
    var vx = 42, vz = 42;
    b.box(vx, -6, vz, 12, 14, 10, '#D9D6CF', -PI / 4); b.box(vx, 8, vz, 13, 1, 11, P.metal, -PI / 4);
    var A = [a[0] + 4, y0 + 5, a[2] + 4], B = [vx - 3, 7, vz - 3], pts = cableLine(c, m.heightAt, A, B, 10);
    var dx = B[0] - A[0], dz = B[2] - A[2], l = Math.hypot(dx, dz), ox = -dz / l * 2.4, oz = dx / l * 2.4;
    [-1, 1].forEach(function (s, i) {
      var pp = pts.map(function (p) { return [p[0] + ox * s, p[1], p[2] + oz * s]; });
      for (var k = 0; k < pp.length - 1; k++) b.beam(pp[k], pp[k + 1], .35, P.dark);
      var path = new Path(pp.map(function (p) { return [p[0], p[1] - 7, p[2]]; })), v = new T.Vector3();
      var cab = part(function (cb) {
        cb.box(0, 0, 0, 5, 3.4, 3.4, c.brand); cb.box(0, 1.3, 0, 5.1, 1.2, 3.5, '#5E7E92');
        cb.box(0, 3.4, 0, .4, 3.4, .4, P.dark); cb.box(0, 6.6, 0, 2.4, .6, .6, P.dark);
      });
      c.g.add(cab);
      c.A.push(function (t) { var f = pingpong(t, 40); path.at((i ? 1 - f : f) * path.len, v); cab.position.copy(v); cab.rotation.y = Math.atan2(-dz, dx); });
    });
    c.A.push(function (t) { rest.rotation.y = t * .12; });
    flag(c, a[0] - 4.5, y0 + 8, a[2] - 3.5, 6, 6, 'canton');
  };

  TYPES['peak-rail'] = function (c) {
    var b = c.b;
    var m = mountain(c, { r: 56, h: 96, n: 10, flat: true, rings: [[0, 1], [.3, .72], [.58, .44], [.8, .22], [.94, .11]], paint: paintAlpine(2, .45) });
    var a = m.apex, pts = [], N = 26, k;
    for (k = 0; k <= N; k++) {
      var u = k / N * .9, ang = 2.2 - u * 3.1, rad = 66 * (1 - u) + 4 * u;
      var x = a[0] * u + Math.sin(ang) * rad, z = a[2] * u + Math.cos(ang) * rad;
      pts.push([x, m.heightAt(x, z) + 1.2, z, m.heightAt(x, z)]);
    }
    for (var it = 0; it < 3; it++) for (k = 1; k < N; k++) pts[k][1] = Math.max(pts[k][3] + 1, (pts[k - 1][1] + 2 * pts[k][1] + pts[k + 1][1]) / 4);
    for (k = 0; k < N; k++) seg(b, pts[k], pts[k + 1], 3.2, .8, '#6E665E');
    var p0 = pts[0]; b.box(p0[0], -6, p0[2], 10, 13, 8, P.wall); b.gable(p0[0], 7, p0[2], 11, 3, 9, P.tile);
    house(b, a[0] - 6, a[1], a[2] - 8, 22, 12, 10, 6, P.wall, P.slate, .4, { hip: .7, side: true });
    var train = part(function (tb) {
      tb.box(0, 0, 0, 12, 3.4, 3, c.brand); tb.box(0, 1.4, 0, 12.1, 1.2, 3.1, '#3E4A55'); tb.box(0, 3.4, 0, 11.6, .5, 2.8, P.white);
      tb.box(-4, -.6, 0, 2, .7, 2.4, P.dark); tb.box(4, -.6, 0, 2, .7, 2.4, P.dark);
    });
    shuttle(c, train, new Path(pts.map(function (p) { return [p[0], p[1] + 1.4, p[2]]; })), 44, 6);
    flag(c, a[0] + 6, a[1], a[2] + 5, 9, 7, 'canton');
  };

  TYPES.observatory = function (c) {
    var b = c.b, p = paintAlpine(.36, .08);
    mountain(c, { x: -36, z: -8, r: 31, h: 116, n: 8, paint: p });
    mountain(c, { x: 36, z: -12, r: 34, h: 142, n: 9, paint: p });
    var sad = mountain(c, { x: 0, z: -10, r: 40, sx: 1.4, sz: .8, h: 64, n: 10, rings: [[0, 1], [.5, .72], [.88, .4]], flat: true, paint: p });
    var sph = mountain(c, { x: 2, z: 8, r: 11, h: 82, n: 7, rings: [[0, 1], [.5, .72], [.9, .48]], flat: true,
      paint: function (fy, ny, r) { return ny > .7 ? P.snow : r() < .5 ? P.rock : P.rock2; } });
    var y0 = sph.top, x = 2, z = 8;
    b.box(x, y0 - 4, z, 9, 9, 9, '#D7DADD'); b.box(x, y0 + 5, z, 11, .5, 11, P.steel); b.cyl(x, y0 + 5.5, z, 3.6, 2.5, '#D7DADD', 12);
    wins(b, x, z, 9, 9, 0, [y0 + 1], 2, 3, 3, '#5E7E92', 1.6);
    var dome = part(function (db) { db.dome(0, 0, 0, 3.9, 3.9, '#C9CED3', 12); db.beam([0, 1.6, 0], [0, 4.2, 3.4], .9, P.dark); });
    dome.position.set(x, y0 + 8, z); c.g.add(dome);
    c.A.push(function (t) { dome.rotation.y = t * .25; });
    flag(c, x + 5, y0 + 5.5, z + 5, 8, 6, 'ch');
    var line = []; for (var k = 0; k <= 8; k++) { var zz = 14 + k * 5.6; line.push([-8 + Math.sin(k * .5) * 4, zz, 22 - k * 1.2, sad.heightAt(-8, zz) * .3 + 30 - k * 3.6]); }
    iceBand(c, line);
  };

  // Eisstrom entlang [[x, z, Breite, y], ...]: gewölbtes Querprofil, Mittelmoränen, Spalten am Rand
  function iceBand(c, line) {
    var b = c.b, U = [-1.12, -.82, -.42, -.3, .3, .42, .82, 1.12], rows = [], nrm = [];
    line.forEach(function (q, i) {
      var a = line[Math.max(0, i - 1)], e = line[Math.min(line.length - 1, i + 1)], dx = e[0] - a[0], dz = e[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      nrm.push([nx, 0, nz, dx / l, dz / l]);
      rows.push(U.map(function (u) { return [q[0] + nx * u * q[2] / 2, q[3] + (Math.abs(u) > 1 ? -5 : (1 - u * u) * 3), q[1] + nz * u * q[2] / 2]; }));
    });
    for (var i = 0; i < rows.length - 1; i++) for (var j = 0; j < U.length - 1; j++) {
      var col = (j === 2 || j === 4) ? '#7D766E' : (j === 0 || j === 6) ? P.ice2 : i < 2 ? P.snow : (i % 2 && (j === 1 || j === 5) ? P.ice2 : P.ice);
      b.quad4(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j], col, [0, 1, 0]);
    }
    for (i = 0; i < rows.length - 1; i++) [0, U.length - 1].forEach(function (j) {
      var p = rows[i][j], q = rows[i + 1][j], s = j ? 1 : -1;
      b.quad4(p, q, [q[0], -4, q[2]], [p[0], -4, p[2]], P.ice2, [nrm[i][0] * s, 0, nrm[i][2] * s]);
    });
    var L = rows[rows.length - 1], n = nrm[nrm.length - 1];
    for (j = 0; j < U.length - 1; j++) b.quad4(L[j], L[j + 1], [L[j + 1][0], -4, L[j + 1][2]], [L[j][0], -4, L[j][2]], P.ice2, [n[3], 0, n[4]]);
    return rows;
  }
  TYPES.glacier = function (c) {
    var p = paintAlpine(.45, .2);
    mountain(c, { x: -46, z: -4, r: 36, sx: .5, sz: 1.6, h: 64, n: 10, paint: p });
    var R = mountain(c, { x: 47, z: -8, r: 36, sx: .5, sz: 1.6, h: 78, n: 10, paint: p });
    var line = [];
    for (var k = 0; k <= 12; k++) { var z = -58 + k * 9; line.push([Math.sin(z * .035) * 6, z, 52 - k * 2.1, 28 - k * 2.1]); }
    iceBand(c, line);
    var e = line[line.length - 1];
    river(c, [[e[0], e[1] - 1, 7], [e[0] + 3, 60, 8]], .5);
    flag(c, R.apex[0], R.apex[1] - 1, R.apex[2], 6, 6, 'canton');
    var hikers = [];
    for (k = 0; k < 4; k++) { var h = part(function (hb) { person(hb, 0, 0, 0, 2.6, k % 2 ? c.brand : '#3A3F4A'); }); c.g.add(h); hikers.push(h); }
    var path = new Path(line.slice(2, 11).map(function (q) { return [q[0] + 8, q[3] + 2.4, q[1]]; })), v = new T.Vector3();
    c.A.push(function (t) { for (var i = 0; i < hikers.length; i++) { path.at(((t * 1.6 - i * 3) % path.len + path.len) % path.len, v); hikers[i].position.copy(v); } });
  };

  TYPES.ridge = function (c) {
    var b = c.b, r = c.rnd, n = 7, pts = [], i;
    for (i = 0; i <= 2 * n; i++) {
      var x = -56 + 112 * i / (2 * n), top = i === 0 || i === 2 * n ? 18 : i % 2 ? 50 + r() * 14 : 34 + r() * 6;
      pts.push({ C: [x, top, (r() - .5) * 3], S1: [x, top * .55, 6 + r() * 2], S2: [x, 0, 11], N1: [x, top * .5, -20 - r() * 4], N2: [x, 0, -44], top: top });
    }
    for (i = 0; i < 2 * n; i++) {
      var a = pts[i], e = pts[i + 1];
      b.quad4(a.C, e.C, e.S1, a.S1, pick(r, [P.lime, '#C4BCAF']), [0, .2, 1]);
      b.quad4(a.S1, e.S1, e.S2, a.S2, pick(r, [P.rock3, P.lime]), [0, .1, 1]);
      b.quad4(a.C, a.N1, e.N1, e.C, r() < .5 ? P.grass : P.rock3, [0, .6, -1]);
      b.quad4(a.N1, a.N2, e.N2, e.N1, r() < .5 ? P.grass2 : P.grassD, [0, .7, -1]);
      b.quad4(a.S2, e.S2, [e.S2[0], -15, 11], [a.S2[0], -15, 11], P.rock3, [0, 0, 1]);
      b.quad4(a.N2, e.N2, [e.N2[0], -15, -44], [a.N2[0], -15, -44], P.grassD, [0, 0, -1]);
    }
    [[pts[0], -1], [pts[2 * n], 1]].forEach(function (q) {
      var p = q[0], h = [q[1], 0, 0];
      b.tri(p.C, p.S1, p.S2, P.rock3, h); b.tri(p.C, p.S2, p.N2, P.rock3, h); b.tri(p.C, p.N2, p.N1, P.rock3, h);
      b.quad4(p.S2, [p.S2[0], -15, 11], [p.N2[0], -15, -44], p.N2, P.rock3, h);
    });
    waterRect(c, -60, 11, 60, 56, .5, false);
    for (i = 0; i < 14; i++) {
      var tx = -50 + r() * 100, tz = -42 + r() * 18, k = Math.min(2 * n - 1, Math.floor((tx + 56) / 112 * 2 * n)), f = ((tx + 56) / 112 * 2 * n) - k;
      var tp = pts[k].top * (1 - f) + pts[k + 1].top * f;
      tree(b, tx, (tz + 44) / 24 * tp * .5 - 1, tz, 11, r, 'c');
    }
    paraglider(c, 0, 52, 26, 26, 22);
  };
  function paraglider(c, cx, cy, cz, rad, period) {
    var g = part(function (pb) {
      for (var i = -2; i <= 2; i++) { var a = i * .3; pb.put(G('box'), mat(0, 8 - (1 - Math.cos(a)) * 6, Math.sin(a) * 6, 3.2, .5, 2.7, 0, a), i % 2 ? c.accent : c.brand); }
      [-1, 1].forEach(function (s) { pb.beam([0, .4, 0], [0, 8 - (1 - Math.cos(.6)) * 6, s * Math.sin(.6) * 6], .1, P.dark); });
      pb.box(0, -1.2, 0, .8, 1.6, .8, '#3A3F4A'); pb.ball(0, .7, 0, .35, P.skin, 6);
    });
    c.g.add(g); var ph = c.rnd() * TAU;
    c.A.push(function (t) {
      var a = ph + t / period * TAU;
      g.position.set(cx + Math.cos(a) * rad, cy + Math.sin(t * .4) * 4, cz + Math.sin(a) * rad * .6);
      g.rotation.set(.25, Math.atan2(-Math.cos(a) * .6, -Math.sin(a)), 0, 'YZX');
    });
  }

  TYPES.cirque = function (c) {
    var b = c.b, r = c.rnd, N = 18, a0 = -2.05, a1 = 2.05, ri = 30, ro = 56, H = 44, ring = [];
    function pt(th, rad, y) { return [Math.sin(th) * rad, y, -Math.cos(th) * rad]; }
    for (var k = 0; k <= N; k++) {
      var th = a0 + (a1 - a0) * k / N;
      ring.push({ th: th, I0: pt(th, ri + r() * 2, H + r() * 2), I1: pt(th, ri + 1 + r() * 2, H * .66), I2: pt(th, ri + 1.5 + r() * 2, H * .33), I3: pt(th, ri - 5 - r() * 3, 0),
        O0: pt(th, ro - 4, H * .88), O1: pt(th, ro + 4, 0) });
    }
    for (k = 0; k < N; k++) {
      var A = ring[k], B = ring[k + 1], tm = (A.th + B.th) / 2, inn = [-Math.sin(tm), 0, Math.cos(tm)], out = [Math.sin(tm), 0, -Math.cos(tm)];
      b.quad4(A.I0, B.I0, B.I1, A.I1, '#D3CBBC', inn);
      b.quad4(A.I1, B.I1, B.I2, A.I2, k % 3 ? '#BCB3A3' : '#C8C0B0', inn);
      b.quad4(A.I2, B.I2, B.I3, A.I3, '#A9A194', [inn[0], .6, inn[2]]);
      b.quad4(A.I0, A.O0, B.O0, B.I0, r() < .5 ? P.grass : P.grass2, [0, 1, 0]);
      b.quad4(A.O0, A.O1, B.O1, B.O0, r() < .5 ? P.grassD : '#3F6638', [out[0], .7, out[2]]);
      b.quad4(A.O1, B.O1, [B.O1[0], -15, B.O1[2]], [A.O1[0], -15, A.O1[2]], P.grassD, out);
    }
    [[ring[0], -1], [ring[N], 1]].forEach(function (q) {
      var p = q[0], h = [Math.cos(p.th) * q[1], 0, Math.sin(p.th) * q[1]], lo = [p.O1[0], -15, p.O1[2]], li = [p.I3[0], -15, p.I3[2]];
      b.tri(p.I0, p.I1, p.O0, P.rock3, h); b.tri(p.I1, p.I2, p.O0, P.rock3, h); b.tri(p.I2, p.O1, p.O0, P.rock3, h); b.tri(p.I2, p.I3, p.O1, P.rock3, h);
      b.quad4(p.I3, li, lo, p.O1, P.rock3, h);
    });
    b.cyl(0, -6, 0, ri - 2, 6.4, P.grass, 16);
    trees(c, 14, -26, -26, 26, 26, 11, 'c', function () { return .4; }, function (x, z) { return Math.hypot(x, z) > ri - 7; });
    trees(c, 10, -60, -60, 60, 30, 11, 'c', function (x, z) { var d = Math.hypot(x, z); return d > ro - 2 && d < ro + 4 ? (ro + 4 - d) / 8 * H * .88 : 0; }, function (x, z) { var d = Math.hypot(x, z); return d < ro - 2 || d > ro + 3 || z > 20; });
    bird(c, 0, 30, -6, 18, 8, 5); bird(c, 6, 36, -2, 24, -9, 5);
  };

  TYPES['cliff-lift'] = function (c) {
    var b = c.b;
    rockWall(c, { x0: -58, x1: 58, z: 0, d: 46, h: 90, nx: 9, ny: 7, jit: 2.5, over: 3, topJit: 0, cols: [P.lime, P.rock3, '#A8A091'] });
    var knoll = mountain(c, { x: 24, z: -16, r: 18, h: 124, n: 7, rings: [[0, 1], [.72, .8], [.9, .4]],
      paint: function (fy, ny, rr) { return ny > .6 ? P.grassD : rr() < .5 ? P.lime : P.rock3; } });
    trees(c, 12, -54, -44, 54, -6, 12, 'mix', function () { return 90.4; }, function (x, z) { return Math.hypot(x - 24, z + 16) < 17; });
    house(b, -30, 90.4, -28, 26, 14, 12, 3, P.wall, P.slate, 0, { hip: .8, side: true });
    b.box(-4, 89, -30, 16, 8.4, 12, '#9DB4C0'); b.box(-4, 97.4, -30, 17, .6, 13, P.steel);
    waterRect(c, -60, 0, 60, 46, .5, false);
    b.box(0, 44, 3.6, 116, .8, 4.4, P.path); b.box(0, 44.8, 5.6, 116, .9, .2, P.steel);
    var lx = 24, lz = 8, y0 = 44.8, y1 = 118, cn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    cn.forEach(function (q) { b.beam([lx + q[0] * 1.8, y0, lz + q[1] * 1.8], [lx + q[0] * 1.8, y1, lz + q[1] * 1.8], .35, P.steel); });
    for (var y = y0 + 8; y < y1; y += 8) for (var s = 0; s < 4; s++) {
      var p = cn[s], q = cn[(s + 1) % 4];
      b.beam([lx + p[0] * 1.8, y, lz + p[1] * 1.8], [lx + q[0] * 1.8, y, lz + q[1] * 1.8], .25, P.steel);
      if (s === 0 && (y - y0) % 16 < 1) b.beam([lx, y, lz - 1.8], [lx, y, -4], .3, P.steel);
    }
    b.box(lx, y1, lz, 5, 4, 5, P.steel); b.box(lx, y1 + 1, lz - 9, 2, .5, 14, P.steel);
    var cab = part(function (cb) { cb.box(0, 0, 0, 2.8, 3.2, 2.8, '#C9D3DA'); cb.box(0, 3.2, 0, 3, .4, 3, c.brand); cb.box(0, 1, 0, 2.9, 1.4, 2.9, '#5E7E92'); });
    c.g.add(cab);
    c.A.push(function (t) { cab.position.set(lx, y0 + 1 + pingpong(t, 30) * (y1 - y0 - 6), lz); });
    flag(c, knoll.apex[0], knoll.apex[1] - 1, knoll.apex[2], 6, 6, 'canton');
    sail(c, boat(c, 'sail'), 0, 30, 30, 8, 36, .5);
  };

  TYPES.fossil = function (c) {
    var b = c.b;
    var m = mountain(c, { x: -14, z: -18, r: 46, h: 82, n: 8, rings: [[0, 1], [.3, .7], [.6, .42], [.86, .14]], paint: paintForest, jit: .08 });
    trees(c, 26, -60, -64, 32, 28, 12, 'mix', m.heightAt, null, 70);
    waterRect(c, -60, 34, 60, 60, .5, false);
    b.box(32, -4, 16, 9, 7, 9, P.stone); b.box(32, 3, 16, 7, .6, 7, P.stone2);
    var am = part(function (ab) {
      var prev = null, n = 26, tmax = 3 * PI, k2 = Math.log(7) / tmax;
      for (var k = 0; k <= n; k++) {
        var th = k / n * tmax, R = Math.exp(k2 * th), p = [Math.cos(th) * R, Math.sin(th) * R, 0];
        if (prev) ab.beam(prev, p, .55 * R + .3, k % 2 ? '#D8C49A' : '#BFA678');
        prev = p;
      }
    });
    am.position.set(32, 11.4, 16); c.g.add(am);
    c.A.push(function (t) { am.rotation.y = t * .4; });
  };

  /* ---------- Wasser ---------- */
  TYPES.lake = function (c) {
    var b = c.b, r = c.rnd;
    mountain(c, { x: 0, z: -46, r: 40, sx: 1.4, sz: .55, h: 66, n: 10, paint: paintAlpine(.78, .32) });
    b.cyl(0, -6, 4, 58, 6.4, P.grass, 18);
    var pts = [];
    for (var k = 0; k < 16; k++) { var a = k / 16 * TAU, rr = 40 * (.85 + r() * .25); pts.push([Math.sin(a) * rr * 1.1, 10 + Math.cos(a) * rr * .8]); }
    waterPoly(c, pts, .8);
    pts.forEach(function (q, i) { if (i % 2) b.box(q[0] * 1.05, -.5, 10 + (q[1] - 10) * 1.05, 3 + r() * 3, 2 + r(), 3, pick(r, [P.rock, P.rock3]), r() * 3); });
    trees(c, 18, -58, -30, 58, 60, 12, 'c', function () { return .4; }, function (x, z) { return Math.hypot(x / 1.1, (z - 10) / .8) < 48 || Math.hypot(x, z - 4) > 55; });
    sail(c, boat(c, 'sail'), 0, 12, 22, 14, 40, .8);
  };

  TYPES.waterfall = function (c) {
    var b = c.b, r = c.rnd, top = 24, i;
    b.box(0, -8, -36, 120, top + 8, 52, P.rock2);
    river(c, [[0, -62, 92], [0, -10, 92]], top + .5);
    [-1, 1].forEach(function (s) {
      b.at(0, 0, 0, -s * H2); rockWall(c, { x0: -62, x1: 52, z: -46, d: 14, h: top + 10, nx: 8, ny: 3, jit: 1.5 }); b.end();
      trees(c, 7, s > 0 ? 48 : -59, -56, s > 0 ? 59 : -48, 50, 13, 'c', function () { return top + 10; });
    });
    for (i = 0; i < 6; i++) b.box(-40 + i * 15 + r() * 4, -2, -8.5 + r() * 3, 4 + r() * 2, top - 6 + r() * 6, 4.5, pick(r, [P.rock, P.rock2, P.rock3]), r() * .3);
    waterMat(true);
    var fm = MAT.foam || (MAT.foam = new T.MeshBasicMaterial({ color: '#E4F0F8', map: TEX.flow, transparent: true, opacity: .92 }));
    var prof = [[top + .5, -10], [15, -5], [1, 5]], pos = [], uv = [], X0 = -46, X1 = 46, s = [0];
    for (i = 1; i < prof.length; i++) s.push(s[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    for (i = 0; i < prof.length - 1; i++) {
      var A = prof[i], B = prof[i + 1], ua = s[i] / 30, ub = s[i + 1] / 30;
      pos.push(X0, A[0], A[1], X0, B[0], B[1], X1, B[0], B[1], X0, A[0], A[1], X1, B[0], B[1], X1, A[0], A[1]);
      uv.push(ua, X0 / 30, ub, X0 / 30, ub, X1 / 30, ua, X0 / 30, ub, X1 / 30, ua, X1 / 30);
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals(); c.g.add(new T.Mesh(g, fm));
    var rp = function (fy, ny, rr) { return ny > .7 ? P.grassD : (rr() < .5 ? P.rock : P.rock2); };
    var rock = mountain(c, { x: 4, z: -3, r: 7, h: 34, n: 6, rings: [[0, 1], [.5, .72], [.85, .5]], flat: true, jit: .12, paint: rp });
    mountain(c, { x: -24, z: -2, r: 5, h: 22, n: 6, rings: [[0, 1], [.6, .6]], flat: true, paint: rp });
    flag(c, rock.apex[0], rock.apex[1], rock.apex[2], 6, 6, 'ch');
    waterRect(c, -60, -9, 60, 60, .8, false);
    particles(c, 'fall', 320, function (i, rr) { return [-44 + rr() * 88, top + .2, -10]; }, 1.6, '#FFFFFF', .85, [top - 1, 12, 0, 2.4]);
    particles(c, 'mist', 90, function (i, rr) { return [-40 + rr() * 80, 1, -1 + rr() * 12]; }, 5, '#FFFFFF', .22, [18, 18, 14, 6]);
  };

  TYPES.fountain = function (c) {
    var b = c.b, r = c.rnd;
    waterRect(c, -60, -36, 60, 60, .5, false);
    b.box(0, -8, -48, 120, 10, 24, P.stone);
    for (var i = 0; i < 11; i++) tree(b, -55 + i * 11, 2, -52, 11, r, 'd');
    b.box(-2, -6, -14, 6, 7.6, 44, P.stone);
    b.cyl(-2, 1.6, 6, 1.3, 7, P.white, 8); b.cone(-2, 8.6, 6, 1.6, 2.4, P.red, 8);
    var core = new T.Mesh(G('frus:10:0.30'), MAT.jet || (MAT.jet = new T.MeshBasicMaterial({ color: '#F4FAFF', transparent: true, opacity: .55, depthWrite: false })));
    core.scale.set(2.4, 126, 2.4); core.position.set(4, .5, 6); c.g.add(core);
    particles(c, 'jet', 380, [[4, .5, 6]], 3.2, '#FFFFFF', .8, [136, 18, 10, 9]);
    particles(c, 'mist', 80, function (i, rr) { return [4 + (rr() - .5) * 10, .6, 6 + (rr() - .5) * 10]; }, 6, '#FFFFFF', .35, [24, 10, 24, 5]);
    sail(c, boat(c, 'sail'), -14, 32, 30, 12, 45, .5);
    flag(c, -4, 1.6, -30, 12, 6, 'canton');
  };

  TYPES.dam = function (c) {
    var b = c.b, H = 78, Rr = 64, cz = 52, a0 = -.74, a1 = .74, N = 10, con = '#D6D3CB', con2 = '#C4C0B6', k;
    var p = paintAlpine(.72, .3), rings = [[0, 1], [.35, .8], [.7, .5], [.9, .2]];
    mountain(c, { x: -48, z: 6, r: 36, sx: .6, sz: 1.5, h: 112, n: 9, rings: rings, paint: p });
    mountain(c, { x: 48, z: 4, r: 36, sx: .6, sz: 1.5, h: 120, n: 9, rings: rings, paint: p });
    function q(th, rho, y) { return [Math.sin(th) * rho, y, cz - Math.cos(th) * rho]; }
    for (k = 0; k < N; k++) {
      var ta = a0 + (a1 - a0) * k / N, tb = a0 + (a1 - a0) * (k + 1) / N, tm = (ta + tb) / 2, out = [Math.sin(tm), 0, -Math.cos(tm)];
      b.quad4(q(ta, Rr, -6), q(tb, Rr, -6), q(tb, Rr, H), q(ta, Rr, H), con2, out);
      b.quad4(q(ta, Rr, H), q(tb, Rr, H), q(tb, Rr - 7, H), q(ta, Rr - 7, H), con, [0, 1, 0]);
      b.quad4(q(ta, Rr - 7, H), q(tb, Rr - 7, H), q(tb, Rr - 34, -6), q(ta, Rr - 34, -6), k % 2 ? con : shade(con, .95), [-out[0], .6, -out[2]]);
      var m = q(tm, Rr - .5, H); b.box(m[0], H, m[2], (tb - ta) * Rr + .2, 1, .4, con2, -tm);
      m = q(tm, Rr - 6.5, H); b.box(m[0], H, m[2], (tb - ta) * (Rr - 6.5) + .2, 1, .4, con2, -tm);
    }
    var pos = [], uv = [], M = 16, yW = H - 3;
    for (k = 0; k < M; k++) {
      var t0 = -1.1 + 2.2 * k / M, t1 = -1.1 + 2.2 * (k + 1) / M, p0 = q(t0, Rr + .5, yW), p1 = q(t1, Rr + .5, yW);
      pos.push(p0[0], yW, p0[2], p1[0], yW, p1[2], p1[0], yW, -60, p0[0], yW, p0[2], p1[0], yW, -60, p0[0], yW, -60);
    }
    for (k = 0; k < pos.length; k += 3) uv.push(pos[k] / 30, pos[k + 2] / 30);
    waterMesh(c, pos, uv, false);
    river(c, [[0, 24, 6], [3, 60, 8]], .5);
    particles(c, 'mist', 50, function (i, rr) { return [(rr() - .5) * 6, 1, 24 + rr() * 4]; }, 2.4, '#FFFFFF', .18, [10, 10, 10, 4]);
    particles(c, 'spray', 60, function (i, rr) { return [(rr() - .5) * 3, .8, 23]; }, 1.2, '#FFFFFF', .8, [5, 0, 0, 1.4]);
    var e = q(.6, Rr - 3.5, H);
    b.box(e[0], H - 1, e[2], 7, 6, 6, con2, -.6); b.gable(e[0], H + 5, e[2], 7.6, 2, 6.6, P.slate, -.6);
    flag(c, e[0] - 5, H, e[2] - 2, 8, 6, 'canton');
  };

  TYPES.gorge = function (c) {
    var b = c.b;
    river(c, [[0, -60, 15], [3, -20, 14], [-2, 20, 13], [0, 60, 15]], .5);
    [-1, 1].forEach(function (s) {
      b.at(0, 0, 0, -s * H2);
      rockWall(c, { x0: -60, x1: 60, z: -8.5, d: 32, h: 58, nx: 8, ny: 6, jit: 2.2, over: 5.5, top: P.grassD, ends: .45 });
      b.end();
      trees(c, 9, s > 0 ? 16 : -40, -40, s > 0 ? 40 : -16, 40, 12, 'c', function () { return 57; });
    });
    b.box(0, 44, -6, 24, .5, 2.6, P.wood); b.box(0, 44.5, -7.2, 24, 1.1, .2, P.woodD); b.box(0, 44.5, -4.8, 24, 1.1, .2, P.woodD);
    particles(c, 'spray', 160, function (i, rr) { return [(rr() - .5) * 9, .6, -56 + rr() * 112]; }, 1.4, '#FFFFFF', .85, [2.4, 0, 0, 1.3]);
    particles(c, 'mist', 60, function (i, rr) { return [(rr() - .5) * 8, 1, -50 + rr() * 100]; }, 6, '#FFFFFF', .2, [4, 24, 10, 8]);
  };

  TYPES.cave = function (c) {
    var b = c.b, r = c.rnd;
    var m = mountain(c, { z: -42, r: 52, sx: 1.1, sz: .6, h: 52, n: 10, rings: [[0, 1], [.35, .78], [.7, .45], [.92, .15]],
      paint: function (fy, ny, rr) { return ny > .55 ? (rr() < .5 ? P.grassD : P.grass) : (rr() < .5 ? P.rock : P.rock3); } });
    b.box(0, -10, -9, 24, 42, 26, P.rock3);
    rockWall(c, { x0: -42, x1: -11, z: 3, d: 24, h: 28, nx: 3, ny: 3 }); rockWall(c, { x0: 11, x1: 42, z: 3, d: 24, h: 28, nx: 3, ny: 3 });
    b.door(0, -.2, 4.15, 16.4, 15.4, '#5E5750'); b.door(0, 0, 4.3, 14, 13, '#171412');
    for (var i = 0; i < 7; i++) { var x = -5.4 + i * 1.8; b.put(G('cone:5'), mat(x, 7 + Math.sqrt(Math.max(0, 49 - x * x)) - .4, 4.6, .55, -(2 + r() * 2.5), .55), '#D8CBB0'); }
    [-4, -1.5, 2.5, 4.6].forEach(function (x) { b.cone(x, 0, 4.6, .8, 1.5 + r() * 1.8, '#CDBFA2', 5); });
    b.box(0, -1, 18, 6, 1.3, 28, P.path);
    var glow = new T.Mesh(GEO.circle || (GEO.circle = new T.CircleGeometry(1, 20)), new T.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false }));
    glow.position.set(2.5, 3.2, 4.5); glow.scale.set(3.4, 3.4, 1); c.g.add(glow);
    b.box(2.5, 0, 4.8, .3, 2.6, .3, P.dark); b.box(2.5, 2.6, 4.8, .8, .9, .8, P.winL);
    c.A.push(function (t) { glow.material.opacity = .35 + .25 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 7.3 + 2)); });
    particles(c, 'drip', 40, function (i, rr) { return [-5 + rr() * 10, 11 + rr(), 4.7 + rr() * .6]; }, .5, '#CFE6F2', .9, [10, 0, 0, 3]);
    trees(c, 12, -54, -62, 54, -8, 12, 'mix', m.heightAt, function (x, z) { return Math.abs(x) < 14 && z > -24; }, 46);
    river(c, [[-60, 30, 6], [-20, 34, 6], [20, 28, 6], [60, 32, 6]], .5);
  };

  TYPES.confluence = function (c) {
    var b = c.b, J = [4, 2];
    b.box(0, -6, 0, 120, 6.3, 120, P.grass2);
    var L = [
      [[-60, -36, 16], [-38, -26, 16], [-16, -10, 17], [J[0], J[1], 18]],
      [[-56, 60, 13], [-38, 36, 13], [-16, 16, 14], [J[0], J[1], 14]],
      [[24, 60, 12], [18, 38, 12], [10, 18, 13], [J[0], J[1], 13]],
      [[J[0], J[1], 22], [22, -12, 22], [42, -30, 22], [60, -48, 22]]
    ];
    L.forEach(function (l, i) { river(c, l, .5 + i * .12); });
    function near(x, z) {
      for (var i = 0; i < L.length; i++) for (var k = 0; k < L[i].length - 1; k++) {
        var p = L[i][k], q = L[i][k + 1], dx = q[0] - p[0], dz = q[1] - p[1], f = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(x - p[0] - dx * f, z - p[1] - dz * f) < p[2] / 2 + 5) return true;
      }
      return false;
    }
    trees(c, 44, -58, -58, 58, 58, 11, 'd', function () { return .3; }, near);
    b.box(32, 1, -21, 4, .8, 34, P.stone, Math.atan2(18, 20));
    var pts = L[1].concat(L[3].slice(1)).map(function (p) { return [p[0], 1, p[1]]; }), path = new Path(pts), bt = boat(c, 'row'), A = new T.Vector3(), B = new T.Vector3();
    c.g.add(bt);
    c.A.push(function (t) { var s = (t * 5) % path.len; path.at(Math.min(path.len, s + 3), A); path.at(Math.max(0, s - 3), B); orient(bt, A, B); bt.position.y = .55 + Math.sin(t * 2) * .1; });
  };

  TYPES.vineyard = function (c) {
    var b = c.b, r = c.rnd, NT = 7, tops = [], z0s = [], k;
    for (k = 0; k < NT; k++) {
      var z0 = -50 + k * 10, top = 6 + (NT - 1 - k) * 7.5; tops.push(top); z0s.push(z0);
      b.box(0, -6, z0 + 5, 118, top + 5.4, 10, '#D2C7B2');
      b.box(0, top - .6, z0 + 4.7, 118, .6, 9.4, '#7C8F4A');
      for (var j = 0; j < 2; j++) [[-30, 56], [30, 56]].forEach(function (q) {
        if ((k === 4 || k === 5) && q[0] < 0) return;
        b.box(q[0], top, z0 + 2.4 + j * 3.2, q[1], 1.5, 1, P.vine);
      });
    }
    house(b, -46, tops[4], z0s[4] + 4, 10, 7, 8, 5, P.wall, P.tile, 0, { side: true });
    house(b, -31, tops[4], z0s[4] + 4, 9, 7, 7, 5, '#E9D4A8', P.tile2, 0, { side: true });
    house(b, -40, tops[5], z0s[5] + 4, 12, 7, 6, 4.5, '#F0DDB8', P.tile, 0, { side: true });
    tower(b, -18, tops[5], z0s[5] + 4.5, 5, 20, P.wall, 9, P.tile); flag(c, -18, tops[5] + 28.6, z0s[5] + 4.5, 3, 6.4, 'pennant');
    waterRect(c, -60, 20, 60, 58, .5, false);
    trees(c, 10, -58, -50, 58, -42, 11, 'mix', function () { return tops[0]; });
    var train = part(function (tb) {
      tb.box(5, 0, 0, 3, 2.4, 2, c.brand); tb.box(5.3, 2.4, 0, 2, 1, 1.9, P.white);
      for (var i = 0; i < 2; i++) { var x = 1 - i * 4.4; tb.box(x, 0, 0, 4, 1.4, 2.2, c.accent); tb.box(x, 2.6, 0, 4.1, .2, 2.3, c.brand); tb.box(x - 1.8, 1.4, 0, .15, 1.2, .15, P.dark); tb.box(x + 1.8, 1.4, 0, .15, 1.2, .15, P.dark); }
    });
    var y3 = tops[3], zt = z0s[3] + 8.2;
    shuttle(c, train, new Path([[-52, y3, zt], [52, y3, zt]]), 40, 5);
  };

  function ibex() {
    return part(function (ib) {
      var col = '#7A6A58', d = '#4A3E32';
      ib.ell(0, 3.4, 0, 2.4, 1.2, 1, col);
      [[-1.6, -.6], [-1.6, .6], [1.5, -.6], [1.5, .6]].forEach(function (q) { ib.box(q[0], 0, q[1], .4, 3, .4, col); });
      ib.beam([2, 3.8, 0], [3, 5.6, 0], .8, col); ib.ell(3.3, 5.8, 0, .9, .55, .5, col);
      [-.3, .3].forEach(function (s) { ib.beam([3, 6.2, s], [2.2, 8, s * 1.3], .3, d); ib.beam([2.2, 8, s * 1.3], [1, 8.4, s * 1.5], .25, d); });
      ib.box(-2.5, 3.5, 0, .5, .6, .3, col);
    });
  }
  TYPES.park = function (c) {
    var b = c.b, p = paintAlpine(.7, .35);
    mountain(c, { x: -26, z: -38, r: 34, h: 92, n: 9, paint: p });
    mountain(c, { x: 30, z: -42, r: 30, h: 74, n: 8, paint: p });
    b.box(0, -6, 18, 120, 6.4, 84, P.grass2);
    river(c, [[-60, 50, 5], [-20, 44, 5], [20, 52, 6], [60, 46, 6]], .7);
    trees(c, 34, -58, -24, 58, 58, 12, 'c', function () { return .4; }, function (x, z) { return Math.hypot(x / 30, (z - 18) / 16) < 1 || Math.abs(z - 48) < 6 || Math.hypot(x - 38, z - 32) < 9; });
    house(b, 40, .4, 30, 9, 7, 5, 4, P.woodL, P.slate, -.3, {});
    flag(c, 32, .4, 37, 9, 5, 'canton');
    [0, PI].forEach(function (ph) {
      var ib = ibex(); c.g.add(ib);
      c.A.push(function (t) {
        var a = ph + t * .12, x = Math.cos(a) * 22, z = 18 + Math.sin(a) * 10, dx = -Math.sin(a) * 22, dz = Math.cos(a) * 10;
        ib.position.set(x, .4 + Math.abs(Math.sin(t * 4 + ph)) * .4, z); ib.rotation.set(0, Math.atan2(-dz, dx), Math.sin(t * 4 + ph) * .04, 'YZX');
      });
    });
  };

  TYPES.theatre = function (c) {
    var b = c.b, r = c.rnd, st = '#CFC3AE', st2 = '#BBAE96', N = 14, NT = 7;
    b.box(0, -6, 4, 116, 6.4, 100, P.grass);
    function q(rad, th, y) { return [Math.cos(th) * rad, y, Math.sin(th) * rad]; }
    for (var k = 0; k < NT; k++) {
      var ri = 14 + k * 5, ro = 50, y0 = .4 + k * 3, y1 = y0 + 3, col = k % 2 ? st : st2;
      for (var i = 0; i < N; i++) {
        var ta = PI + PI * i / N, tb = PI + PI * (i + 1) / N, tm = (ta + tb) / 2;
        b.quad4(q(ri, ta, y1), q(ro, ta, y1), q(ro, tb, y1), q(ri, tb, y1), col, [0, 1, 0]);
        b.quad4(q(ri, ta, k ? y0 : -1), q(ri, tb, k ? y0 : -1), q(ri, tb, y1), q(ri, ta, y1), shade(col, .88), [-Math.cos(tm), 0, -Math.sin(tm)]);
        if (k === NT - 1) b.quad4(q(ro, ta, -6), q(ro, tb, -6), q(ro, tb, y1), q(ro, ta, y1), st2, [Math.cos(tm), 0, Math.sin(tm)]);
      }
      [PI, TAU].forEach(function (th) { b.quad4(q(ri, th, k ? y0 : -6), q(ro, th, k ? y0 : -6), q(ro, th, y1), q(ri, th, y1), st2, [0, 0, 1]); });
    }
    b.cyl(0, -1, 0, 14, 1.6, P.sand, 12);
    b.box(0, .4, 9, 64, 2.2, 10, st2);
    for (i = 0; i < 7; i++) b.box(-24 + i * 8, 2.6, 13.4, 5, 2 + r() * 6, 2, st);
    [-18, -10, 10, 18].forEach(function (x) { b.cyl(x, 2.6, 6, .7, 4 + r() * 5, st, 8); });
    [1.2, 1.5, 1.8].forEach(function (f) { var p = q(48, f * PI, .4 + NT * 3); flag(c, p[0], p[1], p[2], 8, 5, 'canton'); });
  };

  TYPES.hut = function (c) {
    var b = c.b;
    rockWall(c, { x0: -58, x1: 58, z: -12, d: 34, h: 96, nx: 9, ny: 7, jit: 3, over: 11, top: P.grassD });
    trees(c, 10, -54, -44, 54, -16, 12, 'c', function () { return 96; });
    b.box(0, -6, 6, 76, 11, 34, P.grass);
    house(b, -6, 5, -3, 22, 12, 13, 6, P.wood, P.woodD, 0, { side: true, win: '#F2EEE6', chimney: true });
    b.box(10, 5, 9, 14, .5, 8, P.woodL);
    [[6, 8], [13, 10]].forEach(function (q) { b.cyl(q[0], 5.5, q[1], .12, 3, P.dark, 4); b.cone(q[0], 8, q[1], 2.4, 1.1, c.brand, 6); });
    flag(c, 16, 5, -1, 11, 6, 'ch'); flag(c, -24, 5, 8, 9, 5, 'canton');
    particles(c, 'smoke', 50, [[-.5, 25.4, -5.4]], 2.2, '#EDEDED', .55, [16, 6, 2, 6]);
    trees(c, 10, -58, 0, 58, 40, 11, 'c', function (x, z) { return Math.abs(x) < 38 && z < 23 ? 5 : 0; }, function (x, z) { return Math.abs(x) < 30 && z < 20; });
  };

  /* ---------- Zuordnung der Wahrzeichen (Reihenfolge wie KANTONE.C[code].marks) ---------- */
  var MARKS = {
    ZH: ['church-twin', 'peak-tower', 'castle', 'castle'],
    BE: ['tower-clock', 'parliament', 'observatory', 'castle'],
    LU: ['bridge-covered', 'monument-lion', 'peak-rail', 'wall'],
    UR: ['monument', 'meadow', 'bridge-stone', 'chapel'],
    SZ: ['museum', 'monastery', 'peak', 'peak-rail'],
    OW: ['chapel-hill', 'monastery', 'peak-cablecar', 'tower'],
    NW: ['peak-cablecar', 'monument', 'cliff-lift'],
    GL: ['square', 'manor', 'lake', 'peak-snow'],
    ZG: ['tower-clock', 'monument', 'cave', 'peak'],
    FR: ['cathedral', 'castle', 'oldtown', 'peak-cablecar'],
    SO: ['basilica', 'peak-cablecar', 'tower-clock'],
    BS: ['minster', 'townhall', 'bridge-stone', 'tripoint'],
    BL: ['theatre', 'castle', 'peak', 'tower'],
    SH: ['waterfall', 'castle-round', 'oldtown', 'monastery'],
    AR: ['peak-cablecar', 'square', 'village', 'peak'],
    AI: ['lake', 'hut', 'peak-cablecar', 'square'],
    SG: ['monastery', 'castle', 'ridge', 'gorge'],
    GR: ['viaduct', 'peak-snow', 'monastery', 'gorge', 'park'],
    AG: ['castle', 'castle', 'monastery', 'confluence'],
    TG: ['monastery', 'manor', 'monastery', 'castle'],
    TI: ['castle', 'church-rock', 'fossil', 'bridge-stone'],
    VD: ['water-castle', 'vineyard', 'cathedral', 'peak-rail'],
    VS: ['matterhorn', 'glacier', 'church-rock', 'dam'],
    NE: ['cirque', 'castle', 'gridtown', 'waterfall'],
    GE: ['fountain', 'basilica', 'palace', 'monument-wall'],
    JU: ['oldtown', 'castle', 'lake', 'oldtown']
  };
  var markType = {};
  Object.keys(MARKS).forEach(function (k) { MARKS[k].forEach(function (t, i) { markType[k + ':' + i] = t; }); });

  function create(type, opts) {
    init(); opts = opts || {};
    if (!TYPES[type]) type = 'monument';
    var seed = opts.seed == null ? 1 : opts.seed | 0, brand = opts.brand || '#E8423F', accent = opts.accent || '#FFD72E';
    if (accent.toLowerCase() === brand.toLowerCase()) accent = '#FFFFFF';
    var c = { g: new T.Group(), A: [], b: new Builder(), rnd: rng(hash(type) ^ Math.imul(seed + 1, 2654435761)), brand: brand, accent: accent, seed: seed, wind: -.35 };
    TYPES[type](c);
    var key = type + '|' + brand + '|' + accent + '|' + seed;
    var mesh = new T.Mesh(STATIC[key] || (STATIC[key] = c.b.geometry()), vcMat());
    mesh.name = 'static'; c.g.add(mesh);
    c.g.name = 'sf-' + type; c.g.userData.type = type;
    var A = c.A;
    return {
      group: c.g,
      update: function (t, dt) { TIME.value = t; animateShared(t); for (var i = 0; i < A.length; i++) A[i](t, dt || 0); }
    };
  }

  return { types: Object.keys(TYPES), markType: markType, create: create, setLift: function (v) { LIFT.value = v; } };
})();
