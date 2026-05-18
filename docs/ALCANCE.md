# Alcance — copia de referencia

El documento de alcance maestro vive en el repo personal de JP (`ALCANCE-optimizador-corte-NEPOTIS.md`).
Este archivo queda como puntero al spec funcional definitivo:

- **Spec funcional canónico:** `maqueta-gcode-nepotis-v3.html` — el optimizador y el generador
  de G-code de ahí se reproducen 1:1.
- **Decisiones cerradas** y reglas de trabajo: ver `ALCANCE-optimizador-corte-NEPOTIS.md`.
- **Decisiones tomadas en esta sesión** que sobreescriben/aclaran el alcance original:
  - Etiquetas v1: `window.print()` + Chrome `--kiosk-printing` (ver `DPL-DATAMAX.md`).
  - Excel: columnas `Código, Largo, Ancho, Cant, Veta, Descripción`.
  - Multipasada Z: opción visible, default 1 pasante.
  - Tabs: auto, lado < 200 mm.
  - Supabase: sí en v1 para historial básico.
  - Paridad de corte: contorno limpio v3.
