# Verificación del proyecto de pruebas alojado

Última actualización: 12 de noviembre de 2026. Uso: exclusivamente pruebas; no apto todavía para pacientes reales.

El usuario creó un proyecto y conectó la integración Supabase. Se localizó un único proyecto recién creado en `eu-central-1` (Frankfurt), PostgreSQL 17.11, sin tablas de aplicación, migraciones ni usuarios. No se incluyen aquí identificadores de cuenta, correos, claves ni secretos.

## Instalación y comprobaciones realizadas

- Aplicadas las migraciones `001_private_patients.sql`, `002_private_rpc_boundary.sql` y `20261111181241_clinical_session_guard.sql` con la herramienta de migraciones. El último nombre fue generado por la CLI. No se creó un proyecto adicional ni se activó facturación.
- Cuatro tablas privadas con RLS y políticas restrictivas que niegan acceso directo a `anon` y `authenticated`. Ninguno de esos roles tiene permisos de tabla.
- Seis puntos de entrada públicos `SECURITY INVOKER`: los cinco de pacientes y `clinical_access_check`, que solo devuelve `{authorized:true}` tras comprobar el permiso. Las implementaciones con privilegios elevados están en el esquema privado y mantienen comprobaciones de identidad, admisión, MFA, vigencia de sesión y propietario. Los auxiliares internos no son ejecutables por los clientes.
- Las seis llamadas HTTP anónimas, realizadas con la clave publicable del proyecto y sin sesión de usuario, devuelven HTTP 401 / SQLSTATE `42501`.
- Solicitar el esquema `clinical_private` por HTTP devuelve HTTP 406 / `PGRST106`: no forma parte de los esquemas expuestos.
- La comprobación previa a crear el usuario devolvió una lista vacía de avisos. La revisión actual señala la protección contra contraseñas filtradas desactivada; no hay otros avisos. Según la [documentación del proveedor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), esa protección requiere Pro o superior. No se han activado pagos ni se ha ocultado el aviso. Sigue pendiente para la evaluación de producción; MFA no lo sustituye.
- El usuario ha creado una única cuenta Auth: correo confirmado, sin bloqueo administrativo. Se ha admitido exclusivamente esa cuenta en la lista privada. El registro público está cerrado (`disable_signup = true`); siguen desactivados los accesos anónimos. No se han creado pacientes.
- Doce pruebas SQL locales pasan. Incluyen la denegación en los seis puntos de entrada ante sesión revocada, ausente, mal formada, de otra cuenta, caducada, mayor de ocho horas o sin AAL2, y ante bloqueo administrativo. Las identidades/sesiones simuladas nunca se instalaron en el proyecto alojado.

La comprobación inicial señaló funciones privilegiadas en el esquema expuesto y RLS sin políticas. La segunda migración mueve las implementaciones al esquema privado, añade entradas públicas sin elevación y explicita la denegación restrictiva. No se relajaron permisos para quitar avisos.

## Autenticación: estado y siguiente prueba

Verificados mediante consulta administrativa y configuración pública: una cuenta, una admisión habilitada, un TOTP verificado, una sesión del proveedor con AAL2 y cero pacientes. El propietario confirma que completó el autenticador. El registro se cerró desde el panel; no se han manipulado las tablas gestionadas de Auth para crear usuarios, factores ni contraseñas.

Se ha preparado `clinical/access`, una pantalla independiente de autenticación y alta/verificación TOTP. Usa el SDK empaquetado localmente, versiones fijadas, CSP sin scripts inline ni CDN y sesiones exclusivamente en memoria. Quince pruebas de navegador con respuestas Auth simuladas pasan: las nueve de autenticación/permisos y seis de comprobación de cierre. Solo se solicita la comprobación de acceso, nunca datos clínicos.

La pantalla utiliza un sitio Sites privado, separado de la demo: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . La política consultada solo incluye al propietario, sin grupos ni editores. La cuarta versión procede del commit de su repositorio privado `652e2f1b6cecbb7b6b08dd56cd42b7e31622a8dd` y añade «Probar cierre seguro». No se ha habilitado uso clínico.

La primera publicación estática ignoraba `_headers`. Se sustituyó por un Worker que devuelve explícitamente CSP con `frame-ancestors 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y permisos de dispositivos desactivados. Las tres respuestas HTTPS (HTML, JS, CSS) dan HTTP 200, coinciden byte a byte con los archivos compilados y contienen esas cabeceras. Se verificaron localmente las rutas del Worker, HEAD y el rechazo de POST. No contiene datos clínicos ni claves secretas.

La compilación impide utilizar el origen de la demo. No se ha hecho QA automatizada de navegador del alojamiento porque no está disponible `cua_repl.js` para la vista previa gestionada. Las quince pruebas locales del flujo usan solo claves y cuentas sintéticas. El propietario confirma el 12 de noviembre que aparece «Acceso de pruebas autorizado»: queda registrado el éxito de la prueba del RPC con su sesión real y MFA. No ha compartido contraseñas, tokens, códigos ni QR.

La siguiente prueba reutiliza en el navegador el mismo token antes y después de `signOut({scope:'local'})`, exclusivamente contra `clinical_access_check`. Primero debe recibir HTTP 200 y `{authorized:true}`; después del cierre correcto debe recibir HTTP 401/403 y SQLSTATE `42501`. No cuentan como éxito una caída de red, un JWT caducado, un cierre fallido ni una sesión que siga autorizada. El token no se muestra ni persiste; las solicitudes se limitan al proveedor y tienen tiempo máximo. El resultado requiere una nueva prueba del propietario; todavía no está confirmado con su sesión real.

## Vigencia de sesión en cada operación

La función privada exige que `session_id` corresponda a una fila de `auth.sessions`, del mismo usuario y AAL2, con `not_after` vigente cuando exista y creada hace menos de ocho horas. Comprueba también correo confirmado, ausencia de bloqueo administrativo y admisión actual. No se concede acceso cliente a `auth.sessions` ni a `auth.users`; solo se consultan desde la función privilegiada privada, por clave primaria. Una sesión borrada al salir deja de servir para nuevas operaciones, aunque su JWT todavía no haya caducado. No se cancelan operaciones que ya estuvieran en curso.

El máximo de ocho horas se aplica en esta API, no cambia las opciones del plan de Auth ni invalida por sí solo todos los endpoints del proveedor. Los cinco minutos de inactividad siguen siendo un cierre del cliente, no un límite de inactividad impuesto en el servidor. La firma y caducidad del JWT corresponden al gateway del proveedor; las pruebas SQL simuladas no verifican firmas.

Pendiente configurar/verificar por separado el MFA de la cuenta administradora del proveedor. La integración no permite comprobarlo ni sustituye esa protección. La cuenta del panel de Supabase no es el usuario Auth de la aplicación; sus segundos factores son distintos.

Pendientes la prueba completa de reutilización de token tras salir, recuperación de cuenta, copias/restauración y el resto de recursos clínicos. No hay una interfaz clínica conectada y no se han eliminado los avisos de demo.
