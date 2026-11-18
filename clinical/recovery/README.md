# Recuperación del servicio · ensayo ficticio

Esta entrega amplía la recuperación de datos a una prueba con **PostgreSQL, GoTrue (Supabase Auth) y PostgREST reales**, aislados en Docker. No utiliza sesiones/JWT de usuario simulados ni escribe filas en las tablas gestionadas de Auth. El proyecto habitual y la demo publicada permanecen intactos.

```sh
npm run test:recovery
npm run verify:service-recovery
```

El primer comando ejecuta cuatro pruebas locales de las protecciones del importador. El segundo necesita Docker y las tres imágenes fijadas por digest en `local-services.mjs`. Crea únicamente contenedores/redes con prefijo `mlrehab-recovery-source` o `mlrehab-recovery-target`; los elimina al finalizar, incluidos sus volúmenes anónimos. Usa puertos de loopback asignados dinámicamente. Las credenciales locales son aleatorias, efímeras y no se solicitan al propietario. El ensayo no envía correos; crea y confirma usuarios ficticios mediante la API administrativa local.

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

El [estado alojado](../verification/HOSTED_RECOVERY_STATUS.json) distingue lo verificado de lo pendiente: diez tablas de aplicación, once con RLS contando el marcador, cero permisos cliente y diecisiete RPC anónimos rechazados por HTTPS; esquema privado no expuesto. **No hay todavía usuarios Auth ni datos restaurados en este destino. No se presenta como recuperación alojada superada.**

La conexión MCP disponible administra la base, pero no ofrece Auth Admin API ni secretos administrativos. No se intenta obtenerlos mediante SQL, se insertan usuarios directamente en Auth ni se solicitan contraseñas/claves por chat.

### Paso manual pendiente

En el [panel de usuarios del destino](https://supabase.com/dashboard/project/wtlwhokxgskktjcqqtzn/auth/users), crear `recuperacion@example.invalid`, establecer/guardar allí una contraseña y marcar Auto Confirm User. Después cerrar las altas públicas en Authentication / Sign In–Providers, como en el proyecto habitual. Es una cuenta ficticia separada, no la cuenta habitual ni su autenticador de reserva.

Una vez exista esa identidad confirmada, el operador puede obtener **solo su UUID** mediante la administración y generar los fixtures con ese UUID:

```sh
node clinical/recovery/verify-services.mjs UUID_DEL_USUARIO_FICTICIO
```

El SQL desechable `work/service-recovery/synthetic-hosted-restore.sql` se dirige exclusivamente al destino aprobado. Debe ejecutarse administrativamente en ese proyecto y verificarse antes de admitir la cuenta; no es un endpoint público. Este ensayo vincula fixtures nuevos a una identidad ficticia conocida. No acredita recuperar una cuenta antigua perdida ni conocer la contraseña elegida por el propietario. La prueba real de MFA/acceso en el servicio alojado sigue pendiente y requerirá una pantalla de prueba conectada al destino, sin cambiar el acceso habitual.

Para una pérdida real de cuenta se necesita verificar la identidad del titular fuera de la aplicación y un operador con acceso administrativo autorizado. Si se recrea una identidad con UUID original mediante Auth Admin API, deben documentarse ese vínculo y el restablecimiento de contraseña/MFA. Este ensayo no resuelve la recuperación del panel del proveedor, correo ni una frase de copia perdida.

## Protecciones de restauración

- `schema.mjs` solo construye el esquema de aplicación; no copia roles o tablas ficticias de los tests. Rechaza un esquema existente y registra hashes de las migraciones.
- `restore-sql.mjs` acepta exclusivamente snapshots ficticios v4 validados. Las copias antiguas siguen abriéndose en la herramienta de datos, pero no se importan automáticamente por este procedimiento de servicio.
- Rechaza explícitamente el ref del proyecto habitual. Exige un marcador de destino concordante en fase `schema_ready`, aplicación vacía e identidad Auth confirmada. Todo se comprueba dentro de la transacción.
- Nombres/tablas/columnas son constantes; todos los valores se convierten en literales SQL escapados, incluidos backslashes, comillas, JSON y arrays. Una prueba inserta texto con apariencia de SQL y demuestra que sigue siendo texto.
- No concede admisión automáticamente. Solo marca `data_restored` cuando la comparación completa de las nueve colecciones ha pasado. Un destino ocupado o un reintento se rechaza; no mezcla ni sobrescribe datos.

Quedan pendientes recuperación alojada de extremo a extremo, SMTP, archivos/Storage, alojamiento de la interfaz, custodia externa/recuperación de claves, automatización, disponibilidad, revisión contractual y operación clínica. La reserva MFA independiente continúa aplazada por el propietario. El entorno sigue siendo ficticio.
