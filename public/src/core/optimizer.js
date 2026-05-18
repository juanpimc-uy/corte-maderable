/* core · optimizador de nesting
 *
 * MIGRACIÓN 1:1 desde maqueta-gcode-nepotis-v3.html (líneas 257-386).
 * NO se reescribe el algoritmo. NO se "mejora". NO se cambian heurísticas.
 *
 * Algoritmos:
 *   - MaxRects con scoring BSSF / BAF / BLSF  → packCapped()
 *   - Skyline bottom-left                      → skylineCapped()
 *   - Multi-start con RNG determinista         → optimize()
 *   - Eliminación del tablero menos lleno      → eliminate()
 *
 * Presupuesto de tiempo: 700 ms (BUDGET).
 *
 * Invariantes (verificadas en tests/optimizer.test.js):
 *   - 0 solapamientos entre piezas.
 *   - 0 piezas fuera de borde (respetando refilado).
 *   - 100% de piezas ubicadas.
 *   - Resultado determinista para misma entrada + misma seed.
 */

// MaxRects con tope de tableros.
// items: [{_w, _h, veta, ...}]
// board: {w, h}
// o: {kerf, trim, allowRotate}
// score: 'BSSF' | 'BAF' | 'BLSF'
// maxB: máximo de tableros a usar
export function packCapped(items, board, o, score, maxB) {
  const kerf = o.kerf || 0, trim = o.trim || 0, rot = o.allowRotate !== false;
  const W = board.w - 2 * trim, H = board.h - 2 * trim, boards = [];
  const nb = () => { if (boards.length >= maxB) return null; boards.push({ free: [{ x: trim, y: trim, w: W, h: H }], pl: [] }); return boards[boards.length - 1]; };
  const sf = (fr, pw, ph) => {
    const lh = fr.w - pw, lv = fr.h - ph; if (lh < -1e-6 || lv < -1e-6) return null;
    if (score === 'BSSF') return { a: Math.min(lh, lv), b: Math.max(lh, lv) };
    if (score === 'BLSF') return { a: Math.max(lh, lv), b: Math.min(lh, lv) };
    return { a: fr.w * fr.h - pw * ph, b: Math.min(lh, lv) };
  };
  const split = (bd, u) => {
    const nf = [];
    for (const f of bd.free) {
      if (u.x >= f.x + f.w || u.x + u.w <= f.x || u.y >= f.y + f.h || u.y + u.h <= f.y) { nf.push(f); continue; }
      if (u.x > f.x) nf.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
      if (u.x + u.w < f.x + f.w) nf.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - (u.x + u.w), h: f.h });
      if (u.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
      if (u.y + u.h < f.y + f.h) nf.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - (u.y + u.h) });
    }
    bd.free = nf;
  };
  const prune = bd => {
    const f = bd.free;
    for (let i = f.length - 1; i >= 0; i--) for (let j = 0; j < f.length; j++) {
      if (i === j) continue; const a = f[i], b = f[j];
      if (a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6) { f.splice(i, 1); break; }
    }
  };
  for (const it of items) {
    const ors = [{ w: it._w, h: it._h, r: false }];
    if (rot && !it.veta && it._w !== it._h) ors.push({ w: it._h, h: it._w, r: true });
    let best = null;
    for (let bi = 0; bi < boards.length; bi++) {
      const bd = boards[bi];
      for (let fi = 0; fi < bd.free.length; fi++) {
        const fr = bd.free[fi];
        for (const or of ors) {
          const s = sf(fr, or.w + kerf, or.h + kerf); if (!s) continue;
          if (!best || s.a < best.a - 1e-6 || (Math.abs(s.a - best.a) < 1e-6 && s.b < best.b - 1e-6))
            best = { a: s.a, b: s.b, bi, x: fr.x, y: fr.y, w: or.w, h: or.h, r: or.r };
        }
      }
    }
    if (!best) {
      const bd = nb(); if (!bd) return null; const fr = bd.free[0]; let ok = false;
      for (const or of ors) if (or.w + kerf <= fr.w + 1e-6 && or.h + kerf <= fr.h + 1e-6) { best = { bi: boards.length - 1, x: fr.x, y: fr.y, w: or.w, h: or.h, r: or.r }; ok = true; break; }
      if (!ok) return null;
    }
    const bd = boards[best.bi];
    bd.pl.push({ x: best.x, y: best.y, w: best.w, h: best.h, rot: best.r, piece: it });
    split(bd, { x: best.x, y: best.y, w: best.w + kerf, h: best.h + kerf }); prune(bd);
  }
  return { boards };
}

// Skyline bottom-left con tope de tableros.
export function skylineCapped(items, board, o, maxB) {
  const kerf = o.kerf || 0, trim = o.trim || 0, rot = o.allowRotate !== false;
  const W = board.w - 2 * trim, H = board.h - 2 * trim, boards = [];
  const mk = () => ({ sky: [{ x: trim, y: trim, w: W }], pl: [] });
  function tryB(bd, w, h) {
    let best = null;
    for (let i = 0; i < bd.sky.length; i++) {
      let x = bd.sky[i].x, y = bd.sky[i].y, acc = 0, j = i;
      if (x + w > trim + W + 1e-6) continue;
      while (acc < w - 1e-6 && j < bd.sky.length) { y = Math.max(y, bd.sky[j].y); acc += bd.sky[j].w; j++; }
      if (acc < w - 1e-6) continue; if (y + h > trim + H + 1e-6) continue;
      if (!best || y < best.y - 1e-6 || (Math.abs(y - best.y) < 1e-6 && x < best.x - 1e-6)) best = { x, y };
    }
    return best;
  }
  function add(bd, x, y, w, h) {
    const ns = [];
    for (const s of bd.sky) {
      if (s.x + s.w <= x + 1e-6 || s.x >= x + w - 1e-6) { ns.push(s); continue; }
      if (s.x < x - 1e-6) ns.push({ x: s.x, y: s.y, w: x - s.x });
      if (s.x + s.w > x + w + 1e-6) ns.push({ x: x + w, y: s.y, w: s.x + s.w - (x + w) });
    }
    ns.push({ x, y: y + h, w }); ns.sort((a, b) => a.x - b.x);
    const mg = [ns[0]];
    for (let i = 1; i < ns.length; i++) {
      const l = mg[mg.length - 1];
      if (Math.abs(l.y - ns[i].y) < 1e-6 && Math.abs(l.x + l.w - ns[i].x) < 1e-6) l.w += ns[i].w; else mg.push(ns[i]);
    }
    bd.sky = mg;
  }
  for (const it of items) {
    const ors = [{ w: it._w, h: it._h, r: false }];
    if (rot && !it.veta && it._w !== it._h) ors.push({ w: it._h, h: it._w, r: true });
    let placed = false;
    for (let bi = 0; bi < boards.length && !placed; bi++) {
      const bd = boards[bi]; let bp = null, bo = null;
      for (const or of ors) { const p = tryB(bd, or.w + kerf, or.h + kerf); if (p && (!bp || p.y < bp.y - 1e-6 || (Math.abs(p.y - bp.y) < 1e-6 && p.x < bp.x - 1e-6))) { bp = p; bo = or; } }
      if (bp) { bd.pl.push({ x: bp.x, y: bp.y, w: bo.w, h: bo.h, rot: bo.r, piece: it }); add(bd, bp.x, bp.y, bo.w + kerf, bo.h + kerf); placed = true; }
    }
    if (!placed) {
      if (boards.length >= maxB) return null;
      const bd = mk(); boards.push(bd);
      let bp = null, bo = null;
      for (const or of ors) { const p = tryB(bd, or.w + kerf, or.h + kerf); if (p && (!bp || p.y < bp.y)) { bp = p; bo = or; } }
      if (!bp) return null;
      bd.pl.push({ x: bp.x, y: bp.y, w: bo.w, h: bo.h, rot: bo.r, piece: it });
      add(bd, bp.x, bp.y, bo.w + kerf, bo.h + kerf);
    }
  }
  return { boards };
}

// RNG determinista (LCG). Misma semilla → mismo orden de candidatos.
export function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function shuffle(a, r) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Eliminación iterativa del tablero menos lleno: intenta reubicar todas
// sus piezas en los demás. Si entran, lo elimina. Repite hasta no mejorar.
export function eliminate(boards, board, o) {
  const kerf = o.kerf || 0, trim = o.trim || 0, rot = o.allowRotate !== false;
  function freeOf(bd) {
    let fr = [{ x: trim, y: trim, w: board.w - 2 * trim, h: board.h - 2 * trim }];
    for (const p of bd.pl) {
      const u = { x: p.x, y: p.y, w: p.w + kerf, h: p.h + kerf }, nf = [];
      for (const f of fr) {
        if (u.x >= f.x + f.w || u.x + u.w <= f.x || u.y >= f.y + f.h || u.y + u.h <= f.y) { nf.push(f); continue; }
        if (u.x > f.x) nf.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
        if (u.x + u.w < f.x + f.w) nf.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - (u.x + u.w), h: f.h });
        if (u.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
        if (u.y + u.h < f.y + f.h) nf.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - (u.y + u.h) });
      }
      fr = nf;
    }
    for (let i = fr.length - 1; i >= 0; i--) for (let j = 0; j < fr.length; j++) {
      if (i === j) continue; const a = fr[i], b = fr[j];
      if (a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6) { fr.splice(i, 1); break; }
    }
    return fr;
  }
  let improved = true;
  while (improved && boards.length > 1) {
    improved = false;
    let li = 0, lu = 1 / 0;
    boards.forEach((b, i) => { const u = b.pl.reduce((s, p) => s + p.w * p.h, 0); if (u < lu) { lu = u; li = i; } });
    const donor = boards[li], others = boards.filter((_, i) => i !== li), frees = others.map(freeOf);
    const items = donor.pl.slice().sort((a, b) => b.w * b.h - a.w * a.h), trial = []; let allFit = true;
    for (const it of items) {
      const ors = [{ w: it.w, h: it.h, r: it.rot }];
      if (rot && !it.piece.veta && it.w !== it.h) ors.push({ w: it.h, h: it.w, r: !it.rot });
      let best = null;
      for (let bi = 0; bi < others.length; bi++) for (let fi = 0; fi < frees[bi].length; fi++) {
        const fr = frees[bi][fi];
        for (const or of ors) {
          const lh = fr.w - (or.w + kerf), lv = fr.h - (or.h + kerf); if (lh < -1e-6 || lv < -1e-6) continue;
          const sc = Math.min(lh, lv); if (!best || sc < best.sc - 1e-6) best = { sc, bi, x: fr.x, y: fr.y, w: or.w, h: or.h, r: or.r, piece: it.piece };
        }
      }
      if (!best) { allFit = false; break; }
      const arr = frees[best.bi], u = { x: best.x, y: best.y, w: best.w + kerf, h: best.h + kerf }, nf = [];
      for (const f of arr) {
        if (u.x >= f.x + f.w || u.x + u.w <= f.x || u.y >= f.y + f.h || u.y + u.h <= f.y) { nf.push(f); continue; }
        if (u.x > f.x) nf.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
        if (u.x + u.w < f.x + f.w) nf.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - (u.x + u.w), h: f.h });
        if (u.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
        if (u.y + u.h < f.y + f.h) nf.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - (u.y + u.h) });
      }
      frees[best.bi] = nf; trial.push(best);
    }
    if (allFit) {
      trial.forEach(t => others[t.bi].pl.push({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.r, piece: t.piece }));
      boards.splice(li, 1); improved = true;
    }
  }
  return boards;
}

// Entry point: nesting completo.
// pieces: [{w, h, qty, veta, desc, cod}]
// board: {w, h}
// o: {kerf, trim, allowRotate}
// → {boards, n, minB, un}
export function optimize(pieces, board, o) {
  o = o || {};
  let base = [];
  pieces.forEach(p => { for (let i = 0; i < p.qty; i++) base.push({ ...p, _w: p.w, _h: p.h }); });
  const usable = (board.w - 2 * (o.trim || 0)) * (board.h - 2 * (o.trim || 0));
  let area = 0; base.forEach(p => area += p._w * p._h);
  const minB = Math.max(1, Math.floor(area / usable * 0.999) || 1);
  const sorts = [
    a => a.slice().sort((x, y) => y._w * y._h - x._w * x._h),
    a => a.slice().sort((x, y) => Math.max(y._w, y._h) - Math.max(x._w, x._h)),
    a => a.slice().sort((x, y) => y._h - x._h || y._w - x._w),
    a => a.slice().sort((x, y) => y._w - x._w || y._h - x._h),
    a => a.slice().sort((x, y) => (y._w + y._h) - (x._w + x._h)),
  ];
  const scores = ['BSSF', 'BAF', 'BLSF'], r = rng(987654), T0 = Date.now(), BUDGET = 700;
  let result = null;
  for (let T = minB; T <= minB + 4; T++) {
    const cands = []; sorts.forEach(s => cands.push(s(base)));
    const restarts = Math.max(24, Math.min(220, Math.round(9000 / Math.max(1, base.length)))) * (T <= minB + 1 ? 1 : 0.4) | 0;
    for (let i = 0; i < restarts; i++) cands.push(shuffle(base, r));
    let found = null;
    for (const ord of cands) {
      if (Date.now() - T0 > BUDGET) break;
      const tries = [];
      for (const sc of scores) { const m = packCapped(ord, board, o, sc, T); if (m) tries.push(m.boards); }
      const sk = skylineCapped(ord, board, o, T); if (sk) tries.push(sk.boards);
      for (const bs of tries) {
        if (bs.length > T) continue;
        const fills = bs.map(b => b.pl.reduce((q, p) => q + p.w * p.h, 0)).sort((a, b) => b - a);
        const conc = fills.slice(0, Math.max(1, fills.length - 1)).reduce((a, c) => a + c, 0);
        if (!found || conc > found._c + 1e-6) found = { boards: bs, _c: conc };
      }
    }
    if (Date.now() - T0 > BUDGET && !found) break;
    if (found) { result = found; break; }
  }
  if (!result) { const m = packCapped(sorts[0](base), board, o, 'BSSF', 999); result = { boards: m.boards }; }
  result.boards = eliminate(result.boards, board, o);
  result.n = result.boards.length; result.minB = minB; result.un = [];
  return result;
}
