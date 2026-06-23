# Auditoria Del Sistema Actual Para Migracion A ARA

## Resumen ejecutivo

El repositorio implementa una aplicacion interna llamada `Freelan Revenue Agent` para buscar contactos en Apollo, interpretar filtros ICP con OpenAI, ejecutar una prueba de hasta 5 contactos e importar/enriquecer contactos y empresas en HubSpot.

El sistema actual es una base util para el futuro **ARA Discovery Agent**, especialmente por su flujo de descubrimiento, normalizacion basica de candidatos, deduplicacion por email/dominio y creacion/enriquecimiento en HubSpot. No esta listo como plataforma ARA multiagente: no tiene autenticacion, separacion clara por servicios, orquestador, cola de trabajos, auditoria robusta, retries, rate limits, trazabilidad de aprobaciones ni capa formal de eventos.

## Alcance auditado

- Backend Express en `src/server.js`.
- Logica de ejecucion en `src/agent.js`.
- Conectores Apollo/HubSpot en `src/clients.js`.
- Interpretacion OpenAI en `src/interpreter.js`.
- Persistencia PostgreSQL en `src/db.js`.
- Configuracion en `src/config.js`, `.env.example`, `Dockerfile`, `railway.toml`.
- UI estatica en `public/`.
- Pruebas en `test/`.

No se ejecutaron operaciones contra Apollo ni se escribio informacion en HubSpot. La unica verificacion automatizada ejecutada fue `npm test`, que pasa con 2 pruebas.

## Que hace actualmente el sistema

1. Inicia un proceso de importacion (`run`) con roles ICP sugeridos.
2. Recibe filtros del usuario: industria, rango de empleados, paises, cantidad, maximo 3 roles y brief libre.
3. Usa OpenAI para convertir esos filtros en terminos compatibles con Apollo.
4. Solicita aprobacion del usuario sobre la interpretacion.
5. Busca candidatos en Apollo usando `/contacts/search`.
6. Filtra candidatos por email verificado, dominio de compania y telefono valido mapeable.
7. Ejecuta una prueba de hasta 5 contactos en HubSpot.
8. Pide al usuario verificar HubSpot antes de continuar.
9. Importa la cantidad solicitada posterior a la prueba, con limite diario.
10. Crea o enriquece companias y contactos en HubSpot.
11. Asocia contactos con companias.
12. Guarda el estado del proceso, candidatos y resultados en PostgreSQL.

## Flujo de ejecucion completo

1. El navegador carga `public/index.html`, `public/app.js` y `public/styles.css`.
2. `boot()` llama `POST /api/runs`.
3. `startRun()` crea un `run` con UUID y fase `collecting`.
4. El usuario llena filtros y roles.
5. UI llama `POST /api/runs/:id/analyze`.
6. `analyzeFilters()` valida filtros y llama `interpretFilters()`.
7. OpenAI devuelve `industryKeywords`, `roleTitles`, `seniorities`, `companyKeywords`, `contactLocations`, `excludedTitles`, `explanation` y `relaxation`.
8. El usuario aprueba la interpretacion.
9. UI llama `POST /api/runs/:id/approve-roles`.
10. `approveRoles()` pagina Apollo hasta 5 paginas o hasta juntar `quantity + TEST_BATCH_SIZE`.
11. Se guardan candidatos unicos por email.
12. UI muestra candidatos y permite ejecutar prueba.
13. UI llama `POST /api/runs/:id/test`.
14. `executeTest()` asegura la propiedad `freelan_icp_match_context` en HubSpot y ejecuta `importCandidate()` para los primeros `TEST_BATCH_SIZE`.
15. El usuario verifica manualmente HubSpot.
16. UI llama `POST /api/runs/:id/import`.
17. `executeFinal()` valida limite diario y `APPROVAL_CODE` si aplica.
18. Ejecuta importacion final sobre candidatos posteriores a la prueba.
19. Incrementa `daily_imports` solo por exitos finales, no por prueba.
20. Retorna reporte de exitos y fallos.

## Endpoints activos

| Metodo | Ruta | Responsabilidad | Mutacion externa |
|---|---|---|---|
| GET | `/health` | Estado de DB/configuracion | No |
| GET | `/api/diagnostics/hubspot` | Verifica lectura basica en HubSpot | No |
| GET | `/api/diagnostics/openai` | Verifica autenticacion OpenAI | No |
| GET | `/api/audit/latest-import` | Lee ultima importacion exitosa desde DB y HubSpot | No |
| POST | `/api/setup/hubspot-properties` | Crea propiedad faltante en HubSpot | Si |
| POST | `/api/runs` | Crea run local | No externa |
| POST | `/api/runs/:id/configure` | Guarda filtros y roles; parece legado/no usado por UI actual | No externa |
| POST | `/api/runs/:id/analyze` | Interpreta filtros con OpenAI | Llama OpenAI |
| POST | `/api/runs/:id/approve-roles` | Busca candidatos en Apollo | Llama Apollo |
| POST | `/api/runs/:id/relax` | Relaja filtros y vuelve a buscar | Llama Apollo |
| POST | `/api/runs/:id/test` | Ejecuta prueba en HubSpot | Si |
| POST | `/api/runs/:id/import` | Ejecuta importacion final en HubSpot | Si |

## Servicios, jobs y scripts

- Servicio HTTP unico: Express en `src/server.js`.
- Scripts npm:
  - `npm start`: `node src/server.js`.
  - `npm run dev`: `node --watch src/server.js`.
  - `npm test`: `node --test`.
- Jobs programados: no existen en codigo.
- Workers: no existen.
- Colas: no existen.
- Cron de reseteo diario: no existe como job; el "reset" se logra usando una llave diaria calculada por fecha (`dayKey()`) en `daily_imports`.

## Riesgos criticos

1. No hay autenticacion ni autorizacion en la aplicacion interna.
2. Endpoints de escritura en HubSpot estan expuestos si alguien conoce la URL.
3. No existen retries, backoff ni control formal de rate limits para Apollo, HubSpot u OpenAI.
4. `test` escribe en HubSpot aunque no cuenta contra limite diario.
5. La auditoria guardada en DB es util pero insuficiente para trazabilidad ARA: no guarda actor, aprobaciones, payloads externos sanitizados, versiones de prompts ni eventos.

## Quick wins

1. Agregar autenticacion interna simple antes de convertirlo en ARA.
2. Separar conectores Apollo, HubSpot y OpenAI en modulos con interfaces estables.
3. Convertir `import_runs` en un audit trail append-only o agregar tabla de eventos.
4. Agregar retries/backoff y clasificacion de errores.
5. Agregar pruebas de flujo para deduplicacion, limites diarios, propiedad ICP y asociaciones.

## Recomendacion general

Usar el repositorio como prototipo funcional para **ARA Discovery Agent**, pero migrar incrementalmente hacia una arquitectura modular:

1. Encapsular conectores.
2. Separar busqueda, scoring, approval e importacion.
3. Agregar auditoria y seguridad.
4. Preparar configuracion por cliente/tenant para que ARA pueda operar con cuentas Apollo y HubSpot de cada cliente.
5. Hacer que la escritura inicial en HubSpot se dirija a una lista especifica `ARA_Leads`.
6. Mantener Latenode como opcional y solo incorporarlo si aparece un caso real que lo requiera.
7. Mantener compatibilidad temporal con la UI actual mientras se construye ARA Revenue Orchestrator.
