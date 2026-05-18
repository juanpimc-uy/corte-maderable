// Verificación 1:1 byte-a-byte contra la maqueta v3.
//
// Corre 3 casos distintos a través de ambas implementaciones:
//   - Las funciones copiadas TAL CUAL de la maqueta (tests/fixtures/maqueta-v3-algorithms.mjs).
//   - Las funciones migradas a módulos (src/core/optimizer.js + src/core/gcode.js).
//
// Compara:
//   1. Resultado del optimizer (cantidad y geometría de cada tablero).
//   2. G-code byte-a-byte.
//   3. Setup-sheet byte-a-byte.
//
// Si algún caso difiere, sale con código 1 y muestra el diff.

import * as MAQ from './fixtures/maqueta-v3-algorithms.mjs';
import { optimize as optMig } from '../public/src/core/optimizer.js';
import { genGcode as gcMig, genSet as setMig } from '../public/src/core/gcode.js';

// ===== casos =====
const CASES = [
  {
    name: 'FASE0 (4 piezas, sin rotar, 1 pasada pasante, sin tabs)',
    pieces: [
      { cod: 'REF', w: 100, h: 80,  qty: 1, veta: true,  desc: 'Ref origen' },
      { cod: 'HX',  w: 400, h: 60,  qty: 1, veta: true,  desc: 'Sentido X' },
      { cod: 'VY',  w: 60,  h: 300, qty: 1, veta: true,  desc: 'Sentido Y' },
      { cod: 'SQ',  w: 200, h: 200, qty: 1, veta: true,  desc: 'Cuadrado' },
    ],
    sheet: { w: 1000, h: 600, thick: 25.4 },
    nest: { kerf: 14, trim: 15, allowRotate: false },
    gc: {
      cli: 'MADERABLE', proy: 'FASE0', job: 'FASE0', mat: 'MDF',
      bit: 12, rpm: 18000,
      zsafe: 44, zclear: 22, ztop: 25.4, zthru: 0,
      strat: 'single', pdep: 9,
      lead: 15, fcut: 7999.2, fplg: 4000, fret: 500,
      tabn: 0, tabl: 20, tabh: 4,
    },
  },
  {
    name: 'SAMPLE maqueta (53 piezas, con rotación)',
    pieces: [
      { cod: 'LAT', w: 800,  h: 560, qty: 8,  veta: true,  desc: 'Lateral mueble' },
      { cod: 'EST', w: 900,  h: 300, qty: 12, veta: false, desc: 'Estante' },
      { cod: 'FON', w: 1200, h: 500, qty: 5,  veta: true,  desc: 'Fondo cajonera' },
      { cod: 'DIV', w: 560,  h: 520, qty: 8,  veta: false, desc: 'Divisor' },
      { cod: 'TAP', w: 1810, h: 600, qty: 4,  veta: true,  desc: 'Tapa' },
      { cod: 'ZOC', w: 400,  h: 300, qty: 16, veta: false, desc: '' },
    ],
    sheet: { w: 2750, h: 1830, thick: 25.4 },
    nest: { kerf: 14, trim: 15, allowRotate: true },
    gc: {
      cli: 'LGD Arquitectos', proy: 'MAQUETA-SPC1', job: 'MAQUETA-SPC1', mat: 'MDF',
      bit: 12, rpm: 18000,
      zsafe: 44, zclear: 22, ztop: 25.4, zthru: 0,
      strat: 'single', pdep: 9,
      lead: 15, fcut: 7999.2, fplg: 4000, fret: 500,
      tabn: 0, tabl: 20, tabh: 4,
    },
  },
  {
    name: 'Con tabs y multipasada Z (stress al gcode)',
    pieces: [
      { cod: 'A', w: 250, h: 180, qty: 2, veta: false, desc: 'A' },
      { cod: 'B', w: 150, h: 120, qty: 4, veta: false, desc: 'B' },
    ],
    sheet: { w: 800, h: 500, thick: 18 },
    nest: { kerf: 14, trim: 12, allowRotate: true },
    gc: {
      cli: 'TEST', proy: 'TABS', job: 'TABS', mat: 'MDF',
      bit: 12, rpm: 18000,
      zsafe: 44, zclear: 22, ztop: 18, zthru: 0,
      strat: 'multi', pdep: 9,
      lead: 15, fcut: 7999.2, fplg: 4000, fret: 500,
      tabn: 4, tabl: 20, tabh: 4,
    },
  },
];

// ===== util: firma compacta del resultado del optimizer =====
function nestSig(res) {
  return res.boards.map(b =>
    b.pl.map(p =>
      `${p.piece.cod}@${p.x.toFixed(3)},${p.y.toFixed(3)},${p.w.toFixed(3)}x${p.h.toFixed(3)},r${p.rot ? 1 : 0}`
    ).sort().join('|')
  ).join('\n--BOARD--\n');
}

// ===== util: armar parts[] tal como hace doOptimize en la maqueta =====
function buildParts(res) {
  const totByCod = {};
  res.boards.forEach(b => b.pl.forEach(pl => { const c = pl.piece.cod; totByCod[c] = (totByCod[c] || 0) + 1; }));
  const seenByCod = {};
  return res.boards.map((b, bi) => ({
    n: bi + 1,
    parts: b.pl.map(pl => {
      const c = pl.piece.cod;
      seenByCod[c] = (seenByCod[c] || 0) + 1;
      const code = totByCod[c] > 1 ? c + '-' + seenByCod[c] : c;
      return { code, desc: pl.piece.desc, x: pl.x, y: pl.y, w: pl.w, h: pl.h };
    }),
  }));
}

function diffStrings(label, a, b) {
  if (a === b) return null;
  const la = a.split('\r\n'), lb = b.split('\r\n');
  const out = [`${label} difiere (${la.length} vs ${lb.length} líneas):`];
  const N = Math.max(la.length, lb.length);
  let shown = 0;
  for (let i = 0; i < N && shown < 8; i++) {
    if (la[i] !== lb[i]) {
      out.push(`  L${i + 1}:`);
      out.push(`    maqueta: ${JSON.stringify(la[i] ?? '<eof>')}`);
      out.push(`    migrado: ${JSON.stringify(lb[i] ?? '<eof>')}`);
      shown++;
    }
  }
  if (shown >= 8) out.push('  ... (más diferencias truncadas)');
  return out.join('\n');
}

// ===== correr =====
let fails = 0;
for (const c of CASES) {
  console.log(`\n=== ${c.name} ===`);

  // Optimizer
  const piecesForOpt = c.pieces.map(p => ({ w: p.w, h: p.h, qty: p.qty, veta: p.veta, desc: p.desc, cod: p.cod }));
  const rMaq = MAQ.optimize(piecesForOpt, { w: c.sheet.w, h: c.sheet.h }, c.nest);
  const rMig = optMig (piecesForOpt, { w: c.sheet.w, h: c.sheet.h }, c.nest);

  if (rMaq.boards.length !== rMig.boards.length) {
    console.error(`  ✘ #tableros maqueta=${rMaq.boards.length} migrado=${rMig.boards.length}`); fails++;
  } else {
    console.log(`  ✓ #tableros = ${rMig.boards.length}`);
  }

  const sigMaq = nestSig(rMaq), sigMig = nestSig(rMig);
  if (sigMaq !== sigMig) {
    console.error('  ✘ posiciones del optimizer difieren');
    const linesMaq = sigMaq.split('\n'), linesMig = sigMig.split('\n');
    for (let i = 0; i < Math.max(linesMaq.length, linesMig.length); i++) {
      if (linesMaq[i] !== linesMig[i]) {
        console.error(`    L${i + 1} maq: ${linesMaq[i]}`);
        console.error(`    L${i + 1} mig: ${linesMig[i]}`);
      }
    }
    fails++;
  } else {
    console.log('  ✓ posiciones del optimizer iguales');
  }

  // G-code por tablero
  const boardsMaq = buildParts(rMaq);
  const boardsMig = buildParts(rMig);
  for (let i = 0; i < boardsMaq.length; i++) {
    const gMaq = MAQ.genGcode(boardsMaq[i].parts, c.sheet, c.gc, boardsMaq[i].n);
    const gMig = gcMig   (boardsMig[i].parts, c.sheet, c.gc, boardsMig[i].n);
    const d = diffStrings(`  gcode T${i + 1}`, gMaq, gMig);
    if (d) { console.error('  ✘ ' + d); fails++; } else { console.log(`  ✓ gcode T${i + 1}: ${gMig.split('\r\n').length} líneas idénticas`); }

    const sMaq = MAQ.genSet(c.gc, c.sheet, boardsMaq[i].parts, boardsMaq[i].n);
    const sMig = setMig   (c.gc, c.sheet, boardsMig[i].parts, boardsMig[i].n);
    const ds = diffStrings(`  set T${i + 1}`, sMaq, sMig);
    if (ds) { console.error('  ✘ ' + ds); fails++; } else { console.log(`  ✓ set T${i + 1}: idéntico`); }
  }
}

console.log();
if (fails) { console.error(`✘ ${fails} diferencia(s) — la migración 1:1 NO está garantizada.`); process.exit(1); }
console.log('✓ Migración byte-a-byte verificada en los 3 casos. Cierre limpio de Fase 1.');
