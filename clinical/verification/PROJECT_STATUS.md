# Estado verificado · 21 de noviembre de 2026

El acceso privado permite crear, buscar, editar y archivar fichas ficticias, gestionar citas/sesiones y ejercicios propios y exportar/comprobar copias cifradas. El propietario es autónomo individual en España y utiliza iPad y ordenador. El entorno sigue siendo de pruebas: no admite uso con pacientes reales y la demo pública 0.11 continúa separada.

## Base y permisos

Aplicadas las diez migraciones de `clinical/migrations` al proyecto habitual y al destino independiente de recuperación. La última, `20261121095456_clinical_patient_workflow_test.sql`, amplía el flujo de pacientes y la copia v5. No se ha repetido la importación en el destino ocupado ni se han cambiado cuentas, factores, configuración Auth o datos existentes durante esta actualización.

Ambos proyectos conservan diez tablas de aplicación con RLS, cero permisos cliente de tabla y diecinueve RPC públicos SECURITY INVOKER sin funciones públicas privilegiadas. Los auxiliares internos no son ejecutables por el cliente. Cada operación exige admisión, cuenta confirmada sin bloqueo, MFA AAL2 y sesión actual propia, vigente y menor de ocho horas. El destino tiene además el marcador privado de restauración (once tablas con RLS en total).

Las diecinueve peticiones RPC anónimas a cada proyecto se rechazan por HTTPS con 401/42501. La solicitud del esquema privado devuelve 406/PGRST106. Los metadatos posteriores a la migración mantienen los recuentos existentes: habitual dos pacientes/seis versiones/29 eventos; recuperación dos pacientes/cuatro versiones/13 eventos. No se leyó el texto de sus fichas ni se crearon fixtures alojados para probar esta mejora.

Los asesores de seguridad de ambos proyectos solo advierten de protección contra contraseñas filtradas desactivada. Según la [documentación del proveedor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), requiere Pro o superior. No se oculta el aviso ni se activa facturación; sigue pendiente para evaluar producción. Rendimiento únicamente informa de índices aún sin uso (uno en habitual, tres en recuperación), conservados para unicidad y consultas/referencias previstas; [explicación del proveedor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Flujo y copias

El alta recibe un alias ficticio, deriva el prefijo FICTICIO y registra versión/auditoría atómicas. Un UUID estable permite reintentar una petición sin duplicarla. La edición conserva campos desconocidos y precisión numérica en servidor y comprueba revisión/propietario/estado. El archivo conserva los historiales y comparte el bloqueo de agenda: se rechaza mientras haya citas programadas. El listado y las copias admiten de cero a 500 fichas sin recortes silenciosos.

La copia v5 incluye las mismas nueve colecciones y admite las altas nuevas junto con los ejemplos originales. Exportar no crea pacientes. Se conservan descifrado, validación y restauración aislada de v1–v4. Tokens y borradores solo viven en memoria; cierre, inactividad y respuestas tardías están protegidos. El alta pendiente también bloquea una copia que omitiría ese borrador.

Validación local de esta revisión: 45 pruebas SQL, 56 de navegador con respuestas sintéticas, 12 de cifrado/formato y seis de recuperación. El [ensayo de datos](BACKUP_RESTORE_REPORT.json) recupera tres pacientes/seis versiones y las nueve colecciones desde disco tras cerrar el origen, con hash coincidente. El [ensayo de servicios](SERVICE_RECOVERY_REPORT.json) reconstruye PostgreSQL, GoTrue y PostgREST reales en contenedores nuevos: alta idempotente y alias revisado de una tercera ficha, sesión vinculada, contraseña/MFA nuevos, igualdad/hash, AAL1/anonimato rechazados, admisión deshabilitada hasta comprobar y rechazo de token del origen y de sesión cerrada. La espera local de PostgreSQL se corrigió para comprobar el listener TCP final, evitando el servidor temporal de initdb.

## Alojamiento privado

Site solo para el propietario, versión 13, commit privado `b7eb3b7a9dc8460df0eac57f84ed13f18a26b355`, despliegue `appgdep_6b016f325a048191b6fe2404a1366f69`, completado. La entrada habitual es https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site y la recuperada `/recovery/`. Ambas incorporan la interfaz actualizada, cada una con CSP limitada a su backend. No se cambió la audiencia ni se añadieron editores/grupos.

El Worker supera rutas, independencia de backends/CSP, redirección, HEAD y rechazo de escritura. Las seis respuestas HTTPS coinciden exactamente con sus artefactos compilados y mantienen no-store, no-referrer, nosniff, DENY, frame-ancestors y permisos de dispositivos desactivados. No hay herramienta de navegador administrado disponible para QA del Site alojado; las pruebas automatizadas de interfaz se ejecutan localmente con respuestas sintéticas. La prueba manual de las funciones nuevas en Safari/iPad queda pendiente.

## Recuperación alojada y límites

El ensayo alojado inicial usó una copia v4 de dos pacientes y nueve migraciones. La identidad ficticia confirmada se restauró con igualdad completa antes de habilitar su admisión; el titular confirmó acceso con MFA y lectura. Las altas públicas quedaron cerradas y verificadas mediante captura y consulta pública sin caché el 21 de noviembre de 2026. [HOSTED_RECOVERY_STATUS.json](HOSTED_RECOVERY_STATUS.json) conserva el hash/recuentos originales y distingue la posterior actualización de esquema de una nueva restauración. No se ha vuelto a importar la copia.

Este ejercicio no demuestra recuperación de una identidad humana perdida o de la cuenta del proveedor. Siguen pendientes revisión contractual/jurídica de proveedores/alojamiento, identidad/campos clínicos definitivos, custodia externa de copias y frases, continuidad/automatización y validación final. El plan gratuito no garantiza disponibilidad ni copias automáticas. La reserva MFA independiente continúa aplazada por el propietario; no se ha vuelto a configurar ni exigir. No se habilita modo clínico por superar estas pruebas.
