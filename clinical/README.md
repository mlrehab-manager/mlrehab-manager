# Preparación de la versión clínica · fase 1

**Estado: base de desarrollo, no apta aún para datos reales.** La demo publicada no se modifica ni se conecta a esta base. El usuario ya ha creado y conectado un proyecto gratuito de pruebas. Las tres migraciones se han instalado y verificado; se ha admitido exclusivamente la cuenta Auth creada por el usuario y se ha comprobado el cierre del registro. No se han activado pagos. Consulta [el estado verificado](verification/PROJECT_STATUS.md).

Contexto confirmado: un profesional desde iPad y ordenador, consulta en la Comunitat Valenciana, España, preferencia por comenzar gratis. La forma jurídica del centro, el responsable del tratamiento y sus obligaciones concretas quedan por confirmar; un único usuario no determina esas cuestiones.

## Qué se ha preparado

`migrations/001_private_patients.sql` y `002_private_rpc_boundary.sql` contienen una primera API de pacientes para un proyecto Supabase de pruebas vacío:

- Sin acceso por defecto: la cuenta debe incorporarse a una lista privada por un administrador; no existe alta ni autoasignación de permisos desde la API.
- Todas las operaciones requieren identidad verificada del proveedor, cuenta habilitada y nivel MFA `aal2`. La tercera migración (`20261111181241_clinical_session_guard.sql`) añade comprobación de sesión actual contra `auth.sessions`, máximo de ocho horas, caducidad del proveedor y cuenta confirmada sin bloqueo. No concede acceso de tabla al cliente.
- Tablas privadas sin permisos de cliente y RLS con denegación restrictiva explícita. Las funciones públicas son SECURITY INVOKER y llaman implementaciones privadas con privilegios controlados, que vuelven a comprobar identidad y propietario en cada consulta. Cada función fija su `search_path` y no utiliza SQL dinámico.
- Listado paginado de resúmenes, lectura individual, creación, actualización con revisión esperada y archivo sin borrado físico.
- Versiones de las modificaciones y registro atómico de accesos/operaciones correctas con identificadores, acción, revisión y hora. No se duplican nombres o textos clínicos en el registro de auditoría. Si el registro de auditoría falla, la operación no se confirma.
- El cliente no puede leer ni modificar las tablas de auditoría/versiones, ni admitirse a sí mismo. Un administrador de la base conserva privilegios técnicos: esto no es un registro inalterable frente al administrador.

La validación del `payload` es todavía inicial: objeto, nombre limitado y tamaño máximo de 1 MiB. No sustituye el esquema clínico completo, las reglas de citas, la gestión documental ni la validación futura de cada campo.

## Propuesta de proveedor y límite del plan gratuito

Supabase se propone como candidato por PostgreSQL, autenticación/MFA y disponibilidad de región de base en la UE. **No está elegido contractualmente ni aprobado para producción.** Antes de crear el entorno clínico hay que revisar el contrato/DPA, los subencargados, el acceso de soporte, las transferencias y las condiciones para datos de salud. Alojar la base en la UE no demuestra por sí solo que todo tratamiento o acceso quede en la UE.

A 11 de noviembre de 2026, el [plan Free](https://supabase.com/pricing) anuncia 500 MB de base de datos, pausa tras una semana sin actividad y ausencia de copias automáticas. La [documentación de copias](https://supabase.com/docs/guides/platform/backups) recomienda exportaciones externas en Free. Por tanto, empezamos gratis con pruebas ficticias. El uso real queda pendiente de implementar y ensayar recuperación, disponibilidad y operación; un plan de pago tampoco las garantiza por sí solo. No se activa facturación.

## Ejecutar las pruebas locales

```sh
npm ci
npm run test:clinical
```

Las pruebas ejecutan el SQL en PostgreSQL embebido con PGlite. Se simulan `auth.users`, `auth.uid()` y `auth.jwt()` solo en el entorno de pruebas; las migraciones no contienen esa simulación. No hay contraseñas ni tokens reales.

Se prueban anonimato, cuenta no admitida, ausencia de doble factor, separación entre usuarios, acceso directo denegado, revocación de cuenta y sesión, caducidad y límite de ocho horas, bloqueo, conflicto de revisiones, conservación de versiones, archivo, paginación y fallo de auditoría. Una concesión accidental de lectura sigue sin permitir filas por RLS. Se han verificado en Supabase alojado los permisos, la ausencia de exposición del esquema privado y el rechazo de peticiones anónimas. El propietario ha completado el enrolamiento MFA real. **Quedan pendientes la confirmación del nuevo RPC con su JWT real, revocación de extremo a extremo, recuperación, cifrado del proveedor, copias/restauración y aplicación clínica completa.**

## Aplicación futura en un proyecto de pruebas

No ejecutar la migración contra un proyecto con datos ni copiar historias reales a este repositorio. Es una migración inicial, deliberadamente no idempotente: ante un error se revierte la transacción y se investiga; no se eliminan tablas para repetirla.

1. Crear un proyecto de pruebas vacío en una región UE y guardar fuera del repositorio sus datos administrativos y credenciales. Verificar la región concreta, las condiciones y el DPA disponibles para la cuenta.
2. Aplicar las tres migraciones en orden como propietario administrativo; ya están instaladas en el proyecto conectado y no deben repetirse allí. Mantener `clinical_private` fuera de los esquemas expuestos de la API. No habilitar Realtime ni permisos de tablas privadas.
3. Desactivar altas públicas, crear/invitar únicamente la cuenta del profesional por el procedimiento del proveedor y configurar MFA. Las invitaciones y el correo requieren configuración y prueba; este trabajo no envía mensajes.
4. Admitir manualmente el UUID de esa cuenta en `clinical_private.authorized_clinicians` desde la administración. No hay UUID real ni usuario autorizado en la migración. Mantener también MFA y acceso mínimo en la cuenta administradora del proveedor.
5. Ejecutar pruebas reales con dos cuentas ficticias, anonimato, MFA incompleto, cuenta revocada y peticiones HTTP manipuladas. Verificar privilegios efectivos y configuración de esquemas en el proyecto, no solo el SQL local.
6. Conectar después una interfaz clínica separada, sin usar `save()` ni `localStorage` de la demo. No existe todavía esa integración ni un botón para activar modo clínico.

Nunca colocar `service_role`, contraseña de PostgreSQL, token administrativo, claves de copia o credenciales de sesión en JavaScript público, GitHub, chat o archivos de ejemplo. La URL y una clave publicable no son contraseñas, pero solo se utilizarán en una integración revisada con permisos de servidor efectivos.

## Antes de permitir datos reales

El [plan clínico](../docs/CLINICAL_SECURITY_PLAN.md) y el [mapa de riesgos](../docs/CLINICAL_THREAT_MODEL.md) identifican el trabajo pendiente. La [pantalla de autenticación/MFA](access/README.md) ya está alojada en un sitio privado separado, con cabeceras HTTPS verificadas. El siguiente bloque concreto es probar con el propietario la sesión y el MFA reales. La entrada clínica sigue bloqueada mientras falten la migración del resto de funciones y la recuperación probada.
