# Acceso de pruebas independiente

Solo autenticación y configuración TOTP. No hay formularios ni solicitudes a la API de pacientes. Publicada para el propietario en https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . No utilizar historias reales. Consulta el [estado de las comprobaciones HTTPS](../verification/PROJECT_STATUS.md).

## Verificar localmente

```sh
npm ci
npm run test:access
```

El comando compila con un proyecto, clave, cuenta y tokens sintéticos. Playwright intercepta todas las llamadas Auth; nunca se envía la contraseña de prueba a un proveedor real. Las seis pruebas de navegador no certifican el inicio de sesión, el MFA ni la revocación reales.

## Preparar el alojamiento de pruebas

Definir estas tres variables en el proceso de compilación:

- `MLREHAB_ACCESS_ORIGIN`: origen HTTPS exacto del nuevo alojamiento, sin ruta ni barra final. Debe ser distinto del origen de la demo.
- `MLREHAB_SUPABASE_URL`: URL HTTPS del proyecto de pruebas.
- `MLREHAB_SUPABASE_PUBLISHABLE_KEY`: clave moderna `sb_publishable_…`. Nunca claves secretas o `service_role`.

Ejecutar `npm run build:access`. El único directorio publicable es `clinical/access-dist`, ignorado por Git. No alojar la raíz del repositorio. La compilación genera HTML, CSS, el SDK empaquetado y `_headers`, sin CDN, scripts inline ni mapas de fuentes.

El alojamiento debe aplicar las cabeceras generadas: CSP con `frame-ancestors 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` y permisos de dispositivos desactivados. `_headers` es una propuesta para alojamientos compatibles: **hay que comprobar la respuesta HTTPS real**; subir el archivo no prueba que el servidor lo interprete. Sites no interpretó este archivo en la publicación estática; la versión alojada utiliza un Worker con respuestas explícitas y cabeceras verificadas por HTTPS. El código y el artefacto de ese alojamiento se conservan en su repositorio privado independiente. No usar una vista previa de terceros para introducir credenciales. No instalar service workers ni analítica. Revisar el proveedor del alojamiento y sus condiciones antes de uso clínico.

La comprobación de origen en JavaScript evita errores de ubicación; no es un control de autorización. El bloqueo de marcos se refuerza con la cabecera HTTP. El permiso clínico depende de la API privada y nunca de una pantalla que diga que el MFA fue correcto.

## Sesiones y límites

`persistSession: false`, tokens en memoria y detección de sesión en URL desactivada. Recargar obliga a autenticarse; no se escriben credenciales ni tokens en localStorage/sessionStorage. El navegador puede ofrecer su gestor de contraseñas. Salir borra el QR/clave de la pantalla y solicita el cierre de esta sesión al proveedor; una recarga elimina la memoria incluso si falla la red. Se cierra tras 5 minutos de inactividad, también al recuperar una pestaña suspendida. Esto no sustituye un límite de sesión en el servidor.

El enrolamiento solo elimina factores TOTP incompletos; nunca elimina un factor verificado. El acceso inicial usa el primer TOTP verificado de la cuenta. El soporte para varios autenticadores, recuperación por pérdida del dispositivo y gestión de factores requieren trabajo posterior. No guardar capturas del QR ni registrar claves, códigos, contraseñas o tokens.

Antes de uso clínico faltan pruebas reales de JWT/MFA, comprobación de sesión revocada contra `auth.sessions`, recuperación, límites del servidor y revisión de cabeceras. El estado `aal2` mostrado por el SDK sirve para el flujo de interfaz; toda operación clínica debe volver a exigirlo en el servidor junto con la cuenta admitida y el propietario. No se habilita acceso clínico por superar este asistente.

Documentación consultada el 11 de noviembre de 2026: [enrolamiento](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [verificación](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify), [nivel de autenticación](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel). Revisado el changelog vigente, incluido el cambio de cifrados TLS del 10 de noviembre: no se desactiva verificación TLS ni se habilitan cifrados antiguos.
