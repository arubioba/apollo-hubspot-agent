# Auditoria De Seguridad

## Resumen

El sistema maneja credenciales sensibles y puede escribir en HubSpot. Actualmente confia en que el uso sera interno, pero no implementa autenticacion ni autorizacion. Para ARA, este es el principal bloqueo antes de ampliar capacidades.

## Hallazgos

### S1 - Aplicacion sin autenticacion

- Ubicacion: `src/server.js`, `public/app.js`.
- Riesgo: cualquier persona con la URL puede iniciar busquedas, ejecutar pruebas e importar contactos.
- Impacto: escritura no autorizada en HubSpot, consumo de creditos Apollo/OpenAI y fuga de datos de candidatos.
- Recomendacion: agregar auth antes de cualquier migracion ARA publica o semi-publica.
- Prioridad: Critica.

### S2 - Endpoints de mutacion CRM expuestos

- Ubicacion: `/api/runs/:id/test`, `/api/runs/:id/import`, `/api/setup/hubspot-properties`.
- Riesgo: operaciones de escritura en HubSpot sin usuario autenticado ni permisos.
- Recomendacion: proteger con Approval Service y RBAC.
- Prioridad: Critica.

### S3 - Codigo de aprobacion fijo

- Ubicacion: `src/config.js`, `src/agent.js`.
- Riesgo: un secreto compartido no identifica actor, no rota por operacion y no deja auditoria de aprobacion.
- Recomendacion: reemplazar por aprobaciones firmadas/expirables, con actor y scope.
- Prioridad: Alta.

### S4 - Falta de rate limiting

- Ubicacion: todas las rutas API.
- Riesgo: abuso de endpoints, costos y saturacion de proveedores.
- Recomendacion: rate limit por usuario/IP y limites por tenant.
- Prioridad: Alta.

### S5 - Errores externos pueden exponerse al usuario

- Ubicacion: `request()` en `src/clients.js`, route wrapper en `src/server.js`.
- Riesgo: mensajes de APIs externas pueden revelar detalles operativos.
- Recomendacion: normalizar errores, guardar detalle interno y mostrar mensajes seguros.
- Prioridad: Media.

### S6 - Healthcheck muestra variables faltantes

- Ubicacion: `/health`.
- Riesgo: revela nombres de configuracion esperada.
- Recomendacion: health publico minimalista y diagnostics protegidos.
- Prioridad: Media.

### S7 - No hay CSRF ni proteccion browser-side

- Ubicacion: UI y API.
- Riesgo: si un usuario autenticado existiera en el futuro, endpoints POST podrian requerir CSRF/token.
- Recomendacion: resolver junto con auth.
- Prioridad: Media.

### S8 - Persistencia de datos personales

- Ubicacion: `import_runs.candidates`, `test_results`, `final_results`.
- Riesgo: se guardan emails, telefonos y datos de contactos en PostgreSQL sin politica de retencion.
- Recomendacion: clasificar PII, minimizar datos guardados, agregar retencion y auditoria de acceso.
- Prioridad: Alta.

### S9 - SSL PostgreSQL con `rejectUnauthorized: false`

- Ubicacion: `src/db.js`.
- Riesgo: reduce validacion TLS cuando `DATABASE_URL` contiene `railway`.
- Recomendacion: validar practica recomendada de Railway o configurar CA.
- Prioridad: Media.

## Manejo de secretos

Los secretos se leen desde variables de entorno y no aparecen hardcodeados en codigo. `normalizeSecret()` limpia espacios, comillas y `Bearer`.

Variables sensibles:

- `APOLLO_API_KEY`
- `HUBSPOT_PRIVATE_APP_TOKEN` / `HUBSPOT_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `APPROVAL_CODE`
- `DATABASE_URL`

## Recomendacion de seguridad para ARA

Bloqueantes antes de escalar:

1. Autenticacion.
2. Autorizacion por rol.
3. Auditoria append-only.
4. Approval Service real.
5. Rate limits y cuotas.
6. Politica de retencion PII.

