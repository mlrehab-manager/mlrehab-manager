# Verificación del proyecto de pruebas alojado

Revisión actual: conexión de fichas ficticias a la base privada. Uso: exclusivamente pruebas; no apto todavía para pacientes reales.

El usuario creó un proyecto y conectó la integración Supabase. Se localizó un único proyecto recién creado en `eu-central-1` (Frankfurt), PostgreSQL 17.11, sin tablas de aplicación, migraciones ni usuarios. No se incluyen aquí identificadores de cuenta, correos, claves ni secretos.

## Instalación y comprobaciones realizadas

- Aplicadas las migraciones `001_private_patients.sql`, `002_private_rpc_boundary.sql`, `20261111181241_clinical_session_guard.sql`, `20261115164119_clinical_test_backups.sql` y `20261118183217_clinical_patient_fields_test.sql` con la herramienta de migraciones. Los nombres con fecha fueron generados por la CLI. No se creó un proyecto adicional ni se activó facturación.
- Cuatro tablas privadas con RLS y políticas restrictivas que niegan acceso directo a `anon` y `authenticated`. Ninguno de esos roles tiene permisos de tabla.
- Diez puntos de entrada públicos `SECURITY INVOKER`: los cinco originales de pacientes, dos de listado/edición de fichas ficticias, `clinical_access_check` y dos de preparación/exportación de copias exclusivamente ficticias. Las implementaciones con privilegios elevados están en el esquema privado y mantienen comprobaciones de identidad, admisión, MFA, vigencia de sesión y propietario. Los auxiliares internos no son ejecutables por los clientes. No hay entrada de restauración en el proyecto conectado.
- Las diez llamadas HTTP anónimas, realizadas con la clave publicable del proyecto y sin sesión de usuario, devuelven HTTP 401 / SQLSTATE `42501`.
- Solicitar el esquema `clinical_private` por HTTP devuelve HTTP 406 / `PGRST106`: no forma parte de los esquemas expuestos.
- La comprobación previa a crear el usuario devolvió una lista vacía de avisos. La revisión actual señala la protección contra contraseñas filtradas desactivada; no hay otros avisos. Según la [documentación del proveedor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), esa protección requiere Pro o superior. No se han activado pagos ni se ha ocultado el aviso. Sigue pendiente para la evaluación de producción; MFA no lo sustituye.
- El usuario ha creado una única cuenta Auth confirmada y admitida; el registro público permanece cerrado. Tras la prueba manual de copia existen dos pacientes marcados como ficticios con cuatro versiones. La comprobación administrativa de esta revisión confirma esas cifras y que los nuevos RPC no conceden acceso anónimo ni acceso directo de tabla. La instalación de la interfaz no ha editado fichas de la cuenta.
- Dieciocho pruebas SQL locales pasan: las doce previas de permisos y seis de fichas, con aislamiento, límites, revisión esperada, archivados, rollback de auditoría, preservación de campos/números y copia/restauración de una ficha editada. Las identidades/sesiones simuladas nunca se instalaron en el proyecto alojado.

La comprobación inicial señaló funciones privilegiadas en el esquema expuesto y RLS sin políticas. La segunda migración mueve las implementaciones al esquema privado, añade entradas públicas sin elevación y explicita la denegación restrictiva. No se relajaron permisos para quitar avisos.

## Autenticación: pruebas reales confirmadas

Verificados mediante consulta administrativa y configuración pública: una cuenta, una admisión habilitada, un TOTP verificado, una sesión del proveedor con AAL2 y cero pacientes. El propietario confirma que completó el autenticador. El registro se cerró desde el panel; no se han manipulado las tablas gestionadas de Auth para crear usuarios, factores ni contraseñas.

Se ha preparado `clinical/access`, una interfaz privada de pruebas. Usa el SDK empaquetado localmente, versiones fijadas, CSP sin scripts inline ni CDN y sesiones exclusivamente en memoria. Veintinueve pruebas de navegador con respuestas simuladas pasan: las veintitrés previas y seis de fichas (guardado/reapertura, archivados, conflictos, fallos/borradores, respuesta tardía tras salir y escritura durante confirmación). El guardado solo admite cuatro campos de texto sobre las fichas ficticias existentes.

La pantalla utiliza un sitio Sites privado, separado de la demo: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . La política consultada solo incluye al propietario, sin grupos ni editores. La séptima versión procede del commit de su repositorio privado `be5985304b5832e7470b08851560ef516776f383` y conecta la primera lectura/edición de fichas ficticias. No se ha habilitado uso clínico.

La primera publicación estática ignoraba `_headers`. Se sustituyó por un Worker que devuelve explícitamente CSP con `frame-ancestors 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y permisos de dispositivos desactivados. Las tres respuestas HTTPS (HTML, JS, CSS) dan HTTP 200, coinciden byte a byte con los archivos compilados y contienen esas cabeceras. Se verificaron localmente las rutas del Worker, HEAD y el rechazo de POST. No contiene datos clínicos ni claves secretas.

La compilación impide utilizar el origen de la demo. No se ha hecho QA automatizada de navegador del alojamiento porque no está disponible `cua_repl.js` para la vista previa gestionada. Las veintinueve pruebas locales usan solo claves y cuentas sintéticas. El propietario ha confirmado acceso real con MFA, cierre seguro y «Archivo verificado» tras descargar/comprobar la copia. No ha compartido contraseñas, tokens, códigos, QR ni el archivo. La nueva edición manual en su iPad queda pendiente.

La prueba de cierre reutiliza en el navegador el mismo token antes y después de `signOut({scope:'local'})`, exclusivamente contra `clinical_access_check`. Primero debe recibir HTTP 200 y `{authorized:true}`; después del cierre correcto debe recibir HTTP 401/403 y SQLSTATE `42501`. No cuentan como éxito una caída de red, un JWT caducado, un cierre fallido ni una sesión que siga autorizada. El token no se muestra ni persiste; las solicitudes se limitan al proveedor y tienen tiempo máximo. El propietario confirmó el 12 de noviembre el mensaje «Cierre seguro verificado». Queda registrada la prueba real de aceptación antes del cierre y denegación posterior del mismo token contra este RPC; no equivale a revocar criptográficamente el JWT en todos los servicios del proveedor.

## Vigencia de sesión en cada operación

La función privada exige que `session_id` corresponda a una fila de `auth.sessions`, del mismo usuario y AAL2, con `not_after` vigente cuando exista y creada hace menos de ocho horas. Comprueba también correo confirmado, ausencia de bloqueo administrativo y admisión actual. No se concede acceso cliente a `auth.sessions` ni a `auth.users`; solo se consultan desde la función privilegiada privada, por clave primaria. Una sesión borrada al salir deja de servir para nuevas operaciones, aunque su JWT todavía no haya caducado. No se cancelan operaciones que ya estuvieran en curso.

El máximo de ocho horas se aplica en esta API, no cambia las opciones del plan de Auth ni invalida por sí solo todos los endpoints del proveedor. Los cinco minutos de inactividad siguen siendo un cierre del cliente, no un límite de inactividad impuesto en el servidor. La firma y caducidad del JWT corresponden al gateway del proveedor; las pruebas SQL simuladas no verifican firmas.

Pendiente configurar/verificar por separado el MFA de la cuenta administradora del proveedor. La integración no permite comprobarlo ni sustituye esa protección. La cuenta del panel de Supabase no es el usuario Auth de la aplicación; sus segundos factores son distintos.

## Recuperación de acceso y cifrado de copias

El propietario dispone de otro dispositivo, pero aclaró el 15 de noviembre que Contraseñas sincroniza el mismo TOTP entre iPhone e iPad. La consulta administrativa solo muestra un TOTP verificado y el usuario no ve selector de factores: no se registra como prueba superada de un factor independiente. Por instrucción expresa se deja la reserva pendiente, sin cambiar el acceso actual ni borrar factores. El [procedimiento de recuperación](../RECOVERY_RUNBOOK.md) permanece como preparación futura. Siguen pendientes pérdida de acceso a Contraseñas/iCloud, recuperación administrativa y gestión de dispositivos perdidos.

La [copia de prueba](../backups/README.md) conecta preparación/exportación del conjunto ficticio en Supabase con cifrado local AES-GCM-256/PBKDF2-SHA256. Una sola sentencia SQL lee las tres colecciones; incluye auditoría de exportación y rechaza límites sin truncar. Conserva textos JSONB, bigint y microsegundos. La pantalla descarga el archivo cifrado y lo comprueba localmente, sin subir archivo ni frase y sin restaurar sobre el proyecto conectado.

Doce pruebas automáticas de cifrado/restauración siguen pasando, además de las dieciocho SQL y veintinueve de interfaz. El [informe reproducible del conjunto inicial](BACKUP_RESTORE_REPORT.json) muestra dos pacientes (uno archivado), cuatro versiones y cinco eventos con hashes coincidentes; la nueva suite añade el ensayo de una ficha editada con cinco versiones entre ambos pacientes. Se escribió y releyó el archivo cifrado, se cerró el origen antes de restaurar y se creó un PostgreSQL/PGlite nuevo y aislado. Las identidades de origen son simuladas; el destino solo prueba datos y relaciones, sin Auth ni RPCs de aplicación. No se presenta como recuperación del servicio Supabase alojado.

## Primera gestión de fichas ficticias

El [editor](../access/PATIENTS.md) lista fichas activas y archivadas, carga la historia y permite guardar historia, exploración, diagnóstico y objetivos. El servidor bloquea la fila, valida propietario/marcador/revisión y combina solo esos campos antes de crear la nueva versión y auditoría. No se envía de vuelta el payload completo; se conservan tratamiento, campos desconocidos y precisión numérica. Una revisión antigua mantiene el borrador en pantalla y requiere cargar explícitamente la versión guardada para descartarlo.

No hay persistencia de fichas ni borradores en localStorage/sessionStorage. Se protegen cambios sin guardar al navegar/salir manualmente y se bloquea crear una copia con un borrador pendiente. La pérdida de sesión/inactividad limpia la ficha sin guardar ese borrador. Una respuesta tardía tras salir no repuebla la pantalla. Los datos que se escriban durante una confirmación quedan como cambios posteriores pendientes. Los archivados son de solo lectura tanto en la interfaz como en el nuevo RPC.

Pendientes exportación de todos los recursos clínicos y de los que aún están en la demo, recuperación de Auth/configuración/archivos, restauración en un entorno alojado independiente, custodia externa de copias/claves, automatización con avisos y objetivos RPO/RTO. No se han creado servicios de almacenamiento ni activado pagos. No hay una interfaz clínica completa y no se han eliminado los avisos de demo.
