# corte-maderable

App web para cargar despieces desde planta, optimizar el nesting, generar G-code para la CNC NEPOTIS e imprimir etiquetas en la Datamax.

**Estado:** esqueleto — sin lógica todavía. Ver `docs/ALCANCE.md` para el spec completo y `docs/DPL-DATAMAX.md` para la decisión de impresión.

## Stack

- Frontend estático (HTML + JS modular, sin framework).
- Vercel para hosting + funciones serverless (`api/cortes` para historial).
- Supabase para historial básico de cortes.
- Sin agente local en planta. Etiquetas vía `window.print()` + Chrome `--kiosk-printing` (ver `docs/SETUP-PLANTA.md`).

## Estructura

```
public/              ← servido estático (index.html, css, fuentes)
src/
  app.js             ← bootstrap, tabs, estado global
  ui/                ← una pestaña por archivo
  core/              ← lógica de negocio (optimizer, gcode, excel, labels, supabase)
  data/              ← constantes (tableros predefinidos, defaults de máquina)
  lib/               ← utilidades compartidas
api/                 ← funciones serverless de Vercel
db/                  ← SQL — se aprueba y ejecuta manualmente, NUNCA automático
docs/                ← alcance, dialecto G-code, setup planta, hallazgos
tests/               ← integridad optimizer + diff gcode contra maqueta
```

## Reglas de trabajo críticas

1. **PROHIBIDO** `git add` / `git commit` / `git push` sin "ok push" explícito de JP.
2. **SQL** se deja en archivo, nunca se ejecuta automático.
3. **G-code** sale rotulado "VERIFICAR ANTES DE CORTAR" hasta cerrar Fase 0 (air-cut en NEPOTIS).
4. Optimizer y generador de G-code se reproducen 1:1 desde `maqueta-gcode-nepotis-v3.html`. No se "mejoran" ni se "refactorizan" sin pedirlo.

## Estado por componente

| Componente | Estado |
|---|---|
| Esqueleto | ✅ |
| Optimizer | ⏳ pendiente migración 1:1 |
| Generador G-code | ⏳ pendiente migración 1:1 |
| UI 4 pestañas | ⏳ pendiente |
| Import Excel | ⏳ pendiente |
| Etiquetas (window.print + kiosk) | ⏳ pendiente |
| Supabase historial | ⏳ pendiente (SQL en archivo, NO ejecutado) |
| Tests integridad | ⏳ pendiente |
| Fase 0 air-cut | ⏳ esperando coordinación con planta |
