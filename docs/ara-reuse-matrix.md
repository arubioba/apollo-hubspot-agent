# Matriz De Reutilizacion Para ARA

## Criterios

- `REUSE_AS_IS`: puede moverse sin cambios relevantes.
- `REUSE_WITH_MINOR_CHANGES`: util con ajustes pequenos.
- `REFACTOR`: conservar intencion/logica, cambiar estructura.
- `REPLACE`: sustituir por componente nuevo.
- `REMOVE`: eliminar.
- `UNKNOWN`: requiere informacion externa.

| Componente | Ubicacion | Responsabilidad actual | Dependencias | Riesgos | Clasificacion | Recomendacion | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|
| Servidor Express | `src/server.js` | API HTTP y static hosting | express, db, agent, clients | Sin auth, mezcla diagnosticos y mutaciones | REFACTOR | Mantener temporalmente como API interna; separar controladores ARA | Media | Alta |
| Workflow de run | `src/agent.js` | Estados, validacion, discovery, test/import | db, clients, interpreter | Mucha responsabilidad, sin eventos | REFACTOR | Extraer Discovery Agent y Approval hooks | Alta | Alta |
| Roles ICP sugeridos | `src/agent.js` | Lista fija de roles iniciales | Ninguna | No configurable por ICP/tenant | REUSE_WITH_MINOR_CHANGES | Mover a configuracion/plantillas ICP | Baja | Media |
| Validacion de filtros | `src/agent.js` | Valida industria, empleados, paises, roles, cantidad | Ninguna | Validacion minima | REUSE_WITH_MINOR_CHANGES | Convertir a schema compartido | Baja | Alta |
| Limite diario | `src/agent.js`, `src/db.js` | Maximo de importaciones finales por dia | PostgreSQL, TZ | No distingue usuario/tenant; test no cuenta pero escribe | REFACTOR | Mover a Approval/Quota Service | Media | Alta |
| Apollo request helper | `src/clients.js` | HTTP a Apollo con API key | fetch, config | Sin retry/rate limit | REFACTOR | Crear Apollo Connector formal | Media | Alta |
| Busqueda Apollo | `findApolloCandidates()` | Buscar y filtrar candidatos | Apollo API, OpenAI interpretation | Puede consumir cuota por sinonimos; limitado a `/contacts/search` | REFACTOR | Base del ARA Discovery Agent | Alta | Critica |
| Normalizacion Apollo | `normalizeCandidate()` | Convertir persona Apollo a DTO interno | Apollo payload | DTO informal | REUSE_WITH_MINOR_CHANGES | Formalizar tipos y pruebas | Media | Alta |
| Filtro telefono/email/dominio | `findApolloCandidates()` | Elegibilidad minima | Apollo payload | Reglas hardcodeadas | REUSE_WITH_MINOR_CHANGES | Mantener como reglas base de calidad | Baja | Alta |
| Mapeo telefonico | `contactProperties()` | Mobile a WhatsApp, direct a phone | HubSpot schema | Cubre pocos tipos | REUSE_AS_IS | Reusar con mas pruebas | Baja | Alta |
| HubSpot request helper | `src/clients.js` | HTTP a HubSpot con token | fetch, config | Sin retry/rate limit/error taxonomy | REFACTOR | Crear HubSpot Connector | Media | Alta |
| Upsert contacto | `importCandidate()` | Buscar por email, crear o completar vacios | HubSpot | Acoplado a importacion | REFACTOR | Servicio writeback idempotente | Media | Critica |
| Upsert compania | `importCandidate()` | Buscar por dominio, crear o completar vacios | HubSpot | Dominio puede faltar o variar | REFACTOR | Servicio account resolution | Media | Alta |
| Asociacion contacto-compania | `associate()` | Asociacion default HubSpot | HubSpot v4 | Sin manejo de asociacion existente/error especifico | REUSE_WITH_MINOR_CHANGES | Mantener con idempotencia explicita | Baja | Alta |
| Escritura a lista ARA_Leads | No existe actualmente | N/A | HubSpot lists API o propiedad/filtro | Requisito nuevo; falta diseno | UNKNOWN | Definir si sera lista estatica, lista activa o propiedad de control | Media | Critica |
| Propiedad ICP context | `ensureHubSpotProperties()` | Crear propiedad custom | HubSpot properties API | Endpoint expuesto crea schema | REFACTOR | Mover a migracion/configuracion ARA | Baja | Media |
| Interpretacion OpenAI | `src/interpreter.js` | Expande ICP a filtros Apollo | OpenAI Responses API | Prompt hardcodeado, sin versionado | REFACTOR | Convertir a Data Intelligence Agent tool | Media | Alta |
| Relaxation proposal | `buildSafeRelaxation()` | Propone relajacion segura | Interpretation | Basica; no aprende de resultados | REUSE_WITH_MINOR_CHANGES | Mantener como primer heuristic | Baja | Media |
| Persistencia runs | `import_runs` | Estado completo del proceso | PostgreSQL | JSONB con PII, no append-only | REFACTOR | Separar state + audit events | Alta | Critica |
| Conteo diario | `daily_imports` | Cuota diaria | PostgreSQL | No multiusuario | REFACTOR | Quota/Approval Service | Media | Alta |
| UI chat/form | `public/` | Captura filtros y controla flujo | Browser fetch | Sin auth, estado fragil | REPLACE | Reemplazar por UI ARA; conservar aprendizajes UX | Media | Media |
| Audit latest endpoint | `/api/audit/latest-import` | Consulta ultima importacion | DB, HubSpot | Solo ultima, no historico completo | REUSE_WITH_MINOR_CHANGES | Base de Audit Service read model | Baja | Media |
| Dockerfile | `Dockerfile` | Imagen Node | node alpine | Basico | REUSE_WITH_MINOR_CHANGES | Reusar hasta separar servicios | Baja | Media |
| Railway config | `railway.toml` | Build/deploy/healthcheck | Railway | Sin workers ni migration step | REUSE_WITH_MINOR_CHANGES | Mantener para MVP ARA | Baja | Media |
| Configuracion por cliente/tenant | No existe actualmente | N/A | DB, secretos, conectores | Necesaria para producto plug and play | REPLACE | Crear modelo nuevo de tenant/client configuration | Alta | Critica |
| Tests telefonos | `test/phone-mapping.test.js` | Verifica phone mapping | node:test | Cobertura minima | REUSE_AS_IS | Mantener y ampliar | Baja | Alta |
| Configure endpoint | `/api/runs/:id/configure` | Configuracion sin OpenAI | Backend | No usado por UI | REMOVE | Eliminar tras confirmar no consumidores externos | Baja | Baja |

## Componentes mas reutilizables

1. Normalizacion de candidatos Apollo.
2. Mapeo de telefonos a propiedades HubSpot.
3. Deduplicacion por email/dominio.
4. Flujo de test antes de importacion final.
5. Interpretacion semantica de ICP con aprobacion humana.

## Componentes que deben cambiar primero

1. Seguridad/autenticacion.
2. Conectores externos.
3. Auditoria de eventos.
4. Approval/quota.
5. Persistencia de runs.
