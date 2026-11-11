# Verificación del proyecto de pruebas alojado

Fecha: 11 de noviembre de 2026. Uso: exclusivamente pruebas; no apto todavía para pacientes reales.

El usuario creó un proyecto y conectó la integración Supabase. Se localizó un único proyecto recién creado en `eu-central-1` (Frankfurt), PostgreSQL 17.11, sin tablas de aplicación, migraciones ni usuarios. No se incluyen aquí identificadores de cuenta, correos, claves ni secretos.

## Instalación y comprobaciones realizadas

- Aplicadas las migraciones `001_private_patients.sql` y `002_private_rpc_boundary.sql` con la herramienta de migraciones. No se creó un proyecto adicional ni se activó facturación.
- Cuatro tablas privadas con RLS y políticas restrictivas que niegan acceso directo a `anon` y `authenticated`. Ninguno de esos roles tiene permisos de tabla.
- Cinco puntos de entrada públicos `SECURITY INVOKER`. Las implementaciones con privilegios elevados están en el esquema privado y mantienen comprobaciones de identidad, admisión, MFA y propietario. Los auxiliares internos no son ejecutables por los clientes.
- Las cinco llamadas HTTP anónimas, realizadas con la clave publicable del proyecto y sin sesión de usuario, devuelven HTTP 401 / SQLSTATE `42501`.
- Solicitar el esquema `clinical_private` por HTTP devuelve HTTP 406 / `PGRST106`: no forma parte de los esquemas expuestos.
- El asesor de seguridad de Supabase devuelve una lista vacía de avisos después de la segunda migración. Esto no certifica seguridad clínica ni cumplimiento normativo.
- El usuario ha creado una única cuenta Auth: correo confirmado, sin bloqueo administrativo. Se ha admitido exclusivamente esa cuenta en la lista privada. El registro público está cerrado (`disable_signup = true`); siguen desactivados los accesos anónimos. No se han creado pacientes.
- Ocho pruebas SQL locales pasan. Las identidades simuladas de dichas pruebas nunca se instalaron en el proyecto alojado.

La comprobación inicial señaló funciones privilegiadas en el esquema expuesto y RLS sin políticas. La segunda migración mueve las implementaciones al esquema privado, añade entradas públicas sin elevación y explicita la denegación restrictiva. No se relajaron permisos para quitar avisos.

## Autenticación: estado y siguiente prueba

Verificados mediante consulta administrativa y configuración pública: una cuenta, una admisión habilitada, cero factores MFA verificados y cero pacientes. El registro se cerró desde el panel; no se han manipulado las tablas gestionadas de Auth para crear usuarios ni contraseñas.

Se ha preparado `clinical/access`, una pantalla independiente de autenticación y alta/verificación TOTP. Usa el SDK empaquetado localmente, versiones fijadas, CSP sin scripts inline ni CDN y sesiones exclusivamente en memoria. Seis pruebas de navegador con respuestas Auth simuladas pasan: contraseña incorrecta, MFA existente, primer enrolamiento, código incorrecto, salida y caducidad por inactividad. No solicitan ni muestran datos clínicos.

La pantalla está publicada en un sitio Sites privado, separado de la demo: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . La política consultada solo incluye al propietario, sin grupos ni editores. La versión publicada es la segunda, procedente del commit de su repositorio privado `50c197514d7a3708a4a26e3db4489f12e2411815`. No se ha habilitado uso clínico.

La primera publicación estática ignoraba `_headers`. Se sustituyó por un Worker que devuelve explícitamente CSP con `frame-ancestors 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y permisos de dispositivos desactivados. Las tres respuestas HTTPS (HTML, JS, CSS) dan HTTP 200, coinciden byte a byte con los archivos compilados y contienen esas cabeceras. Se verificaron localmente las rutas del Worker, HEAD y el rechazo de POST. No contiene datos clínicos ni claves secretas.

La compilación impide utilizar el origen de la demo. La plataforma confirma la publicación; no se ha hecho QA de navegador del nuevo alojamiento porque no está disponible `cua_repl.js` para la vista previa gestionada. Las seis pruebas previas del flujo usan solo claves y cuentas sintéticas; no confirman el MFA de la cuenta real. La próxima prueba la realiza el propietario desde su dispositivo, sin compartir contraseñas, códigos ni QR.

Pendiente configurar/verificar por separado el MFA de la cuenta administradora del proveedor. La integración no permite comprobarlo ni sustituye esa protección. La cuenta del panel de Supabase no es el usuario Auth de la aplicación; sus segundos factores son distintos.

No se han verificado aún accesos con JWT reales de usuario, MFA real, revocación real, recuperación de cuenta, copias/restauración ni el resto de recursos clínicos. No hay una interfaz clínica conectada y no se han eliminado los avisos de demo.
