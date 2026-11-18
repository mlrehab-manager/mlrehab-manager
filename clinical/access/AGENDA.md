# Agenda y sesiones privadas · prueba ficticia

La pantalla privada incorpora una agenda por día y una tira semanal táctil. Guarda únicamente citas de los pacientes activos del conjunto ficticio existente. No importa datos del calendario público, no crea identidades ni permite introducir pacientes reales.

1. Entra con tu cuenta y el autenticador habitual. En **Agenda y sesiones ficticias**, elige el día y pulsa **Nueva cita ficticia**.
2. Selecciona el paciente ficticio, fecha/hora de la clínica y duración (5–240 minutos, múltiplos de cinco). Guarda la cita.
3. Abre una cita para reprogramarla, cancelarla o registrar evolución, tratamiento pasivo y ejercicio terapéutico. Guardar una sesión marca la cita como realizada de forma atómica.
4. Vuelve a abrir la cita para consultar o revisar la sesión. Para comprobar persistencia entre dispositivos, sal y entra de nuevo con tu cuenta.

Todos los horarios se interpretan en `Europe/Madrid`, aunque el dispositivo esté en otra zona. La base conserva UTC. Las citas que cruzan medianoche aparecen en ambos días. Se rechazan horas inexistentes o ambiguas por cambio estacional. El servidor serializa las modificaciones de agenda de un mismo profesional y rechaza solapamientos con citas programadas o realizadas; las citas contiguas sí se admiten. Cancelar libera el horario. No se permite cambiar el paciente de una cita existente.

Cada modificación exige la revisión esperada y crea versión y auditoría en la misma transacción. Una respuesta de conflicto o de red conserva el borrador; **Cargar cita y sesión guardadas** requiere confirmar su descarte. Ante una respuesta incierta, consultar antes de reintentar evita duplicados. No hay eliminación física. Las citas realizadas no se reprograman; la sesión sí puede revisarse. Las canceladas no admiten sesión y los pacientes archivados son de solo lectura.

Las cuatro entradas nuevas tienen wrappers públicos SECURITY INVOKER, implementaciones privadas y comprobaciones de cuenta admitida, sesión vigente AAL2, propietario y conjunto ficticio. No hay acceso de tabla para clientes. Los cuatro nuevos historiales/tablas tienen RLS restrictiva. La auditoría incorpora tipo e identificador de entidad, sin copiar los textos de la sesión.

Los borradores viven en memoria, sin localStorage/sessionStorage. Se avisa antes de descartarlos al navegar o salir manualmente y se bloquea la copia mientras haya cambios pendientes. Al expirar la sesión se limpian sin persistir. Las respuestas tardías no repueblan la pantalla tras salir.

La copia versión 2 incluye citas, sesiones y sus historiales, además de fichas, versiones y auditoría. Se siguen aceptando los archivos versión 1 anteriores. El ensayo de restauración reconstruye las siete colecciones en una base nueva y compara hashes; no restaura sobre Supabase conectado ni reconstruye Auth/configuración del servicio.

Validación: 27 pruebas SQL, 42 de navegador con respuestas sintéticas y 12 de cifrado/restauración; ensayo desde archivo cifrado con el origen cerrado. Las comprobaciones HTTPS del alojamiento verifican archivos compilados y cabeceras. El propietario confirmó la prueba manual de agenda/sesiones; queda pendiente comprobar el nuevo selector de ejercicios en Safari/iPad. Los informes privados siguen pendientes. Sigue siendo un entorno de pruebas, sin habilitación clínica.

## Catálogo en el texto de ejercicio terapéutico

Dentro de la sesión, abre **Buscar ejercicios del catálogo**. Reutiliza los 130 nombres actuales de `assets/exercise-catalog.js`, sin cambiar la demo ni descargar datos de terceros. La compilación incorpora ese archivo de referencia; el repositorio del alojamiento conserva la misma copia. Permite buscar sin tildes y combinar zona corporal con isométricos, dinámicos combinados/concéntricos/excéntricos, pliometría u otros. Muestra 24 coincidencias por vez y permite afinar la búsqueda. Las etiquetas organizan los nombres; no asignan fases, dosis ni indicaciones automáticamente.

Pulsar un nombre añade una línea al texto de la sesión, conserva las notas previas y evita repetir un nombre que ya figure como línea. Puedes editarlo, eliminarlo o escribir nombres nuevos manualmente en ese mismo texto. Los filtros no eliminan nombres añadidos. Enter en el buscador no guarda la sesión. Se respeta el límite de 4 000 caracteres y el bloqueo de sesiones canceladas/pacientes archivados.

Los nombres se guardan únicamente al pulsar **Guardar sesión ficticia**, mediante el RPC existente con revisión esperada. Son parte del campo `exercise`, de sus versiones/auditoría y de la copia cifrada versión 2, sin nuevas tablas, permisos ni migraciones. Las entradas manuales pertenecen al texto de esa sesión: todavía no amplían un catálogo personal compartido entre sesiones. Tampoco se importan ajustes o nombres personales de la demo pública. La ampliación de un catálogo personal privado queda para un incremento posterior.

Las cinco pruebas nuevas de navegador verifican filtros combinados sin red (incluido Enter), conservación/reapertura de texto manual y nombres, duplicados, borradores/copia, límite de tamaño/cancelación y limpieza al cerrar por inactividad. No se almacenan búsquedas ni texto de sesiones en el navegador.
