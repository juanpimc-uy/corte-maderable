# Checklist Fase 0 — air-cut NEPOTIS

> **Operador:** completar con check (✓) o (✗) y firma. Si algo falla, parar
> y anotar abajo qué se observó. No quitar la marca "VERIFICAR ANTES DE CORTAR"
> del generador hasta que esta hoja esté firmada completa.

Programa: `FASE0-aircut.txt`
Fecha: ____________________
Operador: _________________

---

## A · Pre-arranque

- [ ] Single-block activo en el controlador.
- [ ] Sin material en mesa O Z-offset positivo +50 mm aplicado.
- [ ] T001 montada (FRESA DE CORTE PRINCIPAL, Ø12).
- [ ] Origen G54 fijado en la **esquina inferior-izquierda** del tablero (o de la zona de prueba).
- [ ] Vacío apagado (no hace falta para air-cut).

## B · Bloque a bloque

### Cabecera (N5 → N25)

- [ ] `N5 G54` y `N10 G54 G90` se ejecutan sin alarma.
- [ ] `N15 T001` — la máquina **no cambia de herramienta** (ya está montada). Si pide cambio, confirmar manual.
- [ ] `N20 S18000 M03` — husillo arranca a 18000 RPM, sentido horario. Sonido limpio.
- [ ] `N25 G43 H01 Z44.` — sube a Z=44 mm. Verificar con sonda o regla que **realmente está a 44 mm sobre el datum** (no a 44 mm sobre la mesa si el datum es otro).

### Pieza SQ — 200×200 en X=15, Y=15 (esquina inferior-izquierda)

- [ ] `G00 G90 X9. Y24.` — punto de entrada queda **9 mm en X, 24 mm en Y** desde el datum.
- [ ] `Z22.` baja a 22 mm sin problemas (Z retiro bajo).
- [ ] `G01 X9. Y9. Z0. F4000` — lead-in rampado entra a profundidad pasante (Z=0). Sin chillido ni rampa demasiado vertical.
- [ ] Contorno X9→X221 (eje X positivo hacia la derecha del operador).
- [ ] Esquinas a 90°, sin recortes.
- [ ] Cierre vuelve a X=9, Y=9.
- [ ] Sube a Z=22, después a Z=44.

### Pieza HX — 400×60 en X=15, Y=229 (más arriba)

- [ ] Posicionamiento a X=9, Y=238. **Verifica sentido Y** (debería estar 200+14+15=229 mm más arriba que SQ).
- [ ] Tramo largo en X (de X=9 a X=421) — feed corte F7999.2 estable, sin escalones.
- [ ] Rectángulo cierra limpio.

### Pieza VY — 60×300 en X=429, Y=15 (a la derecha)

- [ ] Posicionamiento a X=423, Y=24. **Verifica sentido X** (debería estar 200+14+200+14+1=429 mm a la derecha de SQ).
- [ ] Tramo largo en Y (de Y=9 a Y=321) — feed corte estable.

### Pieza REF — 100×80 en X=229, Y=15 (entre SQ y VY)

- [ ] Posicionamiento a X=223, Y=24. La fresa debería ir físicamente entre SQ y VY.
- [ ] Contorno cierra limpio.

### Cierre (N210 → N235)

- [ ] `G01 Z44. F500` — retracción a 500 mm/min. Lento y controlado.
- [ ] `M15` — husillo se apaga.
- [ ] `M05` — husillo OFF confirmado.
- [ ] `G49` — cancela compensación de herramienta.
- [ ] `M30` — fin de programa.

## C · Mediciones críticas

Estas son las que **bloquean** la salida a producción si fallan:

| Qué medir | Esperado | Medido | OK |
|---|---|---|---|
| Distancia origen → centro de la fresa al inicio de SQ | X=9, Y=9 (esquina ya con medio Ø de offset) | X=____ Y=____ | ☐ |
| Largo del lado X de SQ (entre X=9 y X=221) | 212 mm centro-a-centro (= 200 + Ø) | _____ mm | ☐ |
| Largo del lado Y de HX (entre Y=223 y Y=295) | 72 mm centro-a-centro (= 60 + Ø) | _____ mm | ☐ |
| Z seguro real | 44 mm sobre datum | _____ mm | ☐ |
| Z retiro bajo real | 22 mm sobre datum | _____ mm | ☐ |
| Z pasante (a Z=0, donde dataría el spoilboard) | 0 mm desde datum | _____ mm | ☐ |

## D · Observaciones

> Si hay algo raro (vibración, feeds que no se respetan, ejes invertidos, etc.) anotalo acá. Si los ejes están al revés en X o Y, lo arreglamos en `src/data/defaults.js` o invirtiendo el origen — sin tocar el dialecto.

```


```

## E · Cierre

- [ ] Todo lo de arriba está OK.
- [ ] Confirmo que el dialecto NEPOTIS generado por la app corte-maderable **es seguro de correr en producción**.

Operador (firma): _________________
Fecha: ____________________

---

Una vez firmada, mandar foto/escaneo a JP y se quita la línea
`( ... - VERIFICAR ANTES DE CORTAR )` del generador en `src/core/gcode.js`.
