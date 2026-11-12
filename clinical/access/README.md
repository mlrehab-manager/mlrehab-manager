# Acceso de pruebas independiente

Solo autenticación y configuración TOTP. No hay formularios ni solicitudes a la API de pacientes. Publicada para el propietario en https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . No utilizar historias reales. Consulta el [estado de las comprobaciones HTTPS](../verification/PROJECT_STATUS.md).

## Verificar localmente

```sh
npm ci
npm run test:access
```

El comando compila con un proyecto, clave, cuenta y tokens sintéticos. Playwright intercepta todas las llamadas Auth y la comprobación de acceso; nunca se envía la contraseña de prueba a un proveedor real. Las quince pruebas de navegador no certifican la revocación real. El propietario ya ha confirmado el enrolamiento y el resultado «Acceso de pruebas autorizado» con su sesión real.

## Preparar el alojamiento de pruebas

Definir estas tres variables en el proceso de compilación:

- `MLREHAB_ACCESS_ORIGIN`: origen HTTPS exacto del nuevo alojamiento, sin ruta ni barra final. Debe ser distinto del origen de la demo.
- `MLREHAB_SUPABASE_URL`: URL HTTPS del proyecto de pruebas.
- `MLREHAB_SUPABASE_PUBLISHABLE_KEY`: clave moderna `sb_publishable_…`. Nunca claves secretas o `service_role`.

Ejecutar `npm run build:access`. El único directorio publicable es `clinical/access-dist`, ignorado por Git. No alojar la raíz del repositorio. La compilación genera HTML, CSS, el SDK empaquetado y `_headers`, sin CDN, scripts inline ni mapas de fuentes.

El alojamiento debe aplicar las cabeceras generadas: CSP con `frame-ancestors 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` y permisos de dispositivos desactivados. `_headers` es una propuesta para alojamientos compatibles: **hay que comprobar la respuesta HTTPS real**; subir el archivo no prueba que el servidor lo interprete. Sites no interpretó este archivo en la publicación estática; la versión alojada utiliza un Worker con respuestas explícitas y cabeceras verificadas por HTTPS. El código y el artefacto de ese alojamiento se conservan en su repositorio privado independiente. No usar una vista previa de terceros para introducir credenciales. No instalar service workers ni analítica. Revisar el proveedor del alojamiento y sus condiciones antes de uso clínico.

La comprobación de origen en JavaScript evita errores de ubicación; no es un control de autorización. El bloqueo de marcos se refuerza con la cabecera HTTP. El permiso clínico depende de la API privada y nunca de una pantalla que diga que el MFA fue correcto.

## Sesiones y límites

`persistSession: false`, tokens en memoria y detección de sesión en URL desactivada. Recargar obliga a autenticarse; no se escriben credenciales ni tokens en localStorage/sessionStorage. El navegador puede ofrecer su gestor de contraseñas. Salir borra el QR/clave de la pantalla y solicita el cierre de esta sesión al proveedor; una recarga elimina la memoria incluso si falla la red. Se cierra tras 5 minutos de inactividad, también al recuperar una pestaña suspendida. El servidor aplica por separado un máximo de ocho horas de antigüedad de sesión a esta API; el límite de inactividad sigue siendo solo del cliente.

El enrolamiento solo elimina factores TOTP incompletos; nunca elimina un factor verificado. El acceso inicial usa el primer TOTP verificado de la cuenta. El soporte para varios autenticadores, recuperación por pérdida del dispositivo y gestión de factores requieren trabajo posterior. No guardar capturas del QR ni registrar claves, códigos, contraseñas o tokens.

Después de verificar el TOTP, la interfaz solicita `clinical_access_check`, que no lee pacientes ni devuelve identificadores. Solo muestra autorización cuando la API confirma `{authorized:true}`. Una denegación, respuesta falsa o error de red mantiene bloqueado el resultado. El servidor consulta `auth.sessions` en cada operación: exige sesión del mismo usuario, AAL2, vigencia de `not_after` y antigüedad menor de ocho horas, además de admisión y cuenta confirmada sin bloqueo. No se conceden permisos de tablas Auth al cliente.

«Probar cierre seguro» cierra solo la sesión actual y comprueba en el navegador que el mismo token, aceptado inmediatamente antes del cierre, recibe después una denegación explícita `42501` (HTTP 401/403). El token no sale hacia otros servicios, no se muestra ni se persiste. Las solicitudes de prueba duran como máximo 10 segundos cada una. Un fallo de red, un token caducado, un cierre fallido o una autorización que continúe vigente no se presentan como éxito. «Volver al acceso» recarga y descarta la memoria de esta pantalla. El resultado de la prueba real sigue pendiente.

Antes de uso clínico faltan la prueba completa de revocación reutilizando el token tras salir, recuperación de cuenta y copias, inactividad impuesta por servidor y el resto de recursos clínicos. Las cabeceras HTTPS se han comprobado. El estado `aal2` mostrado por el SDK solo sirve para el flujo de interfaz; las operaciones clínicas vuelven a exigir permiso en el servidor. No se habilita uso clínico por superar este asistente.

Documentación consultada el 11 de noviembre de 2026: [enrolamiento](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [verificación](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify), [nivel de autenticación](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [sesiones y cierre estricto](https://supabase.com/docs/guides/auth/sessions). Revisado el changelog vigente, incluido el cambio de cifrados TLS del 10 de noviembre: no se desactiva verificación TLS ni se habilitan cifrados antiguos.
