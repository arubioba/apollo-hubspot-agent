# Despliegue Actual En Railway

## Configuracion encontrada

Archivo: `railway.toml`

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
```

Archivo: `Dockerfile`

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

## Proceso de ejecucion

1. Railway construye imagen desde Dockerfile.
2. Instala dependencias de produccion con `npm ci --omit=dev`.
3. Ejecuta `npm start`.
4. `npm start` lanza `node src/server.js`.
5. Express escucha `PORT` o 3000.
6. Railway usa `/health` como healthcheck.

## Variables requeridas

Desde `src/config.js` y `.env.example`:

- `PORT`
- `DATABASE_URL`
- `APOLLO_API_KEY`
- `HUBSPOT_PRIVATE_APP_TOKEN` o `HUBSPOT_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `APPROVAL_CODE`
- `TZ`
- `DAILY_IMPORT_LIMIT`
- `TEST_BATCH_SIZE`
- `APOLLO_API_BASE`
- `HUBSPOT_API_BASE`

No se documentan valores reales y no deben incluirse en repositorio.

## Base de datos

El servicio espera PostgreSQL mediante `DATABASE_URL`. Si el string contiene `railway`, se habilita SSL con `rejectUnauthorized: false`.

Tablas creadas automaticamente al arrancar:

- `import_runs`
- `daily_imports`

## Healthcheck

`GET /health` devuelve:

- `ok`
- `database`
- `configuration`
- `missingConfig`

Riesgo: expone nombres de variables faltantes. No expone secretos, pero en produccion conviene limitar detalle o proteger diagnosticos.

## Jobs y workers

No hay workers ni cron jobs en Railway definidos en el repositorio. El limite diario se resetea logicamente al cambiar `day_key` por zona horaria, no por proceso programado.

## Riesgos de despliegue

1. App sin autenticacion expuesta en URL publica.
2. Diagnosticos y setup accesibles por HTTP.
3. No hay migraciones formales; el schema se crea en runtime.
4. No hay observabilidad centralizada.
5. No hay readiness separada de liveness.
6. Reinicios pueden interrumpir importaciones en proceso.

## Recomendacion ARA

Clasificacion: **REUSE_WITH_MINOR_CHANGES** para Docker/Railway como entorno inicial; **REFACTOR** para operacion productiva ARA.

Acciones:

1. Agregar autenticacion antes de mantener URL publica.
2. Separar health publico de diagnostics privados.
3. Migraciones versionadas.
4. Logs estructurados.
5. Jobs/colas para importaciones largas.
6. Variables gestionadas por entorno ARA.

