# Installers — corte-maderable

Aquí están los launchers que **resuelven el problema del cuadro de impresión**.
Chrome muestra el diálogo de impresión a menos que se lance con
`--kiosk-printing`. Estos scripts hacen eso y dejan todo configurado para
producción.

## Para PLANTA (Windows)

### `launch-planta-windows.bat`

El acceso directo definitivo de la PC de planta.

**Setup una sola vez:**

1. Instalar el driver de la Datamax en Windows.
2. En *Configuración → Impresoras*, marcar la Datamax como **predeterminada**.
3. Copiar `launch-planta-windows.bat` al **escritorio** de la PC.
4. (Opcional, recomendado) click derecho sobre el icono → *Propiedades* →
   *Cambiar icono…* y elegir uno reconocible. También se puede cambiar el
   nombre del .bat (ej. "Corte Maderable").
5. Si Chrome no está en `C:\Program Files\Google\Chrome\Application\chrome.exe`,
   editá el .bat y apuntá la variable `CHROME` a la ruta real.

**Uso diario:**

- Doble click al ícono del escritorio.
- Se abre Chrome a pantalla completa en `corte.maderable.uy`.
- Cualquier impresión de etiqueta sale **directo a la Datamax, sin diálogo**.

Si la conexión a `corte.maderable.uy` falla por internet caído, Chrome
muestra un error genérico. Esto se va a poder mejorar más adelante con
modo offline / cache.

---

## Para TESTING (Mac)

### `launch-mac-test.command`

Para que JP pueda verificar en su Mac que la app imprime sin diálogo,
sin tener que armar la PC de planta.

**Setup una sola vez:**

1. Abrir Terminal.
2. Hacer el .command ejecutable:
   ```bash
   chmod +x "/Users/juanpablomartinez/Library/CloudStorage/OneDrive-Personal/PROYECTOS EN CURSO ▶️/CLAUDE/corte-maderable/installers/launch-mac-test.command"
   ```
3. (Opcional) crear alias en el dock o escritorio.

**Uso:**

1. En una terminal, levantar el dev server:
   ```bash
   cd <ruta>/corte-maderable/public
   python3 -m http.server 3000
   ```
2. Click derecho en `launch-mac-test.command` → **Abrir** (la primera vez
   macOS pide confirmación por ser script no firmado — *Open* y queda
   autorizado para siempre).
3. Se abre Chrome con un perfil temporal en `/tmp/`, apuntando a
   `localhost:3000`, **sin cuadro de impresión**.

> Si tu Mac no tiene impresora física, ponele "Guardar como PDF" como
> default temporalmente para ver el efecto. La etiqueta se va a guardar
> directo como PDF, sin diálogo.

---

## Cómo se relaciona con `docs/SETUP-PLANTA.md`

El `SETUP-PLANTA.md` original explicaba los pasos a mano (`--kiosk-printing`,
`--user-data-dir`, etc.). Esos pasos están **ahora todos dentro de los .bat
y .command de este directorio**, así que el setup en planta se reduce a:

1. Instalar driver Datamax.
2. Datamax como predeterminada.
3. Copiar `launch-planta-windows.bat` al escritorio.

Fin.
