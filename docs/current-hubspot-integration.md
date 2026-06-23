# Integracion Actual Con HubSpot

## Conexion

La conexion se implementa en `src/clients.js` mediante `hubspot(path, options)`, que llama a `config.hubspotBase` con header:

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

El token se toma de:

1. `HUBSPOT_PRIVATE_APP_TOKEN`
2. `HUBSPOT_ACCESS_TOKEN`

`src/config.js` elimina espacios, comillas y prefijo `Bearer` si el secreto fue pegado con ese formato.

## Endpoints HubSpot usados

| Operacion | Endpoint |
|---|---|
| Buscar contacto/compania | `POST /crm/v3/objects/{objectType}/search` |
| Crear contacto/compania | `POST /crm/v3/objects/{objectType}` |
| Leer propiedades actuales | `GET /crm/v3/objects/{objectType}/{id}?properties=...` |
| Actualizar campos vacios | `PATCH /crm/v3/objects/{objectType}/{id}` |
| Asociar contacto-compania | `PUT /crm/v4/objects/contacts/{contactId}/associations/default/companies/{companyId}` |
| Leer/crear propiedad ICP | `GET/POST /crm/v3/properties/contacts/...` |
| Diagnostico | `GET /crm/v3/objects/contacts?limit=1` |
| Auditoria lectura batch | `POST /crm/v3/objects/contacts/batch/read` |

## Estrategia de deduplicacion

- Contactos: busqueda exacta por `email`.
- Companias: busqueda exacta por `domain`.

Si existe el registro, no se reemplazan campos con valor; solo se rellenan campos vacios mediante `fillBlankProperties()`.

## Creacion y actualizacion de companias

La compania se procesa antes que el contacto:

1. Buscar compania por `domain`.
2. Si existe, completar campos vacios.
3. Si no existe, crear compania.

Propiedades:

- `name`
- `domain`
- `website`
- `phone`
- `city`
- `state`
- `country`
- `zip`
- `linkedin_company_page`
- `numberofemployees`
- `apollo_company_keywords`

## Creacion y actualizacion de contactos

1. Construir `contactIncoming` desde candidato normalizado.
2. Agregar `freelan_icp_match_context`.
3. Buscar contacto por `email`.
4. Si existe, completar campos vacios.
5. Si no existe, crear contacto.
6. Asociar con compania.

Propiedades:

- `firstname`
- `lastname`
- `email`
- `jobtitle`
- `company`
- `hs_linkedin_url`
- `city`
- `state`
- `country`
- `phone`
- `hs_whatsapp_phone_number`
- `freelan_icp_match_context`

## Telefonos

- Movil (`mobile`) se escribe en `hs_whatsapp_phone_number`.
- Directos (`direct`, `direct_dial`, `work_direct`) se escriben en `phone`.
- `work_hq` queda excluido del contacto.

## Propiedad custom

El sistema asegura la propiedad de contacto:

- Nombre interno: `freelan_icp_match_context`
- Tipo: `string`
- Field type: `textarea`
- Grupo: `contactinformation`

Riesgo: `POST /api/setup/hubspot-properties` y `executeTest()`/`executeFinal()` pueden crear la propiedad. La creacion automatica es conveniente, pero en ARA deberia moverse a migraciones/infra controlada.

## Errores y permisos

Los errores HubSpot se propagan como texto hacia el reporte de fallos por contacto. No hay clasificacion por permisos, validacion de scopes, retry, backoff ni cola de reintentos.

## Recomendacion ARA

Clasificacion: **REUSE_WITH_MINOR_CHANGES** para el mapeo de propiedades y normalizacion telefonica; **REFACTOR** para el conector HubSpot.

Acciones recomendadas:

1. Separar `HubSpotConnector` de `clients.js`.
2. Agregar contratos de DTO para contacto y compania.
3. Centralizar scopes requeridos.
4. Agregar idempotency/audit event por operacion.
5. Proteger operaciones de escritura con Approval Service.

