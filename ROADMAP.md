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

## Versión 0.8 · en revisión

Confirmación antes de descartar formularios modificados con X o Escape y solicitud de aviso nativo al recargar con cambios pendientes. No guarda borradores. Pendiente de revisión en iPad; la versión pública permanece en 0.7.
