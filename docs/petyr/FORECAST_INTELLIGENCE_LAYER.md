# Petyr Forecast Intelligence Layer

Status: accepted implementation contract as of 2026-06-20.

This document supersedes any older Petyr AI Forecasting wording that allowed
OpenRouter to calculate, adjust or choose forecast numbers.

## Responsibility Split

Petyr local code is the source of truth for forecast math.

Local deterministic code must compute:

- eligible months;
- official Business Unit rows;
- three-year historical signals;
- deterministic forecast values;
- trends, scenarios, deltas and risk signals;
- confidence and data-quality flags used by the UI.

OpenRouter is only an interpretation layer. It receives the normalized local
payload after all math is complete and returns structured business analysis.
OpenRouter must not recalculate forecast values, invent metrics, change local
values, overwrite CSM forecasts or write persistence directly.

## API Flow

Primary route:

```txt
POST /api/petyr/ai-forecast/company
```

Expected flow:

```txt
local deterministic forecast
  -> normalized Forecast Intelligence payload
  -> prompt version + input hash
  -> cached validated output lookup
  -> OpenRouter JSON-only request when cache misses
  -> strict schema validation
  -> one retry max for invalid JSON/schema output
  -> ai_forecast_cache success or failure row
  -> UI renders deterministic forecast plus validated intelligence sections
```

If Forecast Intelligence fails, the deterministic preview remains available.
Non-dry-run persistence of numeric forecast rows requires valid or cached
Forecast Intelligence output; failed intelligence saves a failure state and does
not alter deterministic forecast values.

Nightly deterministic automation is separate from this Forecast Intelligence
flow. The `petyr-ai-forecast-worker` service runs at 01:00 in `Europe/Rome`,
computes local deterministic preview rows for active companies and saves those
numeric rows to `ai_forecast_cache` with daily model versions such as
`petyr_deterministic_preview_v1@YYYY-MM-DD`. That worker must not call
OpenRouter, must not create or require Forecast Intelligence sentinel rows and
must not modify CSM-owned forecast data.

## Input Payload Contract

Payload version: `petyr_forecast_intelligence_payload_v2`.

The payload is normalized and company-minimized. It uses `company_001` rather
than real company names in the prompt payload. It includes:

- forecast year, as-of date, currency and eligible months;
- `history_years=3`;
- deterministic forecast rows by Business Unit/year/month, with integer EUR `rounded_forecast_value`;
- local totals for deterministic forecast, baseline, planned value and residual coverage gap;
- three-year historical closed revenue points;
- selected-year real signals, including closed YTD, planned future value and
  campaign counts;
- local deltas by Business Unit;
- local scenarios, including deterministic, planned-floor-only and
  history-signals-only totals;
- local risk signals;
- local trend signals, including recent growth, over-consumption and summer slowdown flags;
- agreement residual allocation with remaining months, monthly cap, historical capacity, linked planned campaign cap and planned-over-residual watchout flag;
- Business Unit attribution from sanitized title tokens, linked-agreement history or company+BU history;
- internal consultative scenarios that may remain in local deterministic data but must not be requested, validated, rendered or charted by Forecast Intelligence output;
- data-quality diagnostics and flags;
- explicit LLM constraints stating consultative-only, numbers are local source of truth, no recalculation, no invented numbers, no prescriptive operational instructions and JSON-only response.

The payload must not include CSM-entered monthly or annual forecasts as prompt inputs. Those values remain UI comparison data only. Agreement, campaign and deal titles must not be sent as raw text; only sanitized BU attribution signals such as matched Business Unit, matched tokens and confidence may be sent.

## Output JSON Schema

Output schema version: `petyr_forecast_intelligence_output_v4`.

OpenRouter must return one JSON object only, with no markdown, code fences or
surrounding prose:

```json
{
  "stakeholder_notes": [
    {
      "title": "string",
      "note": "string",
      "numeric_evidence": "string"
    }
  ],
  "risks": [
    {
      "type": "under_consumption|over_consumption|margin_risk|timing_risk|data_quality|other",
      "severity": "low|medium|high",
      "description": "string",
      "numeric_evidence": "string"
    }
  ],
  "opportunities": [
    {
      "title": "string",
      "severity": "low|medium|high",
      "evidence": "string",
      "numeric_evidence": "string"
    }
  ],
  "watchouts": [
    {
      "title": "string",
      "severity": "low|medium|high",
      "evidence": "string",
      "numeric_evidence": "string"
    }
  ]
}
```

Validation rejects missing required fields, unexpected fields, markdown in text fields, prompt/internal implementation disclosures, numeric claims that are not present in the deterministic payload, missing numeric evidence, visible rounding-scenario references such as `floor_100`, `nearest_100`, `ceil_100`, and prescriptive operational instructions such as telling the CSM what to do.

## Prompt And Hashing

Prompt version: `petyr_forecast_intelligence_prompt_v4`.

The system prompt must explicitly state that all forecast numbers and metrics
come from Petyr local calculations and must not be recalculated, adjusted,
rounded, overridden or invented by the model.

The backend computes a stable SHA-256 input hash from the normalized payload.
Cached output may be reused only when provider, model, prompt version and input
hash match.

## Cache Persistence

Cache table/model: `ai_forecast_cache`.

Forecast Intelligence uses the existing table with a sentinel row:

```txt
business_unit = __forecast_intelligence__
month = 0
forecast_value = 0
```

The row stores provider, model, prompt version, input hash, request payload
summary, validated output JSON, status, error message, created_at and
updated_at. For Forecast Intelligence sentinel rows, `model_version` is an
internal cache key containing provider model, prompt version and input hash so
changed inputs do not collide with earlier cache entries. Numeric forecast cache readers must filter to successful rows with
months 1-12 and exclude the sentinel business unit.

Deterministic forecast rows may still be saved to `ai_forecast_cache` for
Business Unit/month values, but their numbers remain local deterministic values.

## Failure Handling

Failure handling is graceful:

- invalid JSON or schema output gets one retry max;
- retry failure stores status `failed` with an error message;
- OpenRouter unavailability stores status `failed`;
- missing `OPENROUTER_API_KEY` stores status `failed` and does not call the
  provider;
- deterministic preview still renders;
- no markdown/prose fallback is accepted as AI output.

## UI Expectations

Forecast Entry's admin-visible AI Forecast support tool exposes:

- `Generate deterministic preview`;
- `Generate AI forecast`;
- `Apply AI forecast`.

Forecast Entry Monthly forecast and Company Detail may also expose a CSM-facing
`Generate Intelligence` action to users with `petyr:forecast:write`. This action
must call only the dry-run Forecast Intelligence path, render validated
consultative JSON and hide apply controls, OpenRouter I/O, raw prompt payloads
and prompt/debug JSON. Company Detail remains read-only for forecast data and
must not generate or apply numeric AI Forecast rows.

The UI must render deterministic numeric rows separately from Forecast
Intelligence analysis. Forecast Intelligence sections must show only stakeholder notes, risks, watchouts and opportunities from validated JSON. Each item must carry compact numeric evidence explaining amounts, timing, residual pressure, planned value, closed revenue, deltas, campaign counts or remaining months. Status, confidence, as-of date, eligible-month/provider diagnostics, executive summaries, key insights, drivers, forecast cues, chart-comparison candidates, rounding scenarios, data-quality notes and CSM questions are intentionally not part of the user-facing output.

The UI must show a graceful error when AI fails and must not imply OpenRouter changed forecast values. Numeric forecast rows remain deterministic even when Forecast Intelligence is cached, retried or failed.
