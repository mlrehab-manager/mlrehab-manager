# Conservación y recuperación de copias

Actualizado el 23 de noviembre de 2026. Responsable operativo: el titular autónomo, único usuario de MLREHAB. El ensayo del mismo archivo desde iPad y Windows está completado con declaraciones del titular y registros vinculados. La revisión de proveedores sigue pendiente y la cuenta alojada continúa en pruebas.

## Rutina acordada para las pruebas

1. Al finalizar cada jornada con cambios, y antes de una actualización importante, guardar las fichas, citas, sesiones y catálogo. Los borradores no entran en la copia.
2. En **Copias**, crear el archivo cifrado, guardarlo en el destino elegido y volver a abrirlo desde ese destino con **Comprobar archivo**. Una descarga iniciada no equivale a un archivo comprobado.
3. Conservar otra copia fuera de la misma cuenta de sincronización: carpeta local del ordenador fuera de iCloud/OneDrive, o soporte desconectado, protegido y custodiado. Un iPad y un iPhone con el mismo iCloud no constituyen dos destinos independientes.
4. Guardar la frase separada de los archivos, con recuperación posible sin el iPad. No comunicarla por chat ni adjuntarla al archivo. Verificar que se puede recuperar antes de declarar ese paso terminado.
5. Registrar la comprobación en la app, marcando solo los pasos realizados. Si el registro falla, reintentar: la petición conserva su identificador y no duplica la comprobación confirmada. La última comprobación se consulta expresamente tras entrar.
6. Conservar dos copias recientes verificadas y una anterior que haya superado un ensayo de restauración. Sustituir la antigua después de comprobar la nueva; nunca borrar la única copia válida. Para pruebas ficticias se pueden retirar archivos ya utilizados. No hay borrado automático.
7. Ensayar la restauración una vez al mes y tras cambios importantes, en un destino independiente autorizado y vacío. Registrar fecha, resultado, integridad y acceso. Nunca ensayar sobre la base habitual ni sobre el destino de recuperación ocupado.

Esta rutina manual y su rotación quedan definidas para las pruebas. Su adecuación a información clínica, destino, período de conservación, obligaciones contractuales y continuidad del plan gratuito se revisarán antes de activar datos reales. La rotación de archivos no autoriza destruir historias ni su auditoría. No hay programación de copias, avisos de omisión, vigilancia en segundo plano ni garantía de plazos de pérdida/recuperación.

## Qué registra la app

Tras validar localmente un archivo v5 del modo de pruebas o v6 del modo clínico, ofrece registrar su versión, el identificador de una exportación propia, una huella SHA-256 del archivo cifrado, fecha del servidor, destino entre opciones acotadas y tres declaraciones: copia independiente, frase separada recuperable y comprobación en otro dispositivo. No admite nombres de carpetas ni texto libre. No envía el archivo, su contenido descifrado, la frase o datos de pacientes.

El servidor exige autorización vigente, AAL2 y sesión actual. Las comprobaciones se aíslan por titular y modo, con tablas privadas, RLS y RPC públicos invoker. Son declaraciones del titular vinculadas a una exportación; el servidor no puede observar si iCloud terminó de sincronizar, si existe una copia física ni si se hizo una restauración. Una fecha reciente tampoco demuestra cobertura de cambios posteriores.

Este registro operativo no forma parte de las nueve colecciones portátiles de pacientes/agenda/sesiones/catálogo/auditoría. Después de recuperar el servicio se necesita una nueva comprobación; no se presenta una declaración antigua como confirmación de la recuperación. Si se necesita un registro de continuidad fuera del proveedor, anotar por separado fecha de exportación/comprobación y resultado, sin datos de pacientes.

## Si falla el iPad o el servicio

- Si solo falla el dispositivo: usar otro protegido, volver a entrar con la cuenta y MFA, localizar el archivo externo y su frase por separado y comprobarlo localmente. No importar ni sustituir la base habitual por una copia antigua.
- Si falta el servicio o sus datos: conservar todas las últimas copias verificadas, anotar el último guardado confirmado y la incidencia. Detener cambios sobre el origen afectado. Recuperar en un proyecto independiente autorizado y vacío mediante el procedimiento de [recuperación del servicio](../clinical/recovery/README.md), que reconstruye esquema y acceso antes de admitir operaciones.
- El proceso administrativo valida propietario, formato, relaciones, versiones y auditoría; restaura las nueve colecciones y contrasta integridad. Las copias clínicas arrancan suspendidas. Solo después de comprobar datos y acceso se decide la puesta en marcha y se actualiza la dirección de la app. No se considera terminada por ver «Archivo verificado».
- La copia excluye cuentas/Auth, contraseñas, autenticadores, secretos y configuración de proveedores. Su recuperación va por un circuito separado. Si se pierde la frase, el archivo no puede abrirse. La reserva MFA independiente sigue aplazada por decisión del titular.

La pantalla permite descargar unas instrucciones sin datos personales para conservarlas fuera de la app. Si el alojamiento falla, una guía que solo existiera dentro de la sesión no sería suficiente.

## Evidencia de la comprobación

Confirmado por el titular: archivo verificado en iPad, guardado en iCloud Drive, visible y descargable desde iPhone. El 22 de noviembre confirma que todos los registros son inventados y que puede recuperar la frase aunque pierda el iPad. El 23 utiliza Windows y completa el recorrido indicado para una carpeta local fuera de OneDrive/iCloud. Consta una segunda comprobación con destino «Carpeta local del ordenador», las tres declaraciones marcadas y la misma huella/propietario/exportación del archivo del iPad. La ubicación fuera de sincronización es una declaración del titular, no una inspección del sistema de archivos por el agente. La frase y el archivo no se reciben. Sigue sin ensayarse la restauración del servidor desde este archivo concreto.

Los ensayos sintéticos de datos y de servicios tienen informes separados en `clinical/verification/`. El recorrido de custodia del titular queda registrado con el alcance anterior. La [revisión de proveedores](CLINICAL_PROVIDER_REVIEW.md) y la decisión sobre los destinos clínicos permanecen pendientes; la comprobación no activa automáticamente el uso clínico.

## Resultado desde Windows

La consulta administrativa del 23 de noviembre a las 17:08 de Madrid observa dos comprobaciones. La última se guardó a las 17:07 (16:07 UTC), con destino local del ordenador y vinculada al mismo archivo/exportación del día 22. Se conserva la declaración anterior del iPad como registro histórico. El nuevo registro y el contexto de Windows resuelven el paso operativo que estaba pendiente; no convierten retrospectivamente la declaración anterior en una observación física.

Los tipos de visita se incluyen como campo opcional de citas/versiones en copias v5/v6. Los formatos anteriores siguen leyéndose y restaurándose sin asignar retrospectivamente una clasificación. Los ensayos sintéticos no sustituyen la apertura del archivo concreto del titular desde el destino independiente.
