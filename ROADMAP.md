# Hoja de ruta de MLREHAB Manager

## Informes para pacientes · versión 0.6 en revisión

Petición del usuario registrada el 11 de noviembre de 2026: añadir una forma de preparar informes para entregar a los pacientes. Implementarla cuando la base de la aplicación esté estabilizada.

Primera implementación de demostración preparada en `feature/demo-patient-reports`, pendiente de revisión y publicación:

- Preparar un informe desde la ficha del paciente, seleccionando explícitamente los apartados que se desean incluir.
- Permitir editar y revisar el contenido antes de imprimirlo o guardarlo como PDF mediante el navegador del iPad.
- Mantener el diseño minimalista con la paleta crema aprobada y la compatibilidad gratuita con GitHub Pages.
- Empezar con informes de demostración claramente identificados y datos exclusivamente ficticios. No habilitar su uso con datos sanitarios reales mientras no exista almacenamiento clínico seguro.
- No enviar informes automáticamente ni incluir toda la historia clínica por defecto.

## Validación de la versión 0.5 DEMO

El 11 de noviembre de 2026, el usuario comunicó que la vista previa funcionaba correctamente en su iPad («Sale todo perfecto»). Es una confirmación general del recorrido propuesto; no constituye una comprobación independiente de cada función ni una validación para uso clínico real.

Las cinco pruebas automatizadas de la iteración verifican los recorridos documentados en README.md. La versión se prepara en la rama `improve/ipad-reliability`; su publicación requiere fusionar el PR correspondiente.

Pendiente antes de publicar la versión 0.6: comprobar en Safari de iPad la selección, el teclado virtual, la vista previa y la impresión o guardado en PDF. La versión pública permanece en 0.5 hasta su aprobación.
