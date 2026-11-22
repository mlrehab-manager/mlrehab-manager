# Puesta en marcha solicitada para el 23 de noviembre de 2026

Revisión: 22 de noviembre de 2026. El titular quiere empezar mañana, será el único usuario y aclara que lleva actualmente la agenda en Calendario del iPhone. No se ha consultado ni importado ese calendario. No se ha confirmado dónde conserva historias anteriores; no se presupone que existan o que no existan.

**Resultado actual: la versión privada 14 sigue siendo de pruebas y no está habilitada para historias reales.** Esta es una evaluación documental, no un interruptor de configuración. No se aprueba una fecha de activación ni se cambian etiquetas para presentar los fixtures como datos clínicos.

## Comprobado y cerrado

El titular confirmó el alta/guardado/reapertura y ahora los campos opcionales de motivo y precauciones. También confirmó archivo cifrado verificado en iPad y descarga desde iPhone a través de iCloud. No se repiten esas pruebas como condición para el siguiente trabajo.

El commit `be752dbf2f9ffbb6499cd1be4b59b3204a250e6e` pasó las comprobaciones de GitHub Actions (ejecución `45006382993`): demo, SQL, interfaz privada, cifrado y recuperación. Hay evidencias de MFA/sesión, autorización por propietario, revisiones/auditoría y restauración sintética con servicios reales. El éxito de las pruebas no amplía su alcance a datos reales.

## Bloqueos de salida y orden de trabajo

| Prioridad                     | Trabajo concreto                                             | Criterio de cierre                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 · técnico                  | Identificación y alta clínica fuera de los aliases de prueba | Identificación mínima definida y validada en servidor, homónimos permitidos, estado clínico separado y pruebas completas de alta/edición/archivo/sesión. La interfaz actual añade FICTICIO y solo abre registros con marcadores de prueba.                                                                                                           |
| P0 · técnico                  | Copia y restauración para registros clínicos                 | Exportador, validador y recuperación compatibles con el modelo clínico sin exigir `testOnly`/`fixture`. Ensayar primero con datos sintéticos equivalentes, con integridad y acceso recuperados. La copia actual solo admite conjuntos ficticios, también cuando los textos parecen clínicos.                                                         |
| P0 · operación                | Custodia y recuperación acordadas                            | Destino y frase recuperables por separado, copia que no dependa solo de una misma sincronización, frecuencia/retención/contingencia verificadas y recuperación de acceso acordada. Descargar un archivo desde otro dispositivo no demuestra esos puntos. La reserva TOTP independiente sigue aplazada; no se exige configurarla como única solución. |
| P0 · condiciones del servicio | Resolver la revisión específica del tratamiento              | Dejar documentadas condiciones/encargos, transferencias, información y obligaciones aplicables al uso propuesto. Hay preguntas preparadas sobre datos sensibles y alojamiento; no se presume que la asesoría prevista para diciembre ya las haya resuelto.                                                                                           |
| P1 · salida                   | Validar y activar deliberadamente una versión identificada   | Recorrido clínico completo, decisiones anteriores cerradas, incidencias críticas resueltas y versión/configuración registradas. Revisar disponibilidad y contingencia de Free. No basta ocultar los avisos de prueba.                                                                                                                                |

Estos son resultados pendientes, no una exigencia de contratar obligatoriamente una asesoría concreta o esperar una fecha del calendario. Se puede seguir desarrollando mientras se revisan las condiciones. El mes de diciembre comunicado por el titular se mantiene como previsión; no habilita el uso real por adelantado ni programa activación automática.

## Alcance que se pospone

Se congelan ampliaciones de ejercicios, informes privados, funciones de equipos/roles/invitaciones, importación de calendarios y cambios estéticos. Se conserva la agenda actual en el iPhone durante la transición; no se duplica o migra sin un procedimiento explícito. No se propone guardar historias reales bajo aliases ficticios o pasarlas al chat para probarlas.

La API base de pacientes existente no constituye por sí sola el circuito clínico validado: la interfaz y las herramientas de copia/restauración actuales son específicas de fixtures. No se presenta un cambio de nombre, prefijo o casilla como transición completa.

## Evidencias y trabajo ya preparado

- [Registro de pruebas del titular](../clinical/verification/MANUAL_CHECKS.json): distingue declaraciones del titular, pruebas técnicas y pendientes.
- [Estado técnico](../clinical/verification/PROJECT_STATUS.md): esquema, permisos, publicación y ensayos.
- [Revisión de proveedores](CLINICAL_PROVIDER_REVIEW.md) y [consultas sin enviar](CLINICAL_VENDOR_QUESTIONS.md).
- [Propuesta de copias](CLINICAL_BACKUP_OPERATIONS.md): sin borrado o automatización ejecutados.

No se han leído o modificado pacientes reales, cuentas, datos de calendario, configuración de servicios o facturación durante esta revisión. La aplicación publicada y su entorno privado permanecen con su funcionamiento actual.
