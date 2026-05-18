/* data · parámetros default de máquina
 *
 * Valores OBSERVADOS contra programas reales de T001. SUJETOS A
 * CONFIRMACIÓN en Fase 0 (air-cut). Hasta entonces, el G-code generado
 * va con la marca "VERIFICAR ANTES DE CORTAR".
 */

export const DEFAULTS = {
  // herramienta
  toolId: 'T001',
  toolName: 'FRESA DE CORTE PRINCIPAL',
  bitDiameter: 12,        // mm
  rpm: 18000,

  // material (MDF default)
  material: 'MDF',
  thickness: 25.4,        // mm

  // datums (mm)
  zSafe: 44,
  zRetractLow: 22,
  zPass: 0,               // pasante

  // estrategia
  passes: 1,              // multipasada Z: default 1 pasante (configurable)

  // feeds (mm/min)
  feedCut: 7999.2,
  feedPlunge: 4000,
  feedRetract: 500,

  // geometría
  trim: 12,               // refilado del tablero (mm)
  gap: 4,                 // separación entre piezas (mm)

  // lead-in rampado
  leadInLen: 30,          // mm
  leadInDepth: 25.4,      // mm (= thickness por default)

  // tabs
  tabsAuto: true,         // piezas con cualquier lado < tabsThreshold llevan tabs
  tabsThreshold: 200,     // mm
};
