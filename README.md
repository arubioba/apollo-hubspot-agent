# Freelan Apollo → HubSpot Agent

Aplicación interna conversacional para filtrar listas de Apollo, validar roles ICP, ejecutar una prueba de cinco contactos e importar a HubSpot con reporte.

## Railway

1. Crear un proyecto desde este repositorio/directorio.
2. Agregar un servicio PostgreSQL.
3. Configurar las variables de `.env.example` como secretos.
4. Desplegar. Railway detectará `railway.toml` y ejecutará `npm start`.

El límite de 50 contactos posteriores a prueba se acumula por día y se reinicia a medianoche usando `TZ=America/Mexico_City`. Para superar el límite, el servidor valida `APPROVAL_CODE`; nunca se envía al navegador.

## Reglas

- La prueba de cinco contactos no consume el límite diario.
- Solo candidatos con email verificado y algún teléfono disponible.
- Contactos se deduplican por email; empresas por dominio.
- Solo se completan campos vacíos en registros existentes.
- Móviles válidos van a `hs_whatsapp_phone_number`.
- Teléfonos directos van a `phone`; centrales `work_hq` no se copian al contacto.
