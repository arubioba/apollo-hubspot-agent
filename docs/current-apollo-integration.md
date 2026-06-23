# Integracion Actual Con Apollo

## Conexion

La conexion se implementa en `src/clients.js` mediante `apollo(path, body, method)`, que llama a `config.apolloBase` con:

- `Content-Type: application/json`
- `X-Api-Key: <APOLLO_API_KEY>`

El valor viene de `APOLLO_API_KEY`.

## Endpoint usado

Actualmente solo se usa:

- `POST /contacts/search`

No se observaron llamadas a listas, enrichment separado, accounts search, people search global alternativo ni endpoints de secuencia/outreach.

## Payload actual de busqueda

Para cada `industry` en `filters.interpretation.industryKeywords`, se envia:

- `page`
- `per_page: 100`
- `organization_num_employees_ranges: ["min,max"]`
- `organization_locations`
- `q_organization_keyword_tags`
- `person_titles`
- `person_seniorities`
- `person_locations`
- `include_similar_titles: true`
- `contact_email_status: ["verified"]`

El sistema pagina del 1 al 5 y se detiene si junta `quantity + TEST_BATCH_SIZE` candidatos.

## Interpretacion de filtros

Los filtros humanos se expanden con OpenAI antes de llamar Apollo:

- Industria principal -> `industryKeywords`.
- Roles seleccionados -> `roleTitles`.
- Brief libre -> `companyKeywords`, `contactLocations`, `excludedTitles`, `seniorities`.

Importante: el prompt dice que `companyKeywords` son senales de contexto y no deben ser filtros obligatorios. Sin embargo, la busqueda actual usa `q_organization_keyword_tags` con cada `industryKeyword`; no usa `companyKeywords` como filtro.

## Normalizacion de candidatos

`normalizeCandidate()` transforma personas Apollo a un objeto interno:

- `apolloId`
- `firstName`
- `lastName`
- `email`
- `emailVerified`
- `title`
- `linkedin`
- ubicacion del contacto
- `validPhones`
- datos de compania

## Filtros posteriores a Apollo

El sistema elimina candidatos que no cumplan:

- Email verificado o `likely to engage`.
- Dominio de compania.
- Algun telefono mapeable.
- Titulo no contiene terminos en `excludedTitles`.

Telefonos mapeables:

- `mobile`
- `direct`
- `direct_dial`
- `work_direct`

## Deduplicacion

- Primero deduplica por Apollo person id dentro de cada pagina/industria.
- Despues deduplica por email en `uniqueByEmail()`.

## Riesgos

1. No hay manejo de rate limits de Apollo.
2. No hay retry/backoff.
3. El sistema depende de `/contacts/search`; puede estar limitado a contactos disponibles/salvados segun plan Apollo.
4. Se hacen multiples llamadas por sinonimos de industria, lo que puede duplicar resultados o consumir cuota.
5. No se registran payloads Apollo sanitizados ni metadata de paginacion.
6. No hay scoring de candidatos antes de importar.
7. No hay separacion entre discovery y writeback a HubSpot.

## Recomendacion ARA

Clasificacion: **REFACTOR**.

El conector Apollo debe convertirse en un modulo independiente:

- `ApolloConnector.searchContacts(criteria)`.
- `ApolloConnector.normalizePerson(raw)`.
- `ApolloConnector.explainQuery(criteria)`.
- Soporte de retries/rate limit.
- Registro de query hash y conteos.
- Separacion entre filtros obligatorios y senales de scoring.

Para ARA Discovery Agent, la logica actual de busqueda y normalizacion es valiosa, pero debe operar antes de cualquier decision de importacion.

