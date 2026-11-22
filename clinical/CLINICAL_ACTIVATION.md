# Activación clínica · preparada, sin ejecutar

22 de noviembre de 2026. La versión privada 15 incluye el modelo clínico y las copias v6. Ambos proyectos alojados conservan sus cuentas en modo de prueba. No se han borrado ejemplos, creado cuentas, cambiado autenticadores ni autorizado pacientes reales.

## Qué está implementado

La ficha clínica usa nombre y apellidos, nacimiento/teléfono/correo opcionales y un UUID estable. Permite homónimos y muestra identificador/fecha en el listado para distinguirlos. El servidor normaliza y valida identidad, deriva el nombre mostrado y conserva las notas, revisión y auditoría. El alta con UUID de petición es idempotente. La fecha de nacimiento se valida respecto al día de la clínica en Europe/Madrid, también cuando la sesión de base o el dispositivo usan otra zona.

Agenda, sesiones, archivo sin borrado y catálogo propio conservan autorización por propietario y revisiones. Una cita programada impide archivar su ficha. No hay equipos, invitaciones ni compartición añadidos: el alcance sigue siendo un solo profesional desde sus dispositivos.

El modelo clínico no usa `testOnly` ni `fixture`. Su copia v6 conserva las nueve colecciones y se cifra en el dispositivo. Las copias v1–v5 de prueba siguen admitidas. Las pruebas de servicios reales locales usan personas inventadas con este formato clínico; no son datos reales ni una activación del proyecto alojado.

## Control del servidor

La migración `20261122093236_clinical_patient_model.sql` añade `data_mode` a la admisión privada, con valor inicial `test`, y `approval_reference`. No hay permisos de tabla cliente, RPC o botón para autoactivarse.

- `test`: conserva los registros de prueba y permite ensayar los campos de identidad con ejemplos inventados. El registro clínico se rechaza.
- `clinical`: exige referencia administrativa de la decisión. La primera activación requiere un conjunto vacío de pacientes, citas, sesiones, ejercicios y auditoría; no convierte ejemplos en historias. Las escrituras genéricas también exigen el modelo clínico validado.
- `suspended`: deniega todas las operaciones protegidas, incluidos los RPC anteriores y un token que aún sea válido en el proveedor. Una denegación explícita en la interfaz limpia fichas/borradores y vuelve al acceso.

Los cambios de modo se registran atómicamente en `mode_events`, privada, con RLS y denegación de clientes. `database_role` identifica el rol técnico ejecutor; no certifica la identidad humana ni una aprobación jurídica. Si el registro del cambio falla, se revierte. La referencia es un identificador de decisión, no un verificador automático de contratos.

Cada operación mantiene MFA AAL2, cuenta admitida/confirmada, sesión actual propia/vigente y máximo de ocho horas. Se toma un bloqueo compartido de la fila de admisión para coordinar operaciones con los cambios administrativos de modo. No se confía en `user_metadata` o en que la interfaz oculte controles.

Algunos RPC conservan el sufijo histórico `_test` por compatibilidad, pero seleccionan el conjunto según el modo del servidor. El nuevo `clinical_patient_register` es una entrada invoker dedicada. Las implementaciones privilegiadas permanecen en el esquema privado.

## Lo necesario antes de una decisión de activación

1. Cerrar la revisión concreta de condiciones/proveedores y las obligaciones aplicables al tratamiento sanitario. El titular indica ahora que puede contratar el servicio esta semana y confirmará estos días; no se da por confirmado. No es obligatorio esperar a diciembre si se resuelve antes.
2. Acordar destino/custodia de copias y frase, independencia frente a la cuenta de sincronización, frecuencia, retención, contingencia y recuperación de acceso. La descarga desde el iPhone ya confirmada no demuestra por sí sola toda esa recuperación. La reserva TOTP independiente sigue aplazada; no se exige volver a configurarla como única solución.
3. Preparar un conjunto clínico limpio con una decisión explícita sobre los datos de prueba. Se puede planificar conservar la cuenta/MFA actuales; este código no obliga a repetir el enrolamiento. Antes de cualquier limpieza se debe conservar/comprobar la copia de prueba, confirmar que no contiene historias reales y revisar la operación exacta. No se ejecuta borrado automático ni se mezclan fixtures con historias clínicas.
4. Validar el recorrido de salida, los límites y la contingencia y registrar la versión/configuración autorizadas. Solo entonces un operador autorizado cambia el modo con la referencia de decisión. Esa acción no está incluida en esta entrega.

No se publican comandos de activación directa ni se programa la fecha. Disponer de una referencia en la base no sustituye las decisiones anteriores, no certifica cumplimiento y no permite aplazar la protección necesaria hasta después de introducir datos reales.

## Copia y recuperación

El generador administrativo admite v6 únicamente con la opción booleana explícita `allowClinical: true`. Una cadena como `"false"` no habilita esa opción. Sigue rechazando el proyecto habitual y exige destino marcado/vacío, identidad confirmada y validación completa. El destino restaurado empieza suspendido y con admisión deshabilitada, hasta verificar igualdad/hash y autorizar su acceso.

Las nueve colecciones no incluyen Auth, secretos, configuración ni `mode_events`: la admisión y los controles del destino se reconstruyen por separado y no se conceden por importar un archivo. Las copias no se restauran sobre la base habitual como prueba ni se reimportan sobre el destino alojado ya ocupado.

Continúan los límites del exportador: 500 pacientes, 500 citas, 500 sesiones, 5 000 versiones de pacientes, 2 000 de cada recurso de agenda/catálogo, 10 000 eventos y 4 MiB de contenido, además de límites internos de historial. Al excederlos la exportación falla sin truncar. Debe evaluarse y vigilarse el crecimiento para el piloto; no se presenta como capacidad clínica ilimitada ni como copia automática. Free y sus pausas/continuidad requieren una decisión operativa.

La [revisión de proveedores](../docs/CLINICAL_PROVIDER_REVIEW.md), las [consultas preparadas](../docs/CLINICAL_VENDOR_QUESTIONS.md) y la [propuesta de copias](../docs/CLINICAL_BACKUP_OPERATIONS.md) siguen siendo entradas para esa decisión. No se han enviado mensajes ni aceptado condiciones o pagos en nombre del titular.
