# Hoja de ruta de MLREHAB Manager

## Informes para pacientes · versión 0.6 publicada

Petición del usuario registrada el 11 de noviembre de 2026: añadir una forma de preparar informes para entregar a los pacientes. Implementarla cuando la base de la aplicación esté estabilizada.

Primera implementación de demostración publicada tras la prueba favorable del usuario en iPad:

- Preparar un informe desde la ficha del paciente, seleccionando explícitamente los apartados que se desean incluir.
- Permitir editar y revisar el contenido antes de imprimirlo o guardarlo como PDF mediante el navegador del iPad.
- Mantener el diseño minimalista con la paleta crema aprobada y la compatibilidad gratuita con GitHub Pages.
- Empezar con informes de demostración claramente identificados y datos exclusivamente ficticios. No habilitar su uso con datos sanitarios reales mientras no exista almacenamiento clínico seguro.
- No enviar informes automáticamente ni incluir toda la historia clínica por defecto.

## Validación de la versión 0.5 DEMO

El 11 de noviembre de 2026, el usuario comunicó que la vista previa funcionaba correctamente en su iPad («Sale todo perfecto»). Es una confirmación general del recorrido propuesto; no constituye una comprobación independiente de cada función ni una validación para uso clínico real.

Las cinco pruebas automatizadas de la iteración verifican los recorridos documentados en README.md. La versión se prepara en la rama `improve/ipad-reliability`; su publicación requiere fusionar el PR correspondiente.

El usuario confirmó el flujo de informes/PDF en iPad y autorizó publicar la versión 0.6.

## Versión 0.7 · publicada

Detección de datos cambiados o borrados en otra pestaña, bloqueo del guardado desde vistas antiguas y opciones explícitas para descargar una copia y recargar. Mantiene el tema crema y los informes de demostración. El usuario confirmó el aviso en iPad y autorizó la publicación de la versión 0.7.

## Versión 0.8 · publicada

Confirmación antes de descartar formularios modificados con X o Escape y solicitud de aviso nativo al recargar con cambios pendientes. No guarda borradores. El usuario confirmó la conservación del texto y autorizó publicar la versión 0.8.

## Versión 0.9 · publicada

Vista previa al importar copias JSON: comparación de recuentos, descarga opcional de los datos actuales y sustitución explícita tras revisión. El usuario confirmó la mejora y autorizó publicar la versión 0.9.

## Versión 0.10 · publicada

Petición del usuario: dividir tratamiento en pasivo y ejercicio terapéutico, con un catálogo de nombres ampliable manualmente. Se prepara un catálogo local ampliado de 112 nombres, selección en fichas, adición manual y conservación de los textos antiguos. Los nuevos datos se incluyen en copias e informes. El usuario revisó y autorizó la versión 0.10, ya publicada.

Ampliación solicitada durante la revisión de 0.10: clasificación en isométricos, dinámicos (combinados, énfasis concéntrico y énfasis excéntrico), pliometría y otros. Se investigan fuentes y se añaden 45 nombres sin eliminar los 67 previos. Las modalidades se pueden filtrar, asignar y modificar manualmente y se conservan en copias. El usuario aprobó la clasificación y autorizó su publicación en 0.10.

## Versión 0.11 · publicada

Prioridad elegida por el usuario al retomar: ampliar ejercicios y filtrar por zona corporal. Se añaden 18 nombres con referencias (130 en total), etiquetas de varias zonas por ejercicio, filtros combinados con modalidad y buscador, asignación manual y conservación en copias. El usuario revisó y autorizó la versión 0.11, ya publicada.

## Base clínica · fase 1 en revisión

Contexto confirmado: Comunitat Valenciana, España; un usuario desde iPad y ordenador; preferencia por empezar gratis con límites claros. Se prepara un diseño para dejar localStorage y una API privada inicial de pacientes con MFA, admisión explícita, versiones y auditoría. Supabase en UE es candidato para pruebas, sin contratar ni configurar servicios externos. El plan gratuito no da por resueltas copias y disponibilidad. La web permanece como demo 0.11; no se retiran los avisos ni se habilitan datos reales.

Siguiente bloque: proyecto de pruebas, autenticación/MFA real y configuración del proveedor, seguido de integración completa de funciones y pruebas de copias/restauración. El plan y los límites están en clinical/README.md y docs/CLINICAL_SECURITY_PLAN.md.
