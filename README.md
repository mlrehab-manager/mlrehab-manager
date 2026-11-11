# MLREHAB Manager · 0.8 DEMO

Aplicación gratuita y estática para ensayar la gestión de una clínica de fisioterapia. **Utiliza exclusivamente datos ficticios.** El almacenamiento local y las copias JSON no están cifrados y no constituyen almacenamiento clínico seguro.

## Funciones conservadas

- Agenda diaria y semanal, alta, edición y eliminación de citas de 60 minutos, control de solapamientos y movimiento con ratón o pulsación prolongada táctil.
- Pacientes: creación, búsqueda, cambio de nombre y eliminación con sus citas.
- Historia: datos personales, anamnesis, antecedentes, exploración, ROM, dinamometría, diagnóstico, objetivos y plan de tratamiento.
- Sesiones: creación, edición y eliminación; referencias a documentos ficticios, sin subir archivos.
- Exportación e importación JSON y restablecimiento de la demo.

## Estructura y ejecución

`index.html` contiene la estructura accesible; `assets/styles.css`, el diseño; `assets/app.js`, las vistas e interacciones; `assets/storage.js`, la validación y carga de datos. Se mantienen los manejadores existentes para reducir el riesgo de regresiones; su conversión a módulos puede hacerse en una iteración posterior.

No hay backend, servicios de pago, fuentes externas ni compilación obligatoria. Para abrir localmente:

```sh
python3 -m http.server 4173
```

Visita `http://localhost:4173`. GitHub Pages puede servir directamente la raíz del repositorio; las rutas de recursos son relativas y funcionan bajo `/mlrehab-manager/`. Esta rama no publica ni modifica la configuración de Pages.

## Datos y recuperación

Se mantiene la clave `mlrehab-demo-v1`, compatible con las copias anteriores. La importación admite JSON de hasta 5 MB y valida IDs, fechas, sesiones, referencias y solapamientos antes de sustituir los datos. Reconstruye los contadores para evitar IDs duplicados al importar copias antiguas.

Si los datos locales están dañados, no se sobrescriben automáticamente: se muestra una demo temporal y en **Copias de prueba** se puede descargar el original. Después, importa una copia válida o restablece la demo. Un fallo de guardado revierte el cambio en memoria y mantiene abierto el formulario cuando corresponde. Exporta copias periódicamente: el navegador puede borrar sus datos. No hay sincronización entre dispositivos. La versión 0.7 detecta datos cambiados en otra pestaña antes de guardar (véase abajo); sigue siendo preferible trabajar en una sola pestaña.

## Verificación

```sh
npm ci
npx playwright install chromium
npm test
npm run format:check
```

Las pruebas locales usan `/usr/bin/chromium`; CI instala el Chromium de Playwright. Se prueban el recorrido de pacientes, historias y sesiones, movimiento de citas con ratón y eventos táctiles, copias de ida y vuelta, recuperación de datos dañados, fallos de escritura y tamaños de iPad en vertical y horizontal. El comportamiento de Safari en un iPad físico debe revisarse antes de publicar.

## Revisión de esta iteración

El código recibido estaba concentrado en un HTML con el título y la agenda marcados como v0.3, aunque la versión publicada se identificó como 0.4. Esta iteración se identifica como 0.5 DEMO para unificar las etiquetas.

Separamos los archivos, añadimos controles táctiles de 44 px y foco visible, etiquetas de formularios, diálogo con desplazamiento, calendario con desplazamiento horizontal y paleta neutra. La fecha inicial corresponde al día local, sin conversiones UTC que puedan desplazar el día.

Antes de fusionar: probar en Safari de iPad la pulsación prolongada, el desplazamiento semanal, los diálogos con teclado virtual y la descarga e importación de una copia ficticia. No utilizar datos sanitarios reales ni interpretar esta demo como una solución clínica segura.

## Informes de demostración (0.6)

Desde la ficha, pulsa **Preparar informe**. Selecciona los apartados; ninguno está marcado inicialmente. La opción de sesiones incorpora todas las sesiones de forma explícita. Los datos personales de contacto, las referencias de documentos y las citas no se incorporan. El nombre ficticio y el identificador figuran en el encabezado.

En el editor puedes cambiar título, fecha y texto sin modificar la historia. La vista previa se actualiza al escribir. Marca la casilla de revisión para habilitar **Imprimir / Guardar PDF**; cualquier edición obliga a revisarlo otra vez. Se imprime únicamente el informe con una indicación permanente de demostración, en A4 y sobre blanco para ahorrar tinta.

En Safari de iPad, abre la impresión y amplía la hoja de previsualización si es necesario para compartirla o guardarla como PDF en Archivos. El flujo depende de las opciones del sistema; debe comprobarse en un iPad físico antes de publicar. No se genera ni envía un archivo automáticamente.

Los borradores son temporales, no se guardan en copias JSON y se descartan al cerrar con confirmación. Recargar la página también elimina el borrador. La función no añade almacenamiento clínico seguro ni permite el uso de datos reales.

La lógica de informes está separada en `assets/reports.js`. Las pruebas cubren selección explícita, exclusión de apartados, edición sin alterar la historia, escape de HTML, confirmación de descarte, revisión obligatoria, validación de fecha y aislamiento del documento al imprimir. Se genera un PDF de prueba en Chromium; esto no sustituye la prueba de impresión en Safari.

## Detección de pestañas desactualizadas (0.7)

Cuando otra pestaña cambia o borra el almacenamiento de esta demo, aparece un aviso. No se recarga automáticamente ni se cierra el formulario que estás editando. Al guardar se vuelve a comparar el contenido del almacenamiento con la versión que se cargó en esta pestaña: si es diferente, el guardado se rechaza, el cambio en memoria se revierte y el formulario permanece abierto cuando corresponde. La misma comprobación protege importaciones y restablecimientos.

Cierra el formulario para usar las opciones del aviso. **Descargar copia de esta pestaña** exporta los datos de la vista anterior; no incorpora los formularios sin guardar ni los borradores de informes. Puedes conservar su texto manualmente antes de cerrar. **Cargar versión guardada** pide confirmación y recarga la página: descarta borradores y carga los datos actuales del navegador. Si estos están dañados se conserva la recuperación existente.

Esta comprobación reduce sobrescrituras de vistas antiguas; no es una transacción ni combina cambios. Dos escrituras que ocurran a la vez entre la lectura y la escritura de localStorage aún pueden competir. No sustituye almacenamiento clínico seguro ni sincronización entre dispositivos.

`assets/storage-sync.js` contiene los avisos y la recarga explícita. Las pruebas usan dos páginas del mismo contexto de navegador y cubren cambios externos, conservación del formulario, descarga de copia, recarga y posterior guardado, eliminación del almacenamiento, comparación sin evento previo y bloqueo de importación/restablecimiento desde una vista antigua.

## Protección de formularios sin guardar (0.8, en revisión)

Al modificar los valores de un formulario, cerrar con la X o con Escape pide confirmación antes de descartarlos. Cancelar conserva el texto. Un formulario sin cambios cierra directamente; si se deshace manualmente una edición hasta recuperar los valores iniciales, tampoco se considera pendiente. Después de un guardado correcto no aparece una segunda confirmación. Si el guardado falla, el formulario sigue protegido.

Los informes conservan su confirmación de descarte específica, sin duplicarla. Ante una recarga o salida de la página con un formulario modificado o un borrador de informe abierto se solicita el aviso nativo de `beforeunload`. Su aparición y texto dependen del navegador y de que haya habido interacción con la página. Safari/iPadOS puede omitirlo, especialmente al cerrar la aplicación o suspenderla; esta función no guarda borradores ni garantiza recuperarlos.

La lógica está separada en `assets/form-guard.js`. Las pruebas comprueban X y Escape, cancelación y aceptación del descarte, conservación del texto, guardado, edición revertida, inicialización de citas desde la ficha y aviso de recarga en Chromium. Pendiente de comprobar el cierre en Safari de iPad antes de publicar. Se mantienen las copias, informes, calendario, tema crema y uso exclusivo de datos ficticios.
