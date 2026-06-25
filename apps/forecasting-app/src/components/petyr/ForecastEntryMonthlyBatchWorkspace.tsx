"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PetyrCard,
  PetyrInlineNotice,
  PetyrSectionTitle,
  PetyrWorkspaceShell
} from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import AnnualForecastEntryBatchWorkspace from "@/components/petyr/AnnualForecastEntryBatchWorkspace";
import { formatPetyrCurrencyValue, formatPetyrNumber } from "@/lib/petyr/formatters";
import type { AnnualForecastEntryBatchDataResult } from "@/services/annualForecastEntryBatchService";
import type {
  ForecastEntryBatchCell,
  ForecastEntryBatchCompany,
  ForecastEntryBatchDataResult
} from "@/services/forecastEntryBatchService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type SourceState = "accepted_ai" | "manual_edit";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOTE_ONLY_MESSAGE = "Company note requires at least one active forecast value entered, accepted from AI or modified.";

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function forecastTypeLabel(forecastType: string | null) {
  if (forecastType === "ongoing") return "Ongoing Forecast";
  if (forecastType === "previous_month") return "Previous Month Forecast";
  return "Forecast";
}

function buildBatchUrl(csmName: string) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  const query = params.toString();
  return query ? `/api/petyr/forecast-entry/batch?${query}` : "/api/petyr/forecast-entry/batch";
}

function buildEntryPageUrl(csmName: string) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  const query = params.toString();
  return query ? `/forecasting/entry?${query}` : "/forecasting/entry";
}

function buildCompanyDetailPageUrl(companyName: string, year: number) {
  const params = new URLSearchParams({ year: String(year) });
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
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

function activeForecast(cell: ForecastEntryBatchCell, editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? cell.ongoingForecast : cell.previousMonthForecast;
}

function inactiveForecast(cell: ForecastEntryBatchCell, editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? cell.previousMonthForecast : cell.ongoingForecast;
}

function inactiveForecastLabel(editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? "Previous Month Forecast" : "Ongoing Forecast";
}

function valuesFromBatch(batch: ForecastEntryBatchDataResult) {
  const editableType = batch.data.entryMode.editableForecastType;
  const values: Record<string, string> = {};

  for (const company of batch.data.companies) {
    for (const cell of company.businessUnits) {
      const forecast = activeForecast(cell, editableType);
      values[cellKey(company.companyName, cell.businessUnit)] = forecast.hasSavedCsmValue ? formatInputValue(forecast.value) : "";
    }
  }

  return values;
}

function companyHasTouchedValue(company: ForecastEntryBatchCompany, sourceStates: Record<string, SourceState | undefined>) {
  return company.businessUnits.some((cell) => Boolean(sourceStates[cellKey(company.companyName, cell.businessUnit)]));
}

function getCompanySaveValues(
  company: ForecastEntryBatchCompany,
  editableForecastType: string | null,
  values: Record<string, string>,
  sourceStates: Record<string, SourceState | undefined>
) {
  if (!editableForecastType) return [];

  return company.businessUnits.flatMap((cell) => {
    const key = cellKey(company.companyName, cell.businessUnit);
    const sourceState = sourceStates[key];
    if (!sourceState) return [];

    const rawValue = values[key] ?? "";
    const nextValue = parseMoneyInput(rawValue);
    if (nextValue === null) {
      return [{ businessUnit: cell.businessUnit, value: rawValue, sourceState }];
    }

    const current = activeForecast(cell, editableForecastType);
    if (!current.hasSavedCsmValue || current.value !== nextValue) {
      return [{ businessUnit: cell.businessUnit, value: rawValue, sourceState }];
    }

    return [];
  });
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className={`h-3 w-3 rounded-full border ${className}`} />
      {label}
    </span>
  );
}

export default function ForecastEntryMonthlyBatchWorkspace({
  initialBatch,
  initialAnnualBatch
}: {
  initialBatch: ForecastEntryBatchDataResult;
  initialAnnualBatch: AnnualForecastEntryBatchDataResult;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsm, setSelectedCsm] = useState(initialBatch.data.selectedCsm);
  const [expandedBusinessUnits, setExpandedBusinessUnits] = useState<Set<string>>(() => new Set());
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromBatch(initialBatch));
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const editableForecastType = batch.data.entryMode.editableForecastType;
  const isLocked = batch.data.entryMode.locked || !editableForecastType;
  const activeLabel = forecastTypeLabel(editableForecastType);
  const selectedMonthLabel = `${monthLabel(batch.data.month)} ${batch.data.year}`;

  const companyDetailHref = batch.data.companies[0]
    ? buildCompanyDetailPageUrl(batch.data.companies[0].companyName, batch.data.year)
    : null;

  useEffect(() => {
    setValues(valuesFromBatch(batch));
    setSourceStates({});
    setNotes({});
    window.history.replaceState(null, "", buildEntryPageUrl(batch.data.selectedCsm));
  }, [batch]);

  function toggleBusinessUnit(businessUnit: string) {
    setExpandedBusinessUnits((current) => {
      const next = new Set(current);
      if (next.has(businessUnit)) {
        next.delete(businessUnit);
      } else {
        next.add(businessUnit);
      }
      return next;
    });
  }

  async function loadBatch(csmName: string) {
    setSelectedCsm(csmName);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildBatchUrl(csmName), { cache: "no-store" });
      const payload = (await response.json()) as ForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Forecast Entry batch.");
      }

      setBatch(payload);
      setSelectedCsm(payload.data.selectedCsm);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Forecast Entry batch."
      });
    } finally {
      setIsLoading(false);
    }
  }

  function acceptAiPlaceholder(company: ForecastEntryBatchCompany, cell: ForecastEntryBatchCell) {
    if (isLocked || !editableForecastType) return;

    const key = cellKey(company.companyName, cell.businessUnit);
    const current = activeForecast(cell, editableForecastType);
    const currentValue = values[key] ?? "";

    if (!current.hasSavedCsmValue && !currentValue.trim() && cell.aiForecast.value !== null) {
      setValues((existing) => ({ ...existing, [key]: formatInputValue(cell.aiForecast.value) }));
      setSourceStates((existing) => ({ ...existing, [key]: "accepted_ai" }));
    }
  }

  function updateValue(company: ForecastEntryBatchCompany, cell: ForecastEntryBatchCell, value: string) {
    const key = cellKey(company.companyName, cell.businessUnit);
    setValues((existing) => ({ ...existing, [key]: value }));
    setSourceStates((existing) => ({ ...existing, [key]: "manual_edit" }));
  }

  function updateNote(companyName: string, value: string) {
    setNotes((existing) => ({ ...existing, [companyName]: value }));
  }

  async function saveBatch() {
    if (isLocked || !editableForecastType) return;

    const updates = [];

    for (const company of batch.data.companies) {
      const note = notes[company.companyName]?.trim() ?? "";
      const saveValues = getCompanySaveValues(company, editableForecastType, values, sourceStates);

      if (note && saveValues.length === 0) {
        setNotice({ type: "error", text: `${company.companyName}: ${NOTE_ONLY_MESSAGE}` });
        return;
      }

      if (note || companyHasTouchedValue(company, sourceStates)) {
        updates.push({
          companyName: company.companyName,
          note,
          values: saveValues
        });
      }
    }

    if (updates.length === 0) {
      setNotice({ type: "success", text: "No changes detected" });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/batch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmName: batch.data.selectedCsm,
          year: batch.data.year,
          month: batch.data.month,
          forecastType: editableForecastType,
          updates
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Forecast Entry batch.");
      }

      setBatch(payload.batch);
      setNotice({
        type: "success",
        text: payload.noChanges
          ? "No changes detected"
          : `Saved ${payload.forecastUpserts} value(s) across ${payload.companiesSaved} compan${payload.companiesSaved === 1 ? "y" : "ies"}.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Forecast Entry batch."
      });
    } finally {
      setIsSaving(false);
    }
  }

  const tableColumnCount = useMemo(() => {
    return 2 + batch.data.businessUnits.reduce((sum, businessUnit) => sum + (expandedBusinessUnits.has(businessUnit) ? 3 : 1), 0);
  }, [batch.data.businessUnits, expandedBusinessUnits]);

  return (
    <PetyrWorkspaceShell
      activeSection="entry"
      companyDetailHref={companyDetailHref}
      forecastEntryHref={buildEntryPageUrl(batch.data.selectedCsm)}
      contentClassName="max-w-[1800px]"
    >
      <section>
        <PetyrSectionTitle
          title="Forecast Entry"
          description={`Current-month batch entry for ${selectedMonthLabel}. Select a CSM, update active forecast cells and save all company changes together.`}
          actions={
            <Badge variant={isLocked ? "outline" : "secondary"}>
              {isLocked ? batch.data.entryMode.label : activeLabel}
            </Badge>
          }
        />

        <PetyrCard className="bg-white/95">
          <CardContent className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-end">
            <PetyrSelectField
              label="CSM"
              disabled={isLoading || isSaving}
              value={selectedCsm}
              onChange={(event) => {
                void loadBatch(event.target.value);
              }}
            >
              {batch.data.csmOptions.map((csmName) => (
                <option key={csmName} value={csmName}>
                  {csmName}
                </option>
              ))}
            </PetyrSelectField>
            <PetyrInlineNotice tone={isLocked ? "warning" : "success"}>
              {isLocked
                ? batch.data.entryMode.reason
                : `${activeLabel} is editable for the current server month. Other forecast fields and Closed Revenue are read-only.`}
            </PetyrInlineNotice>
          </CardContent>
        </PetyrCard>
      </section>

      {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

      <Tabs defaultValue="monthly" className="space-y-5">
        <TabsList className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger value="monthly" className="rounded-xl">
            Monthly Forecast Entry
          </TabsTrigger>
          <TabsTrigger value="annual" className="rounded-xl">
            Annual Forecast Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-5">
          <PetyrCard>
        <CardHeader>
          <CardTitle>Monthly Forecast Batch</CardTitle>
          <CardDescription>
            {batch.data.selectedCsm}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {selectedMonthLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <LegendChip className="border-blue-300 bg-blue-100" label="AI suggestion/placeholder" />
            <LegendChip className="border-violet-300 bg-violet-100" label="CSM validated from AI" />
            <LegendChip className="border-emerald-300 bg-emerald-100" label="CSM manually edited" />
            <LegendChip className="border-slate-300 bg-white" label="Saved CSM forecast" />
            <LegendChip className="border-amber-300 bg-amber-100" label="Closed Revenue read-only" />
            <LegendChip className="border-slate-300 bg-slate-200" label="Locked forecast field" />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 min-w-[240px] bg-white" rowSpan={2}>
                    Customer
                  </TableHead>
                  {batch.data.businessUnits.map((businessUnit) => {
                    const expanded = expandedBusinessUnits.has(businessUnit);
                    return (
                      <TableHead
                        key={businessUnit}
                        className="min-w-[190px] border-l border-slate-200 bg-slate-50 text-center"
                        colSpan={expanded ? 3 : 1}
                      >
                        <button
                          type="button"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-white"
                          onClick={() => toggleBusinessUnit(businessUnit)}
                        >
                          {businessUnit}
                          <span className="text-xs text-slate-400">{expanded ? "Collapse" : "Expand"}</span>
                        </button>
                      </TableHead>
                    );
                  })}
                  <TableHead className="min-w-[260px] bg-white" rowSpan={2}>
                    Note
                  </TableHead>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  {batch.data.businessUnits.flatMap((businessUnit) => {
                    const expanded = expandedBusinessUnits.has(businessUnit);
                    const columns = [
                      <TableHead key={`${businessUnit}-active`} className="min-w-[190px] border-l border-slate-200 bg-white text-xs">
                        {activeLabel}
                      </TableHead>
                    ];

                    if (expanded) {
                      columns.push(
                        <TableHead key={`${businessUnit}-inactive`} className="min-w-[180px] bg-white text-xs">
                          {inactiveForecastLabel(editableForecastType)}
                        </TableHead>,
                        <TableHead key={`${businessUnit}-closed`} className="min-w-[170px] bg-amber-50 text-xs">
                          Closed Revenue
                        </TableHead>
                      );
                    }

                    return columns;
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.data.companies.length > 0 ? (
                  batch.data.companies.map((company) => (
                    <TableRow key={company.companyName}>
                      <TableCell className="sticky left-0 z-10 min-w-[240px] bg-white">
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.year)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">{company.isForecastActive ? "Active" : "Inactive"}</div>
                      </TableCell>
                      {company.businessUnits.flatMap((cell) => {
                        const expanded = expandedBusinessUnits.has(cell.businessUnit);
                        const key = cellKey(company.companyName, cell.businessUnit);
                        const current = activeForecast(cell, editableForecastType);
                        const sourceState = sourceStates[key];
                        const aiPlaceholder = !current.hasSavedCsmValue && cell.aiForecast.value !== null ? formatInputValue(cell.aiForecast.value) : "";
                        const activeInputClass =
                          sourceState === "accepted_ai"
                            ? "border-violet-300 bg-violet-50"
                            : sourceState === "manual_edit"
                              ? "border-emerald-300 bg-emerald-50"
                              : current.hasSavedCsmValue
                                ? "border-slate-300 bg-white"
                                : aiPlaceholder
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-slate-200 bg-white";
                        const columns = [
                          <TableCell key={`${key}-active`} className="border-l border-slate-200">
                            <Input
                              inputMode="decimal"
                              disabled={isLocked || isSaving}
                              readOnly={isLocked}
                              placeholder={aiPlaceholder || "n/a"}
                              value={values[key] ?? ""}
                              onFocus={() => acceptAiPlaceholder(company, cell)}
                              onClick={() => acceptAiPlaceholder(company, cell)}
                              onChange={(event) => updateValue(company, cell, event.target.value)}
                              className={`h-10 min-w-[150px] rounded-xl text-right font-semibold ${isLocked ? "bg-slate-100" : activeInputClass}`}
                            />
                            {sourceState ? (
                              <div className="mt-1 text-[11px] font-medium text-slate-500">
                                {sourceState === "accepted_ai" ? "Validated from AI" : "Manual edit"}
                              </div>
                            ) : current.hasSavedCsmValue ? (
                              <div className="mt-1 text-[11px] text-slate-500">Saved CSM forecast</div>
                            ) : aiPlaceholder ? (
                              <div className="mt-1 text-[11px] text-blue-700">AI suggestion</div>
                            ) : null}
                          </TableCell>
                        ];

                        if (expanded) {
                          columns.push(
                            <TableCell key={`${key}-inactive`} className="bg-slate-50 text-right font-medium text-slate-700">
                              {formatPetyrCurrencyValue(inactiveForecast(cell, editableForecastType)?.value)}
                            </TableCell>,
                            <TableCell key={`${key}-closed`} className="bg-amber-50 text-right font-medium text-slate-700">
                              {formatPetyrCurrencyValue(cell.closedRevenue)}
                            </TableCell>
                          );
                        }

                        return columns;
                      })}
                      <TableCell className="min-w-[260px]">
                        <Textarea
                          value={notes[company.companyName] ?? ""}
                          onChange={(event) => updateNote(company.companyName, event.target.value)}
                          disabled={isSaving}
                          placeholder="Company note..."
                          className="min-h-[72px] rounded-xl"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={tableColumnCount} className="bg-slate-50 py-8 text-center text-sm text-slate-500">
                      No companies available for this CSM.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <Button className="w-full rounded-xl" type="button" disabled={isLocked || isSaving || isLoading} onClick={saveBatch}>
            {isSaving ? "Saving forecast" : "Save forecast"}
          </Button>
        </CardContent>
          </PetyrCard>
        </TabsContent>

        <TabsContent value="annual" className="space-y-5">
          <AnnualForecastEntryBatchWorkspace initialBatch={initialAnnualBatch} />
        </TabsContent>
      </Tabs>
    </PetyrWorkspaceShell>
  );
}
