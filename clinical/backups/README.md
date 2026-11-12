# Base de cifrado de copias · solo pruebas

`crypto.mjs` cifra y descifra JSON mediante Web Crypto (sin dependencias ni peticiones de red): AES-GCM de 256 bits, etiqueta de autenticación de 128 bits, nonce aleatorio de 96 bits, sal aleatoria de 128 bits y PBKDF2-SHA256 con 600 000 iteraciones. La clave derivada no es exportable. El archivo tiene versión y parámetros cerrados; no admite algoritmos ni costes elegidos por un archivo importado. No incluye la frase, nombres ni índices sin cifrar.

La frase tiene un mínimo técnico de 16 caracteres; eso no garantiza entropía. Se deberá usar una frase larga aleatoria y custodiarla separada de la copia y del autenticador. Si se pierde, este módulo no permite recuperar el archivo. No compartir frases por chat, no incluirlas en logs, código, argumentos de shell o en la propia copia. JavaScript no garantiza borrar de memoria todas las representaciones de una cadena; no se afirma borrado seguro de memoria.

Se limita el contenido a 4 MiB y el tamaño del archivo cifrado antes de procesarlo. La validación rechaza campos/algoritmos/versiones desconocidos y valores no canónicos. Un fallo de autenticidad o frase incorrecta no devuelve datos parciales. La función devuelve JSON descifrado en memoria; el futuro restaurador deberá validar el esquema clínico antes de usarlo y nunca mezclarlo directamente con el estado actual.

Las pruebas solo cifran un conjunto ficticio y lo recuperan en memoria, incluyendo versiones, auditoría y Unicode. Comprueban sal/nonce distintos, frase incorrecta, manipulación, límites y parámetros hostiles. Ejecutar `npm run test:backup-crypto`.

**Esto todavía no es una copia de la base ni una restauración clínica.** No está conectado a Supabase ni a formularios de pacientes, no exporta cuentas/Auth, archivos ni claves, y no escribe datos descifrados a disco. Antes de uso real faltan exportación consistente de todos los recursos, conservación y auditoría, cifrado y custodia externa, prueba de claves en otro dispositivo, programación/avisos de fallos y restauración en una base aislada. Un ciclo JSON → cifrado → JSON no verifica esos procesos. No se ha creado almacenamiento externo ni activado facturación.
