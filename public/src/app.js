/* corte-maderable · bootstrap + UI
 *
 * Lift 1:1 de la maqueta v3 (líneas 432-562) industrializado:
 *   - optimizer y gcode importados desde src/core/* (ya migrados 1:1).
 *   - SheetJS cargado por CDN en index.html (window.XLSX).
 *   - Funciones UI expuestas en window.* para que los onclick inline
 *     del HTML sigan funcionando sin refactor.
 *   - Capa de "tabs auto": umbral de 200mm en parámetros — si algún lado
 *     de alguna pieza es menor, se setea tabn (default 2) para toda la
 *     tirada. Per-piece auto-tabs queda como mejora futura, no rompe el
 *     dialecto 1:1 de gcode.js.
 *   - Botón "Guardar en historial" que llama POST /api/cortes
 *     (deshabilitado mientras el endpoint devuelva 501).
 *
 * Reglas que se respetan:
 *   - El G-code generado va con la marca "VERIFICAR ANTES DE CORTAR"
 *     (vive en genGcode, no se quita acá).
 *   - Nada de localStorage/sessionStorage (no aplica al alcance todavía).
 *   - Nada de auto-save: el historial se guarda solo cuando JP toca el botón.
 */

import { optimize } from './core/optimizer.js';
import { genGcode, genSet } from './core/gcode.js';
import { SHEETS as SHEETS_INIT } from './data/sheets.js';
import { mrpConfigured, listClientes, listProyectos, waitForConfig } from './core/mrp.js';
import { NEPOTIS_LIMITS, validateSheet, validateAllGcodes, formatViolations } from './core/validate.js';

// ===== estado global =====
const SHEETS = SHEETS_INIT.slice();         // permite agregar medidas en runtime
let PCS = [], OPT = null, SHEET = null, RES = null;
let bIdx = 0, bIdxL = 0, GCs = [], SETs = [], LBLDONE = {};
let LOCKED = true;
// MRP: cache de clientes/proyectos + estado de la integración
let MRP_OK = false;
let CLIENTES = [];                          // [{id, nombre}, ...]
let PROYECTOS_BY_CLI = {};                  // { [clienteId]: [{id, nombre, cliente_id}, ...] }

const $ = id => document.getElementById(id);

// ===== tabs =====
function tab(t) {
  ['job', 'par', 'res', 'lbl'].forEach(k => {
    $('v' + k[0].toUpperCase() + k.slice(1)).classList.toggle('on', k === t);
    $('t-' + k).classList.toggle('on', k === t);
  });
}

// ===== selector de tableros =====
function fillSheets(sel) {
  $('sheetSel').innerHTML = SHEETS.map((s, i) =>
    '<option value="' + i + '" ' + (i === (sel ?? 0) ? 'selected' : '') + '>' + s[0] + ' × ' + s[1] + ' mm</option>'
  ).join('');
  onSheetSel();
}
function onSheetSel() {
  const s = SHEETS[+$('sheetSel').value];
  $('sheetInfo').textContent = 'Usando ' + s[0] + ' × ' + s[1] + ' mm';
}
function toggleAddSheet() { $('addSheet').classList.toggle('hide'); }
function addSheet() {
  const w = +$('nsW').value, h = +$('nsH').value;
  if (!(w > 0 && h > 0)) { alert('Ingresá largo y ancho.'); return; }
  SHEETS.push([w, h]); fillSheets(SHEETS.length - 1);
  $('addSheet').classList.add('hide'); $('nsW').value = ''; $('nsH').value = '';
}

// ===== candado de parámetros =====
function applyLock() {
  document.querySelectorAll('.pfield input,.pfield select').forEach(e => e.disabled = LOCKED);
  $('padIco').textContent = LOCKED ? '🔒' : '🔓';
  $('lockBtn').textContent = LOCKED ? 'Editar parámetros' : 'Bloquear';
  $('lockMsg').textContent = LOCKED
    ? 'Bloqueado. Estos valores no deberían tocarse en el día a día.'
    : 'Desbloqueado — cambiá con cuidado y volvé a bloquear.';
}
function toggleLock() { LOCKED = !LOCKED; applyLock(); }

// ===== despiece =====
function defCod(i) { return 'P' + String(i + 1).padStart(2, '0'); }
function nextCod() {
  let i = PCS.length + 1, c;
  do { c = 'P' + String(i).padStart(2, '0'); i++; } while (PCS.some(p => p.cod === c));
  return c;
}
function addP(d) {
  d = d || {};
  PCS.push({ cod: d.cod || nextCod(), largo: d.largo || '', ancho: d.ancho || '', qty: d.qty || 1, veta: d.veta ?? true, desc: d.desc || '' });
  renderP();
}
function renderP() {
  const tb = $('tbl').querySelector('tbody'); tb.innerHTML = '';
  PCS.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input value="' + p.cod + '" oninput="PCS[' + i + '].cod=this.value" placeholder="' + defCod(i) + '" style="width:80px;text-transform:uppercase"></td>' +
      '<td><input type="number" value="' + p.largo + '" oninput="PCS[' + i + '].largo=+this.value" style="width:90px"></td>' +
      '<td><input type="number" value="' + p.ancho + '" oninput="PCS[' + i + '].ancho=+this.value" style="width:90px"></td>' +
      '<td><input type="number" value="' + p.qty + '" oninput="PCS[' + i + '].qty=+this.value" style="width:60px"></td>' +
      '<td style="text-align:center"><input type="checkbox" ' + (p.veta ? 'checked' : '') + ' onchange="PCS[' + i + '].veta=this.checked"></td>' +
      '<td><input value="' + p.desc + '" oninput="PCS[' + i + '].desc=this.value" placeholder="(opcional)" style="min-width:170px"></td>' +
      '<td><button class="del" onclick="PCS.splice(' + i + ',1);renderP()">×</button></td>';
    tb.appendChild(tr);
  });
  $('pc').textContent = PCS.reduce((s, p) => s + (+p.qty || 0), 0) + ' piezas';
}
function sample() {
  // Sample mínimo: una sola pieza para que el usuario tenga un punto de partida
  // sin saturar la tabla. Si necesita más, agrega manualmente.
  PCS = [];
  addP({ cod: 'LAT', largo: 800, ancho: 560, qty: 1, veta: true, desc: 'Lateral mueble' });
}

// ===== import Excel =====
// Encabezados tolerantes (case-insensitive, sinónimos comunes).
const HEADER_MAP = {
  cod: ['cod', 'código', 'codigo', 'code', 'sku'],
  largo: ['largo', 'long', 'length', 'l'],
  ancho: ['ancho', 'width', 'a', 'w'],
  qty: ['cant', 'cantidad', 'qty', 'q', 'unidades'],
  veta: ['veta', 'grano', 'grain'],
  desc: ['desc', 'descripción', 'descripcion', 'description', 'nombre'],
};
function normalizeHeader(h) {
  h = String(h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const key of Object.keys(HEADER_MAP)) if (HEADER_MAP[key].includes(h)) return key;
  return null;
}
function parseVeta(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  if (['si', 'sí', 'yes', 'y', 'true', '1', 'con', 'con veta'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'sin', 'sin veta'].includes(s)) return false;
  return true; // default
}
function onXlsx(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = window.XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) { alert('El archivo está vacío.'); return; }
      const headers = rows[0].map(normalizeHeader);
      const missing = ['cod', 'largo', 'ancho', 'qty'].filter(k => !headers.includes(k));
      if (missing.length) { alert('Faltan columnas obligatorias: ' + missing.join(', ') + '.\nEncabezados esperados: Código, Largo, Ancho, Cant, Veta, Descripción.'); return; }
      PCS = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; const obj = {};
        headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
        if (!obj.largo && !obj.ancho && !obj.qty) continue; // fila vacía
        PCS.push({
          cod: obj.cod ? String(obj.cod).trim().toUpperCase() : defCod(PCS.length),
          largo: +obj.largo || '',
          ancho: +obj.ancho || '',
          qty: +obj.qty || 1,
          veta: parseVeta(obj.veta),
          desc: obj.desc ? String(obj.desc) : '',
        });
      }
      renderP();
      alert('Importadas ' + PCS.length + ' filas. Revisá y dale a Optimizar.');
    } catch (err) {
      console.error(err);
      alert('No pude leer el Excel: ' + err.message);
    }
    input.value = ''; // permitir re-importar el mismo archivo
  };
  reader.readAsArrayBuffer(f);
}

// ===== MRP: carga cliente/proyecto desde Supabase =====
function setMrpStatus(text, tone) {
  const el = $('mrpStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--danger)' : '';
}
function showMrpBanner(msgHtml) {
  const b = $('mrpBanner');
  if (!b) return;
  b.innerHTML = msgHtml;
  b.classList.remove('hide');
}

async function initMRP() {
  setMrpStatus('Cargando config…');
  // /api/config trae URL + ANON_KEY desde env vars de Vercel.
  await waitForConfig();
  if (!mrpConfigured()) {
    setMrpStatus('MRP no configurado · texto libre', 'err');
    showMrpBanner(
      '<b class="no">MRP no configurado.</b> Falta SUPABASE_URL y/o SUPABASE_ANON_KEY ' +
      'en las env vars de Vercel. Mientras tanto, Cliente y Proyecto van como texto libre.'
    );
    return;
  }
  setMrpStatus('Cargando MRP…');
  const r = await listClientes();
  if (!r.ok) {
    setMrpStatus('MRP: error · texto libre', 'err');
    showMrpBanner(
      '<b class="no">No pude leer el MRP.</b> Detalle: ' + (r.error || 'unknown') +
      '. Cliente y Proyecto quedan como texto libre.'
    );
    return;
  }
  MRP_OK = true;
  CLIENTES = r.rows;
  // Swap input → select
  $('cli').classList.add('hide');
  $('proy').classList.add('hide');
  $('cliSel').classList.remove('hide');
  $('proySel').classList.remove('hide');
  const cliSel = $('cliSel');
  cliSel.innerHTML = '<option value="">— Cliente —</option>' +
    CLIENTES.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  cliSel.addEventListener('change', onCliSelChange);
  setMrpStatus('MRP: ' + CLIENTES.length + ' clientes', 'ok');
}

async function onCliSelChange() {
  const cliId = $('cliSel').value;
  const proySel = $('proySel');
  if (!cliId) {
    proySel.disabled = true;
    proySel.innerHTML = '<option value="">— Proyecto (elegí cliente) —</option>';
    return;
  }
  if (PROYECTOS_BY_CLI[cliId]) {
    fillProySel(PROYECTOS_BY_CLI[cliId]);
    return;
  }
  proySel.disabled = true;
  proySel.innerHTML = '<option value="">cargando proyectos…</option>';
  const r = await listProyectos(cliId);
  if (!r.ok) {
    proySel.innerHTML = '<option value="">— error: ' + (r.error || 'unknown') + ' —</option>';
    return;
  }
  PROYECTOS_BY_CLI[cliId] = r.rows;
  fillProySel(r.rows);
}

function fillProySel(rows) {
  const proySel = $('proySel');
  proySel.innerHTML = '<option value="">— Proyecto —</option>' +
    rows.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  proySel.disabled = false;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Slug corto para nombres de archivo: solo A-Z0-9, n caracteres, padded.
// Ej: slug('LGD Arquitectos', 4) => 'LGDA'
//     slug('MAQUETA-SPC1', 4)    => 'MAQU'
//     slug('', 4)                 => '----'
function slug(s, n) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return ''.padEnd(n, '-');
  return clean.slice(0, n).padEnd(n, '-');
}

// Nombre corto de trabajo para archivos y PART NAME interno.
//   "<CLI:4>-<PROY:4>"   → ej. "LGDA-SPC1"
function shortJob(cli, proy) {
  return slug(cli, 4) + '-' + slug(proy, 4);
}

// Nombre de archivo por tablero: "<CLI:4>-<PROY:4>-<NN>.<ext>"
function fileName(cli, proy, boardNo, ext) {
  return shortJob(cli, proy) + '-' + String(boardNo).padStart(2, '0') + '.' + ext;
}

// Lee Cliente/Proyecto desde la fuente activa (select MRP o input libre).
function readClienteProyecto() {
  if (MRP_OK) {
    const cliId = $('cliSel').value || null;
    const proyId = $('proySel').value || null;
    const cliName = cliId ? (CLIENTES.find(c => String(c.id) === String(cliId))?.nombre || '') : '';
    const list = cliId ? (PROYECTOS_BY_CLI[cliId] || []) : [];
    const proyName = proyId ? (list.find(p => String(p.id) === String(proyId))?.nombre || '') : '';
    return { cli: cliName, proy: proyName, cliId, proyId };
  }
  return { cli: $('cli').value || '', proy: $('proy').value || '', cliId: null, proyId: null };
}

// ===== lectura de parámetros + auto-tabs =====
function readOpt() {
  const cp = readClienteProyecto();
  const o = {
    cli: cp.cli, proy: cp.proy,
    cliId: cp.cliId, proyId: cp.proyId,
    // job = nombre corto que va en la cabecera del G-code y en los archivos
    job: shortJob(cp.cli, cp.proy),
    mat: $('mat').value || 'MDF',
    bit: +$('bit').value, rpm: +$('rpm').value,
    zsafe: +$('zsafe').value, zclear: +$('zclear').value,
    ztop: +$('ztop').value, zthru: +$('zthru').value, strat: $('strat').value,
    pdep: +$('pdep').value, lead: +$('lead').value,
    fcut: +$('fcut').value, fplg: +$('fplg').value, fret: +$('fret').value,
    tabn: +$('tabn').value, tabl: +$('tabl').value, tabh: +$('tabh').value,
  };
  // Capa "tabs auto": si tabn está en 0 Y el toggle auto está activo Y
  // alguna pieza tiene un lado < umbral, se levanta tabn a 2 (default).
  const autoOn = $('tabsAuto').value === '1';
  const thr = +$('tabsThr').value || 200;
  if (autoOn && o.tabn === 0) {
    const hit = PCS.some(p => Math.min(+p.largo || 1e9, +p.ancho || 1e9) < thr);
    if (hit) o.tabn = 2;
  }
  return o;
}

// ===== optimize → revisar → confirmar =====
function doOptimize() {
  const valid = [];
  PCS.forEach((p, i) => {
    if (+p.largo > 0 && +p.ancho > 0 && +p.qty > 0)
      valid.push({ ...p, cod: (p.cod && String(p.cod).trim()) ? String(p.cod).trim() : defCod(i) });
  });
  if (!valid.length) { alert('Cargá piezas válidas (largo, ancho, cantidad).'); return; }
  const s = SHEETS[+$('sheetSel').value];
  SHEET = { w: s[0], h: s[1], thick: +$('thick').value };

  // Validar que el tablero entre en la NEPOTIS antes de gastar tiempo optimizando.
  const sheetCheck = validateSheet(SHEET, NEPOTIS_LIMITS);
  if (!sheetCheck.ok) { alert(sheetCheck.error); return; }
  if (sheetCheck.warn) {
    if (!confirm(sheetCheck.warn + '\n\n¿Continúo con esta medida?')) return;
  }

  OPT = readOpt();
  const space = Math.max(+$('space').value, OPT.bit);
  const res = optimize(
    valid.map(p => ({ w: +p.largo, h: +p.ancho, qty: +p.qty, veta: !!p.veta, desc: p.desc, cod: String(p.cod).toUpperCase() })),
    { w: SHEET.w, h: SHEET.h },
    { kerf: space, trim: +$('trim').value, allowRotate: true }
  );
  if (!res.boards.length) { alert('No entran piezas con estos parámetros.'); return; }
  const totByCod = {};
  res.boards.forEach(b => b.pl.forEach(pl => { const c = pl.piece.cod; totByCod[c] = (totByCod[c] || 0) + 1; }));
  const seenByCod = {};
  RES = {
    minB: res.minB,
    boards: res.boards.map((b, bi) => ({
      n: bi + 1,
      parts: b.pl.map(pl => {
        const c = pl.piece.cod;
        seenByCod[c] = (seenByCod[c] || 0) + 1;
        const code = totByCod[c] > 1 ? c + '-' + seenByCod[c] : c;
        return { code, desc: pl.piece.desc, x: pl.x, y: pl.y, w: pl.w, h: pl.h };
      }),
    })),
    un: res.un,
  };
  GCs = []; SETs = []; LBLDONE = {}; bIdx = 0; bIdxL = 0;
  $('gcArea').classList.add('hide'); $('preConfirm').style.display = 'flex';
  $('t-res').disabled = false; $('t-lbl').disabled = false;
  renderKPI(); renderThumbs(); renderBig(); renderLblBoard(); tab('res');
}

// ===== KPIs y SVG =====
function renderKPI() {
  const tot = RES.boards.reduce((s, b) => s + b.parts.length, 0);
  const used = RES.boards.reduce((s, b) => s + b.parts.reduce((q, p) => q + p.w * p.h, 0), 0);
  const area = SHEET.w * SHEET.h * RES.boards.length;
  $('kpi').innerHTML =
    '<div class="kpi"><div class="v">' + RES.boards.length + '</div><div class="l">Tableros usados</div></div>' +
    '<div class="kpi"><div class="v">~' + RES.minB + '</div><div class="l">Mín. teórico (área)</div></div>' +
    '<div class="kpi"><div class="v">' + tot + '</div><div class="l">Piezas</div></div>' +
    '<div class="kpi"><div class="v">' + (used / area * 100).toFixed(1) + '%</div><div class="l">Aprovecham.</div></div>' +
    '<div class="kpi"><div class="v">' + SHEET.w + '×' + SHEET.h + '</div><div class="l">Tablero (mm)</div></div>' +
    '<div class="kpi"><div class="v">' + RES.un.length + '</div><div class="l">Sin ubicar</div></div>';
}
function renderThumbs() {
  $('thumbs').innerHTML = RES.boards.map((b, i) =>
    '<button class="' + (i === bIdx ? 'on' : '') + '" onclick="gotoBoard(' + i + ')">T' + (i + 1) + '</button>'
  ).join('');
}
// opts: { showDims: true }  → agrega cotas del tablero (largo arriba, ancho a la izquierda).
//                              Solo se usa en el plano impreso, no en la UI.
function svgBoard(b, big, opts) {
  opts = opts || {};
  const showDims = opts.showDims === true;
  const W = SHEET.w, H = SHEET.h, r = OPT.bit / 2, pad = 14;
  const boardW = big ? 900 : 560;        // ancho útil para dibujar el tablero
  const extraTop  = showDims ? 32 : 0;    // espacio para cota X arriba
  const extraLeft = showDims ? 36 : 0;    // espacio para cota Y a la izquierda
  const sc = (boardW - pad * 2) / W;
  const vw = boardW + extraLeft;
  const vh = H * sc + pad * 2 + extraTop;
  const X = v => extraLeft + pad + v * sc;
  const Y = v => extraTop + pad + (H - v) * sc;
  // Colores: tablero blanco con borde negro, piezas en gris claro.
  const C = {
    boardFill:  '#ffffff',
    boardStr:   '#15130f',
    pieceFill:  '#d8d8d8',
    pieceDone:  '#a8c9a8',  // verde claro cuando ya se etiquetó
    pieceStr:   '#15130f',
    trajStr:    '#d9480f',   // trayectoria centro fresa (naranja)
    textPrim:   '#15130f',
    textSec:    '#555555',
    dimStr:     '#15130f',
  };
  let s = '<svg viewBox="0 0 ' + vw + ' ' + vh + '" preserveAspectRatio="xMidYMid meet">';
  s += '<rect x="' + X(0) + '" y="' + Y(H) + '" width="' + (W * sc) + '" height="' + (H * sc) + '" fill="' + C.boardFill + '" stroke="' + C.boardStr + '" stroke-width="1.5"/>';

  // ----- Cotas del tablero (solo plano impreso) -----
  if (showDims) {
    const x0 = X(0), x1 = X(W), y0 = Y(0), y1 = Y(H);
    // Cota X (largo) arriba
    const xLineY = extraTop - 12;
    s += '<line x1="' + x0 + '" y1="' + xLineY + '" x2="' + x1 + '" y2="' + xLineY + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    s += '<line x1="' + x0 + '" y1="' + (xLineY - 4) + '" x2="' + x0 + '" y2="' + (xLineY + 4) + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    s += '<line x1="' + x1 + '" y1="' + (xLineY - 4) + '" x2="' + x1 + '" y2="' + (xLineY + 4) + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    // Tick verticales hasta el tablero (líneas auxiliares finas)
    s += '<line x1="' + x0 + '" y1="' + xLineY + '" x2="' + x0 + '" y2="' + y1 + '" stroke="' + C.dimStr + '" stroke-width="0.3" stroke-dasharray="2,2"/>';
    s += '<line x1="' + x1 + '" y1="' + xLineY + '" x2="' + x1 + '" y2="' + y1 + '" stroke="' + C.dimStr + '" stroke-width="0.3" stroke-dasharray="2,2"/>';
    const xMid = (x0 + x1) / 2;
    s += '<rect x="' + (xMid - 38) + '" y="' + (xLineY - 8) + '" width="76" height="14" fill="#ffffff"/>';
    s += '<text x="' + xMid + '" y="' + xLineY + '" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono" font-size="11" font-weight="600" fill="' + C.dimStr + '">' + W + ' mm</text>';

    // Cota Y (ancho) a la izquierda, rotada
    const yLineX = extraLeft - 14;
    s += '<line x1="' + yLineX + '" y1="' + y0 + '" x2="' + yLineX + '" y2="' + y1 + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    s += '<line x1="' + (yLineX - 4) + '" y1="' + y0 + '" x2="' + (yLineX + 4) + '" y2="' + y0 + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    s += '<line x1="' + (yLineX - 4) + '" y1="' + y1 + '" x2="' + (yLineX + 4) + '" y2="' + y1 + '" stroke="' + C.dimStr + '" stroke-width="0.7"/>';
    s += '<line x1="' + yLineX + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y0 + '" stroke="' + C.dimStr + '" stroke-width="0.3" stroke-dasharray="2,2"/>';
    s += '<line x1="' + yLineX + '" y1="' + y1 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="' + C.dimStr + '" stroke-width="0.3" stroke-dasharray="2,2"/>';
    const yMid = (y0 + y1) / 2;
    s += '<rect x="' + (yLineX - 7) + '" y="' + (yMid - 38) + '" width="14" height="76" fill="#ffffff"/>';
    s += '<text x="' + yLineX + '" y="' + yMid + '" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono" font-size="11" font-weight="600" fill="' + C.dimStr + '" transform="rotate(-90 ' + yLineX + ' ' + yMid + ')">' + H + ' mm</text>';
  }

  b.parts.forEach(p => {
    const done = big === 'lbl' && LBLDONE[p.code];
    s += '<rect class="pc" data-n="' + p.code + '" x="' + X(p.x) + '" y="' + Y(p.y + p.h) + '" width="' + (p.w * sc) + '" height="' + (p.h * sc) + '" fill="' + (done ? C.pieceDone : C.pieceFill) + '" stroke="' + C.pieceStr + '" stroke-width="1"/>';
    // Trayectoria del centro de fresa: removida por pedido — no agrega valor visual.
    // Texto adentro de la pieza — niveles de detalle según altura disponible:
    //   alto >= 50px  → código + dimensión + descripción (3 líneas)
    //   alto >= 20px  → código + dimensión (2 líneas)
    //   alto <  20px  → nada (pieza muy chica)
    const pxW = p.w * sc, pxH = p.h * sc;
    if (pxW > 34 && pxH > 20) {
      const cx = X(p.x + p.w / 2), cy = Y(p.y + p.h / 2);
      const fsCode = big ? 15 : 12;
      const fsDim  = big ? 12 : 9.5;
      const fsDesc = big ? 11 : 9;
      const desc = (p.desc || '').trim();
      // ↔ siempre indica la dimensión horizontal en pantalla (p.w),
      // ↕ siempre la vertical (p.h). El optimizer ya rotó la pieza, así
      // que estos números son las medidas reales en mm en la orientación
      // que la pieza tendrá sobre el tablero.
      const dimH = '↔ ' + p.w;
      const dimV = '↕ ' + p.h;
      const showDesc = !!desc && pxH > 80;
      const showSeparateDims = pxH > 55;
      if (showDesc) {
        // cuatro líneas: code, ↔W, ↕H, desc
        const baseY = cy - fsCode - 3;
        s += '<text x="' + cx + '" y="' + baseY + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsCode + '" font-weight="600" fill="' + C.textPrim + '">' + p.code + (done ? ' ✓' : '') + '</text>';
        s += '<text x="' + cx + '" y="' + (baseY + fsCode + 2) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsDim + '" fill="' + C.textSec + '">' + dimH + '</text>';
        s += '<text x="' + cx + '" y="' + (baseY + fsCode + fsDim + 4) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsDim + '" fill="' + C.textSec + '">' + dimV + '</text>';
        s += '<text x="' + cx + '" y="' + (baseY + fsCode + fsDim * 2 + 8) + '" text-anchor="middle" font-family="DM Sans, IBM Plex Sans" font-size="' + fsDesc + '" fill="' + C.textSec + '">' + truncateForSvg(desc, pxW, fsDesc) + '</text>';
      } else if (showSeparateDims) {
        // tres líneas: code, ↔W, ↕H
        s += '<text x="' + cx + '" y="' + (cy - fsDim) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsCode + '" font-weight="600" fill="' + C.textPrim + '">' + p.code + (done ? ' ✓' : '') + '</text>';
        s += '<text x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsDim + '" fill="' + C.textSec + '">' + dimH + '</text>';
        s += '<text x="' + cx + '" y="' + (cy + fsDim + 4) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsDim + '" fill="' + C.textSec + '">' + dimV + '</text>';
      } else {
        // dos líneas compactas: code, "↔W  ↕H"
        s += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsCode + '" font-weight="600" fill="' + C.textPrim + '">' + p.code + (done ? ' ✓' : '') + '</text>';
        s += '<text x="' + cx + '" y="' + (cy + fsCode) + '" text-anchor="middle" font-family="IBM Plex Mono" font-size="' + fsDim + '" fill="' + C.textSec + '">' + dimH + '  ' + dimV + '</text>';
      }
    }
  });
  s += '</svg>'; return s;
}

// Trunca el texto si no entra en el ancho disponible en px (aprox).
// Cada char ≈ fontSize * 0.55 en sans-serif.
function truncateForSvg(text, pxWidth, fontSize) {
  const maxChars = Math.max(3, Math.floor((pxWidth - 8) / (fontSize * 0.55)));
  if (text.length <= maxChars) return escapeSvg(text);
  return escapeSvg(text.slice(0, maxChars - 1) + '…');
}
// Escape para texto dentro de <text> SVG
function escapeSvg(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderBig() {
  $('bigwrap').innerHTML = svgBoard(RES.boards[bIdx], true, { showDims: true });
  $('boardNow').textContent = 'Tablero ' + (bIdx + 1) + ' / ' + RES.boards.length;
  renderThumbs();
  if (GCs.length) { $('gc').value = GCs[bIdx]; $('gcBoardLbl').textContent = 'Tablero ' + (bIdx + 1); }
}
function pageBoard(d) { bIdx = (bIdx + d + RES.boards.length) % RES.boards.length; renderBig(); }
function gotoBoard(i) { bIdx = i; renderBig(); }

function confirmGen() {
  const generated = RES.boards.map(b => genGcode(b.parts, SHEET, OPT, b.n));

  // Validar contra límites de la NEPOTIS antes de exponer descargas.
  const check = validateAllGcodes(generated, NEPOTIS_LIMITS);
  if (!check.ok) {
    const msg =
      'El G-code generado tiene coordenadas FUERA de los límites de la NEPOTIS ' +
      '(3000 × 2000 mm, Z ≥ 0). NO se va a permitir descargar hasta corregir.\n\n' +
      formatViolations(check.violations) +
      '\n\nRevisar: refilado, origen G54, datums Z, dimensiones del tablero.';
    alert(msg);
    return;
  }

  GCs = generated;
  SETs = RES.boards.map(b => genSet(OPT, SHEET, b.parts, b.n));
  $('gcArea').classList.remove('hide'); $('preConfirm').style.display = 'none';
  $('gc').value = GCs[bIdx]; $('gcBoardLbl').textContent = 'Tablero ' + (bIdx + 1);
  $('gcArea').scrollIntoView({ behavior: 'smooth' });

  // Guardar automático en historial. Silencioso: si MRP no está
  // configurado o el endpoint no responde (ej. dev local sin Vercel),
  // se loggea a consola pero no se molesta al usuario.
  saveCorte({ silent: true });
}
function downloadBlob(content, filename) {
  const b = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = filename;
  a.click();
  // Liberar el blob URL para no acumular memoria
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// Baja el .txt del tablero actual.
function dl() {
  downloadBlob(GCs[bIdx], fileName(OPT.cli, OPT.proy, bIdx + 1, 'txt'));
}

// Baja un archivo POR tablero. Pequeño delay entre cada uno para que Chrome
// dispare múltiples descargas sin perder ninguna.
function dlAll() {
  GCs.forEach((g, i) => {
    setTimeout(() => downloadBlob(g, fileName(OPT.cli, OPT.proy, i + 1, 'txt')), i * 250);
  });
}

// ===== Impresión BATCH (flujo oficina) =====
// Dispara window.print() con el #printPanel poblado. En modo kiosk va directo
// a la impresora default; en modo normal abre el cuadro para elegir.
function printBatch(html) {
  if (!RES) { alert('Optimizá primero.'); return; }
  const panel = $('printPanel');
  panel.innerHTML = html;
  document.body.classList.add('print-mode-batch');
  // Pequeño delay para que el browser pinte antes de imprimir
  setTimeout(() => {
    window.print();
    // Limpio después del print (afterprint event no es 100% confiable)
    setTimeout(() => {
      document.body.classList.remove('print-mode-batch');
      panel.innerHTML = '';
    }, 500);
  }, 80);
}

// Imprime TODAS las etiquetas (todas las piezas de todos los tableros),
// una etiqueta por página. Mismo formato visual que la etiqueta individual.
function printAllLabels() {
  if (!RES) { alert('Optimizá primero.'); return; }
  const sheets = [];
  RES.boards.forEach(b => {
    b.parts.forEach(p => {
      sheets.push(
        '<div class="print-label-sheet">' +
          '<div class="top">' +
            '<span>' + escapeHtml(OPT.proy || 'Proyecto') + '</span>' +
            '<span>' + escapeHtml(p.code) + ' · Tab ' + b.n + '</span>' +
          '</div>' +
          '<div class="nm">' + escapeHtml(p.desc || 'PIEZA') + '</div>' +
          '<div class="dim">' + p.w + ' × ' + p.h + ' mm</div>' +
          '<div class="mt">' +
            escapeHtml(OPT.cli || '') + ' · ' +
            escapeHtml(OPT.mat || '') + ' · ' +
            SHEET.thick + ' mm' +
          '</div>' +
        '</div>'
      );
    });
  });
  if (!sheets.length) { alert('No hay piezas para imprimir.'); return; }
  printBatch(sheets.join(''));
}

// Logo Maderable como SVG inline — solo wordmark, tinta sólida negra.
// Tamaño chico por default (16px de alto). Imprime limpio en B&N o color.
//
// Si en algún momento se agrega el SVG oficial al repo (ej. public/assets/maderable-logo.svg),
// reemplazar esta función por algo como:
//   return '<img src="/assets/maderable-logo.svg" height="' + h + '" alt="Maderable">';
function maderableLogoSvg(height) {
  const h = height || 16;
  return (
    '<svg class="ml-logo" viewBox="0 0 180 30" height="' + h + '" preserveAspectRatio="xMinYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<text x="0" y="23" font-family="Saira Condensed, sans-serif" font-weight="800" font-size="26" fill="#15130f" letter-spacing="1.5">MADERABLE</text>' +
    '</svg>'
  );
}

// Imprime los planos de nesting — uno por tablero. Cada plano tiene:
// cabecera con logo Maderable + título proyecto + cliente/material/fecha,
// SVG grande del tablero, tabla con el listado de piezas y descripción.
function printNestingPlans() {
  if (!RES) { alert('Optimizá primero.'); return; }
  const today = new Date().toLocaleDateString('es-UY');
  const sheets = RES.boards.map(b => {
    const piezas = b.parts.map(p =>
      '<tr>' +
        '<td>' + escapeHtml(p.code) + '</td>' +
        '<td>' + escapeHtml(p.desc || '') + '</td>' +
        '<td>' + p.w + '</td>' +
        '<td>' + p.h + '</td>' +
        '<td>' + p.x.toFixed(1) + '</td>' +
        '<td>' + p.y.toFixed(1) + '</td>' +
      '</tr>'
    ).join('');
    return (
      '<div class="print-nest-sheet">' +
        '<div class="hdr">' +
          '<div class="h-l">' +
            '<div class="brand">' + maderableLogoSvg(16) + '</div>' +
            '<h1>' + escapeHtml(OPT.proy || '(sin proyecto)') + '</h1>' +
            '<div class="sub">' +
              escapeHtml(OPT.cli || '(sin cliente)') + ' · ' +
              escapeHtml(OPT.mat || '') + ' ' + SHEET.thick + 'mm · ' +
              SHEET.w + '×' + SHEET.h + ' mm · ' +
              today +
            '</div>' +
          '</div>' +
          '<div class="h-r">Tablero ' + b.n + ' / ' + RES.boards.length + '</div>' +
        '</div>' +
        svgBoard(b, true, { showDims: true }) +
        '<table class="pcs">' +
          '<thead><tr><th>Código</th><th>Descripción</th><th>L (mm)</th><th>A (mm)</th><th>X</th><th>Y</th></tr></thead>' +
          '<tbody>' + piezas + '</tbody>' +
        '</table>' +
      '</div>'
    );
  });
  printBatch(sheets.join(''));
}

// ===== Supabase historial (POST /api/cortes) =====
// Modo "silent": confirmGen() llama esto automáticamente. Si MRP no está
// configurado o el endpoint no responde, log a consola y status visible
// en saveStatus, pero sin alerts modales que rompan el flujo.
async function saveCorte(opts) {
  const silent = !!(opts && opts.silent);
  const status = $('saveStatus');
  const setStatus = (txt, tone) => {
    if (!status) return;
    status.textContent = txt || '';
    status.style.color = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--danger)' : '';
  };

  if (!RES || !GCs.length) {
    if (!silent) alert('Confirmá primero para generar el G-code.');
    return;
  }
  const payload = {
    cliente: OPT.cli,
    proyecto: OPT.proy,
    // El MRP de Maderable no tiene tabla clientes — `cliente` es texto del proyecto.
    // Solo persistimos proyecto_id (text) que apunta a public.proyectos_cache(id).
    proyecto_id: OPT.proyId ?? null,
    material: OPT.mat,
    espesor: SHEET.thick,
    tableros: RES.boards,
    piezas: PCS,
    parametros: OPT,
  };
  setStatus('💾 Guardando…');
  try {
    const r = await fetch('/api/cortes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.warn('saveCorte: endpoint respondió', r.status, detail);
      setStatus(silent ? '💾 historial no disponible' : '💾 error ' + r.status, 'err');
      if (!silent) alert('Error guardando historial: ' + r.status + '\n' + detail);
      return;
    }
    const data = await r.json();
    setStatus('💾 Guardado · #' + (data.id ?? '?'), 'ok');
    if (!silent) alert('Guardado en historial. ID: ' + data.id);
  } catch (e) {
    console.warn('saveCorte: fetch falló', e);
    setStatus('💾 historial no disponible', 'err');
    if (!silent) alert('No pude contactar /api/cortes: ' + e.message);
  }
}

// ===== etiquetas tablet =====
function renderLblBoard() {
  $('lblwrap').innerHTML = svgBoard(RES.boards[bIdxL], 'lbl', { showDims: true });
  $('boardNowL').textContent = 'Tablero ' + (bIdxL + 1) + ' / ' + RES.boards.length;
  document.querySelectorAll('#lblwrap rect.pc').forEach(el => {
    const h = () => openLbl(el.getAttribute('data-n'));
    el.addEventListener('click', h);
    el.addEventListener('touchstart', e => { e.preventDefault(); h(); }, { passive: false });
  });
  const done = Object.keys(LBLDONE).filter(k => LBLDONE[k]).length;
  const tot = RES.boards.reduce((s, b) => s + b.parts.length, 0);
  $('lblProg').textContent = done + ' / ' + tot + ' etiquetadas';
}
function pageBoardL(d) { bIdxL = (bIdxL + d + RES.boards.length) % RES.boards.length; renderLblBoard(); }
function resetLbls() { LBLDONE = {}; renderLblBoard(); }
function openLbl(n) {
  let pc = null;
  RES.boards.forEach(b => b.parts.forEach(p => { if (p.code === n) pc = p; }));
  if (!pc) return;
  $('ol_job').textContent = OPT.proy;
  $('ol_n').textContent = n + ' · Tab ' + (bIdxL + 1);
  $('ol_desc').textContent = pc.desc || 'PIEZA';
  $('ol_dim').textContent = pc.w + ' × ' + pc.h + ' mm';
  $('ol_meta').textContent = OPT.cli + ' · ' + OPT.mat + ' · ' + SHEET.thick + 'mm';
  $('ovl').classList.add('on');
  LBLDONE[n] = true;
  // En planta esto imprime directo gracias a Chrome --kiosk-printing
  // + Datamax default. En dev sale el cuadro normal del navegador.
  document.body.classList.add('print-mode-overlay');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('print-mode-overlay'), 500);
  }, 120);
}
function closeOvl() { $('ovl').classList.remove('on'); renderLblBoard(); }

// ===== expose to window =====
// El HTML tiene onclick inline que asume globals. Como ahora estamos en
// un módulo, exponemos explícitamente. Lo hacemos en un solo lugar para
// que sea fácil ver qué entra al window.
const exposes = {
  PCS, tab, onSheetSel, toggleAddSheet, addSheet, toggleLock,
  addP, renderP, sample, onXlsx, doOptimize,
  pageBoard, gotoBoard, confirmGen, dl, dlAll, saveCorte,
  printAllLabels, printNestingPlans,
  pageBoardL, resetLbls, openLbl, closeOvl,
};
for (const k of Object.keys(exposes)) window[k] = exposes[k];
// PCS se accede mutable desde inline onchange/oninput, así que lo mantenemos
// como referencia viva en window:
Object.defineProperty(window, 'PCS', { get: () => PCS, set: v => { PCS = v; } });

// ===== Cargar un corte desde el historial =====
// Si la URL trae ?corte=N, traemos el corte completo de /api/cortes?id=N
// e hidratamos todo el estado (despiece, parámetros, tableros, G-code).
async function loadCorteFromUrl() {
  const id = new URLSearchParams(location.search).get('corte');
  if (!id) return false;
  setMrpStatus('Cargando trabajo #' + id + '…');
  try {
    const r = await fetch('/api/cortes?id=' + encodeURIComponent(id));
    if (!r.ok) { setMrpStatus('No pude cargar trabajo #' + id, 'err'); return false; }
    const data = await r.json();
    const row = data.row;
    if (!row) { setMrpStatus('Trabajo #' + id + ' no encontrado', 'err'); return false; }

    // Hidratamos OPT, SHEET, PCS, RES desde el payload
    OPT = row.parametros || {};
    OPT.cli   = row.cliente  || OPT.cli  || '';
    OPT.proy  = row.proyecto || OPT.proy || '';
    OPT.mat   = row.material || OPT.mat  || 'MDF';
    OPT.proyId = row.proyecto_id || null;
    // SHEET viene del primer tablero (todos comparten dimensiones en un trabajo)
    const tableros = row.tableros || [];
    if (!tableros.length) { setMrpStatus('Trabajo sin tableros', 'err'); return false; }
    SHEET = { w: tableros[0].w || tableros[0].sheet?.w || 0, h: tableros[0].h || tableros[0].sheet?.h || 0, thick: row.espesor };
    // Fallback: la geometría del SHEET puede estar en OPT.parametros o derivarse de
    // la pieza más grande contenida. Si no la encontramos, usamos el sheet selector.
    if (!SHEET.w || !SHEET.h) {
      // Reconstruimos a partir de las medidas máximas vistas en piezas
      let maxX = 0, maxY = 0;
      for (const b of tableros) for (const p of (b.parts || b.pl || [])) {
        maxX = Math.max(maxX, (p.x || 0) + (p.w || 0));
        maxY = Math.max(maxY, (p.y || 0) + (p.h || 0));
      }
      SHEET.w = SHEET.w || Math.ceil(maxX + 15);  // + refilado
      SHEET.h = SHEET.h || Math.ceil(maxY + 15);
    }
    PCS = (row.piezas || []).map(p => ({
      cod: p.cod, largo: p.largo, ancho: p.ancho, qty: p.qty, veta: p.veta, desc: p.desc || '',
    }));
    // RES: si el row.tableros ya tiene la estructura {n, parts}, lo usamos directo.
    // Si tiene {pl} (formato original del optimizer), lo mapeamos.
    RES = {
      minB: tableros.length,
      boards: tableros.map((b, i) => {
        const parts = (b.parts || b.pl || []).map(p => ({
          code: p.code || p.cod, desc: p.desc || (p.piece && p.piece.desc) || '',
          x: p.x, y: p.y, w: p.w, h: p.h,
        }));
        return { n: i + 1, parts };
      }),
      un: [],
    };

    renderP();
    GCs = RES.boards.map(b => genGcode(b.parts, SHEET, OPT, b.n));
    SETs = RES.boards.map(b => genSet(OPT, SHEET, b.parts, b.n));
    LBLDONE = {}; bIdx = 0; bIdxL = 0;
    $('t-res').disabled = false; $('t-lbl').disabled = false;
    $('preConfirm').style.display = 'none';
    $('gcArea').classList.remove('hide');
    renderKPI(); renderThumbs(); renderBig(); renderLblBoard(); tab('res');
    $('gc').value = GCs[bIdx]; $('gcBoardLbl').textContent = 'Tablero ' + (bIdx + 1);
    setMrpStatus('Trabajo #' + id + ' cargado desde historial', 'ok');
    // Indicador visual también en la barra:
    setTimeout(() => {
      const ss = $('saveStatus');
      if (ss) { ss.textContent = '💾 Guardado · #' + id; ss.style.color = 'var(--ok)'; }
    }, 100);
    return true;
  } catch (e) {
    setMrpStatus('Error al cargar #' + id + ': ' + e.message, 'err');
    return false;
  }
}

// ===== init =====
fillSheets(0);
applyLock();
initMRP();   // async — popula clientes/proyectos del Supabase de maderable-produccion
             // si los hay; si no, muestra banner y deja los inputs de texto.
loadCorteFromUrl();  // si hay ?corte=N en la URL, hidratamos desde historial.
