# MLREHAB Manager · 0.11 DEMO

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

## Protección de formularios sin guardar (0.8)

Al modificar los valores de un formulario, cerrar con la X o con Escape pide confirmación antes de descartarlos. Cancelar conserva el texto. Un formulario sin cambios cierra directamente; si se deshace manualmente una edición hasta recuperar los valores iniciales, tampoco se considera pendiente. Después de un guardado correcto no aparece una segunda confirmación. Si el guardado falla, el formulario sigue protegido.

Los informes conservan su confirmación de descarte específica, sin duplicarla. Ante una recarga o salida de la página con un formulario modificado o un borrador de informe abierto se solicita el aviso nativo de `beforeunload`. Su aparición y texto dependen del navegador y de que haya habido interacción con la página. Safari/iPadOS puede omitirlo, especialmente al cerrar la aplicación o suspenderla; esta función no guarda borradores ni garantiza recuperarlos.

La lógica está separada en `assets/form-guard.js`. Las pruebas comprueban X y Escape, cancelación y aceptación del descarte, conservación del texto, guardado, edición revertida, inicialización de citas desde la ficha y aviso de recarga en Chromium. Pendiente de comprobar el cierre en Safari de iPad antes de publicar. Se mantienen las copias, informes, calendario, tema crema y uso exclusivo de datos ficticios.

## Vista previa de importación (0.9)

En **Copias de prueba → Importar JSON**, elige una copia ficticia válida. Antes de cambiar nada se muestra su nombre y una tabla con los recuentos de pacientes, citas y sesiones actuales y de la copia. No se muestran nombres de pacientes ni textos clínicos. Desde esta vista puedes descargar una copia de los datos actuales; si hay datos dañados pendientes de recuperación también puedes descargar el original conservado.

Para importar, marca **Entiendo que se sustituirán los datos actuales** y pulsa **Sustituir datos e importar**. Los datos se sustituyen por completo, sin combinación. Una copia vacía es válida y elimina los registros actuales si se confirma. Cancelar la vista previa deja el almacenamiento intacto; puedes volver a elegir el mismo archivo.

Los archivos se leen y validan localmente, con el límite existente de 5 MB. Ningún archivo se sube. Se conserva la validación de referencias, fechas y sesiones y la protección frente a otra pestaña desactualizada. Si el guardado falla, no se sustituye la vista actual y la importación queda abierta. Las copias siguen sin cifrar y solo pueden contener datos ficticios. Los formularios e informes temporales no se incluyen en las copias.

`assets/backups.js` separa lectura, vista previa y aplicación. Las pruebas comprueban recuentos, cancelación, descarga del estado anterior, importación explícita de una copia vacía, rechazo de archivos inválidos o grandes, escape del nombre de archivo, errores de escritura y los recorridos de copias y conflictos existentes. Pendiente de revisar la vista previa y la selección de archivos en Safari de iPad antes de publicar.

## Tratamiento y catálogo de ejercicios (0.10)

La ficha incorpora **1. Tratamiento pasivo**, como texto libre, y **2. Ejercicio terapéutico**, como selección de nombres. En **Editar tratamiento**, busca ejercicios y marca los que quieras registrar en la ficha ficticia. Filtrar la lista no pierde selecciones. El texto del tratamiento antiguo se conserva sin clasificar en un apartado desplegable y se puede seguir editando.

La sección **Ejercicios** contiene 112 nombres iniciales y un buscador que ignora mayúsculas y tildes. Es un catálogo local de nombres y modalidades, sin imágenes, vídeos, dosis, pautas ni recomendaciones automáticas. No es una base de datos clínica ni una fuente exhaustiva de ejercicios.

Puedes añadir nombres mediante **Ejercicios → Añadir ejercicio**. Se solicitan un nombre (hasta 150 caracteres) y una modalidad, evitando duplicados por mayúsculas, tildes o espacios. También puedes escribir un **Nuevo ejercicio manual** al editar el tratamiento y pulsar **Añadir al borrador**. El nombre queda seleccionado y se incorpora al catálogo cuando guardas el tratamiento; si cancelas no se guarda. Si hay un nombre escrito sin añadir al borrador se pide añadirlo o vaciar el campo antes de guardar.

Los nombres añadidos están disponibles para todas las fichas de este navegador. Se guardan en `exerciseCatalog`; cada paciente conserva `passiveTreatment` y su selección de nombres en `therapeuticExercises`. Los 112 nombres iniciales y sus modalidades vienen incluidos en `assets/exercise-catalog.js`. Las copias exportan los nombres añadidos y las selecciones de las fichas, y el resumen de importación incluye **Ejercicios añadidos**. Restablecer la demo borra los datos y los nombres añadidos, conservando el catálogo inicial.

Se siguen aceptando copias antiguas: los nuevos campos se inicializan vacíos y el texto `treatment` se conserva. Las copias con los nuevos campos deben restaurarse en 0.10 o posterior, porque las versiones anteriores no reconocen estas listas. Al importar se sustituyen los datos y el catálogo personalizado de esta demo, sin combinarlos.

Los informes permiten elegir **Tratamiento pasivo**, **Ejercicio terapéutico** y el texto de **Tratamiento previo (sin clasificar)** por separado. Nada se incorpora al informe sin seleccionarlo.

Pruebas: migración de copias anteriores, rechazo de campos de ejercicios inválidos, selección y búsqueda, adición manual, duplicados, HTML escapado, cancelación de borradores, fallo de almacenamiento, informes y copia de ida y vuelta. Pendiente de revisión en Safari de iPad antes de publicar. Se mantiene el uso exclusivo de pacientes y datos clínicos ficticios.

### Clasificación y ampliación del catálogo (0.10)

La versión 0.10 publicada conserva los 67 nombres anteriores y añade 45 con referencias consultadas: **112 nombres**. La siguiente ampliación por zonas de 0.11 se describe al final.

La lista y el editor de tratamiento se agrupan en **Isométricos**, **Dinámicos · Combinados**, **Dinámicos · Concéntricos**, **Dinámicos · Excéntricos**, **Pliometría** y **Otros / sin clasificar**. Este último conserva nombres de movilidad/equilibrio o manuales sin una modalidad indicada. El filtro **Todos los dinámicos** reúne sus tres subgrupos. La búsqueda funciona a la vez que el filtro y conserva los ejercicios seleccionados aunque no estén visibles.

Al añadir un ejercicio manual puedes elegir su modalidad, tanto desde el catálogo como en el borrador de tratamiento. El botón **Clasificar** permite modificarla en cualquier nombre; el ajuste se aplica al catálogo de este navegador sin cambiar los nombres guardados en las fichas. Los ajustes se exportan en `exerciseClassifications` y aparecen como **Clasificaciones personalizadas** al revisar una copia. Las copias anteriores sin ese campo siguen siendo válidas: conservan los nombres y usan las categorías iniciales o **Otros / sin clasificar**. Restablecer la demo elimina los ajustes personales.

El catálogo es una clasificación por modalidad, no por diagnóstico ni por fase temporal. Concéntrico y excéntrico expresan el énfasis de la variante; los dinámicos combinados pueden contener ambas fases. No se añade una clasificación automática de pacientes ni se identifica hipertrofia con un tipo de contracción. Los informes siguen incorporando solo los nombres seleccionados.

En **Referencias de la ampliación** se pueden abrir las fuentes. La correspondencia y el criterio editorial están documentados en [docs/EXERCISE_SOURCES.md](docs/EXERCISE_SOURCES.md). No se copian protocolos ni se indican dosis. Las fuentes no avalan el catálogo ni los ajustes personales.

## Filtro por zona corporal y ampliación (0.11, en revisión)

La versión 0.11 conserva los 112 nombres y añade 18: **130 nombres** en total. Las nuevas entradas se han adaptado de AAOS (cadera/columna), Cambridge University Hospitals (pulgar) y Northern Health and Social Care Trust (mano). Se mantienen nombres y modalidades, sin pautas, imágenes ni dosis.

El catálogo y el editor de tratamiento combinan **texto + modalidad + zona corporal**. Las zonas son cuello/cervical, hombro/escápula, codo/antebrazo, muñeca/mano, tronco/columna dorsal y lumbar, cadera, rodilla y tobillo/pie. Son etiquetas de organización editables, no diagnósticos ni asignaciones de fase de recuperación. Un ejercicio puede tener varias zonas y aparecer en cualquiera de ellas.

En **Añadir ejercicio** y **Clasificar** puedes marcar varias zonas; sin marcas queda **Sin zona asignada**, incluso si el ejercicio inicial tenía zonas. Los nombres manuales anteriores sin etiquetas siguen disponibles en ese filtro. En el borrador de tratamiento, abre **Asignar zonas al nuevo ejercicio (opcional)** para indicar sus zonas: únicamente se guardan al guardar el tratamiento. Cambiar filtros no elimina selecciones ocultas ni cuenta como edición clínica pendiente.

Las zonas personales se guardan en `exerciseRegions`, como registros con `name` y una lista `regions`. Se incluyen en las copias JSON y el resumen previo a importar muestra **Zonas personalizadas**. Usa 0.11 o posterior para conservarlas al restaurar; copias de versiones previas siguen siendo válidas, sin ajustes de zonas. Restablecer la demo elimina los ajustes personales y recupera las etiquetas iniciales. Las selecciones guardadas en fichas y los informes mantienen sus nombres.

`assets/exercise-regions.js` separa los filtros, etiquetas y ajustes de zonas; los datos iniciales están en `assets/exercise-catalog.js`. Los títulos de tratamiento siguen teniendo el mismo tamaño y se conserva la paleta crema. Pendiente de revisión en Safari de iPad antes de publicar; solo datos ficticios.

## Transición a uso clínico · fase de preparación

Se inicia en una rama separada una base privada de pacientes con permisos, doble factor, revisiones y auditoría, probada localmente. **La aplicación publicada sigue siendo una demo y no puede utilizarse con datos reales.** No hay backend contratado ni interfaz clínica conectada. Consulta [clinical/README.md](clinical/README.md), [el plan clínico](docs/CLINICAL_SECURITY_PLAN.md) y [los riesgos pendientes](docs/CLINICAL_THREAT_MODEL.md). Las pruebas SQL se ejecutan con `npm run test:clinical` y no utilizan cuentas ni datos reales.
