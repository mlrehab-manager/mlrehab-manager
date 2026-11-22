# Modelo clínico en desarrollo · punto de reanudación

22 de noviembre de 2026. Este documento registra trabajo local interrumpido; **no afirma que el código descrito esté incluido en esta rama o publicado**.

## Petición vigente

El titular es un único profesional, usa iPad y ordenador y quiere priorizar identificación, historia/sesiones y copia/recuperación para trabajar cuanto antes. La agenda actual está en Calendario del iPhone; no se ha consultado o importado.

La previsión de revisar protección de datos en diciembre se ha actualizado: el titular indica que puede contratar el servicio esta semana y confirmará estos días. Sigue pendiente su confirmación; no se han aceptado condiciones, contratado servicios, programado recordatorios o habilitado pacientes reales.

## Estado remoto conservado

Antes de este documento, el último commit remoto era `5485c244602b9cc3a8b51b37cde558586c03b8b5`. El acceso privado publicado sigue en versión 14, con las funciones descritas en PROJECT_STATUS.md y los dos campos de motivo/precauciones confirmados por el titular. La demo pública no se ha modificado. PR 9 permanece en borrador.

No se ha aplicado la migración del modelo clínico a ningún proyecto alojado, modificado Auth, borrado fixtures o cambiado facturación durante este bloque. No se han usado datos de pacientes reales.

## Implementación local que debe recuperarse y revisar

Los cambios siguientes estaban en el checkout local y aún no se habían subido al repositorio cuando se perdió el entorno:

- Migración generada por CLI: `clinical/migrations/20261122093236_clinical_patient_model.sql`.
- Modos de cuenta administrados en servidor: prueba, clínico y suspendido. Las cuentas existentes conservan prueba por defecto. La activación requiere referencia de decisión y conjunto inicial vacío; no mezcla automáticamente fixtures con historias.
- Registro de cambios de modo en tabla privada con RLS y sin permisos cliente. El rol de base de datos registrado identifica la ejecución técnica, no acredita por sí solo identidad humana o revisión jurídica.
- Autorización, MFA/sesión actual y propietario se conservan; suspensión bloquea también los RPC anteriores. Bloqueo compartido de la fila de admisión para coordinar operaciones con cambios administrativos de modo.
- Identificación: nombre, apellidos, nacimiento/contacto opcionales, validación servidor/cliente, nombre derivado, UUID estable e idempotencia. Homónimos permitidos. Los campos se pueden ensayar con datos inventados en la ficha de prueba.
- Agenda y sesiones usan el modo de cuenta verificado; alta/edición/archivo conservan revisiones y auditoría.
- Copia clínica v6, formato `mlrehab-clinical-snapshot` y `data_mode: clinical`, sin `testOnly` ni `fixture`. Se conservan las nueve colecciones, cifrado y lectura de v1–v5. Mantiene los límites del exportador; falta evaluar su operación para el piloto.
- Restauración aislada v6 y generación administrativa explícita mediante `allowClinical`; sigue rechazando el proyecto habitual. Un destino clínico restaurado empieza suspendido y sin admisión habilitada.
- Interfaz que obtiene el modo de la comprobación del servidor, sin selector de activación en el cliente. Una denegación explícita limpia datos/borradores y vuelve al acceso.
- Módulos nuevos: `clinical/records/identity.mjs`, `clinical/access/data-mode.js`. También hay cambios locales en acceso, snapshot/restauración, esquema/ensayo de recuperación, pruebas y package.json.

Los nombres históricos de varios RPC terminados en `_test` se mantienen para compatibilidad, pero sus implementaciones locales pasan a comprobar el modo del servidor. El nuevo registro clínico tiene su propia entrada invoker. Revisar este contrato completo antes de instalarlo.

## Verificación observada antes de la interrupción

- Las 50 pruebas SQL anteriores pasaron con la primera versión del modelo.
- Las diez pruebas nuevas de `clinical-model.test.mjs` pasaron: activación/aislamiento, identidad/homónimos, validación, cambios/revisiones, agenda/sesiones/archivo, copia v6, restauración suspendida, revocación y rollback de auditoría.
- Una prueba de cifrado y restauración de datos v6 produjo hashes coincidentes.
- `verify:clinical-service-recovery` terminó correctamente con PostgreSQL, GoTrue y PostgREST reales en contenedores locales, origen cerrado, nueve colecciones e integridad/recuperación de acceso comprobadas. Solo empleó identidades y valores sintéticos.
- Las 60 pruebas de interfaz previas pasaron en modo de prueba con los cambios iniciales. Después se añadieron cinco casos de modo clínico; esa ejecución de 65 casos estaba en marcha al perder el entorno. **No se ha confirmado su resultado final.**
- Las ejecuciones completas finales de SQL/cifrado/recuperación se iniciaron, pero no se han recuperado todos sus resultados. No se presentan como un conjunto final en verde.

## Interrupción y siguiente paso

El entorno dejó de responder con `exec-server transport disconnected` y posteriormente fue marcado `unavailable`. No se pudo volver a leer el checkout ni recuperar las últimas salidas. Las herramientas disponibles no ofrecen reactivación o sustitución de esa máquina.

Al disponer otra vez del entorno: inspeccionar primero los archivos y conservar los cambios, comparar con este punto, recuperar resultados y resolver fallos; verificar los casos de modo clínico, compatibilidad y límites. El commit de este documento se creó mediante GitHub, por lo que el checkout puede estar detrás de la rama remota: reconciliar sin descartar modificaciones.

Solo después de completar la revisión y las comprobaciones procede preparar/desplegar la actualización con las cuentas todavía en prueba, sin activar perfiles ni borrar datos. Mantener el mismo Site privado y sus dos rutas/backends separados. La activación clínica real requiere una decisión posterior con sus condiciones y operación resueltas; este punto de reanudación no la sustituye.
