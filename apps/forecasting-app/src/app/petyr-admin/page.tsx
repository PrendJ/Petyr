import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PetyrAiPreviewBacktestControl from "@/components/petyr/PetyrAiPreviewBacktestControl";
import PetyrAiModelSettingsForm from "@/components/petyr/PetyrAiModelSettingsForm";
import PetyrClosedRevenueOngoingBackfillControl from "@/components/petyr/PetyrClosedRevenueOngoingBackfillControl";
import PetyrDatabaseBackupControl from "@/components/petyr/PetyrDatabaseBackupControl";
import PetyrMonthlyForecastExcelWorkflow from "@/components/petyr/PetyrMonthlyForecastExcelWorkflow";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import { formatPetyrInteger } from "@/lib/petyr/formatters";
import { isPetyrPerfLogsEnabled, PETYR_PERFORMANCE_CHECKS } from "@/lib/petyr/performance";
import {
  getDefaultPetyrAiModelSetting,
  getPetyrAiModelSetting,
  type PetyrAiModelSetting
} from "@/services/petyrAiModelSettingsService";
import {
  getPetyrDataHealth,
  type PetyrDataHealthIssue,
  type PetyrDataHealthResult
} from "@/services/petyrDataHealthService";
import { getForecastEntryCompanies } from "@/services/petyrDataService";

export const dynamic = "force-dynamic";

type LoadState<T> = {
  data: T | null;
  error: string | null;
};

type AiSettingState = {
  setting: PetyrAiModelSetting;
  error: string | null;
};

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatSettingsError(error: unknown) {
  const message = formatError(error);

  if (message.includes("does not exist")) {
    return "Petyr app settings table is missing. Apply the forecasting app Prisma schema before saving AI settings.";
  }

  return message;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return formatPetyrInteger(value);
}

function formatBoolean(value: boolean) {
  return value ? "yes" : "no";
}

function formatList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

function syncStatusBadgeClass(status: string | null | undefined) {
  const normalized = status?.toLowerCase();

  if (normalized === "success" || normalized === "completed" || normalized === "ok") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (normalized === "running" || normalized === "started" || normalized === "pending") {
    return "bg-sky-100 text-sky-800";
  }

  if (normalized === "failed" || normalized === "error") {
    return "bg-rose-100 text-rose-800";
  }

  if (!normalized || normalized === "n/a") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-amber-100 text-amber-900";
}

async function loadDataHealth(): Promise<LoadState<PetyrDataHealthResult>> {
  try {
    return {
      data: await getPetyrDataHealth(),
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: formatError(error)
    };
  }
}

async function loadAiSetting(): Promise<AiSettingState> {
  try {
    return {
      setting: await getPetyrAiModelSetting(),
      error: null
    };
  } catch (error) {
    return {
      setting: getDefaultPetyrAiModelSetting(),
      error: formatSettingsError(error)
    };
  }
}

async function loadCsmFilterCandidates() {
  try {
    const result = await getForecastEntryCompanies();
    return result.data.map((company) => company.csmName);
  } catch {
    return [];
  }
}

function SectionCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function IssueList({
  items,
  emptyText,
  tone
}: {
  items: PetyrDataHealthIssue[];
  emptyText: string;
  tone: "blocking" | "warning";
}) {
  if (!items.length) {
    return <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{emptyText}</div>;
  }

  const classes =
    tone === "blocking"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li className={`rounded-xl border p-3 text-sm ${classes}`} key={`${item.code}-${index}`}>
          <div className="font-semibold">{item.code}</div>
          <div className="mt-1">{item.message}</div>
          {item.tableName || item.sourceKey || item.logicalField || item.dbColumnName ? (
            <div className="mt-2 text-xs opacity-80">
              {[item.sourceKey, item.tableName, item.logicalField, item.dbColumnName].filter(Boolean).join(" · ")}
            </div>
          ) : null}
          {item.detail ? <div className="mt-2 break-words text-xs opacity-80">{item.detail}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function RedashIngestorEntryPoint() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">Redash Ingestor dashboard</h3>
            <Badge variant="outline">Separate service</Badge>
          </div>
          <p>
            Open the technical Redash Ingestor dashboard for manual sync, source status,
            database previews and run diagnostics. Petyr still reads PostgreSQL-backed data
            and does not call Redash directly.
          </p>
          <div className="font-mono text-xs text-slate-500">/redash-ingestor</div>
        </div>
        <Link
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          href="/redash-ingestor"
        >
          Open dashboard
        </Link>
      </div>
    </div>
  );
}

function PerformanceTestResultsSection() {
  const perfLogsEnabled = isPetyrPerfLogsEnabled();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">PETYR_PERF_LOGS</div>
          <div className="mt-1">
            <Badge className={perfLogsEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
              {perfLogsEnabled ? "enabled" : "disabled"}
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Result location</div>
          <div className="mt-1 font-medium text-slate-900">Server logs only</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        Detailed duration and row-count test results are emitted only from server-side services when PETYR_PERF_LOGS=true. This admin-only panel reports instrumentation coverage without exposing customer rows, Redash payloads, API keys or secrets.
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
            {PETYR_PERFORMANCE_CHECKS.map((check) => (
              <tr key={check}>
                <td className="px-3 py-2 font-medium text-slate-900">{check}</td>
                <td className="px-3 py-2"><Badge variant="outline">instrumented</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataHealthSection({ state }: { state: LoadState<PetyrDataHealthResult> }) {
  const data = state.data;

  if (!data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        Unable to load data health diagnostics: {state.error || "Unknown error"}
      </div>
    );
  }

  const rowCounts = Object.entries(data.rowCounts);
  const objectives = data.managementObjectives;
  const syncSources = data.sources.expected;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">ok</div>
          <div className="mt-1">
            <Badge className={data.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>
              {String(data.ok)}
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Blocking issues</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{data.blockingIssues.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Warnings</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{data.warnings.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Checked</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{formatDateTime(data.checkedAt)}</div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Redash sync status</h3>
          <Badge variant="outline">PostgreSQL only</Badge>
        </div>
        {syncSources.length ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Enabled</th>
                  <th className="px-3 py-2 font-medium">Latest sync</th>
                  <th className="px-3 py-2 font-medium">Run rows</th>
                  <th className="px-3 py-2 font-medium">Finished</th>
                  <th className="px-3 py-2 font-medium">Snapshot rows</th>
                  <th className="px-3 py-2 font-medium">Materialized rows</th>
                  <th className="px-3 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {syncSources.map((source) => {
                  const table = data.materializedTables[source.tableName];
                  const latestRun = source.latestSyncRun;
                  const latestSnapshot = source.latestSnapshot;
                  const status = latestRun?.status ?? "n/a";

                  return (
                    <tr key={source.sourceKey}>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-900">{source.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{source.sourceKey} · query {source.expectedRedashQueryId}</div>
                        <div className="mt-1 text-xs text-slate-500">{source.tableName}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {source.redashSource ? (
                          <Badge className={source.redashSource.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>
                            {formatBoolean(source.redashSource.enabled)}
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-800">missing</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge className={syncStatusBadgeClass(status)}>{status}</Badge>
                        {latestRun?.triggeredBy ? <div className="mt-1 text-xs text-slate-500">{latestRun.triggeredBy}</div> : null}
                      </td>
                      <td className="px-3 py-2 align-top">{formatNumber(latestRun?.rowsCount)}</td>
                      <td className="px-3 py-2 align-top">{formatDateTime(latestRun?.finishedAt ?? latestRun?.startedAt)}</td>
                      <td className="px-3 py-2 align-top">
                        <div>{formatNumber(latestSnapshot?.rowsCount)}</div>
                        {latestSnapshot?.fetchedAt ? <div className="mt-1 text-xs text-slate-500">{formatDateTime(latestSnapshot.fetchedAt)}</div> : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{formatNumber(table?.rowCount)}</div>
                        <div className="mt-1 text-xs text-slate-500">exists: {table ? formatBoolean(table.exists) : "n/a"}</div>
                      </td>
                      <td className="max-w-[240px] px-3 py-2 align-top text-xs">
                        {latestRun?.errorMessage ? (
                          <span className="break-words text-rose-800">{latestRun.errorMessage}</span>
                        ) : (
                          <span className="text-slate-500">n/a</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No Redash source sync metadata is available from PostgreSQL.
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Materialized tables and row counts</h3>
        {rowCounts.length ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Table</th>
                  <th className="px-3 py-2 font-medium">Exists</th>
                  <th className="px-3 py-2 font-medium">Rows</th>
                  <th className="px-3 py-2 font-medium">Columns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {rowCounts.map(([tableName, rowCount]) => {
                  const table = data.materializedTables[tableName];

                  return (
                    <tr key={tableName}>
                      <td className="px-3 py-2 font-medium text-slate-900">{tableName}</td>
                      <td className="px-3 py-2">{table ? formatBoolean(table.exists) : "n/a"}</td>
                      <td className="px-3 py-2">{formatNumber(rowCount)}</td>
                      <td className="px-3 py-2">{formatNumber(table?.columnCount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No row counts available.
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Blocking issues</h3>
          <div className="mt-3">
            <IssueList items={data.blockingIssues} emptyText="No blocking issues." tone="blocking" />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Warnings</h3>
          <div className="mt-3">
            <IssueList items={data.warnings} emptyText="No warnings." tone="warning" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Company ownership counts</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(data.sources.ownership.rowCount)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">With company</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(data.sources.ownership.rowsWithCompany)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">With branch</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(data.sources.ownership.rowsWithBranch)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">With CSM</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(data.sources.ownership.rowsWithCsm)}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Management Objectives</h3>
        {objectives.missingTables.length > 0 ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Missing objective table(s): {formatList(objectives.missingTables)}. From apps/forecasting-app run{" "}
            <span className="font-semibold">npm run db:sync</span>.
          </div>
        ) : null}
        {objectives.missingTables.length === 0 &&
        (objectives.branchesWithoutObjective.length > 0 || objectives.businessUnitsWithoutObjective.length > 0) ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Missing objectives are non-blocking; configure them in{" "}
            <Link className="font-semibold underline" href="/forecasting?view=management">
              Management Objectives
            </Link>
            .
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Year</div>
            <div className="mt-1 font-semibold text-slate-900">{objectives.currentYear}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Configured</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(objectives.currentYearConfiguredCount)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Branch missing</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(objectives.branchesWithoutObjective.length)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">BU missing</div>
            <div className="mt-1 font-semibold text-slate-900">{formatNumber(objectives.businessUnitsWithoutObjective.length)}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Branches without objective</div>
            <div className="mt-2">{formatList(objectives.branchesWithoutObjective)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Business Units without objective</div>
            <div className="mt-2">{formatList(objectives.businessUnitsWithoutObjective)}</div>
          </div>
        </div>

        {objectives.configuredByYear.length ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 font-medium">Business Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {objectives.configuredByYear.map((row) => (
                  <tr key={row.year}>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.year}</td>
                    <td className="px-3 py-2">{formatNumber(row.total)}</td>
                    <td className="px-3 py-2">{formatNumber(row.branch)}</td>
                    <td className="px-3 py-2">{formatNumber(row.businessUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No Management Objectives are configured by year.
          </div>
        )}
      </div>
    </div>
  );
}

export default async function PetyrAdminPage() {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const [dataHealth, aiSetting, csmFilterCandidates] = await Promise.all([
    loadDataHealth(),
    loadAiSetting(),
    loadCsmFilterCandidates()
  ]);
  const preferredCsmName = resolvePreferredCsmName(identity.user.displayName, csmFilterCandidates);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Petyr Admin</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Temporary internal workspace for data health, AI model settings, database backup and Excel-first forecast imports.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              href="/forecasting"
            >
              Back to Forecasting
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              href="/redash-ingestor"
            >
              Open Redash Ingestor
            </Link>
          </div>
        </header>

        <SectionCard
          description="PostgreSQL diagnostics for Redash source metadata, materialized tables, mappings and ownership coverage."
          title="Data health"
        >
          <DataHealthSection state={dataHealth} />
        </SectionCard>

        <SectionCard
          description="Admin-only instrumentation coverage for Petyr and Redash Ingestor server-side performance checks."
          title="Performance test results"
        >
          <PerformanceTestResultsSection />
        </SectionCard>

        <SectionCard
          description="Open the separate Redash Ingestor operator dashboard through the platform gateway."
          title="Redash Ingestor"
        >
          <RedashIngestorEntryPoint />
        </SectionCard>

        <SectionCard
          description="Export or import the shared PostgreSQL database for server migration and controlled recovery."
          title="Database backup"
        >
          <PetyrDatabaseBackupControl />
        </SectionCard>

        <SectionCard
          description="Run the read-only top-10 deterministic preview backtest for May and June 2026."
          title="AI preview backtest"
        >
          <PetyrAiPreviewBacktestControl />
        </SectionCard>

        <SectionCard
          description="Select the OpenRouter model used by Petyr AI forecast and explanation jobs."
          title="OpenRouter model settings"
        >
          <PetyrAiModelSettingsForm initialError={aiSetting.error} initialSetting={aiSetting.setting} />
        </SectionCard>

        <SectionCard
          description="Recommended workflow for CSM-friendly 2026 historical input and bulk monthly forecast updates."
          title="Excel forecast import/export"
        >
          <PetyrMonthlyForecastExcelWorkflow preferredCsmName={preferredCsmName} />
        </SectionCard>


        <SectionCard
          description="One-time protected operation to copy already closed 2026 Redash revenue into Petyr Ongoing Forecast."
          title="2026 closed revenue alignment"
        >
          <PetyrClosedRevenueOngoingBackfillControl />
        </SectionCard>

      </div>
    </main>
  );
}
