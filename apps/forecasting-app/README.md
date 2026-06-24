# Petyr Forecasting App

Petyr is the forecasting product app for UNGUESS.

It is intentionally separated from `apps/redash-ingestor`.

## Current scope

This base app includes:

- Next.js + TypeScript app;
- the approved Petyr visual rendering at `/forecasting`;
- Management Objectives in Management View, with `/forecasting/entry/objectives` kept as a management-only compatibility route;
- PostgreSQL database backup export/import in `/petyr-admin`;
- Excel-first monthly forecast import/export in `/petyr-admin`;
- persisted sanitized performance results in `/petyr-admin`;
- local UI components needed by the rendering;
- Dockerfile;
- Prisma read model for Redash snapshots;
- health API;
- first DB preview API.

## Important rule

Petyr must not call Redash directly.

Correct flow:

```txt
Redash -> redash-ingestor -> PostgreSQL -> Petyr
```

## Local app commands

```bash
npm install
npm run db:generate
npm run dev
```

## Environment

Petyr reads these AI settings from the environment:

```env
OPENROUTER_API_KEY=replace_me
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini
```

`OPENROUTER_API_KEY` is used server-side by `/api/petyr/admin/openrouter-models` and must not be hardcoded or exposed to the browser.
`OPENROUTER_DEFAULT_MODEL` is the `/petyr-admin` fallback when no model setting has been saved.
Forecast Entry Monthly forecast and Company Detail expose a CSM-facing
`Generate Intelligence` control to users with `petyr:forecast:write`. It calls
OpenRouter only server-side through the dry-run Forecast Intelligence path,
renders validated consultative JSON and does not expose apply controls, prompt
payloads or OpenRouter I/O diagnostics.
Management Objectives are controlled through Petyr Access Layer permission
`petyr:management:write`. The old temporary hardcoded password gate has been
removed; Forecast Entry no longer embeds the objective editor.

## Applying database schema changes

Petyr's Prisma schema lives in:

```txt
apps/forecasting-app/prisma/schema.prisma
```

After schema changes, regenerate the Prisma client:

```bash
npm run db:generate
```

To apply the current schema directly to a local PostgreSQL database, set `DATABASE_URL`
and run:

```bash
npm run db:push
```

Do not run raw `npx prisma db push` against the shared platform database. Petyr's
`db:push` script preserves Redash materialized latest tables while Prisma updates
the static Redash/Petyr tables.

For local/dev work where the Prisma client and local database should be brought
in sync before verifying the app, run:

```bash
npm run db:sync
npm run build
```

Or use the combined local/dev helper:

```bash
npm run build:sync
```

`build:sync` is intentionally separate from `build` so production and CI builds
do not run database-changing commands implicitly.

One-time 2026 closed revenue to Previous Month and Ongoing Forecast alignment:

Use `/petyr-admin` -> `2026 closed revenue alignment` when shell commands are unavailable. The admin control requires `APP_INTERNAL_SECRET`, runs dry-run first and applies only after explicit confirmation. CLI fallback:

```bash
npm run backfill:2026-ongoing-from-closed -- --dry-run
npm run backfill:2026-ongoing-from-closed -- --apply
```

This is an exceptional 2026 repair operation. It copies already closed Redash campaign revenue through the selected execution date into monthly `forecast_monthly` previous-month and ongoing rows with the same real value, plus annual `forecast_annual` rows used by Management View Ongoing Forecast. It must not become a recurring import, scheduler, CSM workflow or future-year workflow, and it must not update Initial Forecast snapshots, Redash materialized closed revenue, AI forecast cache or Management Objectives.

`/petyr-admin` Data Health also shows PostgreSQL-only Redash sync status for `master_campaigns`, `master_agreements` and `company_ownership`, includes a link to the Redash Ingestor dashboard at `/redash-ingestor`, and reports latest sync status, row counts, snapshot rows, materialized rows and latest error. When `company_ownership` is unavailable but real campaign/agreement/forecast rows exist, Petyr warns that real fallback rendering is active instead of showing mock customers.

AI preview backtest for calibration:

```bash
npm run backtest:ai-preview -- --as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10
```

The command is read-only. It selects the top companies by closed revenue through the selected as-of date, runs Petyr deterministic AI preview logic as of that date, and compares the requested future months with closed revenue currently available in PostgreSQL. It does not call OpenRouter and does not write `ai_forecast_cache`, CSM forecast tables, Redash materialized tables or audit tables.

Petyr Admin also exposes the same read-only calibration workflow in the `AI preview backtest` card. The card calls:

```txt
POST /api/petyr/admin/ai-preview-backtest
```

Send `x-app-secret: APP_INTERNAL_SECRET`. The default admin payload is `asOf=2026-03-15`, `year=2026`, `months=[5,6]`, `selection=top_revenue` and `limit=10`.

Nightly deterministic AI Forecast worker:

```bash
npm run worker:ai-forecast:once
npm run worker:ai-forecast:loop
```

The Docker Compose service `petyr-ai-forecast-worker` runs the loop every night
at `PETYR_AI_FORECAST_DAILY_TIME=01:00` in `Europe/Rome`, with
`PETYR_AI_FORECAST_DELAY_MS=3000` between active companies. It targets the
current Rome year, excludes only companies explicitly marked inactive, computes
the same local deterministic preview rows used by Forecast Entry, and saves them
to `ai_forecast_cache` with daily append-only model versions such as
`petyr_deterministic_preview_v1@YYYY-MM-DD`. It does not call OpenRouter or
Forecast Intelligence, and it does not write CSM forecast, annual forecast,
management objective, Initial Forecast, closed revenue or Redash tables.

Management Objectives use:

```txt
GET /api/petyr/management-objectives?year=YYYY
POST /api/petyr/management-objectives
```

They require `petyr:management:write` and persist in `management_objective` and
`management_objective_change_log`.

Petyr Admin monthly forecast Excel workflow uses:

```txt
GET /api/petyr/admin/export-monthly-forecast-xlsx?year=2026&csmName=...
POST /api/petyr/admin/import-monthly-forecast-xlsx
```

Excel is the recommended bulk admin format for 2026 historical input and CSM-friendly
forecast updates. CSV import/export routes remain available as legacy/advanced
compatibility.

Petyr Admin performance results use:

```txt
GET /api/petyr/admin/performance-results
```

The endpoint requires `petyr:admin` and reads `petyr_performance_measurement`.
Forecasting and Redash Ingestor write only sanitized operation measurements:
service, operation, status, duration, row count, measured time and small scalar
metadata. Browser DevTools timings, raw Redash payloads, workbook contents,
customer rows and secrets are not stored.

Petyr Admin database backup workflow uses:

```txt
GET /api/petyr/admin/database-backup/export
POST /api/petyr/admin/database-backup/import
```

Both endpoints require `petyr:admin` and `x-app-secret: APP_INTERNAL_SECRET`.
The workflow uses native PostgreSQL SQL dumps so a new server can restore the
shared PostgreSQL data hub, including Redash snapshots/metadata, materialized
tables and Petyr-owned forecast data. Restore can drop/recreate database objects
from the dump and is intended only for server migration or controlled recovery,
not as the final production backup policy.

Petyr Admin no longer exposes the Initial Forecast baseline workflow in the visible `/petyr-admin` workspace. The controlled endpoints remain:

```txt
GET /api/petyr/admin/export-initial-forecast-xlsx?year=2026
POST /api/petyr/admin/import-initial-forecast-xlsx
```

This workflow is separate from monthly forecast import/export. It writes only frozen
Initial Forecast rows in `forecast_annual_snapshot` and audit entries in
`forecast_annual_snapshot_change_log`; it does not update `forecast_annual`,
`forecast_monthly`, closed revenue, AI forecast cache or Management Objectives.

Future Initial Forecast consolidation is available as a protected internal
operation:

```txt
POST /api/petyr/admin/consolidate-initial-forecast
```

Send `x-app-secret: APP_INTERNAL_SECRET`. The default business timezone is
`Europe/Rome`. Until a real scheduler exists, controlled manual recovery should
pass an explicit `year`; an omitted `year` is inferred only on January 1 in
`Europe/Rome`. Locked Initial Forecast snapshots are left unchanged unless the
protected request explicitly passes `overrideLocked=true`.

The real automatic scheduler for January 1 in `Europe/Rome` remains a platform
backlog item.

For migration-managed development, create a migration instead:

```bash
npx prisma migrate dev --name add_petyr_forecasting_schema
```

Then verify the app still builds:

```bash
npm run build
```

When running this app directly with `npm run dev`, open the port printed by Next.js and visit `/forecasting`.

## Docker usage

In the full data platform, Petyr should be started from the root `docker-compose.yml`, not from this folder alone.

Expected local gateway URLs when orchestrated by root compose:

```txt
http://localhost:8080/forecasting
http://localhost:8080/petyr-admin
```

The direct Compose port `http://localhost:3001/forecasting` remains a local/debug convenience, but the user-facing route is the gateway on port `8080`.

## Access Layer preparation

Petyr is prepared to consume the external Access Layer Google SSO protocol without bundling or deploying the Access Layer service itself.

Local development stays open by default:

```env
NODE_ENV=development
PETYR_AUTH_MODE=disabled
```

In this mode Petyr uses a deterministic local identity, `dev.petyr@local`, with all Petyr MVP permissions so developers can continue using `/forecasting`, `/petyr-admin` and local APIs without login.

Production must fail closed through Access Layer:

```env
PETYR_AUTH_MODE=access-layer
ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/auth/callback
ACCESS_LAYER_TOOL_SLUG=petyr
ACCESS_LAYER_CLIENT_ID=replace_with_petyr_tool_client_id
ACCESS_LAYER_CLIENT_SECRET=replace_with_petyr_tool_client_secret
PETYR_SESSION_SECRET=replace_with_long_random_session_secret
```

Petyr implements only the tool-side flow: `/auth/login`, `/auth/callback` and `/auth/logout`. The Access Layer service remains external and must register the `petyr` tool with the callback URL above. If a company-domain user completes Access Layer authentication but the returned grant does not include `petyr:read`, Petyr clears the local auth state and session cookies, then shows an Italian pending-access fallback telling the user that the administrator has been notified and to refer to Lorenzo Brandi for access timing. After the grant is released, the user should return through `/auth/login` and receive a fresh clean session.
