# Recuperación de acceso · entorno de pruebas

El propietario confirmó el 12 de noviembre de 2026 que dispone de otro dispositivo protegido. Se prepara un segundo TOTP independiente para la misma cuenta. No se abre el registro, se sustituye la cuenta ni se rebaja la exigencia AAL2. Esto no recupera la contraseña ni el acceso administrativo al proveedor.

## Preparar y ensayar el autenticador de reserva

1. Entrar en la dirección privada de pruebas con contraseña y autenticador principal; comprobar «Acceso de pruebas autorizado».
2. Pulsar «Añadir autenticador de reserva». La pantalla comprueba de nuevo el permiso en el servidor y exige un único TOTP verificado antes de crear otro.
3. Añadir el nuevo QR o clave al autenticador del segundo dispositivo, protegido con bloqueo y actualizado. No guardar el QR en Fotos, capturas, correo, GitHub ni chat. Verificar allí un código. Se avisa de que el proveedor cerrará las demás sesiones de la aplicación al confirmar el nuevo factor.
4. Comprobar «Autenticador de reserva verificado» y el recuento de dos autenticadores. El principal se conserva; este flujo no elimina factores verificados. El QR y la clave se retiran de la pantalla al verificar o salir, sin persistirlos en el navegador.
5. Salir y volver a entrar; elegir «Autenticador de reserva» y usar el código del segundo dispositivo. La prueba solo queda completada cuando vuelve a aparecer «Acceso de pruebas autorizado» con ese factor. No es necesario borrar ni perder el principal para ensayarlo.
6. Conservar la contraseña en un gestor protegido y el dispositivo de reserva separado del principal. Evaluar las dependencias de sincronización de sus autenticadores: dos dispositivos vinculados a la misma cuenta de sincronización no garantizan independencia frente al compromiso de esa cuenta.

El código de la interfaz ofrece hasta dos TOTP verificados. Si se abandona el alta, el factor no verificado puede quedar en el proveedor: el flujo de reserva no elimina automáticamente factores, ni verificados ni pendientes. Se deberá revisar el límite y retirar únicamente los pendientes mediante un procedimiento administrativo controlado. No se afirma que la recuperación esté probada por haber construido esta pantalla: falta la confirmación real del propietario.

## Si se pierde un dispositivo

Si solo se pierde el principal, entrar con contraseña y reserva, comprobar autorización y evaluar si hubo exposición. La retirada del factor perdido, revocación de las sesiones afectadas y sustitución de credenciales deben resolverse mediante un procedimiento verificado del proveedor. Esta versión no implementa eliminación de autenticadores verificados; no ofrece una supuesta recuperación basada en quitar MFA.

Si se pierden ambos autenticadores, se bloquea el uso clínico y se utiliza recuperación administrativa con verificación de identidad fuera de la aplicación. Antes del uso real deben estar documentados los medios de recuperación del proveedor y del correo, su custodia y el procedimiento de revocación, así como un ensayo sin afectar a la cuenta operativa. No modificar directamente tablas gestionadas de Auth ni habilitar acceso clínico con AAL1 como solución.

El MFA de Supabase/ChatGPT y el MFA de MLREHAB son distintos. La reserva de la aplicación no recupera automáticamente esas cuentas. Tampoco recupera una frase de cifrado de copias perdida: esta debe custodiarse separada y probarse en otro dispositivo. Ningún secreto de recuperación se solicita por chat.

## Copias: trabajo preparado y pendiente

La [base de cifrado](backups/README.md) supera pruebas de cifrado/descifrado de datos ficticios, incluida manipulación y contraseña incorrecta. Todavía no exporta la base ni restaura historias, sesiones, documentos o cuentas en un entorno aislado. Siguen pendientes exportación consistente, custodia externa de copias y claves, objetivos de pérdida/recuperación, automatización con avisos y restauración ensayada. La prueba del autenticador no sustituye esas tareas ni autoriza pacientes reales.
