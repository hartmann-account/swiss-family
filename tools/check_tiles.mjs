// Prüft eine Höhenkachel mit derselben Dekodierung wie app.js.
// Aufruf: node tools/check_tiles.mjs [i_j]   (ohne Angabe: erste Kachel aus index.json)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const dir = new URL('../public/data/tiles/', import.meta.url);
const idx = JSON.parse(readFileSync(new URL('index.json', dir)));
const name = process.argv[2] || idx.tiles[0].join('_');
const raw = gunzipSync(readFileSync(new URL(name + '.bin', dir)));

const nx = idx.n, ny = idx.n, n = nx * ny;
if (raw.length !== 2 * n) throw new Error('falsche Länge ' + raw.length);
const lo = raw.subarray(0, n), hi = raw.subarray(n);
const q = new Int32Array(n);
let min = Infinity, max = -Infinity;
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    const zz = lo[k] | (hi[k] << 8);
    const r = (zz >>> 1) ^ -(zz & 1);
    const p = j === 0 ? (i > 0 ? q[k - 1] : 0) : i === 0 ? q[k - nx] : q[k - 1] + q[k - nx] - q[k - nx - 1];
    q[k] = p + r;
    const h = q[k] * idx.unit;
    if (h < min) min = h;
    if (h > max) max = h;
  }
}
const [ti, tj] = name.split('_').map(Number);
const e = idx.OE + ti * idx.T, nn = idx.ON - tj * idx.T;
console.log(`Kachel ${name} (E ${e}..${e + idx.T}, N ${nn - idx.T}..${nn}): ${nx}x${ny} Knoten, Höhe ${min} .. ${max} m`);
