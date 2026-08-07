/* core · validación de límites de máquina NEPOTIS
 *
 * Garantiza que NINGÚN G-code generado mande la fresa fuera del área
 * útil de la mesa (X 2000 × Y 3000 mm) ni por debajo del datum Z (Z < 0).
 *
 * Se corre en dos momentos:
 *   1. Antes de optimizar  → validateSheet(): el tablero entra en la mesa.
 *   2. Después de generar  → validateGcode(): parsea cada línea N…, extrae
 *      X/Y/Z (recuerda valores modales) y verifica rangos.
 *
 * Si una validación falla, la UI bloquea la descarga del G-code hasta
 * que se corrijan los parámetros. Es una salvaguarda final contra
 * choque mecánico.
 */

export const NEPOTIS_LIMITS = {
  // Mesa útil de la NEPOTIS: X corto (2000), Y largo (3000).
  // El tablero se monta con el LARGO sobre Y y el ANCHO sobre X
  // (ver core/machine.js — toMachine() hace la rotación).
  xMin: 0,    xMax: 2000,
  yMin: 0,    yMax: 3000,
  // Z mínimo: nunca por debajo de cero (la fresa no debe ir más allá
  // del datum / spoilboard).
  zMin: 0,
  // Z máximo razonable. Si alguien pone Z seguro a 500mm se le avisa,
  // probablemente sea un error de typing.
  zMax: 200,
};

/* ---------- validación del tablero ---------- */

/**
 * Verifica que el sheet entre en la mesa, considerando rotación.
 * sheet: { w: LARGO, h: ANCHO } (como lo carga el usuario).
 * El montaje estándar es largo→Y (3000) y ancho→X (2000).
 * Devuelve { ok, fits, rotated, error } donde:
 *   - fits = true si el tablero entra en el montaje estándar
 *   - rotated = true si SOLO entra invirtiendo largo/ancho
 *   - error = mensaje legible si no entra de ninguna forma
 */
export function validateSheet(sheet, limits) {
  limits = limits || NEPOTIS_LIMITS;
  const largo = sheet.w, ancho = sheet.h;
  const xRange = limits.xMax - limits.xMin;
  const yRange = limits.yMax - limits.yMin;
  const fitsDirect  = largo <= yRange && ancho <= xRange;
  const fitsRotated = ancho <= yRange && largo <= xRange;
  if (fitsDirect)  return { ok: true,  fits: true,  rotated: false };
  if (fitsRotated) return { ok: true,  fits: false, rotated: true,
    warn: `El tablero ${largo}×${ancho} solo entra invirtiendo largo y ancho (cargalo como ${ancho}×${largo}).` };
  return { ok: false, fits: false, rotated: false,
    error: `El tablero ${largo}×${ancho} mm NO entra en la mesa de la NEPOTIS (X ${xRange} × Y ${yRange} mm), ni siquiera girado.` };
}

/* ---------- validación del G-code ---------- */

// Parser muy liviano: por cada línea de programa, busca tokens X/Y/Z[n].
// Mantiene el estado modal (si una línea no menciona Y, Y mantiene su valor).
// Reporta CADA violación con número de línea N… para que el operador
// pueda ubicarla en el editor.
export function validateGcode(gcode, limits) {
  limits = limits || NEPOTIS_LIMITS;
  const lines = gcode.split('\r\n');
  const violations = [];
  let curX = null, curY = null, curZ = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Saltar comentarios — todo entre paréntesis o desde ; hasta fin de línea.
    const stripped = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '');
    if (!stripped.trim()) continue;

    const xm = stripped.match(/(?:^|[^A-Z])X(-?\d+\.?\d*)/);
    const ym = stripped.match(/(?:^|[^A-Z])Y(-?\d+\.?\d*)/);
    const zm = stripped.match(/(?:^|[^A-Z])Z(-?\d+\.?\d*)/);

    if (xm) {
      curX = parseFloat(xm[1]);
      if (curX < limits.xMin - 1e-6 || curX > limits.xMax + 1e-6) {
        violations.push({ lineNo: i + 1, axis: 'X', value: curX,
          range: [limits.xMin, limits.xMax], source: line.trim() });
      }
    }
    if (ym) {
      curY = parseFloat(ym[1]);
      if (curY < limits.yMin - 1e-6 || curY > limits.yMax + 1e-6) {
        violations.push({ lineNo: i + 1, axis: 'Y', value: curY,
          range: [limits.yMin, limits.yMax], source: line.trim() });
      }
    }
    if (zm) {
      curZ = parseFloat(zm[1]);
      if (curZ < limits.zMin - 1e-6) {
        violations.push({ lineNo: i + 1, axis: 'Z', value: curZ,
          range: [limits.zMin, limits.zMax], source: line.trim(),
          critical: true, reason: 'Z negativo: la fresa irí­a más allá del datum' });
      } else if (curZ > limits.zMax + 1e-6) {
        violations.push({ lineNo: i + 1, axis: 'Z', value: curZ,
          range: [limits.zMin, limits.zMax], source: line.trim(),
          reason: 'Z muy alto: posible typo' });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Convenience: valida una lista de programas (uno por tablero).
 * Devuelve un resumen único con todas las violaciones agrupadas.
 */
export function validateAllGcodes(gcodes, limits) {
  const all = [];
  gcodes.forEach((g, i) => {
    const r = validateGcode(g, limits);
    if (!r.ok) r.violations.forEach(v => all.push({ ...v, boardIndex: i + 1 }));
  });
  return { ok: all.length === 0, violations: all };
}

/**
 * Texto legible para mostrar al usuario una lista de violaciones.
 * Resumido: muestra hasta 6 ejemplos, dice cuántas más hay.
 */
export function formatViolations(violations, maxExamples = 6) {
  if (!violations.length) return '';
  const head = `Encontré ${violations.length} violación(es) de los límites de la NEPOTIS:`;
  const lines = violations.slice(0, maxExamples).map(v => {
    const lim = v.axis === 'Z'
      ? `Z debe ser ≥ ${v.range[0]} mm`
      : `${v.axis} debe estar entre ${v.range[0]} y ${v.range[1]} mm`;
    const tableroPfx = v.boardIndex ? `T${v.boardIndex} ` : '';
    return `  · ${tableroPfx}línea ${v.lineNo}: ${v.axis}=${v.value}  (${lim})`;
  });
  const more = violations.length > maxExamples
    ? `\n  … y ${violations.length - maxExamples} más.` : '';
  return head + '\n' + lines.join('\n') + more;
}
