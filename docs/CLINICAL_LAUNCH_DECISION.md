# Puesta en marcha · estado tras preparar el modelo clínico

22 de noviembre de 2026. El titular necesita empezar cuanto antes, será el único usuario y lleva la agenda actual en Calendario del iPhone. No se ha consultado ni importado ese calendario ni se presume dónde guarda historias anteriores.

**El modelo clínico y sus copias están implementados y ensayados, pero las cuentas alojadas permanecen en prueba.** No se confirma una puesta en marcha para mañana ni se cambia el aviso para dar por habilitados pacientes reales. La versión privada actual es la 15.

## Trabajo técnico completado

- Identificación validada en servidor/cliente, nombre derivado, UUID e idempotencia; homónimos admitidos.
- Historia, notas, agenda/sesiones, archivo, revisiones y auditoría para el modelo clínico, sin marcadores de fixture.
- Copia clínica v6, cifrado, integridad y recuperación de las nueve colecciones; compatibilidad de archivos de prueba anteriores.
- Activación y suspensión administradas en servidor, sin selector cliente. Restauración clínica inicialmente suspendida y sin admisión; no importa permisos o secretos del origen.
- Pruebas SQL/interfaz y ensayos de servicios reales locales con datos sintéticos. Las cuentas actuales y sus datos de prueba se conservan.

Los detalles y las evidencias están en [PROJECT_STATUS.md](../clinical/verification/PROJECT_STATUS.md) y el [procedimiento de activación](../clinical/CLINICAL_ACTIVATION.md). El punto de reanudación de la interrupción quedó resuelto.

## Pendiente antes de activar

| Prioridad | Decisión/operación | Criterio de cierre |
| --- | --- | --- |
| P0 | Condiciones y tratamiento sanitario | Resolver la revisión específica de proveedores, encargos/transferencias, información y obligaciones aplicables. El titular puede adelantar la contratación a esta semana y confirmará estos días; todavía no ha confirmado el cierre. |
| P0 | Custodia y continuidad | Acordar destino, frase recuperable por separado, copia independiente de la sincronización, frecuencia/retención y contingencia, y evaluar límites/pausas de Free. Descargar el archivo en otro dispositivo no acredita todo esto. |
| P0 | Conjunto clínico limpio | Preparar una operación explícita y revisada sobre los ejemplos, conservando antes su copia y confirmando que no son historias reales. No convierte ni borra automáticamente fixtures, cuentas o factores. |
| P1 | Validación y decisión de salida | Revisar el recorrido final, límites e incidencias críticas y registrar versión/configuración y referencia de decisión. Un operador habilita el perfil solo después; esta entrega no lo hace. |

No se exige contratar una asesoría concreta o esperar a diciembre. Se puede continuar desarrollando y cerrar las decisiones antes si se resuelven. La contratación prevista no equivale a contratos revisados o a activación automática.

## Confirmaciones que no se repiten

El titular ya confirmó alta/guardado/reapertura, motivo/precauciones y archivo cifrado verificado en iPad, guardado en iCloud y descargable desde iPhone. El [registro manual](../clinical/verification/MANUAL_CHECKS.json) distingue esas declaraciones de descifrado/restauración en el segundo dispositivo o recuperación de cuenta, que no se han confirmado.

Se posponen informes, ampliaciones de catálogo, equipos/roles/invitaciones, importación de calendarios y estética. La agenda existente puede mantenerse durante la transición. No se propone introducir pacientes reales bajo aliases ficticios ni subir historias al chat para probarlas.
