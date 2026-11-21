# Recuperación de acceso · entorno de pruebas

El propietario confirmó el 12 de noviembre de 2026 que dispone de otro dispositivo protegido. Se prepara un segundo TOTP independiente para la misma cuenta. No se abre el registro, se sustituye la cuenta ni se rebaja la exigencia AAL2. Esto no recupera la contraseña ni el acceso administrativo al proveedor.

**Actualización del 15 de noviembre:** el propietario aclaró que Contraseñas sincroniza el mismo TOTP entre iPhone e iPad y pidió dejar la reserva pendiente. La base solo muestra un TOTP verificado: no se registra como segundo factor independiente ni como ensayo de reserva superado. Se mantiene el acceso actual sin cambiar ni borrar factores. Los pasos siguientes quedan como procedimiento futuro.

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

## Recuperación de datos y del servicio

La [copia de prueba](backups/README.md) incluye fichas, agenda, sesiones, catálogo e historiales/auditoría. Su restauración en una base nueva está verificada. El nuevo [ensayo de servicios](recovery/README.md) reconstruye además el esquema, permisos y componentes reales de Auth/API en Docker: crea usuarios solo por Auth Admin API, verifica contraseña/MFA nuevos, recupera datos con el origen cerrado y rechaza tokens antiguos y sesiones cerradas.

Hay un proyecto alojado de recuperación separado, gratuito y autorizado, con estructura y permisos reconstruidos. La identidad ficticia ya está confirmada y los datos se han restaurado y verificado. El titular confirmó la lectura de los pacientes y se verificaron MFA y sesión AAL2 en el servidor desde `/recovery/`. Sigue pendiente cerrar las altas públicas. La conexión disponible no administra Auth. No se deben solicitar sus credenciales por chat ni modificar tablas gestionadas de Auth. Los [dos informes](verification/SERVICE_RECOVERY_REPORT.json) distinguen la prueba local superada del [estado alojado pendiente](verification/HOSTED_RECOVERY_STATUS.json).

Se ha verificado la restauración alojada de los datos ficticios con acceso y lectura reales. Siguen pendientes cerrar las altas públicas, recuperación de cuenta humana/proveedor, SMTP/archivos/configuración de alojamiento, custodia externa de copias y claves, automatización y objetivos de pérdida/recuperación. Una prueba local con componentes reales no garantiza RPO/RTO ni autoriza pacientes reales. No se han cambiado los factores de acceso del propietario; la reserva independiente sigue aplazada.
