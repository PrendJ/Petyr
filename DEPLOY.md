# DEPLOY

Root deployment notes for the multi-project platform.

Existing deployment documentation remains valid and must be read first:

- `README_INSTALL_DOCKER.md`
- `README_PETYR_INSTALL.md`
- `docs/08_operational_commands.md`

This file adds cross-project deployment governance and future Access Control Platform notes.

## Current platform

The current root uses Docker Compose and includes:

- PostgreSQL shared data hub;
- `apps/redash-ingestor`;
- `apps/forecasting-app`;
- `platform-home`.

## Petyr schema sync before local/dev builds

When Petyr's Prisma schema changes and a local/dev PostgreSQL database is behind
the app schema, synchronize it explicitly from the app folder:

```bash
cd apps/forecasting-app
npm run db:sync
```

For local/dev verification that also builds Petyr afterward:

```bash
cd apps/forecasting-app
npm run build:sync
```

`db:sync` runs Prisma client generation and Petyr's safe `db:push` wrapper. The
wrapper preserves Redash materialized latest tables while Prisma updates static
Redash/Petyr tables. Keep production and CI on explicit migration/deploy steps;
do not make plain `npm run build` mutate the database implicitly.

## Unified Petyr access


Local Docker exposes one user-facing host through the `platform-home` Nginx gateway:

```txt
http://localhost:8080/forecasting       -> forecasting-app
http://localhost:8080/petyr-admin       -> forecasting-app
http://localhost:8080/redash-ingestor   -> redash-ingestor
```

On a server, publish the chosen Petyr host/domain to the same paths through the selected reverse proxy. Keep `forecasting-app`, `redash-ingestor` and `redash-worker` as separate services behind the proxy. Do not make Forecasting call Redash directly; Forecasting continues to read PostgreSQL-backed data or future stable internal data APIs.

The non-secret `REDASH_INGESTOR_BASE_PATH` defaults to `/redash-ingestor` in root Docker Compose and is passed into the Redash Ingestor build as `NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH` so its Next.js assets and API links work under the gateway path.

## Access Control deployment target

Petyr is prepared to integrate with an external Access Layer service using the tool-side one-time-code flow. The Access Layer service itself remains a separate deployment and must not be copied into this repository as part of Petyr deployment.

Confirmed target URLs:

```txt
Access Layer: https://access-layer.unguess-internal.net
Petyr:        https://petyr.unguess-internal.net
Callback:     https://petyr.unguess-internal.net/auth/callback
Redash Ingestor operator path:
              https://petyr.unguess-internal.net/redash-ingestor
Redash Ingestor callback:
              https://petyr.unguess-internal.net/redash-ingestor/auth/callback
```

For local development, Petyr authentication defaults to disabled when `NODE_ENV=development`. Production must set:

```env
PETYR_AUTH_MODE=access-layer
PETYR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.unguess-internal.net
PETYR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.unguess-internal.net
PETYR_ACCESS_LAYER_CALLBACK_URL=https://petyr.unguess-internal.net/auth/callback
PETYR_ACCESS_LAYER_TOOL_SLUG=petyr
PETYR_ACCESS_LAYER_CLIENT_ID=replace_with_petyr_tool_client_id
PETYR_ACCESS_LAYER_CLIENT_SECRET=replace_with_petyr_tool_client_secret
PETYR_SESSION_SECRET=replace_with_long_random_session_secret
```

Root Docker Compose maps the `PETYR_ACCESS_LAYER_*` values into the generic `ACCESS_LAYER_*` names inside the `forecasting-app` container. Standalone app deployment may set the generic variables directly.

The Access Layer Admin UI must register a `petyr` tool with the callback URL above and these Petyr permission keys:

```txt
petyr:read
petyr:forecast:write
petyr:management:write
petyr:admin
petyr:redash:operator
```

Redash Ingestor is a separate Access Layer tool and remains the only service that calls Redash. Petyr must continue to consume PostgreSQL-backed data and must not call Redash or Redash Ingestor for product data.

Production Redash Ingestor Access Layer values:

```env
REDASH_INGESTOR_AUTH_MODE=access-layer
REDASH_INGESTOR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.unguess-internal.net
REDASH_INGESTOR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.unguess-internal.net
REDASH_INGESTOR_ACCESS_LAYER_CALLBACK_URL=https://petyr.unguess-internal.net/redash-ingestor/auth/callback
REDASH_INGESTOR_ACCESS_LAYER_TOOL_SLUG=redash-ingestor
REDASH_INGESTOR_ACCESS_LAYER_CLIENT_ID=replace_with_redash_ingestor_tool_client_id
REDASH_INGESTOR_ACCESS_LAYER_CLIENT_SECRET=replace_with_redash_ingestor_tool_client_secret
REDASH_INGESTOR_SESSION_SECRET=replace_with_long_random_session_secret
```

Root Docker Compose maps the `REDASH_INGESTOR_ACCESS_LAYER_*` values into the generic `ACCESS_LAYER_*` names inside the `redash-ingestor` container. Standalone app deployment may set the generic variables directly.

The Access Layer Admin UI must register a `redash-ingestor` tool with:

```txt
redash-ingestor:read
redash-ingestor:sync
redash-ingestor:sources:write
redash-ingestor:admin
```

Non-secret onboarding descriptors for both tools live in `petyr/access-layer-tools/`.

## Deployment rule

Do not expose the production Petyr host until:

1. `docs/access-control/SOURCE_OF_TRUTH.md` has been read;
2. the external Access Layer service is deployed and healthy;
3. environment variables are documented;
4. local smoke tests are defined;
5. `DECISIONS.md` records the chosen Access Layer/Petyr URL contract.

`/redash-ingestor` is routed directly by the gateway to the Redash Ingestor service. Its operator surface is protected inside `apps/redash-ingestor`; server deployments must still avoid exposing backend ports directly around the gateway/proxy.

## Post-deploy checks for Access Control

When implemented, the minimum post-deploy checks are:

```txt
[ ] Anonymous user cannot access protected app.
[ ] Non-company Google account is rejected.
[ ] Company Google account can login.
[ ] Auth API returns allowed=false for users without tool membership.
[ ] Auth API returns allowed=true for authorized users.
[ ] Protected backend blocks direct requests without trusted auth header.
[ ] Audit event is written for successful access.
[ ] Audit event is written for denied access.
[ ] Logout clears session cookie.
```

## Rollback direction

If Access Control breaks access to a tool, rollback must prefer restoring the previous proxy/routing layer rather than weakening app-level authorization.

Never bypass authorization by hardcoding emails inside application code.
