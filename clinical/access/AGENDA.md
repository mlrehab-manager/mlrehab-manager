# Agenda semanal privada

La agenda muestra lunes a viernes, de 08:00 a 20:00, con filas horarias y sin la fila de las 14:00. Usa el modelo que autorice el servidor: prueba o clínico. Las cuentas alojadas actuales siguen en prueba; el cambio de vista no activa pacientes reales.

## Uso

1. Entra con la cuenta y el autenticador. En Agenda, elige una fecha de la semana o usa Semana anterior, Semana siguiente y Esta semana.
2. Carga la semana o toca directamente una casilla. Antes de cargar, la pantalla indica que la disponibilidad no está consultada. Un toque vuelve a consultar la semana y prepara la fecha/hora; exige elegir un paciente activo antes de guardar. No se selecciona automáticamente el primero.
3. Confirma duración y paciente y guarda la cita. La duración sigue admitiendo 5–240 minutos en múltiplos de cinco. La cuadrícula es horaria; las citas a otros minutos o de varias horas ocupan todas las casillas que intersectan.
4. Toca una cita para consultar/revisar sus datos o registrar evolución, tratamiento pasivo y ejercicio terapéutico. Guardar la sesión marca la cita realizada atómicamente. Cancelar libera el hueco; la cita cancelada continúa visible con su estado.
5. Las citas ya guardadas a las 14:00, en fines de semana o fuera del horario no se borran ni cambian. El aviso de citas fuera de cuadrícula y **Listado de citas guardadas** permiten abrirlas. La consulta conserva los siete días para no perder acceso a esos registros; las columnas siguen siendo solo lunes a viernes.

Las fechas se interpretan en `Europe/Madrid` y se guardan en UTC. La lectura incluye las citas que intersecten la semana, también si cruzan medianoche. Se mantienen el rechazo de horas ambiguas/inexistentes por DST, la prohibición de solapamientos activos, las revisiones esperadas, el paciente inmutable en citas existentes, la lectura de archivados y las restricciones de citas realizadas/canceladas.

## Lectura y escritura

`clinical_agenda_week(date)` devuelve límites lunes/viernes, pacientes activos y citas de la semana mediante un solo SELECT/MVCC y un evento `agenda.read`. Wrapper público invoker; implementación privada con admisión, AAL2, sesión vigente propia y propietario/modo. No añade tablas, permisos de cliente o controles de activación. El endpoint diario previo se conserva por compatibilidad. Crear/editar/cancelar y las sesiones siguen utilizando las operaciones existentes protegidas y auditadas.

El calendario vuelve a consultar al preparar una cita. Si otro dispositivo ha ocupado el hueco, abre la cita guardada y no prepara un alta duplicada; una carrera posterior queda protegida por el rechazo de solapamiento del servidor. Los borradores se conservan ante fallos de guardado y se pide confirmación antes de descartarlos al cambiar semana/casilla. Un fallo de carga conserva fechas y datos previos; la carga inicial fallida sigue indicando disponibilidad desconocida. Las respuestas tardías no reconstruyen contenido tras cerrar.

No hay datos de pacientes, búsquedas, borradores o tokens en localStorage/sessionStorage. La salida limpia cuadrícula/listado/editor. La copia cifra citas, sesiones, sus versiones y auditoría junto con los demás registros; se conservan formatos v1–v6 según el modo de cuenta. No se cambia el procedimiento de restauración ni se importan calendarios externos.

## Catálogo y sesiones

En la sesión, **Buscar ejercicios del catálogo** combina los 130 nombres de referencia con ejercicios propios y permite filtrar nombre, modalidad y zona. Añade nombres al texto editable sin sustituir notas ni duplicar líneas; los nombres se conservan al guardar la sesión. La clasificación no asigna fases, dosis o indicaciones. El catálogo personal conserva revisión, archivo e historial; véase [Ejercicios propios](CUSTOM_EXERCISES.md).

## Verificación

73 pruebas SQL/identidad/utilidades y la batería de interfaz con respuestas sintéticas, incluidos siete casos semanales: columnas/filas, toque/alta explícita, duración y cancelación, acceso fuera de cuadrícula, confirmación de borradores/teclado/geometría, errores/respuestas tardías y ocupación posterior a la primera lectura. Se comprueban 820×1180, 1180×820 y 390×844, con desbordamiento horizontal dentro del calendario y sin ensanchar la página.

Los ensayos v5/v6 con PostgreSQL, GoTrue y PostgREST reconstruyen el servicio y verifican la lectura semanal tras recuperar. La publicación comprueba ambos backends, activos y cabeceras por HTTPS. El entorno no dispone de navegador administrado para abrir el Site real; el ensayo automatizado usa datos sintéticos. La nueva agenda no se ha confirmado manualmente en Safari/iPad.
