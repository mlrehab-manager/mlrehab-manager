# Riesgos y pruebas de la transición clínica

Estado: fase inicial, datos ficticios. Contexto: un profesional, dos tipos de dispositivo, España.

| Riesgo | Control preparado | Trabajo todavía necesario |
| --- | --- | --- |
| Visita anónima lee historias | RPC reservadas a autenticados y guardia de identidad; tablas privadas | Probar HTTP alojado, configuración real de esquemas y ausencia de contenido clínico antes del login |
| Una cuenta se da de alta y se atribuye permisos | Lista de admisión privada sin permisos de cliente | Desactivar altas públicas, proceso administrativo de admisión y recuperación |
| Contraseña o enlace de acceso comprometido | Guardia exige MFA `aal2` en todas las RPC | Configurar factor, recuperación, revocación, sesiones e inactividad en proveedor/interfaz |
| Un usuario cambia UUID y accede a otro paciente | Cada lectura y escritura exige propietario; pruebas con dos identidades ficticias | Repetir con dos cuentas reales de prueba y para citas, sesiones, documentos y exportación |
| Copiar dos pestañas sobrescribe una historia | Revisión esperada en UPDATE atómico de PostgreSQL | Integración UI, tratamiento de conflicto y prueba concurrente alojada |
| Modificación elimina la evidencia anterior | Versiones nuevas y archivo, sin borrado físico de cliente | Acceso al historial, rectificaciones, políticas de conservación y administración |
| Lectura/escritura sin auditoría | Eventos atómicos; si fallan, no se devuelve resultado correcto | Capturar intentos fallidos sin datos sensibles; supervisión y archivo externo protegido |
| Alteración de auditoría por cliente | Esquema privado sin acceso y RLS de denegación | Separar administración, restringir secretos y definir protección frente a administrador/proveedor; no es inmutable ante superusuarios |
| XSS roba sesión o datos ya autorizados | Ningún control de interfaz clínica implementado en esta fase | Retirar manejadores inline, DOM seguro, CSP, revisión de dependencias; MFA no evita robo de sesión |
| Datos sobreviven en iPad, caché, HTML Preview, PDF o consola | La fase clínica no está conectada a la demo | Prohibir almacenamiento local de historia/tokens, limpiar memoria, origen controlado, no-store, prueba de logout/retroceso, custodia de exportaciones |
| Pérdida de la base o cuenta del proveedor | Versiones en base, que NO son copias externas | Copias cifradas independientes, recuperación de claves y simulacro de restauración completos |
| Plan gratuito se pausa, llena o deja de servir | Limitaciones documentadas; no se usa para datos reales aún | Alertas de capacidad, objetivos de servicio, plan de contingencia y decisión de plan/proveedor |
| Región UE se interpreta como ausencia de transferencias | Proveedor solo propuesto, no contratado | Revisar DPA, subencargados, soporte y servicios auxiliares |

## Evidencia disponible

`npm run test:clinical` ejecuta SQL real en PostgreSQL embebido. Solo las funciones de identidad se simulan; no verifica firma de JWT, cookies, factores ni servicios de Supabase. Las pruebas no son una auditoría independiente ni una autorización para datos reales. En el proyecto alojado se han verificado además los permisos efectivos, el esquema privado no expuesto y cinco peticiones HTTP anónimas rechazadas. No se han creado usuarios ni simulado identidades en esa base.

La migración contiene únicamente pacientes y sus versiones/auditoría. No contiene agenda, sesiones como recurso independiente, catálogo remoto, almacenamiento de documentos ni exportación clínica. La validación JSON es básica y requiere desarrollo adicional. Los nombres de pacientes de las pruebas son ficticios.

Los errores de autorización o transacciones abortadas no quedan registrados en la tabla de eventos porque también se revertiría la transacción. Se necesita un canal separado de supervisión antes de producción. No registrar cuerpos de historias, contraseñas ni tokens en ese canal.

La interfaz pública actual continúa usando localStorage y descargas JSON de demostración. No conectar su `save()` a medias al nuevo backend: la migración debe ser explícita, completa y fallar sin guardar si faltan permisos o conexión. No se proporciona una opción de «activar clínica» ni se retiran los avisos de demo.
