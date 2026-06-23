# Deuda Tecnica

## Resumen

La deuda principal no esta en complejidad accidental del codigo, sino en que el prototipo concentra demasiadas responsabilidades en pocos archivos y carece de controles operativos para una plataforma multiagente.

## Deuda por area

### Arquitectura

- Monolito unico: UI, API, orquestacion, conectores y auditoria estan acoplados.
- `src/clients.js` mezcla Apollo, HubSpot, normalizacion, mapeo y escritura.
- `src/agent.js` mezcla estado del run, reglas de negocio, limites, approval y ejecucion.
- No hay interfaces de dominio ni DTOs versionados.

Recomendacion: separar por dominios ARA: Discovery, Connectors, Approval, Audit, Scoring.

### Persistencia

- Schema creado con `CREATE TABLE IF NOT EXISTS` en runtime.
- No hay migraciones versionadas.
- `candidates` guarda payloads derivados con PII en JSONB.
- No hay tabla de eventos ni historial append-only.
- `daily_imports` no distingue usuario/tenant/proyecto.

Recomendacion: migraciones, evento por accion, retencion de PII, multi-tenant readiness.

### Integraciones

- Sin retries/backoff.
- Sin rate limit.
- Sin timeouts explicitos.
- Sin circuit breaker.
- Sin clasificacion de errores.
- Sin mocks contractuales.

Recomendacion: conectores con politicas de resiliencia y pruebas.

### Seguridad

- Sin login.
- Sin autorizacion.
- Codigo de aprobacion fijo.
- Diagnosticos expuestos.
- Escritura en HubSpot desde endpoints publicos.

Recomendacion: auth primero, Approval Service despues.

### UI/UX

- UI simple y efectiva, pero sin estado robusto.
- No hay visualizacion detallada de auditoria por run.
- No hay paginacion de candidatos.
- No hay confirmacion granular de cada contacto.
- No hay descarga de reporte.

Recomendacion: mantener como consola interna temporal, luego reemplazar por UI ARA.

### Calidad y pruebas

- Solo 2 pruebas automatizadas.
- Cobertura limitada a telefonos.
- No hay pruebas de endpoints.
- No hay pruebas de DB.
- No hay pruebas de deduplicacion, limite diario ni errores de APIs externas.

Recomendacion: suite minima de flujo critico antes de refactor.

### Observabilidad

- Logs con `console.log/error` solo en arranque.
- No hay logs estructurados por run.
- No hay metricas.
- No hay tracing.
- No hay correlacion entre llamadas Apollo, HubSpot, OpenAI y run.

Recomendacion: `runId` como correlation id y Audit Service.

### Internacionalizacion/codificacion

- Se observan textos con mojibake en archivos (`TecnologÃ­a`, `paÃ­ses`, etc.).
- Riesgo de mala experiencia y datos corruptos en prompts/contextos.

Recomendacion: normalizar encoding UTF-8 y agregar prueba de strings criticos.

## Prioridad de correccion

1. Seguridad y proteccion de endpoints.
2. Auditoria/eventos.
3. Conectores desacoplados con retries/rate limits.
4. Migraciones versionadas.
5. Tests de flujo critico.
6. UI/reporting.
7. Encoding.

