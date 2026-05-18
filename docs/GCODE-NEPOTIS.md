# Dialecto G-code · NEPOTIS

Confirmado contra programas reales de T001 en la maqueta v3. Pendiente de validar
contra programa real de **corte puro de paneles** + air-cut en Fase 0.

## Formato

- ISO/Fanuc.
- Número de línea `N` en pasos de 5.
- Comentarios entre `( )`.
- Unidades: mm.
- Fin de línea: **CRLF**.
- Coordenadas estilo Fanuc con punto final: `X9.`, `Z44.`, `F4000.`.
- **Sin G41/G42**: la geometría sale ya offseteada por medio Ø de fresa. El post NEPOTIS
  no usa compensación de radio.

## Cabecera por programa

```
( PART NAME=<proyecto>-T<n> )
( CLIENTE=<cliente> )
( PROYECTO=<proyecto> )
( MACHINE=NEPOTIS )
( MATERIAL=<material> )
( THICKNESS=<espesor>. )
( TABLERO <n> )
( ⚠ VERIFICAR ANTES DE CORTAR — Fase 0 air-cut pendiente )
```

(La línea de advertencia se quita cuando se cierre Fase 0.)

## Secuencia de arranque

```
G54
G54 G90
T001 (FRESA DE CORTE PRINCIPAL)
S<rpm> M03
G43 H01 Z<zSafe>.
```

## Por pieza

1. Posicionar X/Y en el punto de entrada (ya con offset medio Ø).
2. Bajar a Z retiro bajo (`zRetractLow`).
3. **Lead-in rampado** sobre el primer lado hasta `zPass` (profundidad de corte).
4. Recorrer el contorno (4 lados).
5. Subir a `zRetractLow`.
6. Subir a `zSafe`.

## Cierre

```
M15
M05
G49
G90 M05
M30
```

## Valores observados (default, sujetos a Fase 0)

| Parámetro          | Valor       |
|--------------------|-------------|
| RPM                | 18000       |
| Z seguro           | 44 mm       |
| Z retiro bajo      | 22 mm       |
| Tope material      | espesor (25.4 mm para MDF) |
| Pasante            | 0 mm        |
| Feed corte         | 7999.2 mm/min |
| Feed plunge/rampa  | 4000 mm/min |
| Feed retracción    | 500 mm/min  |
| Estrategia         | 1 pasada pasante (multipasada opcional) |
| Sujeción           | vacío, sin tabs (tabs opcionales para piezas chicas, < 200 mm) |

## Fase 0 — checklist (a llenar en planta)

- [ ] Origen G54 vs esquina del tablero — ¿qué esquina, qué orientación?
- [ ] Sentido X/Y respecto al frente de máquina.
- [ ] Z seguro real (44 mm cae en aire — confirmar).
- [ ] Z retiro bajo real (22 mm — confirmar que no choca con prensores).
- [ ] Profundidad pasante real (0 mm contra el spoilboard — ¿qué overcut?).
- [ ] Feeds sanos (sin chillido, sin marca de rampa).
- [ ] Lead-in rampado entra suave.

Cuando todo esto está OK y firmado, se quita la línea de advertencia y el
G-code pasa a producción.
