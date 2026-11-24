# Agenda semanal privada

La agenda muestra lunes a viernes, de 08:00 a 20:00, con once filas ajustadas al alto útil del iPad y sin la fila de las 14:00. Usa el modelo que autorice el servidor: prueba o clínico. Las cuentas alojadas actuales siguen en prueba; el cambio de vista no activa pacientes reales.

## Uso

1. Entra con la cuenta y el autenticador. En Agenda, elige una fecha de la semana o usa Semana anterior, Semana siguiente y Esta semana.
2. Carga la semana o toca directamente una casilla. Antes de cargar, la pantalla indica que la disponibilidad no está consultada. Un toque vuelve a consultar la semana y prepara la fecha/hora; exige elegir un paciente activo antes de guardar. No se selecciona automáticamente el primero.
3. Confirma duración y paciente y guarda la cita. La duración sigue admitiendo 5–240 minutos en múltiplos de cinco. La cuadrícula es horaria; las citas a otros minutos o de varias horas ocupan todas las casillas que intersectan.
4. Toca una cita para abrir **Cita y tratamiento** en una pestaña nueva del navegador. La semana permanece en la principal. En la nueva pestaña puedes revisar la cita y registrar evolución, tratamiento pasivo y ejercicio terapéutico. **Guardar y cerrar pestaña** confirma los cambios de cita y sesión antes de cerrar; si hay un fallo o texto escrito durante la petición, conserva la pestaña y el borrador. Guardar una sesión nueva marca la cita realizada atómicamente. Cancelar libera el hueco y conserva la cita en el listado.
5. Las citas ya guardadas a las 14:00, en fines de semana o fuera del horario no se borran ni cambian. El aviso de citas fuera de cuadrícula y **Listado de citas guardadas** permiten abrirlas. La consulta conserva los siete días para no perder acceso a esos registros; las columnas siguen siendo solo lunes a viernes.

Las fechas se interpretan en `Europe/Madrid` y se guardan en UTC. La lectura incluye las citas que intersecten la semana, también si cruzan medianoche. Se mantienen el rechazo de horas ambiguas/inexistentes por DST, la prohibición de solapamientos activos, las revisiones esperadas, el paciente inmutable en citas existentes, la lectura de archivados y las restricciones de citas realizadas/canceladas.

## Lectura y escritura

`clinical_agenda_week(date)` devuelve límites lunes/viernes, pacientes activos y citas de la semana mediante un solo SELECT/MVCC y un evento `agenda.read`. Wrapper público invoker; implementación privada con admisión, AAL2, sesión vigente propia y propietario/modo. No añade tablas, permisos de cliente o controles de activación. El endpoint diario previo se conserva por compatibilidad. Crear/editar/cancelar y las sesiones siguen utilizando las operaciones existentes protegidas y auditadas.

El calendario vuelve a consultar al preparar una cita. Si otro dispositivo ha ocupado el hueco, actualiza la cuadrícula y pide pulsar la cita para abrir su pestaña, sin preparar un alta duplicada ni intentar una ventana después de una petición asíncrona; una carrera posterior queda protegida por el rechazo de solapamiento del servidor. Los borradores se conservan ante fallos de guardado y se pide confirmación antes de descartarlos al cambiar semana/casilla. Un fallo de carga conserva fechas y datos previos; la carga inicial fallida sigue indicando disponibilidad desconocida. Las respuestas tardías no reconstruyen contenido tras cerrar.

No hay datos de pacientes, búsquedas, borradores o tokens en localStorage/sessionStorage. La salida limpia cuadrícula/listado/editor. La pestaña principal conserva la única sesión autenticada; un puerto privado limita cada pestaña de tratamiento a la cita/paciente seleccionados. No se transfieren credenciales ni las otras citas de la semana. Cerrar la sesión/principal bloquea y limpia los tratamientos. Las copias y el aviso de salida detectan sus borradores y escrituras pendientes, incluso si se cierra una pestaña durante el guardado. Mantén abierta la principal. Las ventanas bloqueadas muestran una instrucción y no abren el editor debajo del calendario. La copia cifra citas, sesiones, sus versiones y auditoría junto con los demás registros; se conservan formatos v1–v6 según el modo de cuenta. No se cambia el procedimiento de restauración ni se importan calendarios externos.

## Catálogo y sesiones

En la sesión, **Buscar ejercicios del catálogo** combina los 130 nombres de referencia con ejercicios propios y permite filtrar nombre, modalidad y zona. Añade nombres al texto editable sin sustituir notas ni duplicar líneas; los nombres se conservan al guardar la sesión. La clasificación no asigna fases, dosis o indicaciones. El catálogo personal conserva revisión, archivo e historial; véase [Ejercicios propios](CUSTOM_EXERCISES.md).

## Verificación

La corrección del acceso desde el calendario añade diez casos de pestañas: cierre tras guardado/reapertura, conflicto y desconexión, cambio de semana con tratamiento, limpieza al salir, puerto limitado a una cita y sin credenciales, escritura durante el guardado, escritura pendiente tras cerrar la pestaña, ventanas bloqueadas y limpieza al entrar en el historial. La apertura desde el listado fuera de cuadrícula y el selector de varias citas también se comprueban como ventanas reales. La comprobación en Safari del iPad del titular queda pendiente tras publicar la corrección.

78 pruebas SQL/identidad/utilidades y la batería de interfaz con respuestas sintéticas, incluidos siete casos semanales: columnas/filas, toque/alta explícita, duración y cancelación, acceso fuera de cuadrícula, confirmación de borradores/teclado/geometría, errores/respuestas tardías y ocupación posterior a la primera lectura. Se comprueban 820×1180, 1180×820 y 390×844, con desbordamiento horizontal dentro del calendario y sin ensanchar la página.

Los ensayos v5/v6 con PostgreSQL, GoTrue y PostgREST reconstruyen el servicio y verifican la lectura semanal tras recuperar. La publicación comprueba ambos backends, activos y cabeceras por HTTPS. El entorno no dispone de navegador administrado para abrir el Site real; el ensayo automatizado usa datos sintéticos. La nueva agenda no se ha confirmado manualmente en Safari/iPad.

## Colores y espacio disponible

En «Tipo de visita», Primera visita usa azul suave, Seguimiento verde salvia y Gimnasio malva. La leyenda y las etiquetas permiten distinguirlos sin depender del color. Las citas antiguas sin tipo permanecen grises, sin adivinar su clasificación. El tipo es parte de la revisión de la cita y de las copias v5/v6; las citas realizadas mantienen el bloqueo de agenda anterior.

Los controles se compactan y las once filas ocupan el espacio de viewport disponible, con comprobaciones de última fila y ausencia de scroll interno en cuatro tamaños de iPad. El alta de citas nuevas conserva sus campos en la principal y permite cerrar la edición con confirmación de descarte. Las citas guardadas se abren en pestañas nuevas desde la cuadrícula, el listado y el selector de coincidencias; «Cerrar pestaña» pide confirmar si hay cambios. Cambiar la cita y su sesión a la vez mediante «Guardar y cerrar pestaña» guarda primero la cita y conserva el texto de tratamiento para el segundo guardado. Un fallo parcial conserva el borrador restante sin repetir el guardado confirmado. Varias citas en una misma hora se eligen mediante un diálogo accesible. En pantallas muy bajas o con texto ampliado se mantiene legibilidad.
