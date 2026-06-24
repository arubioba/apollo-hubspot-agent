# Freelan Apollo → HubSpot Agent

Aplicación interna conversacional para buscar contactos directamente en Apollo, validar roles ICP, ejecutar una prueba de cinco contactos e importar a HubSpot con reporte.

La aplicación usa OpenAI para interpretar una industria como taxonomías similares, expandir hasta tres roles a títulos equivalentes en español e inglés, convertir un brief libre en filtros ad-hoc y proponer relajaciones cuando una búsqueda no devuelve resultados.

## Railway

1. Crear un proyecto desde este repositorio/directorio.
2. Agregar un servicio PostgreSQL.
3. Configurar las variables de `.env.example` como secretos.
4. Desplegar. Railway detectará `railway.toml` y ejecutará `npm start`.

## Safety Baseline ARA

- Todos los endpoints API, excepto `/health`, requieren el header `X-ARA-Admin-Token`.
- `ARA_WRITE_MODE=disabled` es el valor seguro por defecto y bloquea escrituras en HubSpot.
- `ARA_WRITE_MODE=preview` muestra lo que se escribiria sin usar endpoints de escritura.
- `ARA_WRITE_MODE=enabled` conserva el comportamiento actual de escritura y debe usarse solo en entornos controlados.
- Cada request API devuelve y registra un `correlationId`.
- Los logs son JSON estructurado y enmascaran emails, telefonos y secretos.
- Los errores API usan `{ error: { code, message }, correlation_id }`.
- `/api/audit/latest-import` devuelve solo resumen sanitizado del run.
- `/api/import-runs/:runId/candidates` mantiene la vista operativa de contactos con paginacion y campos minimos.
- Diagnostics esta deshabilitado por defecto con `ARA_DIAGNOSTICS_ENABLED=false`.
- El rate limiting actual es local en memoria y debera migrarse a Redis antes de multi-instancia o multi-tenant.
- `ARA_EXTERNAL_SERVICES_MODE=mock` declara la intencion segura para staging; la seleccion real de conectores queda para Connector Extraction.

## Local

1. Copia `.env.example` a `.env` y llena valores locales.
2. Usa `ARA_WRITE_MODE=disabled` o `preview` para pruebas seguras.
3. Ejecuta `npm install` si es necesario.
4. Ejecuta `npm run dev`.
5. Abre la app y proporciona el token interno cuando se solicite.

## Tests

Ejecuta:

```bash
npm test
```

Validacion completa:

```bash
npm run check
```

Smoke test de staging con mocks:

```bash
npm run smoke:staging
```

Los tests usan mocks/stubs y no deben consumir Apollo ni escribir en HubSpot.

El límite de 50 contactos posteriores a prueba se acumula por día y se reinicia a medianoche usando `TZ=America/Mexico_City`. Para superar el límite, el servidor valida `APPROVAL_CODE`; nunca se envía al navegador.

## Reglas

- La prueba de cinco contactos no consume el límite diario.
- El usuario selecciona una industria y hasta tres roles objetivo.
- OpenAI propone la interpretación semántica y el usuario debe aprobarla antes de buscar.
- Las palabras clave del brief no restringen Apollo; se guardan en `freelan_icp_match_context`.
- Las keywords reales de la empresa se guardan en `apollo_company_keywords` cuando están disponibles.
- Cualquier relajación de filtros requiere aprobación.
- Solo candidatos con email verificado y algún teléfono disponible.
- Contactos se deduplican por email; empresas por dominio.
- Solo se completan campos vacíos en registros existentes.
- Móviles válidos van a `hs_whatsapp_phone_number`.
- Teléfonos directos van a `phone`; centrales `work_hq` no se copian al contacto.
