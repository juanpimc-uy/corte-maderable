# Fase 0 — Programa de prueba para air-cut en NEPOTIS

Este directorio tiene el programa de validación del dialecto antes de
liberar la app a producción. Está pensado para correrse **sin material**
o con **Z elevado**, en **single-block**.

## Qué hay acá

| Archivo | Para qué |
|---|---|
| `FASE0-aircut.txt`  | G-code generado con el dialecto NEPOTIS migrado. 4 piezas. |
| `FASE0-aircut.set`  | Setup-sheet acompañante. |
| `posiciones.txt`    | Coordenadas calculadas de cada pieza. Para verificar contra la máquina. |
| `CHECKLIST.md`      | Lista de cosas a verificar durante el air-cut. **Imprimila o tenela abierta al lado de la máquina.** |
| `generate.mjs`      | Regenera todo lo de arriba. Si cambiás algún parámetro, corré: `node fase0/generate.mjs`. |

## Cómo correrlo

1. **No cargar material** o cargar un retazo y subir Z 50 mm desde el offset del controlador.
2. **Single-block ON** en la NEPOTIS.
3. Cargar `FASE0-aircut.txt`.
4. Avanzar línea por línea siguiendo `CHECKLIST.md`.
5. Si todo OK, firmar el checklist y avisar para quitar la marca "VERIFICAR ANTES DE CORTAR" del generador.

## Regenerar después de cambiar parámetros

Si en `src/data/defaults.js` o en el script `generate.mjs` cambias algo:

```
cd corte-maderable
node fase0/generate.mjs
```

Sobreescribe los .txt/.set/posiciones.txt con los nuevos valores.

## Reglas del proyecto que aplican

- ❌ **No correr este programa contra material sin pasar primero por air-cut.**
- ❌ **No quitar la línea `VERIFICAR ANTES DE CORTAR` del generador hasta cerrar este checklist.**
- ❌ **No `git push` sin "ok push" de JP** (vale igual para este directorio).
