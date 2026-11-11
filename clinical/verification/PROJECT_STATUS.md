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
- No se han creado pacientes, cuentas Auth ni admisiones. La base continúa vacía de datos de aplicación.
- Ocho pruebas SQL locales pasan. Las identidades simuladas de dichas pruebas nunca se instalaron en el proyecto alojado.

La comprobación inicial señaló funciones privilegiadas en el esquema expuesto y RLS sin políticas. La segunda migración mueve las implementaciones al esquema privado, añade entradas públicas sin elevación y explicita la denegación restrictiva. No se relajaron permisos para quitar avisos.

## Ajustes pendientes que requieren el panel del usuario

La configuración pública de Auth devuelve `disable_signup = false`, acceso por correo activado y acceso anónimo desactivado. Todavía hay que:

1. En Authentication → Sign In / Providers, desactivar **Allow new users to sign up**.
2. En Authentication → Users, crear explícitamente la única cuenta del profesional mediante **Add user / Create user**, sin enviar invitaciones desde esta integración ni compartir contraseñas.
3. Configurar/verificar por separado el MFA de la cuenta administradora del proveedor. La integración no permite comprobarlo ni sustituye esa protección.

La cuenta del panel de Supabase no es el usuario Auth de la aplicación. El MFA del panel no es el MFA de la aplicación. Tras crear el usuario Auth habrá que comprobar su identidad y admitirlo en la lista privada, construir el flujo de autenticación/enrolamiento MFA de la aplicación y probar una sesión verificada real.

No se han verificado aún accesos con JWT reales de usuario, MFA real, revocación real, recuperación de cuenta, copias/restauración ni el resto de recursos clínicos. No hay una interfaz clínica conectada y no se han eliminado los avisos de demo.
