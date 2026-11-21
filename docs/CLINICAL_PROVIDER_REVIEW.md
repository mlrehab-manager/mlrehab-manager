# Revisión de proveedores para MLREHAB

Revisión documental: 21 de noviembre de 2026. Alcance: autónomo individual, fisioterapia en España, iPad y ordenador. Resultado: candidatos identificados y dudas concretadas; uso real pendiente. No se han aceptado nuevos contratos, enviado consultas, cambiado proveedores ni activado pagos.

## Flujo revisado

El Worker privado sirve archivos de la interfaz y rechaza métodos distintos de GET/HEAD. El navegador se autentica y llama directamente a Supabase; el Worker no implementa un proxy de historias clínicas. Las copias se cifran en el dispositivo antes de descargarse. Esto describe el código revisado, no acredita ausencia de tratamiento de metadatos por las plataformas ni residencia íntegra en la UE.

| Servicio                                 | Función actual                                                  | Evidencia                                                                               | Pendiente antes del uso real                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Supabase, proyectos Frankfurt            | Auth, API, base y auditoría                                     | Región y permisos comprobados previamente; documentación contractual pública localizada | Aplicabilidad del contrato a la cuenta, cláusula de datos sensibles, transferencias y operación del plan             |
| ChatGPT Sites/OpenAI y sus subencargados | Distribución de la interfaz privada y control de acceso al Site | Worker estático; acuerdo específico de alojamiento localizado                           | Acuerdo aplicable al titular, metadatos, soporte, ubicaciones, disponibilidad y exportación de la interfaz           |
| Apple/iCloud Drive                       | Depósito manual de archivos ya cifrados                         | Titular confirma descarga desde el iPhone                                               | Adecuación contractual a copias clínicas, custodia/recuperación de cuenta y copia independiente de la sincronización |
| GitHub/GitHub Pages                      | Código y demo pública ficticia                                  | Separación de la aplicación privada                                                     | Mantener repositorio, incidencias y demo sin pacientes, credenciales ni copias reales                                |

## Supabase: contrato y continuidad

El [DPA de Supabase](https://supabase.com/legal/customer-resources/data-processing-addendum), versión de 1 de agosto de 2026, se incorpora al acuerdo de servicio y contempla datos sensibles. Su apartado 4 incluye una obligación de consentimiento explícito. Debe aclararse su encaje con la asistencia sanitaria y con las condiciones efectivamente aplicables a la cuenta; localizar el texto público no acredita por sí solo su revisión/aceptación documental por el responsable.

La [guía de la AEPD para profesionales sanitarios](https://www.aepd.es/guias/guia-profesionales-sector-sanitario.pdf), apartado 2, explica que la asistencia sanitaria puede tener otra legitimación y diferencia el consentimiento sanitario del relativo a datos. No se añade una casilla genérica para resolver la cuestión contractual. Deben documentarse las bases aplicables y aclarar el requisito del proveedor antes de cargar historias reales.

La [FAQ de residencia y transferencias](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq), versión de 6 de octubre de 2026, sitúa base/Auth/Storage en la región elegida, pero reconoce tratamientos fuera de ella para cuenta, soporte, operación y, según configuración, CDN. La base en Frankfurt no prueba residencia exclusiva europea de todo el servicio. Revisar salvaguardas y acceso de soporte para este tratamiento.

La [lista vigente de subencargados](https://supabase.com/legal/subprocessor-list/October-12-2026.pdf), fechada el 12 de octubre de 2026, incluye entidades de soporte e infraestructura fuera de la UE. La sede de una entidad no equivale por sí sola a la ubicación de cada base. Se requiere comprobar funciones/ubicaciones aplicables, además del mecanismo de transferencias.

Los [precios publicados](https://supabase.com/pricing) mantienen Free con 500 MB, dos proyectos activos y pausa tras una semana sin actividad. La [documentación de copias](https://supabase.com/docs/guides/platform/backups), actualizada el 12 de noviembre de 2026, recomienda exportaciones externas periódicas para Free; no ofrece en ese plan las copias diarias de los planes superiores. No se promete disponibilidad clínica o recuperación automática por usar Free, ni se cambia de plan sin decisión expresa. Pagar tampoco resuelve por sí solo los demás requisitos.

Las restricciones sobre PHI de los [términos de Supabase](https://supabase.com/terms) remiten a la definición HIPAA. No se deduce de ellas una obligación general de contratar BAA para cualquier consulta española; tampoco una aprobación automática de su tratamiento sanitario europeo.

## Sites: el alojamiento y el chat tienen alcances distintos

Los [términos de Sites](https://openai.com/policies/chatgpt-sites-terms/), actualizados el 6 de noviembre de 2026, regulan la publicación y remiten a un acuerdo de tratamiento. Su apartado 3.3 distingue la PHI definida por HIPAA de otros datos sensibles sujetos a leyes como el RGPD. No se interpreta como una prohibición universal de datos sanitarios españoles ni como autorización clínica para MLREHAB.

El [DPA específico de Sites](https://openai.com/policies/chatgpt-sites-data-processing-addendum/), publicado el 9 de julio de 2026, contempla sitios publicados desde planes personales; los planes de empresa remiten a su DPA aplicable. El texto excluye las conversaciones, archivos y prompts usados al crear/editar el sitio. Por tanto, no debe considerarse que el acuerdo de alojamiento cubre subir historias al chat de desarrollo. Hay disposiciones sobre datos sensibles y transferencias, pero no se ha acreditado residencia exclusiva UE para esta publicación.

La [lista de subencargados de OpenAI](https://openai.com/policies/sub-processor-list/), actualizada el 14 de octubre de 2026, contempla alojamiento, soporte e infraestructura de Sites y ubicaciones internacionales. Falta relacionar las condiciones aplicables con la cuenta concreta y la configuración actual. No se asume que cambiar a Business sea obligatorio o suficiente, ni que servir archivos estáticos elimine todos los riesgos del proveedor.

## iCloud: ensayo confirmado, custodia clínica por evaluar

El titular confirmó que guardó el archivo cifrado en iCloud Drive y pudo descargarlo desde el iPhone. No se ha demostrado su descifrado/restauración en ese segundo dispositivo ni la recuperación tras perder el acceso a la cuenta de Apple. Los detalles se separan en [el registro manual](../clinical/verification/MANUAL_CHECKS.json).

La [información de seguridad de Apple](https://support.apple.com/es-es/102651) distingue protección estándar y avanzada; no consta cuál usa esta cuenta. El cifrado propio de MLREHAB no depende de activar la opción avanzada. No se cambia esa configuración ni se inicia otra recuperación de cuenta durante este trabajo.

Las [condiciones de iCloud](https://www.apple.com/legal/internet-services/icloud/es/terms.html), sección II.O y III.D, atribuyen al usuario responsabilidad por copias alternativas. No se ha acreditado un acuerdo aplicable de encargado y transferencias para el uso clínico planteado; no se concluye por ello que todos los productos de Apple carezcan de ese acuerdo o que iCloud sea ilícito. La sincronización entre dispositivos de una misma cuenta no constituye una copia aislada del borrado o compromiso de esa cuenta. No se coloca la frase junto al archivo ni en el chat.

## Resultado y siguiente decisión

Mantener los proveedores actuales para el entorno ficticio. La recomendación provisional de continuidad es conservar la base UE como candidata y resolver primero las dudas contractuales de Supabase y del alojamiento, junto con un destino de copias adecuado y su operación. La revisión jurídica del caso y la decisión del responsable siguen pendientes; no se certifica cumplimiento por la existencia de un DPA.

Hay [preguntas preparadas para los proveedores y la asesoría](CLINICAL_VENDOR_QUESTIONS.md), sin datos de pacientes y sin enviar. La [propuesta de copias](CLINICAL_BACKUP_OPERATIONS.md) reduce acumulación y distingue descargar, verificar un archivo y restaurar el servicio. No se implementa borrado, aceptación de condiciones o activación clínica automática.
