# Fichas ficticias conectadas a la base privada

## Una pestaña del navegador por ficha

Pulsar un paciente abre una pestaña nueva del navegador y conserva la lista en la principal. Cada ficha tiene sus campos y borrador independientes. «Guardar y cerrar pestaña» termina tras confirmar el guardado. El nombre/identificador no se añade a la URL, al historial del navegador ni al título; el fragmento genérico es `#ficha`. Las nuevas altas permanecen en la lista y se abren con un clic posterior, manteniendo el gesto que requieren los navegadores para permitir pestañas.

«Guardar y cerrar pestaña» usa el guardado existente con revisión esperada. Sin cambios cierra sin escribir otra versión; con error o conflicto conserva la pestaña y sus textos. Un texto nuevo durante la petición queda como borrador posterior y mantiene la ficha abierta. «Cerrar ficha» ofrece guardar, continuar o descartar expresamente si hay cambios. Las archivadas siguen en lectura. Un fallo de carga permite reintentar y el bloqueo de ventanas emergentes da instrucciones en la principal.

Mantener abierta la pestaña principal mientras se trabaja en las fichas. Es la única que conserva el cliente autenticado, con MFA y los controles del servidor. Las fichas utilizan un MessagePort asociado a la ventana que abrió la lista y a un único paciente, comprobando origen y ventana en el enlace. Solo se admiten acceso, lectura, guardado y archivo de esa ficha. No se transfieren contraseñas, JWT o refresh tokens ni se usan almacenes del navegador. La actividad del usuario en la ficha mantiene el temporizador de inactividad de la principal; los latidos del canal no lo renuevan.

El cierre de sesión, inactividad o pérdida de la principal bloquea y limpia las fichas, incluidos sus diálogos, y una respuesta tardía no las repuebla. La principal advierte al cerrarse con borradores remotos y las copias se bloquean con textos pendientes en otras pestañas, incluso mientras una escritura espera respuesta después de cerrar su ficha. Los resultados confirmados actualizan la lista. Abrir el enlace `#ficha` directamente o desde una ventana no registrada no concede acceso. El guardado es explícito; cerrar una ventana no sustituye su confirmación.

Las pruebas cubren pestañas reales de Chromium con respuestas sintéticas. La instalación independiente de iPad no proporciona necesariamente una relación de apertura con Safari; para trabajar con pestañas se usa el navegador y se mantiene la principal abierta. El flujo real de Safari/iPad y la custodia clínica se revisan por separado.

La interfaz privada permite crear fichas mediante un alias de prueba, buscar por alias o identificador, editar motivo de consulta, antecedentes y precauciones, historia, exploración, diagnóstico y objetivos y archivar conservando el historial. Se admiten hasta 500 fichas del propietario, incluidas las archivadas. Sigue prohibido introducir nombres, teléfonos u otros datos reales de pacientes. No se migra información de la demo.

«Nueva ficha ficticia» envía un alias de hasta 80 caracteres; el servidor normaliza espacios y genera `FICTICIO · {alias}`. Los alias de prueba son únicos por propietario, ignorando acentos, mayúsculas y espacios; esta regla no se plantea como unicidad de nombres de personas. El identificador UUID de petición se conserva al reintentar un alta sin confirmación para evitar duplicados. Reutilizarlo con otro alias se rechaza y una colisión con otra cuenta no permite acceder a ella. Cada alta crea ficha, versión inicial y auditoría en la misma transacción.

Las fichas nuevas usan el marcador `patient-workflow-v1`, junto con `testOnly=true`. Las dos fichas iniciales `backup-roundtrip-v1` siguen admitidas, con su nombre original. «Preparar los dos pacientes ficticios» solo prepara los ejemplos si no hay fichas; si ya existe un conjunto ficticio válido lo conserva. Exportar una copia no ejecuta la preparación ni crea pacientes.

La migración `20261121095456_clinical_patient_workflow_test.sql` añade las entradas públicas de alta y archivo `SECURITY INVOKER` y amplía las implementaciones privadas existentes. Cada operación exige admisión, MFA AAL2, sesión actual y propietario. No concede permisos de tabla ni permite ejecutar auxiliares internos desde el cliente. El listado devuelve el conjunto completo hasta el límite, sin el recorte previo a 50 fichas; por encima del límite falla explícitamente.

El guardado bloquea la fila, exige la revisión esperada y que esté activa y combina los campos en PostgreSQL. Conserva propietario, marcadores, tratamiento, campos desconocidos y precisión numérica. Solo las fichas nuevas permiten editar su alias; el servidor deriva de nuevo el nombre ficticio. Cada cambio conserva una versión y auditoría; si falla esta, se revierte todo. Las ediciones ajenas, archivadas o desfasadas se rechazan.

El archivo comparte el bloqueo de agenda por propietario con los cambios de citas y sesiones. Si queda cualquier cita programada, se rechaza: hay que cancelarla o registrar su sesión primero. Después se archiva sin borrar pacientes, citas, sesiones, versiones ni auditoría y la ficha queda en lectura. No hay eliminación ni reactivación en esta interfaz.

Los borradores solo viven en memoria, sin localStorage/sessionStorage. Abrir otra ficha conserva los borradores de las pestañas existentes. Cerrar o recargar con cambios pide confirmación y las copias se bloquean con cambios pendientes, incluidas las altas sin confirmar y las fichas de otras pestañas. La inactividad o pérdida de sesión limpia el contenido y una respuesta tardía no lo repuebla. Ante un guardado incierto se conserva el texto para contrastarlo con la versión guardada. Si se sigue escribiendo durante el guardado, ese texto queda como borrador posterior.

La copia v5 incluye todas las fichas ficticias (también una colección vacía), sus versiones, citas, sesiones, catálogo propio y auditoría; mantiene lectura y restauración de los archivos v1–v4. Las pruebas cubren alta idempotente, aislamiento, edición, conflictos, archivo con citas, rollback de auditoría, más de 50 fichas, límite de 500 y copia/restauración de un conjunto ampliado.

Este flujo prepara la gestión completa, pero continúa en modo ficticio. Faltan la identificación clínica definitiva, revisión de proveedores y obligaciones del responsable, custodia externa/operación de copias y validación final antes de permitir datos reales. La demo pública conserva sus funciones y sigue separada.

## Motivo de consulta y precauciones · 22 de noviembre de 2026

La migración `20261122090429_clinical_patient_intake_test.sql` amplía el mismo guardado privado con dos campos opcionales: `reason` (hasta 2 000 caracteres) y `precautions` (hasta 4 000). La interfaz los presenta como «Motivo de consulta ficticio» y «Antecedentes y precauciones ficticios», en texto libre. No genera pautas, diagnósticos ni supuestos de ausencia de antecedentes. No se mueve, resume o reemplaza lo ya escrito en historia/exploración. Los registros y versiones existentes no se reescriben al instalar la migración.

El servidor admite únicamente texto dentro de los límites y conserva las mismas comprobaciones de admisión, AAL2, sesión, propietario, ficha activa y revisión. Cada guardado combina los cambios en PostgreSQL y conserva versión/auditoría atómicas. Los campos vacíos pueden guardarse explícitamente; al cargar una versión que no los tenga se muestran vacíos sin provocar un guardado automático. Las fichas archivadas siguen en lectura.

Ambos campos participan en la detección de borradores, bloqueo de copias incompletas y limpieza al salir; los errores/conflictos conservan el texto. La copia continúa en v5: los campos son opcionales para admitir archivos/historiales anteriores, y se validan tipo/límite si están presentes. Los ensayos verifican su restauración en datos y servicios nuevos, incluida su lectura tras autenticar.

En esa entrega el titular había previsto disponer del servicio de protección de datos en diciembre de 2026; posteriormente indicó que puede adelantarlo a esta semana. El desarrollo individual continúa con datos ficticios; esa previsión no activa pacientes reales ni da por revisados contratos, operación o seguridad. La revisión manual de los dos campos nuevos en iPad queda pendiente.

## Identidad y modelo clínico · versión privada 15

El editor de prueba añade nombre, apellidos y nacimiento/teléfono/correo opcionales para ensayar con valores inventados; conserva el alias y su prefijo FICTICIO. Si la cuenta estuviera activada administrativamente, el alta usa identidad validada y un UUID estable, sin alias ni marcadores de prueba. Se permiten homónimos, con fecha/identificador en el listado. El nombre mostrado se deriva en servidor. No se han activado las cuentas alojadas; los datos anteriores se conservan.

El modo clínico integra los mismos circuitos de agenda/sesiones, archivo y auditoría, con copia v6. El código de nacimiento usa el día Europe/Madrid de la clínica. Los campos se limpian al salir y ante una denegación de acceso; errores de red y conflictos conservan borradores. El [procedimiento de activación](../CLINICAL_ACTIVATION.md) requiere decisiones pendientes y un conjunto limpio; la migración no convierte automáticamente el ejemplo en paciente real.
