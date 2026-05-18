// Smoke test: corre el optimizer y el genGcode con el sample de la maqueta
// y verifica invariantes mínimos. NO es el test 1:1 contra maqueta (ese va
// en gcode.test.js con fixtures); este solo destraba la migración.

import { optimize } from '../public/src/core/optimizer.js';
import { genGcode, genSet } from '../public/src/core/gcode.js';
import { validateGcode, validateSheet, NEPOTIS_LIMITS } from '../public/src/core/validate.js';

// Sample idéntico a sample() de maqueta v3 línea 462.
const SAMPLE = [
  { cod: 'LAT', largo: 800,  ancho: 560, qty: 8,  veta: true,  desc: 'Lateral mueble' },
  { cod: 'EST', largo: 900,  ancho: 300, qty: 12, veta: false, desc: 'Estante' },
  { cod: 'FON', largo: 1200, ancho: 500, qty: 5,  veta: true,  desc: 'Fondo cajonera' },
  { cod: 'DIV', largo: 560,  ancho: 520, qty: 8,  veta: false, desc: 'Divisor' },
  { cod: 'TAP', largo: 1810, ancho: 600, qty: 4,  veta: true,  desc: 'Tapa' },
  { cod: 'ZOC', largo: 400,  ancho: 300, qty: 16, veta: false, desc: '' },
];

const SHEET = { w: 2750, h: 1830, thick: 25.4 };
const OPT_NEST = { kerf: 4, trim: 12, allowRotate: true };
const OPT_GC = {
  cli: 'TEST', proy: 'SMOKE', job: 'SMOKE', mat: 'MDF',
  bit: 12, rpm: 18000,
  zsafe: 44, zclear: 22, ztop: 25.4, zthru: 0,
  strat: 'single', pdep: 5,
  lead: 30, fcut: 7999.2, fplg: 4000, fret: 500,
  tabn: 0, tabl: 30, tabh: 4,
};

let failed = 0;
const fail = msg => { console.error('  ✘ ' + msg); failed++; };
const ok   = msg => { console.log('  ✓ ' + msg); };

// --- Optimizer ---
console.log('Optimizer:');

const pieces = SAMPLE.map(p => ({ w: +p.largo, h: +p.ancho, qty: +p.qty, veta: !!p.veta, desc: p.desc, cod: p.cod.toUpperCase() }));
const totalPieces = SAMPLE.reduce((s, p) => s + p.qty, 0);
const res = optimize(pieces, { w: SHEET.w, h: SHEET.h }, OPT_NEST);

if (!res || !res.boards.length) fail('optimize() devolvió vacío');
else ok(`optimize() devolvió ${res.boards.length} tableros (mínimo teórico: ${res.minB})`);

// Invariante 1: total piezas ubicadas == total piezas pedidas
const placed = res.boards.reduce((s, b) => s + b.pl.length, 0);
if (placed !== totalPieces) fail(`piezas ubicadas ${placed} ≠ pedidas ${totalPieces}`);
else ok(`${placed}/${totalPieces} piezas ubicadas`);

// Invariante 2: ninguna pieza fuera de bordes (con margen de refilado)
let oob = 0;
for (const b of res.boards) for (const p of b.pl) {
  if (p.x < OPT_NEST.trim - 1e-6 || p.y < OPT_NEST.trim - 1e-6
   || p.x + p.w > SHEET.w - OPT_NEST.trim + 1e-6
   || p.y + p.h > SHEET.h - OPT_NEST.trim + 1e-6) oob++;
}
if (oob > 0) fail(`${oob} piezas fuera de bordes`); else ok('todas dentro de los bordes (con refilado)');

// Invariante 3: cero solapamientos (incluyendo el kerf de separación)
function overlap(a, b, k) {
  return !(a.x + a.w + k <= b.x || b.x + b.w + k <= a.x || a.y + a.h + k <= b.y || b.y + b.h + k <= a.y);
}
let ov = 0;
for (const b of res.boards) for (let i = 0; i < b.pl.length; i++) for (let j = i + 1; j < b.pl.length; j++) {
  if (overlap(b.pl[i], b.pl[j], -1e-6)) ov++;
}
if (ov > 0) fail(`${ov} solapamientos`); else ok('cero solapamientos');

// Invariante 4: determinista — corrida 2 da mismo conteo de tableros y misma área total ubicada por tablero
const res2 = optimize(pieces, { w: SHEET.w, h: SHEET.h }, OPT_NEST);
const sig = r => r.boards.map(b => b.pl.reduce((s, p) => s + p.w * p.h, 0)).join('|') + '#' + r.boards.length;
if (sig(res) !== sig(res2)) fail('resultado no determinista (firma cambió en segunda corrida)');
else ok('determinista (misma firma en 2 corridas)');

// --- G-code ---
console.log('\nG-code:');

// Adaptar al formato que espera genGcode (parts con {code, desc, x, y, w, h})
const totByCod = {};
res.boards.forEach(b => b.pl.forEach(pl => { totByCod[pl.piece.cod] = (totByCod[pl.piece.cod] || 0) + 1; }));
const seenByCod = {};
const boardsForGc = res.boards.map((b, bi) => ({
  n: bi + 1,
  parts: b.pl.map(pl => {
    const c = pl.piece.cod;
    seenByCod[c] = (seenByCod[c] || 0) + 1;
    const code = totByCod[c] > 1 ? c + '-' + seenByCod[c] : c;
    return { code, desc: pl.piece.desc, x: pl.x, y: pl.y, w: pl.w, h: pl.h };
  }),
}));

const gc0 = genGcode(boardsForGc[0].parts, SHEET, OPT_GC, 1);
const set0 = genSet(OPT_GC, SHEET, boardsForGc[0].parts, 1);

// Estructura mínima esperada
const checks = [
  ['CRLF',           /\r\n/.test(gc0)],
  ['cabecera PART',  /\( PART NAME=SMOKE-T1 \)/.test(gc0)],
  ['warning fase 0', /VERIFICAR ANTES DE CORTAR/.test(gc0)],
  ['T001',           /T001 \(FRESA DE CORTE PRINCIPAL\)/.test(gc0)],
  ['S18000 M03',     /S18000 M03/.test(gc0)],
  ['G43 H01',        /G43 H01 Z44\./.test(gc0)],
  ['cierre M30',     /M30/.test(gc0)],
  ['N en pasos 5',   /N5 /.test(gc0) && /N10 /.test(gc0) && /N15 /.test(gc0)],
  ['feed format',    /F4000\./.test(gc0)],
];
for (const [name, pass] of checks) (pass ? ok : fail)(`gcode: ${name}`);

const setChecks = [
  ['set PROGRAM NUMBER',   /PROGRAM NUMBER=0001/.test(set0)],
  ['set SHEET dims',       /SHEET=2750 X 1830/.test(set0)],
  ['set bit padded',       /012\.00  FRESA DE CORTE PRINCIPAL/.test(set0)],
];
for (const [name, pass] of setChecks) (pass ? ok : fail)(`set: ${name}`);

// --- Validación de límites de máquina NEPOTIS ---
console.log('\nValidador NEPOTIS (3000×2000, Z≥0):');
const sheetCheck = validateSheet(SHEET, NEPOTIS_LIMITS);
if (!sheetCheck.ok) fail(`sheet ${SHEET.w}×${SHEET.h} no entra: ${sheetCheck.error}`);
else ok(`sheet ${SHEET.w}×${SHEET.h} entra en la mesa`);

// Todos los G-codes generados deben estar dentro de los límites
let allClean = true;
for (let i = 0; i < boardsForGc.length; i++) {
  const v = validateGcode(genGcode(boardsForGc[i].parts, SHEET, OPT_GC, i + 1), NEPOTIS_LIMITS);
  if (!v.ok) { allClean = false; fail(`T${i+1} violaciones: ${v.violations.length}`); }
}
if (allClean) ok(`los ${boardsForGc.length} programas respetan los límites de la NEPOTIS`);

// Caso negativo: debe detectar Z<0
const bad = 'N5 X100. Y200. Z-5.\r\nN10 M30';
const bv = validateGcode(bad, NEPOTIS_LIMITS);
if (bv.ok || !bv.violations.some(x => x.axis === 'Z')) fail('no detectó Z negativo');
else ok('detecta Z negativo en G-code malformado');

// Sample del G-code (primeras 12 líneas)
console.log('\nMuestra del G-code generado (tablero 1, primeras 12 líneas):');
console.log(gc0.split('\r\n').slice(0, 12).map(l => '  ' + l).join('\n'));
console.log(`  ... (${gc0.split('\r\n').length} líneas en total)`);

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log('\nTodos los smoke checks pasaron.');
