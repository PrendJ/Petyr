import { Prisma, type ForecastAnnual, type ForecastAnnualSnapshot } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getPetyrTimezone,
  getPetyrYearInTimezone,
  isPetyrInitialForecastConsolidationDate,
  resolvePetyrTimezone
} from "@/lib/petyr/config";
import { PETYR_BUSINESS_UNITS, normalizePetyrBusinessUnit, type PetyrBusinessUnit } from "@/lib/petyr/constants";

const INITIAL_SNAPSHOT_TYPE = "initial" as const;
const DEFAULT_CONSOLIDATION_USER = "petyr-year-end-consolidation";
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const INITIAL_FORECAST_CONSOLIDATION_DATE_LABEL = "January 1";

type RelationExistsRow = {
  exists: boolean;
};

export type InitialAnnualForecastSnapshotSource = "manual_excel_2026" | "year_end_consolidation" | "admin";

export type InitialAnnualForecastUpsertInput = {
  companyName: string;
  csmName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  value: Prisma.Decimal;
  source: InitialAnnualForecastSnapshotSource;
  note: string | null;
  createdBy: string;
  lockedAt?: Date;
};

export type InitialAnnualForecastUpsertOptions = {
  allowLockedOverwrite?: boolean;
};

export type InitialAnnualForecastUpsertResult = {
  changedRows: number;
  unchangedRows: number;
  lockedRowsSkipped: number;
  snapshotUpserts: number;
  changeLogRows: number;
};

export type InitialAnnualForecastConsolidationResult = InitialAnnualForecastUpsertResult & {
  ok: true;
  year: number;
  source: "year_end_consolidation";
  timezone: string;
  consolidationDate: "January 1";
  explicitYear: boolean;
  isConsolidationDateInTimezone: boolean;
  allowLockedOverwrite: boolean;
  annualForecastRows: number;
  eligibleRows: number;
  skippedRows: number;
  warnings: string[];
  message: string;
};

export class InitialAnnualForecastError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InitialAnnualForecastError";
    this.status = status;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasYearInput(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function requireYear(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asString(value));

  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new InitialAnnualForecastError("Initial annual forecast requires a valid year between 2000 and 2100.", 400);
  }

  return parsed;
}

function decimalChanged(previousValue: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal) {
  return !previousValue || !previousValue.equals(nextValue);
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function assertSnapshotTablesExist() {
  const [snapshotExists, changeLogExists] = await Promise.all([
    relationExists("forecast_annual_snapshot"),
    relationExists("forecast_annual_snapshot_change_log")
  ]);

  if (!snapshotExists || !changeLogExists) {
    throw new InitialAnnualForecastError(
      "forecast_annual_snapshot tables are missing. Apply the forecasting app Prisma schema before importing or consolidating Initial Forecast.",
      500
    );
  }
}

export async function readInitialAnnualForecastSnapshots(
  year: number,
  diagnostics: string[] = []
): Promise<ForecastAnnualSnapshot[]> {
  if (!(await relationExists("forecast_annual_snapshot"))) {
    diagnostics.push(
      "forecast_annual_snapshot is missing. Apply the forecasting app Prisma schema before Petyr can read frozen Initial Forecast baselines."
    );
    return [];
  }

  return prisma.forecastAnnualSnapshot.findMany({
    where: {
      year,
      snapshotType: INITIAL_SNAPSHOT_TYPE
    }
  });
}

export async function upsertInitialAnnualForecastSnapshots(
  rows: InitialAnnualForecastUpsertInput[],
  options: InitialAnnualForecastUpsertOptions = {}
): Promise<InitialAnnualForecastUpsertResult> {
  await assertSnapshotTablesExist();

  let changedRows = 0;
  let unchangedRows = 0;
  let lockedRowsSkipped = 0;
  let snapshotUpserts = 0;
  let changeLogRows = 0;
  const allowLockedOverwrite = options.allowLockedOverwrite === true;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const where = {
        companyName_businessUnit_year_snapshotType: {
          companyName: row.companyName,
          businessUnit: row.businessUnit,
          year: row.year,
          snapshotType: INITIAL_SNAPSHOT_TYPE
        }
      };
      const existing = await tx.forecastAnnualSnapshot.findUnique({ where });
      const nextLockedAt = row.lockedAt ?? new Date();
      const hasChanged =
        !existing ||
        decimalChanged(existing.value, row.value) ||
        existing.csmName !== row.csmName ||
        existing.source !== row.source ||
        (existing.note ?? null) !== row.note;

      if (!hasChanged) {
        unchangedRows += 1;
        continue;
      }

      if (existing?.lockedAt && !allowLockedOverwrite) {
        lockedRowsSkipped += 1;
        continue;
      }

      const snapshot = existing
        ? await tx.forecastAnnualSnapshot.update({
            where,
            data: {
              csmName: row.csmName,
              value: row.value,
              source: row.source,
              note: row.note,
              lockedAt: nextLockedAt
            }
          })
        : await tx.forecastAnnualSnapshot.create({
            data: {
              companyName: row.companyName,
              csmName: row.csmName,
              businessUnit: row.businessUnit,
              year: row.year,
              snapshotType: INITIAL_SNAPSHOT_TYPE,
              value: row.value,
              source: row.source,
              note: row.note,
              createdBy: row.createdBy,
              lockedAt: nextLockedAt
            }
          });

      await tx.forecastAnnualSnapshotChangeLog.create({
        data: {
          snapshotId: snapshot.id,
          companyName: row.companyName,
          csmName: row.csmName,
          businessUnit: row.businessUnit,
          year: row.year,
          snapshotType: INITIAL_SNAPSHOT_TYPE,
          previousValue: existing?.value ?? null,
          newValue: row.value,
          previousSource: existing?.source ?? null,
          newSource: row.source,
          note: row.note,
          changedBy: row.createdBy,
          changedAt: nextLockedAt
        }
      });

      changedRows += 1;
      snapshotUpserts += 1;
      changeLogRows += 1;
    }
  });

  return {
    changedRows,
    unchangedRows,
    lockedRowsSkipped,
    snapshotUpserts,
    changeLogRows
  };
}

function normalizeAnnualBusinessUnit(row: ForecastAnnual, warnings: string[]) {
  const normalized = normalizePetyrBusinessUnit(row.businessUnit);

  if (normalized.reason !== "official" || !BUSINESS_UNITS.has(normalized.businessUnit)) {
    warnings.push(
      `Skipped annual forecast row for ${row.companyName} / ${row.businessUnit || "missing BU"} because Initial Forecast consolidation accepts only official Business Units.`
    );
    return null;
  }

  return normalized.businessUnit;
}

export async function consolidateInitialAnnualForecast(
  yearInput: unknown,
  options: {
    createdBy?: unknown;
    note?: unknown;
    lockedAt?: Date;
    overrideLocked?: unknown;
    timezone?: unknown;
  } = {}
): Promise<InitialAnnualForecastConsolidationResult> {
  const lockedAt = options.lockedAt ?? new Date();
  const timezone = resolvePetyrTimezone(asString(options.timezone) || getPetyrTimezone());
  const isConsolidationDateInTimezone = isPetyrInitialForecastConsolidationDate(lockedAt, timezone);
  const hasExplicitYear = hasYearInput(yearInput);
  const year = hasExplicitYear ? requireYear(yearInput) : getPetyrYearInTimezone(lockedAt, timezone);
  const allowLockedOverwrite = options.overrideLocked === true || asString(options.overrideLocked).toLowerCase() === "true";

  if (!hasExplicitYear && !isConsolidationDateInTimezone) {
    throw new InitialAnnualForecastError(
      `Automatic Initial Forecast consolidation without an explicit year is allowed only on ${INITIAL_FORECAST_CONSOLIDATION_DATE_LABEL} in ${timezone}. For manual recovery, pass an explicit year.`,
      400
    );
  }

  if (!(await relationExists("forecast_annual"))) {
    throw new InitialAnnualForecastError(
      "forecast_annual is missing. Apply the forecasting app Prisma schema before consolidating Initial Forecast.",
      500
    );
  }

  const annualRows = await prisma.forecastAnnual.findMany({
    where: { year },
    orderBy: [{ csmName: "asc" }, { companyName: "asc" }, { businessUnit: "asc" }]
  });
  const warnings: string[] = [];
  const createdBy = asString(options.createdBy) || DEFAULT_CONSOLIDATION_USER;
  const note = asString(options.note) || "Initial Forecast consolidated from current annual forecast.";
  const inputs: InitialAnnualForecastUpsertInput[] = [];
  const seenKeys = new Set<string>();

  if (!isConsolidationDateInTimezone) {
    warnings.push(
      `Manual Initial Forecast consolidation is running outside ${INITIAL_FORECAST_CONSOLIDATION_DATE_LABEL} in ${timezone}; this is intended only for controlled recovery operations with an explicit target year.`
    );
  }

  for (const row of annualRows) {
    const businessUnit = normalizeAnnualBusinessUnit(row, warnings);
    if (!businessUnit) continue;

    const key = [normalizeKey(row.companyName), businessUnit, row.year].join("\u0000");
    if (seenKeys.has(key)) {
      warnings.push(`Skipped duplicate annual forecast row for ${row.companyName} / ${businessUnit} / ${row.year}.`);
      continue;
    }
    seenKeys.add(key);

    inputs.push({
      companyName: row.companyName,
      csmName: row.csmName,
      businessUnit,
      year,
      value: row.value,
      source: "year_end_consolidation",
      note,
      createdBy,
      lockedAt
    });
  }

  const upsertResult = inputs.length > 0
    ? await upsertInitialAnnualForecastSnapshots(inputs, { allowLockedOverwrite })
    : { changedRows: 0, unchangedRows: 0, lockedRowsSkipped: 0, snapshotUpserts: 0, changeLogRows: 0 };

  if (upsertResult.lockedRowsSkipped > 0) {
    warnings.push(
      `${upsertResult.lockedRowsSkipped} locked Initial Forecast snapshot row(s) were left unchanged. Pass overrideLocked=true only for an explicit admin recovery overwrite.`
    );
  }

  return {
    ok: true,
    year,
    source: "year_end_consolidation",
    timezone,
    consolidationDate: INITIAL_FORECAST_CONSOLIDATION_DATE_LABEL,
    explicitYear: hasExplicitYear,
    isConsolidationDateInTimezone,
    allowLockedOverwrite,
    annualForecastRows: annualRows.length,
    eligibleRows: inputs.length,
    skippedRows: annualRows.length - inputs.length + upsertResult.lockedRowsSkipped,
    warnings,
    message:
      inputs.length === 0
        ? `No current annual forecast rows found for ${year}. Initial Forecast was not changed.`
        : `Initial Forecast consolidation completed for ${year}.`,
    ...upsertResult
  };
}
