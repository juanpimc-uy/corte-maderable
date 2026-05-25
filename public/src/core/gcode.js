/* core · generador de G-code (dialecto NEPOTIS)
 *
 * MIGRACIÓN 1:1 desde maqueta-gcode-nepotis-v3.html (líneas 388-430).
 * NO se reescribe el dialecto. NO se cambian feeds, RPM, ni secuencia.
 *
 * El programa generado SIEMPRE lleva la marca:
 *   ( ... - VERIFICAR ANTES DE CORTAR )
 * hasta que JP confirme cierre de Fase 0 (air-cut en NEPOTIS).
 *
 * Estructura del OPT (parámetros de máquina, espejo del readOpt() de la maqueta):
 *   - cli, proy, job, mat         (texto, cabecera)
 *   - bit                          (Ø fresa, mm)
 *   - rpm                          (RPM husillo)
 *   - zsafe                        (Z seguro, mm)
 *   - zclear                       (Z retiro bajo, mm)
 *   - ztop                         (Z tope de material, mm)
 *   - zthru                        (Z pasante, mm — típicamente 0)
 *   - strat                        ('single' = 1 pasada pasante | otro = multipasada)
 *   - pdep                         (profundidad por pasada en multipasada, mm)
 *   - lead                         (longitud de lead-in en Y, mm)
 *   - fcut, fplg, fret             (feeds: corte, plunge/rampa, retracción)
 *   - tabn                         (número de tabs por pieza; 0 = sin tabs)
 *   - tabl                         (longitud de cada tab, mm)
 *   - tabh                         (altura del tab sobre zthru, mm)
 */

// Format helper: número estilo Fanuc (entero → "X.", decimal → recortado a 3).
export function gv(v) {
  v = Math.round(v * 1000) / 1000;
  return Number.isInteger(v) ? v + '.' : String(v);
}

// Format helper: feeds (mantiene el "." final si es entero).
export function gf(v) {
  return Number.isInteger(v) ? v + '.' : String(v);
}

// Transformación de coordenadas según el origen G54 elegido en Parámetros.
// El optimizer siempre trabaja en espacio BL (0,0 abajo-izquierda). Si el
// datum físico de la NEPOTIS está en otra esquina, espejamos las coords.
// Esto NO cambia el sentido del contorno (lógica anti-horaria intacta);
// solo la posición absoluta de cada punto en la mesa.
function makeOriginMappers(sheet, origen) {
  const flipX = origen === 'BR' || origen === 'TR';
  const flipY = origen === 'TL' || origen === 'TR';
  return {
    mx: x => flipX ? (sheet.w - x) : x,
    my: y => flipY ? (sheet.h - y) : y,
  };
}

// Genera el .txt de un tablero.
// parts: [{code, desc, x, y, w, h}]
// sheet: {w, h, thick}
// o: OPT (ver tipo arriba). o.origen: 'BL' (default) | 'BR' | 'TL' | 'TR'
// boardNo: 1, 2, …
export function genGcode(parts, sheet, o, boardNo) {
  let N = 5, L = [];
  const r = o.bit / 2;
  const P = s => { L.push('N' + N + ' ' + s); N += 5; };
  const origen = o.origen || 'BL';
  const { mx, my } = makeOriginMappers(sheet, origen);

  L.push('( PART NAME=' + o.job + '-T' + boardNo + ' )');
  L.push('( CLIENTE=' + o.cli + ' )  ( PROYECTO=' + o.proy + ' )');
  L.push('( MACHINE=NEPOTIS )  ( CONTROLLER=NEPOTIS )');
  L.push('( MATERIAL=' + o.mat + ' )  ( THICKNESS=' + sheet.thick + ' )  ( TABLERO ' + boardNo + ' )');
  // Solo agregamos la línea ORIGEN si NO es BL — así el caso default sigue
  // siendo byte-a-byte igual a la maqueta v3 original.
  if (origen !== 'BL') L.push('( ORIGEN=' + origen + ' )');
  L.push('( MAQUETA - SOLO PERIMETRO T001 - ' + (o.strat === 'single' ? '1 PASADA PASANTE' : 'MULTIPASADA') + ' - VERIFICAR ANTES DE CORTAR )');

  P('G54'); P('G54 G90');
  P('T001 (FRESA DE CORTE PRINCIPAL)'); P('S' + o.rpm + ' M03'); P('G43 H01 Z' + gv(o.zsafe));

  let levels = [];
  if (o.strat === 'single') levels = [o.zthru];
  else { let z = o.ztop; while (z > o.zthru + 1e-6) { z = Math.max(o.zthru, z - o.pdep); levels.push(z); } }

  parts.forEach(p => {
    const x0 = p.x - r, y0 = p.y - r, x1 = p.x + p.w + r, y1 = p.y + p.h + r;
    L.push('( PIEZA ' + p.code + ' - ' + (p.desc || 's/n') + ' ' + p.w + 'x' + p.h + ' )');
    P('G00 G90 X' + gv(mx(x0)) + ' Y' + gv(my(y0 + o.lead)));
    P('Z' + gv(o.zclear));
    levels.forEach((lz, li) => {
      const last = li === levels.length - 1;
      P('G01 X' + gv(mx(x0)) + ' Y' + gv(my(y0)) + ' Z' + gv(lz) + ' F' + gf(o.fplg));
      const cor = [[x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      if (last && o.tabn > 0) {
        const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
        const per = Math.max(1, Math.round(o.tabn / 4));
        for (let s = 0; s < 4; s++) {
          const ax = pts[s][0], ay = pts[s][1], bx = pts[s + 1][0], by = pts[s + 1][1];
          const ln = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / ln, uy = (by - ay) / ln, hf = o.tabl / 2;
          for (let t = 1; t <= per; t++) {
            const c = t / (per + 1), cx = ax + (bx - ax) * c, cy = ay + (by - ay) * c;
            P('G01 X' + gv(mx(cx - ux * hf)) + ' Y' + gv(my(cy - uy * hf)) + ' Z' + gv(lz) + ' F' + gf(o.fcut));
            P('Z' + gv(o.zthru + o.tabh)); P('X' + gv(mx(cx + ux * hf)) + ' Y' + gv(my(cy + uy * hf))); P('Z' + gv(lz));
          }
          P('G01 X' + gv(mx(bx)) + ' Y' + gv(my(by)) + ' F' + gf(o.fcut));
        }
      } else {
        cor.forEach(c => P('G01 X' + gv(mx(c[0])) + ' Y' + gv(my(c[1])) + ' F' + gf(o.fcut)));
      }
    });
    P('G00 Z' + gv(o.zclear)); P('Z' + gv(o.zsafe));
  });

  P('G01 Z' + gv(o.zsafe) + ' F' + gf(o.fret));
  P('M15'); P('M05'); P('G49'); P('G90 M05'); P('M30');

  return L.join('\r\n');
}

// Genera el .set (resumen tipo setup-sheet del programa).
export function genSet(o, sheet, parts, bn) {
  return [
    '( PART NAME=' + o.job + '-T' + bn + ' )',
    '( CLIENTE=' + o.cli + ' )',
    '( PROYECTO=' + o.proy + ' )',
    '( PROGRAM NUMBER=000' + bn + ' )',
    '( MACHINE=NEPOTIS )',
    '( CONTROLLER=NEPOTIS )',
    '( MATERIAL=' + o.mat + ' )',
    '( THICKNESS=' + sheet.thick + ' )',
    '( SHEET=' + sheet.w + ' X ' + sheet.h + ' )',
    '( TABLERO ' + bn + ' - PIEZAS ' + parts.length + ' )',
    '( GENERADO POR MAQUETA - VERIFICAR )',
    '(  001  ENDMILL  ' + o.bit.toFixed(2).padStart(6, '0') + '  FRESA DE CORTE PRINCIPAL )',
  ].join('\r\n');
}
