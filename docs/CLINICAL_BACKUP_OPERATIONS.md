# Copias externas y continuidad · propuesta pendiente de aprobación

21 de noviembre de 2026. Aplicación actual: pruebas con datos ficticios. Esta propuesta no activa automatizaciones, conserva archivos por cuenta del usuario ni habilita uso real.

## Lo que se ha comprobado

El titular confirmó el archivo verificado en el iPad, su depósito en iCloud Drive y su descarga desde el iPhone. Esto demuestra un recorrido manual de creación/comprobación/traslado. No demuestra descifrado en el iPhone, recuperación de una cuenta de Apple perdida, continuidad diaria ni restauración del servicio desde ese archivo concreto. Los ensayos automatizados y la restauración alojada sintética tienen evidencias independientes.

El exportador incluye los datos de la aplicación y sus nueve colecciones; no incorpora cuentas/Auth, secretos, configuración de proveedores o archivos de Storage. El archivo se cifra localmente, tiene nombre genérico y no contiene la frase. «Archivo verificado» acredita comprobación local del contenido y formato, no una restauración de la base alojada.

## Propuesta acotada, sin acumular archivos indefinidamente

Para las pruebas ficticias pueden eliminarse los archivos ya utilizados. No se ha automatizado ni ejecutado su borrado.

Para uso real, acordar primero destino/contrato, pérdida máxima tolerable, plazo de recuperación y retención con el responsable. Como punto de partida operativo sujeto a esa revisión, conservar dos copias recientes verificadas y una anterior que haya superado un ensayo de restauración. No es una política de retención clínica ni garantiza detectar corrupción tardía; podría ser insuficiente según el riesgo y el período de detección, y deberá ajustarse antes de activación.

Conservar al menos una copia cifrada separada de la sincronización habitual, por ejemplo en un soporte desconectado custodiado por el responsable, con ubicación, protección y recuperación ensayadas. Dos dispositivos conectados a una misma cuenta de iCloud no satisfacen por sí solos esa independencia. No se solicita comprar equipos ni contratar almacenamiento en este paso.

## Operación propuesta

1. Al finalizar una jornada con cambios y antes de modificaciones de riesgo, exportar y comprobar el archivo completo; los borradores sin guardar no forman parte de la copia.
2. Guardarlo en el destino externo aprobado y registrar fecha y resultado, sin nombres ni textos clínicos. Una descarga iniciada o una sincronización pendiente no cuenta como copia externa confirmada.
3. Custodiar la frase separada de los archivos y con recuperación probada. No pedirla ni compartirla por chat. Si el archivo y la frase se pierden o quedan inaccesibles juntos, la existencia de cifrado no resuelve la recuperación.
4. Rotar solo después de verificar la nueva copia y respetando la política acordada. Nunca borrar la única copia válida para liberar espacio. No confundir rotación de archivos con autorización para destruir historias o su auditoría.
5. Ante un fallo, conservar las últimas copias verificadas y registrar la incidencia. No presentar el día como protegido si falta la copia requerida; aplicar el procedimiento de contingencia que se haya acordado.
6. Ensayar periódicamente la restauración en un destino aislado con autorización y verificar integridad y acceso. Acordar la frecuencia según riesgo. No restaurar sobre el proyecto habitual como prueba ni reimportar sobre el destino de recuperación ya ocupado.

Estos pasos son manuales. No hay todavía programación, alertas de omisión, custodia externa automática ni garantía de RPO/RTO. Exportar al final de la jornada solo puede sostener un objetivo diario si se ejecuta, se comprueba y existe un destino accesible; no demuestra un compromiso de 24 horas ni uno de recuperación en ocho horas.

## Pendiente para ponerlo en marcha

Elegir un destino contractual y técnicamente adecuado; definir la copia aislada y custodia de la frase; acordar retención, responsables y contingencia; comprobar recuperación desde el segundo dispositivo/destino y del servicio necesario; resolver continuidad de Supabase Free. Véase [la revisión de proveedores](CLINICAL_PROVIDER_REVIEW.md). La reserva MFA independiente permanece aplazada: este documento no la configura ni la impone de nuevo.
