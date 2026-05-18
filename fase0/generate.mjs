// Generador del programa de prueba para Fase 0 (air-cut en NEPOTIS).
//
// Usa el optimizer y el gcode ya migrados 1:1 — no hay código nuevo de
// dialecto acá. Genera 4 rectángulos pensados para que la verificación
// visual en máquina sea trivial:
//
//   REF  100×80   → en la esquina inferior-izquierda. Valida origen G54
//                   y signo X/Y. Si arranca acá, el datum está OK.
//   HX   400×60   → rectángulo largo horizontal. Valida sentido X y
//                   feed en tramos largos.
//   VY    60×300  → rectángulo largo vertical. Valida sentido Y.
//   SQ   200×200  → cuadrado. Valida que las rotaciones del optimizer
//                   no inviertan veta (lo dejamos con veta=true para
//                   forzar orientación fija).
//
// Tablero: 1000×600 mm. Espesor MDF 25.4.
// Parámetros: defaults de producción (sin tabs, 1 pasada pasante).
//
// IMPORTANTE para el operador:
//   - El programa va con la marca "VERIFICAR ANTES DE CORTAR".
//   - Air-cut: o bien usar Z-offset positivo +50mm del controlador,
//     o bien single-block con dry-run. NO correr a Z normal contra
//     spoilboard sin haber validado origen + feeds.
//
// Para regenerar: cd corte-maderable && node fase0/generate.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { optimize } from '../public/src/core/optimizer.js';
import { genGcode, genSet } from '../public/src/core/gcode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== definición de la prueba =====
const PIECES = [
  { cod: 'REF', w: 100, h: 80,  qty: 1, veta: true, desc: 'Ref origen' },
  { cod: 'HX',  w: 400, h: 60,  qty: 1, veta: true, desc: 'Sentido X' },
  { cod: 'VY',  w: 60,  h: 300, qty: 1, veta: true, desc: 'Sentido Y' },
  { cod: 'SQ',  w: 200, h: 200, qty: 1, veta: true, desc: 'Cuadrado' },
];

const SHEET = { w: 1000, h: 600, thick: 25.4 };

const OPT_NEST = { kerf: 14, trim: 15, allowRotate: false };  // veta forzada en todas
const OPT_GC = {
  cli: 'MADERABLE', proy: 'FASE0', job: 'FASE0', mat: 'MDF',
  bit: 12, rpm: 18000,
  zsafe: 44, zclear: 22, ztop: 25.4, zthru: 0,
  strat: 'single', pdep: 9,
  lead: 15, fcut: 7999.2, fplg: 4000, fret: 500,
  tabn: 0, tabl: 20, tabh: 4,
};

// ===== correr optimizer + gcode =====
const res = optimize(PIECES, { w: SHEET.w, h: SHEET.h }, OPT_NEST);
if (!res.boards.length) { console.error('Fase 0: no entran las 4 piezas en el tablero. Revisar.'); process.exit(1); }
if (res.boards.length > 1) { console.error('Fase 0: se generó más de 1 tablero. Reducí piezas o agrandá tablero.'); process.exit(1); }

const board = res.boards[0];
const parts = board.pl.map(pl => ({
  code: pl.piece.cod, desc: pl.piece.desc,
  x: pl.x, y: pl.y, w: pl.w, h: pl.h,
}));

const gcode = genGcode(parts, SHEET, OPT_GC, 1);
const setup = genSet(OPT_GC, SHEET, parts, 1);

// ===== reporte de posiciones para el checklist =====
const summary = parts.map(p =>
  `  ${p.code.padEnd(3)}  ${String(p.w).padStart(4)}×${String(p.h).padStart(4)}  en X=${p.x.toFixed(1).padStart(7)}  Y=${p.y.toFixed(1).padStart(7)}  (${p.desc})`
).join('\n');

// ===== outputs =====
mkdirSync(__dirname, { recursive: true });
writeFileSync(join(__dirname, 'FASE0-aircut.txt'), gcode + '\r\n');
writeFileSync(join(__dirname, 'FASE0-aircut.set'), setup + '\r\n');
writeFileSync(join(__dirname, 'posiciones.txt'),
  'Programa Fase 0 — posiciones generadas por el optimizer\n' +
  '=====================================================\n\n' +
  `Tablero: ${SHEET.w} × ${SHEET.h} mm, espesor ${SHEET.thick} mm\n` +
  `Refilado: ${OPT_NEST.trim} mm — separación entre piezas: ${OPT_NEST.kerf} mm\n` +
  `Fresa T001 Ø${OPT_GC.bit} — RPM ${OPT_GC.rpm}\n` +
  `Z seguro ${OPT_GC.zsafe} / Z retiro bajo ${OPT_GC.zclear} / Z tope ${OPT_GC.ztop} / Z pasante ${OPT_GC.zthru}\n` +
  `Feeds: corte ${OPT_GC.fcut} · plunge ${OPT_GC.fplg} · retracción ${OPT_GC.fret}\n\n` +
  'Piezas (x,y son la esquina inferior-izquierda en mm desde origen G54):\n' +
  summary + '\n'
);

console.log('Generado:');
console.log('  fase0/FASE0-aircut.txt  (' + gcode.split('\r\n').length + ' líneas)');
console.log('  fase0/FASE0-aircut.set');
console.log('  fase0/posiciones.txt');
console.log('\nPiezas:');
console.log(summary);
