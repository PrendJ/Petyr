# BACKLOG

Root backlog for cross-project issues, open questions, deferred scope and ambiguities that must not be solved by assumption.

Project-specific backlog items should be placed in the most specific backlog available, for example:

- `docs/access-control/BACKLOG.md`
- `docs/petyr/*`
- `apps/<app>/BACKLOG.md`
- `services/<service>/BACKLOG.md`

## Entry format

```md
## <short title>

- Area:
- Problem/question:
- Impact:
- Status:
- Proposal / next action:
```

---

## Define production PostgreSQL backup policy beyond Petyr Admin migration dumps

- **Area:** Platform / PostgreSQL / Backup and recovery
- **Problem/question:** Petyr Admin now exposes protected PostgreSQL SQL dump export/import for server migration and controlled recovery, but the long-term production backup policy is not defined.
- **Impact:** Operators can move the current shared database to a new server, but retention, encryption, offsite storage, restore testing, point-in-time recovery, maximum upload/download size and responsibility ownership remain unresolved.
- **Status:** Open.
- **Proposal / next action:** Define the production backup standard for the PostgreSQL service, including schedule, storage location, encryption, retention, PITR expectations, restore drill cadence and whether large backups should move from browser-mediated admin flow to server-side object storage or host-level jobs.

## Resolve Petyr Excel workbook dependency deprecation warnings

- **Area:** Petyr / Forecasting App / Excel import-export dependencies
- **Problem/question:** Docker npm install reported deprecated transitive packages through the current Excel workbook stack. `exceljs@4.4.0` is still the latest release and still declares older transitive ranges, including `uuid@^8.3.0`, `archiver@^5.0.0`, `fast-csv@^4.3.1` and `unzipper@^0.10.11`.
- **Impact:** Resolved for the current Petyr Docker install path by committing a lockfile and narrowly scoped npm overrides that replace the deprecated transitive packages reported in the build log while keeping ExcelJS as the workbook API.
- **Status:** Resolved on 2026-06-16.
- **Proposal / next action:** Keep the overrides and lockfile under normal build validation. Revisit only if ExcelJS publishes a maintained release with updated dependency ranges or if workbook import/export regression testing exposes incompatibility.

## Define initial OpenRouter model for Petyr AI Forecasting

- **Area:** Petyr / AI Forecasting / OpenRouter
- **Problem/question:** The first production model for Petyr AI Forecasting has not been selected.
- **Impact:** Production AI forecasting cannot be enabled safely because payload size, cost, latency, response quality and model-version audit semantics depend on the selected model.
- **Status:** Open TODO.
- **Proposal / next action:** Evaluate candidate OpenRouter models against the manual MVP payload and future anonymized `docs/petyr/AI_FORECASTING_DESIGN.md` payload schema using synthetic or sanitized data where possible, then document the accepted default model and fallback.

## Define Petyr AI Forecast confidence threshold

- **Area:** Petyr / AI Forecasting / Output policy
- **Problem/question:** The minimum accepted `confidence_score` and behavior for low-confidence AI forecast rows are not defined.
- **Impact:** Petyr cannot decide consistently whether to save, hide, flag or reject low-confidence AI forecast output.
- **Status:** Open TODO.
- **Proposal / next action:** Define a threshold and display/persistence policy, for example save with warning, skip below threshold or show low-confidence rows only in admin diagnostics.

## Calibrate Petyr deterministic AI Forecast baseline weights

- **Area:** Petyr / AI Forecasting / Deterministic baseline
- **Problem/question:** The source of truth defines the required baseline strategies, but the final business-approved formula weights, sparse-history thresholds and residual-pressure adjustment policy are not yet calibrated.
- **Impact:** The baseline engine can produce deterministic, explainable candidate forecasts for manual testing, but Management/Finance should validate the formula before treating it as a final business forecasting policy.
- **Status:** Open TODO.
- **Proposal / next action:** Review manual company-by-company baseline output against known accounts, then document accepted strategy weights, dampening thresholds and whether company-level agreement residual pressure should adjust Business Unit baselines or remain an advisory signal until agreements expose canonical BU attribution.

## Define Petyr AI Forecast batch size

- **Area:** Petyr / AI Forecasting / Batch operations
- **Problem/question:** Deterministic nightly AI Forecast automation is now accepted for active companies, but LLM/OpenRouter automated batch sizing is still undefined.
- **Impact:** Resolved for cost-free deterministic preview persistence because it runs locally, one active company at a time, with `PETYR_AI_FORECAST_DELAY_MS=3000` and daily append-only cache model versions. Still open for any future OpenRouter/Forecast Intelligence batch because cost, rate limits, quality gates and privacy hardening remain unresolved.
- **Status:** Partially resolved on 2026-06-20 for deterministic nightly automation; deferred for LLM/OpenRouter automation.
- **Proposal / next action:** Keep the dedicated deterministic worker. Before enabling any automated LLM/OpenRouter batch, choose batch size, rate limits, wait/backoff policy, timeout budget, queue semantics, anonymization requirements and quality/cost thresholds.

## Align Petyr AI Forecast implementation naming with manual MVP

- **Area:** Petyr / AI Forecasting / API and services
- **Problem/question:** Existing implementation naming still uses batch-oriented names such as `ai-forecast-batch` or `aiForecastBatchService`, while the source of truth now scopes the MVP to one selected company and one target year per manual request.
- **Impact:** The naming can confuse operators or future implementers into treating the manual MVP as a global/all-company batch workflow.
- **Status:** Open TODO; no code change in this documentation-only task.
- **Proposal / next action:** In a future implementation task, align endpoint/service naming and request validation with the manual single-company contract, or clearly document any legacy route name as an implementation detail that rejects global/all-company execution.

## Build future Petyr AI Forecast anonymization service

- **Area:** Petyr / AI Forecasting / Privacy
- **Problem/question:** Complete anonymization through a dedicated tool/API is deferred for the first manual MVP.
- **Impact:** The first controlled company-by-company AI test can proceed, but definitive payload protection is not implemented yet. Broader production rollout needs a reliable way to prevent company, CSM, campaign, agreement names and links from reaching the LLM/OpenRouter payload.
- **Status:** Open TODO for a future privacy-hardening task.
- **Proposal / next action:** Design and implement a server-side anonymization service/tool that strips or pseudonymizes company, CSM, campaign, agreement names, deal links, campaign links, notes and identifying free text before any broader production AI rollout.

## Define Petyr AI Forecast output validation

- **Area:** Petyr / AI Forecasting / Validation
- **Problem/question:** The exact validator for model output has not been finalized beyond the design-level schema.
- **Impact:** Partially resolved for the manual LLM reasoning contract. Petyr now has pure strict-JSON response validation for official Business Units, selected year, future-month eligibility, numeric bounds, `confidenceScore` bounds/nullability and required explanation/advice/drivers. Future persistence integration still needs pseudonym reconciliation, non-identifying explanation sanitization, partial-failure behavior and cache-write policy before any production LLM call writes to `ai_forecast_cache`.
- **Status:** Partially resolved on 2026-05-26; remaining production hardening TODO.
- **Proposal / next action:** Wire the validator into the manual company-by-company OpenRouter path only after adding pseudonym reconciliation, explanation/privacy sanitization, partial-failure handling and no-overwrite cache behavior.

## Define persistence for rich Petyr AI Forecast MVP output

- **Area:** Petyr / AI Forecasting / Data model
- **Problem/question:** The manual MVP output contract includes `baselineForecast`, `plannedCampaignsValue`, `agreementResidualSignal`, `advice` and `drivers`, but the current `ai_forecast_cache` table has dedicated columns only for the forecast value, confidence, model version, explanation and generation timestamp.
- **Impact:** A manual run can validate and return the richer JSON contract, but Petyr needs a documented persistence/API decision before those driver fields can be queried later as structured data.
- **Status:** Open TODO; out of scope for this documentation-only task.
- **Proposal / next action:** Decide whether to extend `ai_forecast_cache`, add an AI forecast run/detail table, or keep baseline/signals/advice/drivers as transient manual-run diagnostics until the MVP quality review confirms which fields need durable storage.

## Define append-only AI Forecast cache versioning

- **Area:** Petyr / AI Forecasting / Data model
- **Problem/question:** Product direction says not to overwrite historical AI Forecast output, while the current `ai_forecast_cache` uniqueness is scoped by company, Business Unit, year, month and model version.
- **Impact:** Future regeneration for the same target and model needs a documented append-only versioning/history strategy before implementation can safely refresh AI forecasts without losing prior generations.
- **Status:** Open TODO.
- **Proposal / next action:** Decide whether `model_version` includes prompt/version identifiers, whether a new generation/run identifier is needed, or whether a dedicated AI forecast history table should be added in a later schema task.

## Define non-operational expired agreement residual category for Petyr

- **Area:** Petyr / Alerts / Agreement residuals
- **Problem/question:** Expired agreements can still have residual value and must remain visible without being confused with expiring-soon warnings.
- **Impact:** Resolved. Petyr now has a separate `Expired agreement with residual` alert/action category that shows residual value and stays separate from `expiring within 60 days`.
- **Status:** Resolved on 2026-05-22 for documentation/decision and implementation.
- **Proposal / next action:** Monitor real data usage; refine severity or ordering only through a later documented product decision.

## Confirm or materialize agreement links for Petyr Company Detail

- **Area:** Petyr / Redash mapping / Company Detail
- **Problem/question:** Master Agreements does not expose a usable agreement link. The useful link is the deal link present in Master Campaigns.
- **Impact:** Resolved. Petyr derives agreement/deal links from linked Master Campaigns rows, choosing the first available deal link in deterministic order, and shows `n/a` when none exists.
- **Status:** Resolved on 2026-05-22 for documentation/decision and implementation.
- **Proposal / next action:** Revisit only if future normalized facts expose canonical agreement/deal ids.

## Confirm Redash campaign status taxonomy for Petyr planned future revenue

- **Area:** Petyr / Data quality / Planned future revenue
- **Problem/question:** Petyr previously excluded clearly invalid future campaign statuses from Planned through year end, but missing or unrecognized statuses were still included through a diagnostic fallback while the exact taxonomy was pending.
- **Impact:** Resolved. Planned future now uses a closed allowlist of `Setup` and `Recruiting`; missing or unknown statuses are diagnosed and excluded instead of included by fallback.
- **Status:** Resolved on 2026-05-21.
- **Proposal / next action:** No action required unless Finance/Operations later documents additional statuses that should be included in planned future.

## Confirm production domain strategy for internal tools

- **Area:** Platform / Access Control / Deployment
- **Problem/question:** The exact public/internal domains for OAuth2 Proxy, Auth API and admin/access-control surfaces are not yet fully defined. Petyr unified access is accepted as one user-facing Petyr host/domain routed through a gateway.
- **Impact:** Resolved for current Petyr, Redash Ingestor and Access Layer production routing: Petyr uses `https://petyr.draftapps.it` with callback `https://petyr.draftapps.it/auth/callback`; Redash Ingestor uses `https://petyr.draftapps.it/redash-ingestor` with callback `https://petyr.draftapps.it/redash-ingestor/auth/callback`; Access Layer uses `https://access-layer.draftapps.it`.
- **Status:** Resolved on 2026-06-22 for the current Petyr/Redash Ingestor/Access Layer host contract.
- **Proposal / next action:** Configure DNS/proxy so `petyr.draftapps.it` routes `/forecasting`, `/petyr-admin`, `/api/petyr/*` and `/redash-ingestor/*` through the gateway, configure `access-layer.draftapps.it` for Access Layer, and update both Access Layer tool registrations with the documented callback URLs.

## Confirm first protected tool

- **Area:** Platform / Access Control rollout
- **Problem/question:** The first pilot tool to protect is not formally confirmed.
- **Impact:** Integration tests and middleware adoption need a concrete target.
- **Status:** Proposed.
- **Proposal / next action:** Use `apps/forecasting-app` / Petyr as the first pilot because it is already present in the monorepo and has clear business value.

## Confirm hosting provider and reverse proxy stack

- **Area:** Infrastructure
- **Problem/question:** Local Docker now uses `platform-home` Nginx as the Petyr gateway/reverse proxy, but the exact production stack for Nginx/Caddy/Traefik/OAuth2 Proxy is not finalized and the hosting environment is not Google Cloud.
- **Impact:** Cannot finalize production deployment commands, network trust model, direct backend exposure rules or proxy-header security behavior.
- **Status:** Partially resolved on 2026-06-15 for local Docker gateway routing; production stack remains open.
- **Proposal / next action:** Pick one reverse proxy standard before writing deployment code. Recommended default: Nginx + OAuth2 Proxy for MVP, unless the current infra already standardizes on Traefik or Caddy.

## Configure Petyr yearly objective values through Management Objectives

- **Area:** Petyr / Management View / Yearly objectives
- **Problem/question:** `PETYR_PRODUCT_AND_DATA_LOGIC.md` now defines Branch and Business Unit yearly objectives as annual values entered by management, but approved values by year are not yet configured.
- **Impact:** Management View must show `n/a` and diagnostics for Branch or Business Unit objective percentages until management enters the relevant objective values.
- **Status:** Open.
- **Proposal / next action:** Have Management/Finance enter approved values by year in the `Management Objectives` workflow for dynamic Branches and official Business Units.

## Define/confirm initial annual forecast lock date, even if current source is earliest saved annual forecast.

- **Area:** Petyr / Management View / Annual forecast history
- **Problem/question:** Management View needed a confirmed source for Initial Forecast.
- **Impact:** Resolved at source-of-truth level. 2026 uses a one-shot Excel bootstrap; from 2027 onward Initial Forecast is frozen automatically on January 1 in `Europe/Rome` from the annual forecast in force for the newly started year or service-defined annual cycle.
- **Status:** Resolved; updated on 2026-05-26 for January 1 `Europe/Rome`.
- **Proposal / next action:** Use `forecast_annual_snapshot` for Initial Forecast and `forecast_annual` for Ongoing Forecast. Real automatic scheduler and exact target-year/cutoff semantics remain open below.

## Define technical scheduler for Petyr automatic Initial Forecast consolidation

- **Area:** Petyr / Annual forecast / Scheduling
- **Problem/question:** From 2027 onward, Initial Forecast must be frozen automatically on January 1 in `Europe/Rome`, but the definitive technical mechanism is not documented.
- **Impact:** The server-side consolidation service and protected manual endpoint exist, but production automation cannot safely choose between app cron, worker job, database job, external scheduler or another orchestrator without an explicit platform decision.
- **Status:** Open TODO.
- **Proposal / next action:** Until the scheduler exists, use the protected manual endpoint documented in `docs/08_operational_commands.md` for controlled recovery. Implement a real scheduler for `consolidateInitialAnnualForecast(year)` after deciding scheduling mechanism, operational ownership, retry behavior, idempotency, observability and exact cutoff handling.

## Confirm timezone for Petyr automatic Initial Forecast consolidation

- **Area:** Petyr / Annual forecast / Scheduling
- **Problem/question:** Product defines consolidation timezone for Initial Forecast.
- **Impact:** Resolved. The default business timezone is `Europe/Rome`.
- **Status:** Resolved on 2026-05-26.
- **Proposal / next action:** Use `Europe/Rome` in source-of-truth docs and future scheduler implementation.

## Clarify Petyr Initial Forecast January 1 target-year cutoff

- **Area:** Petyr / Annual forecast / Scheduling
- **Problem/question:** Product says the January 1 `Europe/Rome` consolidation saves the current annual forecast as Initial Forecast of the year just started or of the annual cycle defined by the service. The exact target-year and cutoff semantics for the production scheduler still need final confirmation.
- **Impact:** Implementation could freeze the wrong target year/cycle if the scheduler infers the year differently from the service parameter or business expectation.
- **Status:** Open TODO.
- **Proposal / next action:** Confirm whether the scheduler always calls `consolidateInitialAnnualForecast(current Europe/Rome year)` on January 1, or whether it should pass an explicit service-defined cycle/year from configuration. Document the final cutoff timestamp and idempotency behavior before scheduler implementation.

## Confirm manual fallback trigger for automatic Initial Forecast consolidation

- **Area:** Petyr / Annual forecast / Operations
- **Problem/question:** It is not confirmed whether the automatic January 1 `Europe/Rome` consolidation requires a manual trigger fallback.
- **Impact:** Resolved technically for the MVP: a protected manual endpoint exists and uses `APP_INTERNAL_SECRET`. Final role ownership should still be governed by the future access-control layer.
- **Status:** Resolved on 2026-05-22 for MVP manual fallback.
- **Proposal / next action:** Keep `/api/petyr/admin/consolidate-initial-forecast` protected with `x-app-secret`; revisit role-based operator access when Petyr Admin RBAC is implemented.

## Implement separate Initial Forecast 2026 Excel bootstrap

- **Area:** Petyr / Admin / Initial Forecast
- **Problem/question:** 2026 Initial Forecast must be manually compiled by CSMs through a one-shot Excel export/import flow, but that flow must stay separate from the existing monthly import.
- **Impact:** Resolved by dedicated endpoints and admin UI. Reusing the monthly import is no longer necessary and monthly import behavior remains separate.
- **Status:** Resolved on 2026-05-22.
- **Proposal / next action:** Use `/api/petyr/admin/export-initial-forecast-xlsx` and `/api/petyr/admin/import-initial-forecast-xlsx` for the 2026 baseline or controlled recovery operations.

## Define Petyr Initial Forecast persistence model

- **Area:** Petyr / Data model / Initial Forecast
- **Problem/question:** Product now distinguishes frozen Initial Forecast from mutable Ongoing Forecast, but the final persistence model for frozen annual baselines has not been selected.
- **Impact:** Resolved by the dedicated `forecast_annual_snapshot` table and `forecast_annual_snapshot_change_log` audit table.
- **Status:** Resolved on 2026-05-22.
- **Proposal / next action:** Keep Initial Forecast reads/writes on `forecast_annual_snapshot`; keep Ongoing Forecast reads/writes on `forecast_annual`.

## Confirm deterministic tie-breaker for agreement/deal link derivation

- **Area:** Petyr / Redash mapping / Agreement links
- **Problem/question:** Product says to use the first available linked campaign deal link deterministically, but the exact ordering key has not been confirmed.
- **Impact:** Resolved by documented tie-breaker and implementation: campaign end date, start date, campaign name, campaign link, then materialized `row_index`.
- **Status:** Resolved on 2026-05-22.
- **Proposal / next action:** Revisit only if future normalized facts expose canonical agreement/deal ids.

## Verify Petyr Excel export active/inactive status

- **Area:** Petyr / Admin / Excel import-export
- **Problem/question:** The external Excel format is `active`, `inactive`, or blank = do not modify, but it must be verified whether the export currently shows each company's current status.
- **Impact:** Resolved. Monthly Excel export and legacy CSV template export now show each company's known current status as `active` or `inactive`, leaving the cell blank only when no Petyr status row is configured.
- **Status:** Resolved on 2026-05-25.
- **Proposal / next action:** No action required unless future product scope changes the admin workbook/template format.

## Implement RBAC for Petyr Management Objectives

- **Area:** Petyr / Access Control / Management Objectives
- **Problem/question:** The `Management Objectives` section is intended for management users and previously relied on a temporary hardcoded password gate.
- **Impact:** Resolved for Petyr MVP. Management Objectives now use the existing Petyr Access Layer permission `petyr:management:write`; the temporary password gate is removed from the UI and API.
- **Status:** Resolved on 2026-06-19.
- **Proposal / next action:** Keep user membership and role assignment in the external Access Layer. Reopen only if product defines finer-grained objective permissions beyond `petyr:management:write`.

## Implement Petyr objective persistence and audit trail

- **Area:** Petyr / Data model / Management Objectives
- **Problem/question:** Branch and Business Unit objectives must be management-entered and audit-friendly, but no DB schema/API implementation has been added in this documentation-only task.
- **Impact:** Runtime objective editing and objective change auditability remain unavailable until a future schema/API implementation persists objective values and change history.
- **Status:** Resolved on 2026-05-15.
- **Proposal / next action:** Implemented with `management_objective`, `management_objective_change_log`, Management View UI, compatibility route `/forecasting/entry/objectives` and `GET/POST /api/petyr/management-objectives`. Access is governed by `petyr:management:write`.

## Define RBAC and hardened workbook controls for Petyr Excel import/export

- **Area:** Petyr / Admin / Access Control / Excel import-export
- **Problem/question:** The Excel admin workflow is intended for bulk 2026 historical input and CSM-friendly updates, but manager/CSM access scoping, row-level permissions and stronger workbook protection/dropdown behavior are not yet formally defined.
- **Impact:** `/petyr-admin` can expose broad bulk import/export capability in trusted internal environments until the shared access-control layer defines and enforces Admin, Manager and CSM scopes. Workbook styling and validation help users, but they are not a security boundary.
- **Status:** Open.
- **Proposal / next action:** Define Petyr Admin permissions in the access-control rollout, decide whether CSM-filtered exports/imports require row-level server enforcement, and decide whether to add worksheet protection or stricter Excel dropdown validation beyond the current import-time validation.

## Restore Petyr documentation and handoff rules file

- **Area:** Petyr / Documentation
- **Problem/question:** Older audits reported that the requested root source document `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` was not present in this repository.
- **Impact:** Resolved. Agents can now read that file directly before Petyr implementation and handoff work.
- **Status:** Resolved on 2026-05-21.
- **Proposal / next action:** No action required. `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` is present at the repository root and was used as Petyr's handoff source of truth during final verification.
