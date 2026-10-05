# Conectar el formulario con Google (5 minutos)

Las inscripciones llegan a una **Google Sheet** y los archivos (logo, foto y comprobante) se guardan en una **carpeta de Drive**, con una subcarpeta por equipo.

## 1. Crear el script

1. Entrá a <https://script.google.com> con tu cuenta de Google y tocá **Nuevo proyecto**.
2. Ponele de nombre **SAS CUP 2026 Inscripciones** (arriba a la izquierda).
3. Borrá todo lo que aparece en `Código.gs` y pegá el contenido de [`Code.gs`](Code.gs).
4. *(Opcional)* Si querés recibir un mail por cada inscripción, poné tu mail en la línea `const NOTIFY_EMAIL = "";`.
5. Guardá con **⌘ + S**.

## 2. Crear la planilla y la carpeta

1. Arriba, en el menú de funciones, elegí **`setup`** y tocá **▶ Ejecutar**.
2. Google te va a pedir permisos: **Revisar permisos**, elegí tu cuenta, después **Configuración avanzada**, después **Ir a SAS CUP 2026 Inscripciones (no seguro)** y por último **Permitir**.
   > Aparece "no seguro" porque el script es tuyo y no está verificado por Google. Es normal.
3. En el **Registro de ejecución** abajo vas a ver los links a la planilla y a la carpeta. Ya están creadas en tu Drive.

## 3. Publicarlo

1. Tocá **Implementar → Nueva implementación**.
2. En el engranaje ⚙️ elegí **Aplicación web**.
3. Completá así:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** **Cualquier persona**
4. Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).

## 4. Pegar la URL en la página

Al principio de `assets/js/inscripcion.js` (línea 10):

```js
const SCRIPT_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

Listo. Hacé una inscripción de prueba y revisá que aparezca en la planilla.

---

### Durante el torneo

- En la columna **Estado seña** de la planilla podés marcar *Pendiente / Verificada / Rechazada*.
- Si cambiás algo en `Code.gs`, tenés que volver a publicar: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar**. Así la URL no cambia.
