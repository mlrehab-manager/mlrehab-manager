# Estado verificado · 22 de noviembre de 2026

La versión privada 16 organiza MLREHAB como una aplicación con Inicio, Agenda, Pacientes, Ejercicios, Copias y Acceso. Conserva identificación/historias/sesiones y recuperación v6 con activación administrada. El titular es autónomo individual en España y utilizará iPad y Windows. Las cuentas alojadas permanecen en `test`; no se han habilitado pacientes reales ni se ha modificado la demo pública.

## Interfaz privada

Navegación lateral en iPad/ordenador y navegación inferior en pantallas estrechas, colores del diseño tostado claro/negro/gris, campos legibles y controles táctiles. Cambiar de sección conserva los borradores montados y no dispara lecturas automáticas. Inicio indica «Sin cargar» hasta obtener datos y distingue el día de agenda consultado. La salida/denegación limpia datos y restablece la vista inicial.

Manifest con `display: standalone`, icono y metadatos para añadir a la pantalla de inicio desde Safari. Las rutas habitual y recuperada tienen alcance relativo y nombres distintos. No se añade service worker, caché de fichas, analítica ni persistencia de sesiones. La instalación real en Safari/iPad queda pendiente de comprobación del titular; las pruebas locales usan respuestas sintéticas.

## Copias y custodia

Procedimiento manual definido a petición del titular: final de cada jornada con cambios y antes de modificaciones importantes; comprobar desde el destino, segunda copia independiente, frase separada recuperable, dos recientes verificadas y una anterior con restauración ensayada, ensayo mensual aislado. [Procedimiento y límites](../../docs/CLINICAL_BACKUP_OPERATIONS.md). Las instrucciones descargables incluyen carpeta local de Windows fuera de OneDrive/iCloud y se pueden conservar fuera de la app.

Tras comprobar localmente un archivo v5/v6 del modo actual, el titular puede registrar fecha, exportación propia, huella del archivo cifrado, destino acotado y declaraciones de custodia. Es un envío explícito de metadatos; no sube archivo, frase o contenido clínico. AAL2/sesión/admisión y propietario se verifican en servidor. Reintentos idempotentes, aislamiento por modo y limpieza al salir. La última comprobación se consulta expresamente, sin afirmar restauración, sincronización observada o cobertura de cambios posteriores.

`backup_checks` es control operativo privado y no entra en las nueve colecciones portátiles; después de recuperar se exige una nueva comprobación. Permanecen v1–v5 de prueba y v6 `mlrehab-clinical-snapshot`, AES-GCM/PBKDF2, validación de propietario/identidad/referencias/revisiones/auditoría. La restauración administrativa clínica requiere `allowClinical: true`, origen distinto y destino vacío; arranca suspendida. Auth, secretos y configuración se reconstruyen aparte. No hay copias automáticas ni borrado automático.

## Instalación y permisos

El esquema fuente contiene trece migraciones. Se ha aplicado `20261122123320_backup_custody_receipts.sql` a los dos proyectos existentes, sin modificar Auth, factores, fichas o facturación. La cuenta clínica continúa sin activar y no se ha repetido la restauración del destino ocupado.

Comprobación administrativa por proyecto: doce tablas de aplicación, todas con RLS, cero permisos cliente de tabla, veintidós RPC públicos invoker y cero definer públicos. Una cuenta test, cero cuentas fuera de test, cero eventos de cambio de modo y cero comprobaciones reales creadas por el agente. El historial de migraciones del proyecto habitual tiene trece entradas; el recuperado, seis, porque su esquema inicial se reconstruyó agrupado. El número de entradas de ese historial no equivale al de archivos fuente.

Las veintidós llamadas RPC anónimas por proyecto se rechazan por HTTPS con 401/42501; el esquema privado devuelve 406/PGRST106. El asesor conserva únicamente el aviso conocido de [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), cuya disponibilidad/decisión sigue en la revisión de proveedores. No se activa facturación.

## Verificación

68 pruebas SQL/identidad/permisos, 68 de interfaz con respuestas sintéticas, 12 de cifrado y seis de recuperación superadas; formato y comprobación del diff correctos. Tras los cambios finales de texto/activos, se repiten el recorrido de navegación/borradores/geometría en 820×1180, 1180×820 y 390×844 y las pruebas de compilación de recuperación.

Los ensayos [clínico v6](CLINICAL_SERVICE_RECOVERY_REPORT.json) y [legado v5](SERVICE_RECOVERY_REPORT.json) reconstruyen PostgreSQL, GoTrue y PostgREST con imágenes fijadas, origen cerrado antes de recuperar, cuenta/contraseña/MFA recreados y nueve colecciones con hashes coincidentes. Comprueban admisión inicial cerrada, suspensión cuando procede, tokens de origen/sesión cerrada rechazados y registro de metadatos accesible solo al origen y sin heredar falsa confirmación de custodia tras recuperar. Todo es sintético. No certifican identidad humana/proveedor, custodia del archivo del titular o plazos de recuperación.

## Publicación

Site propietario privado, versión 16, commit `2a384569690a7c9343b9f55d09adea38f62afe17`, despliegue `appgdep_6b02e4a3522c81919c076ad65476b00f`, completado. Una cuenta propietaria, sin grupos/editores.

- Habitual: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site
- Recuperación: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site/recovery/

Worker verificado: rutas, separación de backends/CSP, manifest/icono binario/guía, redirección, HEAD y rechazo de escritura. Las doce respuestas HTTPS coinciden con los artefactos y mantienen no-store, no-referrer, nosniff, DENY y frame-ancestors. No hay navegador administrado disponible para QA del Site alojado; no se sustituye por pruebas con credenciales reales.

## Lo confirmado y lo pendiente

[MANUAL_CHECKS.json](MANUAL_CHECKS.json) conserva las confirmaciones del titular: alta/guardado/reapertura, motivo/precauciones, copia verificada en iPad y descargable desde iPhone. No afirma descifrado en iPhone/Windows, existencia de segunda copia independiente o recuperación de la frase. Windows está confirmado; las instrucciones no equivalen a haber hecho esos pasos.

El titular llamará sobre proveedores el 23 de noviembre. El desarrollo y el procedimiento de copias siguen avanzando; su revisión contractual, custodia material pendiente, conjunto clínico limpio y activación deliberada siguen sin darse por hechos. La reserva MFA independiente permanece aplazada. La agenda actual está en Calendario del iPhone y no se ha accedido o importado.
