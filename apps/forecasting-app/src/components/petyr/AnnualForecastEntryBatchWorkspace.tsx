"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PetyrCard, PetyrInlineNotice } from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import { formatPetyrCurrencyValue, formatPetyrNumber, formatPetyrPercent } from "@/lib/petyr/formatters";
import { calculateAnnualForecastPercentages } from "@/lib/petyr/annualForecastEntryRules";
import type {
  AnnualForecastEntryBatchCell,
  AnnualForecastEntryBatchCompany,
  AnnualForecastEntryBatchDataResult
} from "@/services/annualForecastEntryBatchService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type SourceState = "accepted_ai" | "manual_edit";

function buildAnnualBatchUrl(csmName: string, year: number) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/annual-batch?${params.toString()}`;
}

function buildCompanyDetailPageUrl(companyName: string, year: number) {
  const params = new URLSearchParams({ year: String(year) });
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function buildHistoryUrl(companyName: string, year: number) {
  return `${buildCompanyDetailPageUrl(companyName, year)}#history-changes`;
}

function cellKey(companyName: string, businessUnit: string) {
  return `${companyName}\u0000${businessUnit}`;
}

function formatInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : formatPetyrNumber(value);
}

function normalizeMoneyString(value: string) {
  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|\u20ac/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  return normalized;
}

function parseMoneyInput(value: string) {
  const normalized = normalizeMoneyString(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  const values: Record<string, string> = {};

  for (const company of batch.data.companies) {
    for (const cell of company.businessUnits) {
      values[cellKey(company.companyName, cell.businessUnit)] = cell.savedForecast.hasSavedValue
        ? formatInputValue(cell.savedForecast.value)
        : "";
    }
  }

  return values;
}

function initialValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, formatInputValue(company.initialForecast)]));
}

function activeValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, company.isForecastActive]));
}

function confidenceValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, company.ongoingConfidence ?? ""]));
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className={`h-3 w-3 rounded-full border ${className}`} />
      {label}
    </span>
  );
}

function rowHasTouchedValue(company: AnnualForecastEntryBatchCompany, sourceStates: Record<string, SourceState | undefined>) {
  return company.businessUnits.some((cell) => Boolean(sourceStates[cellKey(company.companyName, cell.businessUnit)]));
}

function percentLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : formatPetyrPercent(value * 100);
}

export default function AnnualForecastEntryBatchWorkspace({
  initialBatch
}: {
  initialBatch: AnnualForecastEntryBatchDataResult;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsm, setSelectedCsm] = useState(initialBatch.data.selectedCsm);
  const [selectedYear, setSelectedYear] = useState(initialBatch.data.selectedYear);
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromBatch(initialBatch));
  const [initialValues, setInitialValues] = useState<Record<string, string>>(() => initialValuesFromBatch(initialBatch));
  const [activeValues, setActiveValues] = useState<Record<string, boolean>>(() => activeValuesFromBatch(initialBatch));
  const [confidenceValues, setConfidenceValues] = useState<Record<string, string>>(() => confidenceValuesFromBatch(initialBatch));
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState | undefined>>({});
  const [touchedInitial, setTouchedInitial] = useState<Set<string>>(() => new Set());
  const [touchedActive, setTouchedActive] = useState<Set<string>>(() => new Set());
  const [touchedConfidence, setTouchedConfidence] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasLocalChanges = useMemo(
    () =>
      Object.values(sourceStates).some(Boolean) ||
      touchedInitial.size > 0 ||
      touchedActive.size > 0 ||
      touchedConfidence.size > 0,
    [sourceStates, touchedInitial, touchedActive, touchedConfidence]
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasLocalChanges) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasLocalChanges]);

  function resetLocalState(nextBatch: AnnualForecastEntryBatchDataResult) {
    setBatch(nextBatch);
    setSelectedCsm(nextBatch.data.selectedCsm);
    setSelectedYear(nextBatch.data.selectedYear);
    setValues(valuesFromBatch(nextBatch));
    setInitialValues(initialValuesFromBatch(nextBatch));
    setActiveValues(activeValuesFromBatch(nextBatch));
    setConfidenceValues(confidenceValuesFromBatch(nextBatch));
    setSourceStates({});
    setTouchedInitial(new Set());
    setTouchedActive(new Set());
    setTouchedConfidence(new Set());
  }

  async function loadAnnualBatch(csmName: string, year: number) {
    if (hasLocalChanges && !window.confirm("Annual Forecast Entry has unsaved changes. Change filter and discard them?")) {
      return;
    }

    setSelectedCsm(csmName);
    setSelectedYear(year);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildAnnualBatchUrl(csmName, year), { cache: "no-store" });
      const payload = (await response.json()) as AnnualForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Annual Forecast Entry.");
      }

      resetLocalState(payload);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Annual Forecast Entry."
      });
    } finally {
      setIsLoading(false);
    }
  }

  function acceptAiPlaceholder(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const currentValue = values[key] ?? "";

    if (!cell.savedForecast.hasSavedValue && !currentValue.trim() && cell.aiForecast.value !== null) {
      setValues((existing) => ({ ...existing, [key]: formatInputValue(cell.aiForecast.value) }));
      setSourceStates((existing) => ({ ...existing, [key]: "accepted_ai" }));
    }
  }

  function updateValue(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell, value: string) {
    const key = cellKey(company.companyName, cell.businessUnit);
    setValues((existing) => ({ ...existing, [key]: value }));
    setSourceStates((existing) => ({ ...existing, [key]: "manual_edit" }));
  }

  function updateInitial(companyName: string, value: string) {
    setInitialValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedInitial((existing) => new Set(existing).add(companyName));
  }

  function updateActive(companyName: string, value: boolean) {
    setActiveValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedActive((existing) => new Set(existing).add(companyName));
  }

  function updateConfidence(companyName: string, value: string) {
    setConfidenceValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedConfidence((existing) => new Set(existing).add(companyName));
  }

  function currentBuValue(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const parsed = parseMoneyInput(values[key] ?? "");

    if (sourceStates[key] && parsed !== null) return parsed;
    if (cell.savedForecast.hasSavedValue) return cell.savedForecast.value ?? 0;

    return null;
  }

  function currentFcOngoing(company: AnnualForecastEntryBatchCompany) {
    return company.businessUnits.reduce((sum, cell) => sum + (currentBuValue(company, cell) ?? 0), 0);
  }

  function getCompanySaveValues(company: AnnualForecastEntryBatchCompany) {
    return company.businessUnits.flatMap((cell) => {
      const key = cellKey(company.companyName, cell.businessUnit);
      const sourceState = sourceStates[key];
      if (!sourceState) return [];

      return [
        {
          businessUnit: cell.businessUnit,
          value: values[key] ?? "",
          sourceState
        }
      ];
    });
  }

  function buildUpdates() {
    return batch.data.companies.flatMap((company) => {
      const valuesForCompany = getCompanySaveValues(company);
      const hasInitial = touchedInitial.has(company.companyName);
      const hasActive = touchedActive.has(company.companyName);
      const hasConfidence = touchedConfidence.has(company.companyName);
      const rowModified = valuesForCompany.length > 0 || hasInitial || hasActive;

      if (!rowModified && !hasConfidence) return [];

      const confidence = confidenceValues[company.companyName] ?? "";
      if (rowModified && !confidence) {
        throw new Error(`${company.companyName}: Confidence is required on modified annual rows.`);
      }

      return [
        {
          companyName: company.companyName,
          activeStatus: hasActive ? activeValues[company.companyName] : undefined,
          initialForecast: hasInitial ? initialValues[company.companyName] : undefined,
          confidence: rowModified || hasConfidence ? confidence : undefined,
          values: valuesForCompany
        }
      ];
    });
  }

  async function saveBatch() {
    let updates: ReturnType<typeof buildUpdates>;

    try {
      updates = buildUpdates();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to validate Annual Forecast Entry." });
      return;
    }

    if (updates.length === 0) {
      setNotice({ type: "success", text: "No changes detected" });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/annual-batch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmName: batch.data.selectedCsm,
          year: batch.data.selectedYear,
          updates
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Annual Forecast Entry.");
      }

      resetLocalState(payload.batch);
      setNotice({
        type: "success",
        text: payload.noChanges
          ? "No changes detected"
          : `Saved annual changes for ${payload.companiesSaved} compan${payload.companiesSaved === 1 ? "y" : "ies"}.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Annual Forecast Entry."
      });
    } finally {
      setIsSaving(false);
    }
  }

  const saveDisabled = isLoading || isSaving || !hasLocalChanges;

  return (
    <PetyrCard>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Annual Forecast Entry</CardTitle>
            <CardDescription>
              {batch.data.selectedCsm}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {batch.data.selectedYear}
            </CardDescription>
          </div>
          <Badge variant={batch.data.initialMode.editable ? "secondary" : "outline"}>{batch.data.initialMode.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_180px_minmax(0,1fr)] lg:items-end">
          <PetyrSelectField
            label="CSM"
            disabled={isLoading || isSaving}
            value={selectedCsm}
            onChange={(event) => void loadAnnualBatch(event.target.value, selectedYear)}
          >
            {batch.data.csmOptions.map((csmName) => (
              <option key={csmName} value={csmName}>
                {csmName}
              </option>
            ))}
          </PetyrSelectField>
          <PetyrSelectField
            label="Year"
            disabled={isLoading || isSaving}
            value={String(selectedYear)}
            onChange={(event) => void loadAnnualBatch(selectedCsm, Number(event.target.value))}
          >
            {batch.data.yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </PetyrSelectField>
          <PetyrInlineNotice tone={batch.data.initialMode.editable ? "success" : "warning"}>
            {batch.data.initialMode.reason}
          </PetyrInlineNotice>
        </div>

        {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <LegendChip className="border-blue-300 bg-blue-100" label="FC AI placeholder" />
            <LegendChip className="border-violet-300 bg-violet-100" label="AI confirmed" />
            <LegendChip className="border-emerald-300 bg-emerald-100" label="Manual value" />
            <LegendChip className="border-slate-300 bg-white" label="Saved value" />
            <LegendChip className="border-slate-300 bg-slate-100" label="Inactive customer" />
          </div>
          <Button type="button" className="rounded-xl" disabled={saveDisabled} onClick={saveBatch}>
            {isSaving ? "Saving changes" : "Save Changes"}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 min-w-[220px] bg-white">Customer</TableHead>
                <TableHead className="min-w-[120px]">Active</TableHead>
                <TableHead className="min-w-[160px]">FC Initial</TableHead>
                <TableHead className="min-w-[150px]">FC Ongoing</TableHead>
                <TableHead className="min-w-[150px]">Confidence</TableHead>
                {batch.data.businessUnits.map((businessUnit) => (
                  <TableHead key={businessUnit} className="min-w-[150px] text-right">
                    {businessUnit}
                  </TableHead>
                ))}
                <TableHead className="min-w-[140px] text-right">Revenue EUR</TableHead>
                <TableHead className="min-w-[140px] text-right">Planned EUR</TableHead>
                <TableHead className="min-w-[130px] text-right">Revenue / FC</TableHead>
                <TableHead className="min-w-[130px] text-right">Planned / FC</TableHead>
                <TableHead className="min-w-[140px] text-right">Uncovered / FC</TableHead>
                <TableHead className="min-w-[120px]">History</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.data.companies.length > 0 ? (
                batch.data.companies.map((company) => {
                  const fcOngoing = currentFcOngoing(company);
                  const percentages = calculateAnnualForecastPercentages({
                    revenue: company.revenue,
                    planned: company.planned,
                    fcOngoing
                  });
                  const inactiveClass = company.isForecastActive ? "" : "bg-slate-50 text-slate-500 opacity-75";

                  return (
                    <TableRow key={company.companyName} className={inactiveClass}>
                      <TableCell className={`sticky left-0 z-10 min-w-[220px] ${company.isForecastActive ? "bg-white" : "bg-slate-50"}`}>
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.selectedYear)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">{company.csmName}</div>
                      </TableCell>
                      <TableCell>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={activeValues[company.companyName] ?? company.isForecastActive}
                            disabled={isSaving}
                            onChange={(event) => updateActive(company.companyName, event.target.checked)}
                          />
                          {activeValues[company.companyName] ? "ON" : "OFF"}
                        </label>
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          disabled={!batch.data.initialMode.editable || isSaving}
                          readOnly={!batch.data.initialMode.editable}
                          value={initialValues[company.companyName] ?? ""}
                          onChange={(event) => updateInitial(company.companyName, event.target.value)}
                          placeholder="n/a"
                          className={`h-10 min-w-[130px] rounded-xl text-right font-semibold ${
                            touchedInitial.has(company.companyName) ? "border-emerald-300 bg-emerald-50" : "bg-white"
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatPetyrCurrencyValue(fcOngoing)}</TableCell>
                      <TableCell>
                        <select
                          value={confidenceValues[company.companyName] ?? ""}
                          disabled={isSaving}
                          onChange={(event) => updateConfidence(company.companyName, event.target.value)}
                          className={`h-10 min-w-[130px] rounded-xl border px-3 text-sm ${
                            touchedConfidence.has(company.companyName) ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                          }`}
                        >
                          <option value="">Select...</option>
                          {batch.data.confidenceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      {company.businessUnits.map((cell) => {
                        const key = cellKey(company.companyName, cell.businessUnit);
                        const sourceState = sourceStates[key];
                        const aiPlaceholder = !cell.savedForecast.hasSavedValue && cell.aiForecast.value !== null
                          ? formatInputValue(cell.aiForecast.value)
                          : "";
                        const inputClass =
                          sourceState === "accepted_ai"
                            ? "border-violet-300 bg-violet-50"
                            : sourceState === "manual_edit"
                              ? "border-emerald-300 bg-emerald-50"
                              : cell.savedForecast.hasSavedValue
                                ? "border-slate-300 bg-white"
                                : aiPlaceholder
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-slate-200 bg-white";

                        return (
                          <TableCell key={key}>
                            <Input
                              inputMode="decimal"
                              disabled={isSaving}
                              placeholder={aiPlaceholder || "n/a"}
                              value={values[key] ?? ""}
                              onFocus={() => acceptAiPlaceholder(company, cell)}
                              onClick={() => acceptAiPlaceholder(company, cell)}
                              onChange={(event) => updateValue(company, cell, event.target.value)}
                              className={`h-10 min-w-[130px] rounded-xl text-right font-semibold ${inputClass}`}
                            />
                            {sourceState ? (
                              <div className="mt-1 text-right text-[11px] font-medium text-slate-500">
                                {sourceState === "accepted_ai" ? "AI confirmed" : "Manual"}
                              </div>
                            ) : cell.savedForecast.hasSavedValue ? (
                              <div className="mt-1 text-right text-[11px] text-slate-500">
                                {cell.savedForecast.valueSource === "ai_confirmed" ? "AI confirmed" : "Saved"}
                              </div>
                            ) : aiPlaceholder ? (
                              <div className="mt-1 text-right text-[11px] text-blue-700">FC AI</div>
                            ) : null}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-medium">{formatPetyrCurrencyValue(company.revenue)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPetyrCurrencyValue(company.planned)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.revenuePct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.plannedPct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.uncoveredPct)}</TableCell>
                      <TableCell>
                        <a
                          href={buildHistoryUrl(company.companyName, batch.data.selectedYear)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
                        >
                          History
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={batch.data.businessUnits.length + 11} className="bg-slate-50 py-8 text-center text-sm text-slate-500">
                    No companies available for this CSM.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <Button type="button" className="rounded-xl" disabled={saveDisabled} onClick={saveBatch}>
            {isSaving ? "Saving changes" : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </PetyrCard>
  );
}
