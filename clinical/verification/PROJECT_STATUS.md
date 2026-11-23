# Estado verificado · 23 de noviembre de 2026

La versión privada 22 organiza MLREHAB como una aplicación con Inicio, Agenda, Pacientes, Ejercicios, Copias y Acceso. Cada paciente abre una pestaña nueva del navegador; la lista permanece en la principal y el cierre de la ficha espera la confirmación del guardado. Conserva identificación/historias/sesiones y recuperación v6 con activación administrada. El titular es autónomo individual en España y utilizará iPad y Windows. Las cuentas alojadas permanecen en `test`; no se han habilitado pacientes reales ni se ha modificado la demo pública.

## Interfaz privada

Navegación lateral en iPad/ordenador y navegación inferior en pantallas estrechas, colores del diseño tostado claro/negro/gris, campos legibles y controles táctiles. Cambiar de sección conserva los borradores montados y no dispara lecturas automáticas. Inicio indica «Sin cargar» hasta obtener datos y distingue el día de agenda consultado. La salida/denegación limpia datos y restablece la vista inicial.

Manifest con `display: standalone`, icono y metadatos para añadir a la pantalla de inicio desde Safari. Las rutas habitual y recuperada tienen alcance relativo y nombres distintos. No se añade service worker, caché de fichas, analítica ni persistencia de sesiones. La instalación real en Safari/iPad queda pendiente de comprobación del titular; las pruebas locales usan respuestas sintéticas.

La agenda muestra cinco columnas lunes/viernes y once franjas 08:00–20:00 sin 14:00. Un toque consulta disponibilidad y abre una cita con fecha/hora preparadas; exige elegir el paciente. Las citas largas ocupan todas sus casillas; las canceladas liberan el hueco. Las guardadas fuera del horario o en fines de semana permanecen accesibles en el listado, sin borrados. Semana anterior/siguiente y selector de fecha conservan el control de borradores. El resumen de Inicio corresponde a los cinco días consultados.

El nuevo RPC `clinical_agenda_week` realiza una sola lectura coherente y un evento de auditoría, conservando las escrituras existentes. Una ocupación aparecida desde la primera carga abre la cita existente. Los fallos de carga mantienen la semana previa y no presentan disponibilidad falsa; la selección de paciente recibe foco después de habilitarse. Véase [agenda semanal](../access/AGENDA.md).

La agenda calcula el alto de sus once filas según el espacio útil del viewport, compacta los controles y mantiene texto legible. La última fila de las 19:00 queda visible sin scroll vertical del calendario en 1180×820, 1024×768, 1024×700 y 820×1180. Las citas múltiples de una hora muestran una elección accesible sin ocultarlas; cerrar edición devuelve a la semana. En ventanas menores o con ampliación se prioriza legibilidad, sin prometer ajuste universal de todos los dispositivos.

Cada clic en la lista abre una pestaña real del navegador con título y URL genéricos. «Guardar y cerrar pestaña» cierra solo tras confirmar el guardado; sin cambios no escribe otra versión. Errores, conflictos o texto posterior a una petición conservan la ficha. Cerrar con cambios ofrece guardar, continuar o descartar. Las archivadas siguen en lectura. La principal conserva la lista y debe permanecer abierta. Un MessageChannel limitado a esa ventana y paciente envía operaciones a la principal, única propietaria del cliente autenticado: no se transfieren tokens o contraseñas. La actividad de la ficha respeta la inactividad existente; cerrar sesión o la principal bloquea y limpia las fichas. Al salir de una ficha también se limpia su documento antes de conservarlo en el historial. Las copias y el aviso de salida de la principal detectan borradores y escrituras pendientes en otras pestañas, incluso si se cierra una ficha durante una petición. La comprobación manual en Safari/iPad sigue pendiente; el modo instalado puede requerir abrir MLREHAB en Safari para mantener pestañas vinculadas. Véase [fichas](../access/PATIENTS.md).

El tipo se guarda por cita: primera visita (azul), seguimiento (verde salvia), gimnasio (malva). El texto/leyenda acompañan los colores. Los registros anteriores permanecen sin clasificar (gris); no se reescriben versiones antiguas. El endpoint nuevo `clinical_appointment_save_typed` reutiliza las comprobaciones de revisión/solapamiento/propietario y actualiza tipo y versión atómicamente. La operación histórica conserva los tipos existentes.

## Copias y custodia

Procedimiento manual definido a petición del titular: final de cada jornada con cambios y antes de modificaciones importantes; comprobar desde el destino, segunda copia independiente, frase separada recuperable, dos recientes verificadas y una anterior con restauración ensayada, ensayo mensual aislado. [Procedimiento y límites](../../docs/CLINICAL_BACKUP_OPERATIONS.md). Las instrucciones descargables incluyen carpeta local de Windows fuera de OneDrive/iCloud y se pueden conservar fuera de la app.

Tras comprobar localmente un archivo v5/v6 del modo actual, el titular puede registrar fecha, exportación propia, huella del archivo cifrado, destino acotado y declaraciones de custodia. Es un envío explícito de metadatos; no sube archivo, frase o contenido clínico. AAL2/sesión/admisión y propietario se verifican en servidor. Reintentos idempotentes, aislamiento por modo y limpieza al salir. La última comprobación se consulta expresamente, sin afirmar restauración, sincronización observada o cobertura de cambios posteriores.

`backup_checks` es control operativo privado y no entra en las nueve colecciones portátiles; después de recuperar se exige una nueva comprobación. Permanecen v1–v5 de prueba y v6 `mlrehab-clinical-snapshot`, AES-GCM/PBKDF2, validación de propietario/identidad/referencias/revisiones/auditoría. La restauración administrativa clínica requiere `allowClinical: true`, origen distinto y destino vacío; arranca suspendida. Auth, secretos y configuración se reconstruyen aparte. El campo opcional `visit_type` se valida en v5/v6 y se omite cuando es desconocido: esto conserva representaciones/hashes antiguos y permite recuperar tipos nuevos. No hay copias automáticas ni borrado automático.

## Instalación y permisos

El esquema fuente contiene quince migraciones. Se ha aplicado `20261122151054_appointment_visit_types.sql` a los dos proyectos existentes, sin modificar Auth, factores, fichas o facturación. La cuenta clínica continúa sin activar y no se ha repetido la restauración del destino ocupado.

Comprobación administrativa por proyecto: doce tablas de aplicación, todas con RLS, cero permisos cliente de tabla, veinticuatro RPC públicos invoker y cero definer públicos. Una cuenta test, cero cuentas fuera de test, cero eventos de cambio de modo y cero comprobaciones reales creadas por el agente. El historial de migraciones del proyecto habitual tiene quince entradas; el recuperado, ocho, porque su esquema inicial se reconstruyó agrupado. El número de entradas de ese historial no equivale al de archivos fuente.

Las veinticuatro llamadas RPC anónimas por proyecto se rechazan por HTTPS con 401/42501; el esquema privado devuelve 406/PGRST106. El asesor conserva únicamente el aviso conocido de [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), cuya disponibilidad/decisión sigue en la revisión de proveedores. No se activa facturación.

## Verificación

Esta entrega verifica 98 casos de interfaz con respuestas sintéticas: 97 del recorrido completo y una regresión adicional de limpieza al salir de la pestaña, con repetición de seis casos de ciclo de vida afectados. Supera también seis pruebas de recuperación/compilación, formato y comprobación del diff. Incluye pestañas reales, guardado/cierre y reapertura, tres opciones del diálogo, conflictos/desconexión, escritura durante la petición, dos fichas independientes, denegación de otros pacientes/RPC, ausencia de credenciales transferidas, bloqueo al salir de la principal, aviso de salida por borradores remotos y bloqueo de copias por escrituras pendientes. Conserva las comprobaciones de geometría en iPad y móvil. El esquema, contratos de copia y criptografía conservan los resultados anteriores de 78 pruebas SQL/identidad/permisos y 12 de cifrado; no se modifican.

Una regresión adicional comprueba que cambiar el archivo durante una verificación anula el resultado anterior, conserva el nuevo archivo y exige comprobarlo de nuevo. Las cuatro pruebas afectadas de comprobación/custodia se repiten tras ese ajuste.

Los ensayos [clínico v6](CLINICAL_SERVICE_RECOVERY_REPORT.json) y [legado v5](SERVICE_RECOVERY_REPORT.json) reconstruyen PostgreSQL, GoTrue y PostgREST con imágenes fijadas, origen cerrado antes de recuperar, cuenta/contraseña/MFA recreados y nueve colecciones con hashes coincidentes. Comprueban admisión inicial cerrada, suspensión cuando procede, tokens de origen/sesión cerrada rechazados y registro de metadatos accesible solo al origen y sin heredar falsa confirmación de custodia tras recuperar. Todo es sintético. No certifican identidad humana/proveedor, custodia del archivo del titular o plazos de recuperación.

## Publicación

Site propietario privado, versión 22, commit `da1f2ba02e02383642719d201063b01f3e406c68`, despliegue `appgdep_6b0481d30c20819188c621bbe4a517ee`, completado. Una cuenta propietaria, sin grupos/editores.

- Habitual: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site
- Recuperación: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site/recovery/

Worker verificado: rutas, separación de backends/CSP, manifest/icono binario/guía, redirección, HEAD y rechazo de escritura. Las catorce respuestas HTTPS coinciden con los artefactos y mantienen no-store, no-referrer, nosniff, DENY y frame-ancestors. No hay navegador administrado disponible para QA del Site alojado; no se sustituye por pruebas con credenciales reales.

## Lo confirmado y lo pendiente

[MANUAL_CHECKS.json](MANUAL_CHECKS.json) conserva las confirmaciones del titular: alta/guardado/reapertura, motivo/precauciones, copia verificada en iPad y descargable desde iPhone. El 22 de noviembre confirma que todos los registros actuales son inventados y que puede recuperar la frase aunque pierda el iPad. El 23 completa el recorrido desde Windows: consta una nueva comprobación con destino local del ordenador y la misma huella/propietario/exportación del archivo del iPad. La colocación fuera de sincronización es su declaración; no se inspecciona su sistema de archivos ni se restaura el servidor desde ese archivo.

El titular había previsto llamar sobre proveedores el 23 de noviembre; se solicita si ya tiene respuesta, sin asumir que la llamada se realizó. El ensayo operativo de copias está registrado. Su adecuación clínica, revisión contractual, conjunto clínico limpio y activación deliberada siguen pendientes. La reserva MFA independiente permanece aplazada. La agenda actual está en Calendario del iPhone y no se ha accedido o importado.

La revisión de proveedores conserva las fuentes del día 22 y el día 23 vuelve a consultar el DPA/FAQ oficiales de Supabase. La base está en Frankfurt y el titular confirma ChatGPT personal, identificando el DPA de Sites aplicable. El documento descargable concreta cláusula 4(d), transferencias y Free, sin exigir una compra o firma genérica como solución. Ya constan dos comprobaciones del mismo archivo, desde iPad y Windows. La evidencia manual histórica se conserva. No se ha activado el perfil clínico ni aceptado nuevas condiciones.

## Revisión de cierre posterior

El [informe de cierre](CLOSING_REVIEW.json) conserva con sus fechas las consultas de configuración, permisos, avisos y recuentos del día 22. La última consulta del día 23 observa dos comprobaciones: la de Windows es posterior, selecciona carpeta local y coincide en archivo/propietario/exportación con la del iPad. El paso operativo se registra como completado para el archivo ficticio bajo las declaraciones del titular. No se incluyen textos de pacientes, archivos o secretos.

La [decisión de puesta en marcha](../../docs/CLINICAL_LAUNCH_DECISION.md) concreta los registros afectados por una eventual retirada de pruebas, manteniendo cuenta/MFA. El titular ya ha confirmado registros inventados, recuperación de frase y el recorrido desde Windows, respaldado por la comprobación vinculada. La revisión de la operación destructiva y la decisión de adecuación de proveedores continúan pendientes. La actualización de interfaz publicada no retira registros ni cambia el perfil, el esquema o la configuración Auth del proveedor. La coordinación entre pestañas se realiza en el cliente.
