# Consulta privada · interfaz de aplicación

Interfaz privada de pruebas con autenticación, copias y una primera [consulta/edición de fichas ficticias](PATIENTS.md). Publicada para el propietario en https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . No utilizar historias reales. Consulta el [estado de las comprobaciones HTTPS](../verification/PROJECT_STATUS.md).

## Verificar localmente

```sh
npm ci
npm run test:access
```

El comando compila con un proyecto, clave, cuenta y tokens sintéticos. Playwright intercepta Auth y los RPC de prueba; nunca envía contraseñas, frases o archivos a un proveedor real. Las setenta y seis pruebas cubren autenticación, reserva, cierre, copias, fichas, agenda y sesiones. El propietario ha confirmado acceso, cierre y comprobación del archivo cifrado con su sesión real. La reserva independiente sigue pendiente por su indicación; el mismo código sincronizado por Contraseñas entre dispositivos corresponde a un solo factor.

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

El enrolamiento inicial solo elimina factores TOTP incompletos; nunca elimina un factor verificado. Si hay varios TOTP verificados, el usuario puede elegir cuál utilizar al entrar. Después de autorización AAL2 por el servidor, «Añadir autenticador de reserva» permite preparar y verificar un segundo factor en otro dispositivo. Se conserva el principal y se retira el QR/clave al confirmar o salir. Al confirmar un nuevo factor el proveedor cierra las otras sesiones. El flujo de reserva no elimina factores; abandonar el alta puede dejar uno pendiente y consumir el límite del proveedor. La gestión de factores perdidos y la recuperación administrativa siguen pendientes. Ver [procedimiento y ensayo](../RECOVERY_RUNBOOK.md). No guardar capturas del QR ni registrar claves, códigos, contraseñas o tokens.

Después de verificar el TOTP, la interfaz solicita `clinical_access_check`, que no lee pacientes ni devuelve identificadores. Solo muestra autorización cuando la API confirma `{authorized:true}`. Una denegación, respuesta falsa o error de red mantiene bloqueado el resultado. El servidor consulta `auth.sessions` en cada operación: exige sesión del mismo usuario, AAL2, vigencia de `not_after` y antigüedad menor de ocho horas, además de admisión y cuenta confirmada sin bloqueo. No se conceden permisos de tablas Auth al cliente.

«Probar cierre seguro» cierra solo la sesión actual y comprueba en el navegador que el mismo token, aceptado inmediatamente antes del cierre, recibe después una denegación explícita `42501` (HTTP 401/403). El token no sale hacia otros servicios, no se muestra ni se persiste. Las solicitudes de prueba duran como máximo 10 segundos cada una. Un fallo de red, un token caducado, un cierre fallido o una autorización que continúe vigente no se presentan como éxito. «Volver al acceso» recarga y descarta la memoria de esta pantalla. El propietario confirmó el 12 de noviembre de 2026 el resultado «Cierre seguro verificado» con su sesión real. Esta comprobación se limita a la API protegida; no revoca criptográficamente el JWT en todos los servicios del proveedor.

«Crear copia cifrada de prueba» exporta mediante RPC todas las fichas ficticias actuales (de cero a 500), sus versiones y auditoría en una instantánea coherente y descarga solo el archivo cifrado. La frase, independiente de la contraseña de acceso, no se envía al servidor. «Comprobar archivo» lo descifra y valida localmente sin subirlo ni escribir sobre la base. Las frases se vacían al utilizarlas y al salir. El conjunto no incluye calendario ni otros recursos de la demo. Ver [alcance y restauración aislada](../backups/README.md).

Antes de uso clínico faltan recuperación de cuenta, copias completas y recuperación del servicio alojado, custodia externa/automatización, inactividad impuesta por servidor y el resto de recursos clínicos. Se ha ensayado una restauración de los datos ficticios en PostgreSQL/PGlite nuevo; no es una reconstrucción de Supabase/Auth. Las cabeceras HTTPS se han comprobado. El estado `aal2` mostrado por el SDK solo sirve para el flujo de interfaz; las operaciones clínicas vuelven a exigir permiso en el servidor. No se habilita uso clínico por superar este asistente.

Documentación consultada el 11 de noviembre de 2026: [enrolamiento](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [verificación](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify), [nivel de autenticación](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [sesiones y cierre estricto](https://supabase.com/docs/guides/auth/sessions). Revisado el changelog vigente, incluido el cambio de cifrados TLS del 10 de noviembre: no se desactiva verificación TLS ni se habilitan cifrados antiguos.

La [agenda y las sesiones ficticias](AGENDA.md) se guardan en esta misma base privada con horario Europe/Madrid, revisión esperada, versiones y auditoría. La copia versión 2 las incluye. No se modifica la autenticación actual ni se habilita uso clínico.

Dentro de cada sesión, **Buscar ejercicios del catálogo** permite elegir entre los 130 nombres existentes, combinando búsqueda, modalidad y zona. Se añaden al texto editable y se conservan al guardar la sesión, con sus versiones y copia cifrada. Las entradas manuales siguen siendo texto de esa sesión; el apartado [Ejercicios propios](CUSTOM_EXERCISES.md) permite guardar nombres reutilizables por cuenta, con modalidad y zonas. Se incluyen en la copia versión 3.

Los ejercicios propios se pueden editar y archivar desde su lista, con revisión esperada y conservación del historial y de las sesiones anteriores. El buscador de gestión permite localizar nombres y Mostrar también archivados permite consultarlos. La copia v4 incluye las versiones.

El [flujo de fichas](PATIENTS.md) permite crear por alias ficticio, buscar, editar y archivar con historial conservado. Exportar ya no prepara pacientes automáticamente y la copia v5 mantiene los archivos v1–v4. Las funciones se prueban con datos sintéticos; el uso clínico sigue pendiente del plan de puesta en marcha.

La ficha añade «Motivo de consulta ficticio» y «Antecedentes y precauciones ficticios», opcionales y separados de los textos anteriores. Se guardan con revisión, se incluyen en v5 y conservan las protecciones de borrador/cierre. No se añaden usuarios, roles o invitaciones; sigue siendo la aplicación individual de pruebas.

El código de la versión 15 admite un modo clínico asignado por el servidor, identificación validada y copias v6. La cuenta actual sigue en prueba y permite ensayar identidad con ejemplos inventados. No hay botón de activación en la pantalla; la [activación clínica](../CLINICAL_ACTIVATION.md) se prepara por separado. Una denegación explícita de datos limpia todos los paneles y devuelve al acceso.

## Navegación e instalación en iPad

Inicio, Agenda, Pacientes, Ejercicios, Copias y Acceso comparten la sesión; cambiar de sección no desmonta formularios ni descarta borradores. No se cargan fichas automáticamente al entrar. La barra lateral se convierte en navegación inferior en pantallas estrechas. Inicio distingue totales sin cargar y citas del día consultado.

Desde el enlace privado habitual, Safari → Compartir → Añadir a pantalla de inicio permite abrir la app en modo independiente con icono propio. Manifest y alcance relativos; `/recovery/` conserva nombre y backend distintos. No añade funcionamiento sin conexión ni recuerda tokens al recargar. La instalación real en iPad debe comprobarse con el titular.

En Copias, la rutina y las instrucciones descargables permiten conservar el procedimiento fuera de la app. Después de validar localmente una copia v5/v6 del modo actual, «Guardar comprobación» envía exclusivamente metadatos/declaraciones acotadas mediante una operación idempotente. «Consultar última comprobación» recupera ese registro para el titular/modo autorizado. El archivo, frase y contenido descifrado no se suben; el registro no equivale a una restauración ni a observar el destino externo. Véase [conservación y recuperación](../../docs/CLINICAL_BACKUP_OPERATIONS.md).

La agenda ahora es semanal de lunes a viernes, sin fila de las 14:00, con alta desde cada casilla y elección obligatoria de paciente. Las citas fuera de la cuadrícula permanecen en el listado; se mantiene el control de borradores, revisiones, sesiones y cierre. Véase [agenda semanal](AGENDA.md).
