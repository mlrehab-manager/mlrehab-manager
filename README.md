# MLREHAB Manager · 0.5 DEMO

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

Si los datos locales están dañados, no se sobrescriben automáticamente: se muestra una demo temporal y en **Copias de prueba** se puede descargar el original. Después, importa una copia válida o restablece la demo. Un fallo de guardado revierte el cambio en memoria y mantiene abierto el formulario cuando corresponde. Exporta copias periódicamente: el navegador puede borrar sus datos. No hay sincronización entre dispositivos ni resolución de ediciones simultáneas entre pestañas; utiliza una sola pestaña.

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
