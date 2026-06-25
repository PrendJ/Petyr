# Petyr target database model

The first Petyr forecasting schema is implemented in:

```txt
apps/forecasting-app/prisma/schema.prisma
```

Apply it from `apps/forecasting-app` with:

```bash
npm run db:sync
```

Do not run raw `npx prisma db push` against the shared platform database. Petyr's
`db:push` wrapper preserves Redash materialized latest tables while Prisma
updates static Redash/Petyr tables.

For migration-managed environments, create and review a migration instead:

```bash
npx prisma migrate dev --name add_petyr_forecasting_schema
```

Implemented Petyr-owned tables:

## forecast_monthly

- id
- company_name
- csm_name
- business_unit
- year
- month
- forecast_type: previous_month | ongoing
- value
- ai_forecast_value
- status: draft | saved | locked
- created_by
- created_at
- updated_by
- updated_at

## forecast_annual

- id
- company_name
- csm_name
- business_unit
- year
- value
- ai_forecast_value
- value_source: manual | ai_confirmed
- status: draft | consolidated
- note
- created_by
- created_at
- updated_by
- updated_at
- consolidated_by
- consolidated_at

`forecast_annual` is the current/latest annual CSM forecast source. Management
View reads it as Ongoing Forecast.

## forecast_annual_entry

- id
- company_name
- csm_name
- year
- initial_forecast
- ongoing_confidence: 01 High | 02 Mid | 03 Low
- created_by
- created_at
- updated_by
- updated_at

`forecast_annual_entry` stores customer + year metadata for the CSM-facing
Annual Forecast Entry section. The Business Unit annual values remain in
`forecast_annual`; FC Ongoing is derived by summing only saved or confirmed BU
values. Unclicked AI placeholders are not persisted and do not contribute.

FC Initial is editable only from December 10 of the previous year through
January 10 of the selected year. Outside that window it is read-only.

## forecast_annual_snapshot

Frozen annual forecast snapshots live in a dedicated table so Initial Forecast
does not mutate Ongoing Forecast.

- id
- company_name
- csm_name
- business_unit
- year
- snapshot_type: initial
- value
- source: manual_excel_2026 | year_end_consolidation | admin
- note
- created_by
- created_at
- locked_at

Unique key:

```txt
company_name + business_unit + year + snapshot_type
```

Rules:

- Initial Forecast reads from `forecast_annual_snapshot` where `snapshot_type=initial`.
- Ongoing Forecast reads from current/latest `forecast_annual`.
- The 2026 Excel bootstrap writes only Initial Forecast snapshot rows.
- Future year-end consolidation writes only Initial Forecast snapshot rows.
- Rows with `locked_at` are immutable for normal import/consolidation runs.
  A protected admin recovery operation must pass an explicit override before a
  locked Initial Forecast snapshot can be overwritten.

## forecast_annual_snapshot_change_log

- id
- snapshot_id
- company_name
- csm_name
- business_unit
- year
- snapshot_type
- previous_value
- new_value
- previous_source
- new_source
- note
- changed_by
- changed_at

Every effective snapshot creation or overwrite writes one audit row.

## forecast_save_session

- id
- company_name
- csm_name
- source
- year
- month
- forecast_type
- note
- company_active_status
- created_by
- created_at

## forecast_change_log

- id
- save_session_id
- company_name
- business_unit
- field_name
- previous_value
- new_value
- ai_forecast_value_at_save
- created_by
- created_at

## company_forecast_status

- id
- company_name
- is_active
- reason
- updated_by
- updated_at

## app_setting

- setting_key
- setting_value
- updated_at

Temporary Petyr settings are stored here. The selected OpenRouter model uses
`setting_key=petyr.openrouter.model` and falls back to `OPENROUTER_DEFAULT_MODEL`
when no row exists.

## ai_forecast_cache

- id
- company_name
- business_unit
- year
- month
- forecast_value
- confidence_score
- model_version
- explanation
- generated_at
- provider
- model
- prompt_version
- input_hash
- request_payload_summary
- validated_output
- status
- error_message
- created_at
- updated_at

Forecast Intelligence analysis rows use `business_unit=__forecast_intelligence__`, `month=0` and `forecast_value=0`. Numeric AI forecast readers must exclude this sentinel row and read only successful months 1-12. For sentinel rows, `model_version` is an internal cache key that includes provider model, prompt version and input hash.

## management_objective

Annual management objectives persist Branch and Business Unit objective values
separately from CSM forecast tables.

Required objective fields:

- scope type: `branch` or `business_unit`
- scope key: Branch name from Company Ownership or official Business Unit name
- year
- value
- note
- created_by
- created_at
- updated_by
- updated_at

Unique key:

```txt
scope_type + scope_key + year
```

## management_objective_change_log

Required objective audit fields:

- scope type: `branch` or `business_unit`
- scope key: Branch name or official Business Unit name
- year
- previous value
- new value
- note
- updated by, even if temporarily a placeholder until authentication exists
- timestamp

Rules:

- Branch keys come from the dynamic Company Ownership `company_branch` list.
- Business Unit keys must stay within the official closed list.
- Objective rows must not be derived from Redash.
- Objective rows must not be derived from annual forecasts.

## Business Unit rule

Business Unit is stored as a string in this first schema. App logic must validate values
against the official list from `03_petyr_business_rules.md`.
