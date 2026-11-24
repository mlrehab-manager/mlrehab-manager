# Puesta en marcha · revisión de cierre

23 de noviembre de 2026. Solicitud del titular: cerrar los pendientes para trabajar con MLREHAB. Alcance: fisioterapeuta autónomo individual en España, desde iPad y Windows. La aplicación privada publicada sigue en versión 19 y el perfil habitual permanece en modo de prueba.

## Comprobado y cerrado en esta revisión

Se han consultado de nuevo ambos proyectos, su configuración de permisos y el acceso del Site. La [evidencia agregada](../clinical/verification/CLOSING_REVIEW.json) contiene fecha, recuentos y límites, sin contenido de fichas, archivos o secretos.

- Ambos proyectos están operativos en Frankfurt. La organización mantiene Free; no hay cambio de facturación.
- Cada proyecto tiene doce tablas de aplicación con RLS, cero permisos cliente de tabla, veinticuatro RPC públicos invoker y cero definer públicos.
- El Site conserva un solo propietario, sin editores o grupos, y la versión 19. La demo pública continúa separada.
- El código de aplicación revisado tiene CI correcta y ensayos v5/v6 de recuperación de nueve colecciones con hashes coincidentes. Esto no verifica el archivo concreto del titular.
- Se ha identificado el contrato de alojamiento correspondiente a su cuenta personal Plus/Pro. La [revisión documental](CLINICAL_PROVIDER_REVIEW.md) distingue este contrato del chat de desarrollo.

El único aviso del asesor de seguridad continúa siendo [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Se registra como limitación conocida; no se presenta como habilitada ni se cambia de plan.

## Proveedores: la decisión concreta pendiente

Los textos aplicables y los flujos ya están identificados. El DPA estándar de Supabase se incorpora a su acuerdo de servicio y existe un DPA de Sites para planes personales; no se deja pendiente una compra genérica de «protección» ni se exige Business por defecto.

Falta documentar la adecuación al caso sanitario: encaje del apartado 4(d) de Supabase, información/base aplicable al paciente, salvaguardas de transferencias y destino de custodia. La [AEPD](https://www.aepd.es/preguntas-frecuentes/16-salud/2-profesionales-sanitarios/FAQ-1635-es-necesario-que-el-medico-o-el-centro-sanitario-solicite-el-consentimiento-a-los-pacientes-para-tratar-sus-datos-personales) distingue asistencia sanitaria, consentimiento e información; añadir una casilla no resuelve por sí solo la cláusula contractual. La duda acotada está redactada en [las consultas preparadas](CLINICAL_VENDOR_QUESTIONS.md), sin enviar.

La decisión puede apoyarse en una aclaración del proveedor o una revisión competente del responsable; no se exige una respuesta comercial o contratar una asesoría concreta como trámite universal. Las obligaciones del tratamiento y las dudas materiales siguen pendientes de resolver, sin certificarlas desde el código.

## Copias: ensayo desde iPad y Windows completado

La [rutina](CLINICAL_BACKUP_OPERATIONS.md) ya fija copia manual tras jornadas con cambios, verificación, rotación y restauración aislada. La propuesta para datos clínicos es un archivo cifrado en almacenamiento local protegido fuera de sincronización y una frase separada recuperable. Windows es el dispositivo propuesto, no una exigencia ligada a ese sistema operativo. Otro dispositivo protegido o soporte externo independiente puede servir si se comprueban sus condiciones y recuperación.

El titular confirma que puede recuperar la frase aunque pierda el iPad. El 23 de noviembre utiliza Windows y guarda una segunda comprobación a las 17:07 de Madrid (16:07 UTC), con destino «Carpeta local del ordenador». Coinciden propietario, huella del archivo cifrado y evento de exportación con la comprobación del iPad del día 22. Las declaraciones de copia independiente, frase separada y otro dispositivo están marcadas. El ensayo del mismo archivo ficticio v5 queda completado como recorrido del titular respaldado por esos registros; la ubicación física es su declaración y no una inspección del agente.

Conservar el archivo ya comprobado en sus destinos y la frase separada. La [rutina definida](CLINICAL_BACKUP_OPERATIONS.md) se aplicará a las jornadas con cambios. La adecuación del destino clínico y de los proveedores sigue pendiente; esta comprobación no restaura el servidor ni aprueba el uso clínico de iCloud.

## Operación de transición preparada para revisar

La operación propuesta conservaría cuenta, contraseña y autenticador actuales, así como el catálogo general incluido en el código. Retiraría exclusivamente el conjunto de pruebas del titular del proyecto habitual después de conservar y comprobar su copia. El destino de recuperación y la demo pública quedarían fuera de esa operación.

Recuentos observados a las 15:52 UTC del 22 de noviembre; deberán coincidir de nuevo antes de cualquier ejecución:

| Colección del conjunto habitual      | Registros actuales | Resultado propuesto |
| ------------------------------------ | -----------------: | ------------------: |
| Pacientes                            |                  3 |                   0 |
| Versiones de pacientes               |                  8 |                   0 |
| Citas                                |                  3 |                   0 |
| Versiones de citas                   |                  6 |                   0 |
| Sesiones                             |                  1 |                   0 |
| Versiones de sesiones                |                  1 |                   0 |
| Ejercicios propios                   |                  0 |                   0 |
| Versiones de ejercicios              |                  0 |                   0 |
| Auditoría de ese conjunto de pruebas |                 64 |                   0 |

El titular confirma expresamente el 22 de noviembre que todos los registros actuales son inventados. Se registra esta declaración por separado de los marcadores de fixture y de las consultas administrativas. El mismo archivo ya se ha comprobado en iPad y Windows; quedan la revisión de proveedores y la revisión del alcance destructivo antes de ejecutar la propuesta. Los recuentos anteriores preceden a la nueva exportación y deberán revalidarse, incluida la auditoría y cobertura de la copia, antes de presentar la operación para ejecución.

La propuesta de retirada no se ha ejecutado ni se considera autorizada por pedir una revisión de cierre. Una vez resueltas las condiciones y la custodia, el titular revisará el alcance destructivo concreto. La operación administrativa deberá bloquear la admisión durante la transacción, revalidar el conjunto y registrar la decisión de activación. El perfil solo pasará a modo clínico con conjunto vacío y referencia de decisión; el código no lo activa automáticamente.

La reserva MFA independiente continúa aplazada por el titular. No se ha accedido al Calendario del iPhone, enviado mensajes a proveedores o aceptado nuevos contratos. La versión de aplicación no cambia por esta revisión documental.
