# Recuperación del servicio · ensayo ficticio

Esta entrega amplía la recuperación de datos a una prueba con **PostgreSQL, GoTrue (Supabase Auth) y PostgREST reales**, aislados en Docker. No utiliza sesiones/JWT de usuario simulados ni escribe filas en las tablas gestionadas de Auth. El proyecto habitual y la demo publicada permanecen intactos.

```sh
npm run test:recovery
npm run verify:service-recovery
```

El primer comando ejecuta seis pruebas locales de las protecciones del importador. El segundo necesita Docker y las tres imágenes fijadas por digest en `local-services.mjs`. Crea únicamente contenedores/redes con prefijo `mlrehab-recovery-source` o `mlrehab-recovery-target`; los elimina al finalizar, incluidos sus volúmenes anónimos. Usa puertos de loopback asignados dinámicamente. Las credenciales locales son aleatorias, efímeras y no se solicitan al propietario. El ensayo no envía correos; crea y confirma usuarios ficticios mediante la API administrativa local.

## Prueba automática completada

1. Reconstruir el esquema desde las nueve migraciones, con manifiesto SHA-256. Auth ejecuta sus propias migraciones.
2. Crear un usuario ficticio mediante Auth Admin API, con UUID elegido para el ensayo. Iniciar sesión con contraseña; comprobar que AAL1 se rechaza incluso estando admitido. Enrolar/verificar un TOTP real mediante Auth y obtener AAL2.
3. Crear fichas ficticias, cita, sesión y ejercicio con cambios/archivo a través de RPC reales. Exportar una copia v4, cifrarla y escribirla en disco.
4. Cerrar/eliminar el origen antes de iniciar un destino nuevo. Reconstruir esquema, roles/permisos y configuración de los componentes. Recrear la identidad con el mismo UUID, **contraseña nueva y MFA nuevo**, mediante APIs de Auth.
5. Descifrar el archivo en memoria y restaurar sus nueve colecciones en una transacción. La cuenta permanece deshabilitada en la admisión. PostgreSQL comprueba igualdad completa antes del commit; se vuelve a leer y comparar el hash SHA-256 desde Node.
6. Admitir la identidad ficticia ya verificada y comprobar RPC, agenda y sesión histórica. Rechazar anonimato, un JWT del origen y el mismo JWT del destino tras cerrar su sesión. Verificar las diez tablas con RLS y cero permisos de tabla de cliente.

El [informe](../verification/SERVICE_RECOVERY_REPORT.json) contiene hashes, recuentos, versiones inmutables de imágenes y resultados; no contiene contraseñas, claves ni TOTP. El tiempo observado es de este ensayo con imágenes ya descargadas, **no un RTO comprometido**. Los archivos de `work/service-recovery/` son desechables: el archivo cifrado usa una frase aleatoria solo en el proceso y el SQL contiene exclusivamente los fixtures generados. No son copias operativas del proyecto alojado ni admiten datos reales.

## Destino alojado preparado

El propietario autorizó la misma organización que MLREHAB y el coste consultado de **0/mes**. Se creó `MLREHAB recovery test`, ref `wtlwhokxgskktjcqqtzn`, en Frankfurt (`eu-central-1`). No se activaron pagos ni ramas con coste. Las nueve migraciones de aplicación se reconstruyeron en una transacción, con manifiesto, sin registros de aplicación. Otra migración instala el marcador privado `recovery_admin.destination`.

El [estado alojado](../verification/HOSTED_RECOVERY_STATUS.json) distingue lo verificado de lo pendiente: diez tablas de aplicación, once con RLS contando el marcador, cero permisos cliente y diecisiete RPC anónimos rechazados por HTTPS; esquema privado no expuesto. **Actualización: la identidad ficticia ya está confirmada y las nueve colecciones se han restaurado y verificado en el destino. El titular ya confirmó la lectura de los pacientes recuperados y el servidor confirma MFA y acceso. Las altas públicas ya están cerradas; esta fase de restauración y acceso está verificada, sin dar por resuelta toda la recuperación operativa del servicio.**

La conexión MCP disponible administra la base, pero no ofrece Auth Admin API ni secretos administrativos. No se intenta obtenerlos mediante SQL, se insertan usuarios directamente en Auth ni se solicitan contraseñas/claves por chat.

### Comprobación alojada verificada

El propietario ya creó y confirmó la cuenta ficticia. Se generaron los datos del ensayo asociados a su UUID y se repitió la prueba con servicios reales antes de importar. La restauración alojada superó las guardas y la igualdad completa dentro de la transacción: dos pacientes/cuatro versiones, una cita/dos versiones, una sesión/una versión, un ejercicio/tres versiones y doce eventos. El hash del marcador coincide con el de la copia de ensayo. Solo después se habilitó la admisión para esa cuenta confirmada; cada RPC continúa exigiendo AAL2 y sesión vigente.

Entra en el [acceso privado de recuperación](https://mlrehab-acceso-pruebas.mauvegem514.chatgpt.site/recovery/) con `recuperacion@example.invalid` y la contraseña guardada en tu gestor. La página está rotulada como recuperación y fija el correo ficticio. Si pide configurar MFA, corresponde únicamente a esa cuenta de ensayo; no cambia el factor habitual ni configura la reserva aplazada. Tras ver **Acceso de pruebas autorizado**, carga los pacientes y comprueba los dos registros ficticios recuperados. El titular confirmó que ve los pacientes recuperados. El servidor registró un factor verificado, una sesión AAL2 y una nueva lectura de pacientes después de la restauración (13 eventos frente a los 12 iniciales). La prueba de acceso y lectura queda verificada el 21 de noviembre de 2026.

El 21 de noviembre de 2026 se confirmó el cierre de las altas públicas mediante captura del propietario y consulta pública sin caché: `disable_signup=true`. El acceso por correo sigue habilitado y el acceso anónimo desactivado. El paso de configuración y el ensayo de acceso quedan cerrados. La lista de admisión y MFA siguen exigiéndose en cada operación.

El acceso habitual `/` conserva exactamente sus tres archivos compilados y su CSP apuntando al proyecto habitual. `/recovery/` usa el backend recuperado y una CSP que solo permite esa conexión. Ambas rutas permanecen en el mismo Site privado para el propietario, con no-store, bloqueo de marcos y sin guardar tokens en el navegador. La herramienta `build-access.mjs` conserva y repone los archivos de la entrada habitual incluso si falla la compilación; dos pruebas nuevas verifican esa protección y el rechazo de un backend no aprobado. Los tests del Worker y las seis respuestas HTTPS verifican rutas, headers y correspondencia con los artefactos. No se ha realizado QA automatizada del navegador del alojamiento; la comprobación manual está pendiente.

Este ensayo vincula fixtures generados a una identidad ficticia confirmada. No acredita recuperar una cuenta antigua perdida ni conocer la contraseña elegida por el propietario. El SQL de ensayo está bajo `work/` ignorado y el importador no permite repetir la carga sobre el destino ya ocupado.

Para una pérdida real de cuenta se necesita verificar la identidad del titular fuera de la aplicación y un operador con acceso administrativo autorizado. Si se recrea una identidad con UUID original mediante Auth Admin API, deben documentarse ese vínculo y el restablecimiento de contraseña/MFA. Este ensayo no resuelve la recuperación del panel del proveedor, correo ni una frase de copia perdida.

## Protecciones de restauración

- `schema.mjs` solo construye el esquema de aplicación; no copia roles o tablas ficticias de los tests. Rechaza un esquema existente y registra hashes de las migraciones.
- `restore-sql.mjs` acepta exclusivamente snapshots ficticios v4/v5 validados; v6 clínico requiere opción booleana administrativa explícita. Las copias antiguas siguen abriéndose en la herramienta de datos, pero no se importan automáticamente por este procedimiento de servicio.
- Rechaza explícitamente el ref del proyecto habitual. Exige un marcador de destino concordante en fase `schema_ready`, aplicación vacía e identidad Auth confirmada. Todo se comprueba dentro de la transacción.
- Nombres/tablas/columnas son constantes; todos los valores se convierten en literales SQL escapados, incluidos backslashes, comillas, JSON y arrays. Una prueba inserta texto con apariencia de SQL y demuestra que sigue siendo texto.
- No concede admisión automáticamente. Solo marca `data_restored` cuando la comparación completa de las nueve colecciones ha pasado. Un destino ocupado o un reintento se rechaza; no mezcla ni sobrescribe datos.

La restauración alojada de los fixtures, el acceso con MFA y la lectura por el titular están verificados. Quedan pendientes recuperación de identidad humana/proveedor, SMTP, archivos/Storage, alojamiento de la interfaz, custodia externa/recuperación de claves, automatización, disponibilidad, revisión contractual y operación clínica. La reserva MFA independiente continúa aplazada por el propietario. El entorno sigue siendo ficticio.

## Ampliación de fichas ficticias · copia v5

El esquema reconstruible actual contiene doce migraciones de aplicación. El nuevo ensayo local con Auth/PostgREST reales crea una tercera ficha mediante el alta idempotente, edita su alias, le vincula una cita/sesión y recupera las nueve colecciones v5 con hashes coincidentes y autorización comprobada. La espera de PostgreSQL utiliza el listener TCP final, para no confundir el servidor temporal de initdb con el servicio listo.

La restauración alojada inicial sigue siendo el ensayo v4 de dos pacientes: se conservan su hash, recuentos y evidencia de acceso. La nueva migración amplía el esquema de ambos proyectos sin repetir la importación, crear usuarios ni cambiar Auth. Las dos rutas privadas reciben la misma interfaz actualizada, con sus backends/CSP separados. El constructor de recuperación preserva los archivos recién compilados de la ruta habitual; esto no significa que una actualización funcional mantenga los bytes de una versión anterior del Site.

La ampliación de anamnesis añade dos textos opcionales a la ficha y la undécima migración actualiza únicamente la función de guardado. Se aplicó a ambos proyectos sin reimportar datos o cambiar Auth. El ensayo local actual verifica el motivo y las precauciones mediante lectura autenticada tras la restauración. El primer hash/recuentos de la restauración alojada v4 siguen siendo evidencia histórica y no se sustituyen por los del ensayo local vigente.

## Ensayo del modelo clínico

`npm run verify:clinical-service-recovery` utiliza los mismos servicios locales reales con un perfil clínico sintético y snapshot v6, sin marcadores de fixture. Prueba dos pacientes con el mismo nombre, alta idempotente, identidad/notas, agenda/sesión, copia cifrada, cierre del origen, reconstrucción de identidad/MFA y recuperación suspendida hasta verificar hash/admisión. Comprueba también suspensión con sesión vigente. El [informe separado](../verification/CLINICAL_SERVICE_RECOVERY_REPORT.json) distingue este ensayo del legado v5 y del primer ensayo alojado v4.

La restauración clínica requiere `allowClinical: true` y no permite el proyecto habitual ni un destino ocupado. La nueva tabla privada `mode_events` registra el control de admisión y no se copia como dato clínico. El esquema tiene once tablas de aplicación, doce con RLS contando el marcador del destino. Las cuentas alojadas siguen en test; no se ha repetido allí ninguna importación ni se ha habilitado el modelo clínico.
