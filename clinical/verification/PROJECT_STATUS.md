# Estado verificado · 22 de noviembre de 2026

La versión privada 15 incorpora identificación de pacientes, modelo clínico y copias v6, con activación administrada en servidor. Las cuentas alojadas siguen en modo `test`; el entorno actual admite solo pruebas con datos inventados. No se han activado pacientes reales. El titular es autónomo individual en España y usará la app él solo desde iPad/ordenador. La demo pública permanece separada.

## Instalación y permisos

Aplicadas doce migraciones a ambos proyectos de pruebas. La última, `20261122093236_clinical_patient_model.sql`, conserva los ejemplos y las funciones existentes, añade modo de cuenta y un registro privado de transiciones. No se ha vuelto a importar la copia del proyecto de recuperación ni se han cambiado Auth, factores, registros de pacientes o facturación.

La comprobación administrativa posterior muestra en cada proyecto: once tablas de aplicación, once con RLS, veinte RPC públicos invoker, cero funciones públicas definer y cero permisos cliente de tabla. Una cuenta en modo test, cero referencias de aprobación y cero eventos de cambio de modo. El destino tiene además su marcador privado con RLS. No se han leído los textos de las fichas alojadas para esta comprobación.

Las veinte peticiones RPC anónimas de cada proyecto se rechazan por HTTPS con 401/42501; el esquema privado devuelve 406/PGRST106. Los asesores de seguridad solo mantienen el aviso conocido de protección contra contraseñas filtradas desactivada; [documentación y disponibilidad del proveedor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se ha activado facturación ni ocultado el aviso. Su tratamiento sigue pendiente de la revisión de producción.

## Circuito y activación

Identificación, homónimos/UUID, alta idempotente, revisión/auditoría, agenda/sesiones y archivo ya funcionan con el modelo clínico en los ensayos. Los campos de identidad también se pueden practicar en el editor ficticio. El modo verificado por la API controla el comportamiento de la interfaz; no hay selector cliente para habilitar datos reales.

Primera activación clínica: referencia de decisión y conjunto vacío; no mezcla ejemplos con historias. Suspensión: deniega todos los puntos protegidos y limpia el contenido ante una denegación explícita. Las referencias/eventos son control administrativo, no una certificación de identidad humana o cumplimiento. El [procedimiento preparado](../CLINICAL_ACTIVATION.md) distingue implementación, decisión y pendientes.

## Copias y pruebas

Se conservan v1–v5 de prueba y se añade v6 `mlrehab-clinical-snapshot` con `data_mode: clinical`, sin marcadores de fixture. Cifrado/propietario/referencias/revisiones/auditoría se validan y las nueve colecciones se recuperan con hashes coincidentes. La restauración administrativa clínica requiere `allowClinical: true` explícito y arranca suspendida, sin admisión. No cambia el alcance de Auth, secretos o configuración excluidos de la copia.

Validación: 62 pruebas SQL/identidad, 65 de interfaz con respuestas sintéticas, 12 de cifrado y seis de recuperación superadas. El [ensayo clínico con servicios](CLINICAL_SERVICE_RECOVERY_REPORT.json) reconstruye PostgreSQL, GoTrue y PostgREST locales con imágenes fijadas, origen cerrado, identidad/MFA recreados, dos pacientes homónimos, sesión y nueve colecciones v6. Comprueba integridad, admisión inicial cerrada, suspensión y tokens de origen/sesión cerrada rechazados. Todos los datos son sintéticos. El [ensayo legado](SERVICE_RECOVERY_REPORT.json) conserva también la recuperación v5 y el [ensayo de datos](BACKUP_RESTORE_REPORT.json) documenta la restauración aislada previa. No se equiparan a recuperación total de identidad humana/proveedor o a RPO/RTO garantizados.

## Publicación privada

Site solo para el propietario, versión 15, commit privado `84f58dd53ce42e0f67350f4ba7811f0b24072463`, despliegue `appgdep_6b02be19df8481919afc7f0069d55168`, completado. Entrada habitual: https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site . Se conserva `/recovery/` con su backend/CSP independiente. La audiencia sigue siendo una cuenta propietaria, sin grupos o editores.

El Worker comprueba rutas, separación de backends/CSP, redirección, HEAD y rechazo de escritura. Las seis respuestas HTTPS coinciden con sus artefactos y conservan no-store, no-referrer, nosniff, DENY y frame-ancestors. No hay navegador administrado disponible para QA del Site alojado; la batería de interfaz se ejecuta localmente con respuestas simuladas. La prueba manual de identidad añadida en esta versión queda pendiente.

## Evidencia del titular y siguiente decisión

[MANUAL_CHECKS.json](MANUAL_CHECKS.json) registra las pruebas manuales confirmadas hasta la versión 14: creación/guardado/reapertura, motivo/precauciones, copia verificada en iPad y archivo en iCloud descargable desde iPhone. No afirma descifrado en iPhone o recuperación de su cuenta. La agenda actual está en Calendario del iPhone; no se ha accedido o importado.

El titular puede adelantar la revisión/contratación de protección de datos a esta semana y confirmará estos días; diciembre deja de ser una espera del desarrollo. Siguen pendientes condiciones/proveedores, custodia/continuidad y elección de conjunto clínico limpio/activación. La reserva MFA independiente continúa aplazada. El entorno se recuperó tras una interrupción; el [punto de reanudación](CLINICAL_MODEL_WORK_IN_PROGRESS.md) se conserva como historial y ya no describe un bloqueo activo.
