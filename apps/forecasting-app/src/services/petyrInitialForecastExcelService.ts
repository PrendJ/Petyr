import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { PETYR_BUSINESS_UNITS, normalizePetyrBusinessUnit, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { PETYR_EXCEL_CURRENCY_NUM_FORMAT } from "@/lib/petyr/formatters";
import {
  getCanonicalCompanyOwnershipPairs,
  normalizeCompanyOwnershipKey
} from "@/services/petyrCompanyOwnershipService";
import {
  readInitialAnnualForecastSnapshots,
  upsertInitialAnnualForecastSnapshots,
  type InitialAnnualForecastSnapshotSource,
  type InitialAnnualForecastUpsertInput
} from "@/services/petyrInitialAnnualForecastService";

const EXCEL_IMPORT_SOURCE = "Initial Forecast Excel Import";
const DEFAULT_TEMPLATE_YEAR = 2026;
const SYSTEM_USER = "petyr-initial-forecast-excel";

const INITIAL_FORECAST_INPUT_HEADERS = [
  { key: "csmName", label: "CSM", width: 24 },
  { key: "companyName", label: "Company", width: 34 },
  { key: "businessUnit", label: "Business Unit", width: 18 },
  { key: "year", label: "Year", width: 12 },
  { key: "currentAnnualForecast", label: "Current annual forecast, read-only/reference", width: 30 },
  { key: "initialForecastValue", label: "Initial forecast value, editable", width: 28 },
  { key: "note", label: "Note", width: 36 }
] as const;

type InitialForecastInputHeaderKey = (typeof INITIAL_FORECAST_INPUT_HEADERS)[number]["key"];

type RelationExistsRow = {
  exists: boolean;
};

type ExportInputRow = {
  csmName: string;
  companyName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  currentAnnualForecast: number | null;
  initialForecastValue: number | null;
  note: string;
};

type ReferenceCompanyRow = {
  csmName: string;
  companyName: string;
  branchName: string;
};

type ImportIssue = {
  row?: number;
  field?: string;
  message: string;
};

type ProblemRow = {
  row: number;
  values: Record<string, string | undefined>;
  messages: string[];
};

type ParsedImportRow = {
  rowNumber: number;
  companyName: string;
  csmName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  value: Prisma.Decimal;
  note: string | null;
  source: InitialAnnualForecastSnapshotSource;
};

export type InitialForecastImportResult = {
  ok: boolean;
  source: string;
  fileName?: string;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  lockedRowsSkipped: number;
  importedRows: number;
  skippedRows: number;
  snapshotUpserts: number;
  changeLogRows: number;
  durationMs: number;
  message?: string;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  problemRows: ProblemRow[];
};

function normalizeCellValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeMoneyString(value: string) {
  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|€/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  return normalized;
}

function parseDecimal(value: string) {
  const normalized = normalizeMoneyString(value);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  return new Prisma.Decimal(normalized);
}

function isNegativeDecimal(value: Prisma.Decimal) {
  return value.lessThan(new Prisma.Decimal(0));
}

function parseYear(value: string) {
  const year = Number(value.trim());
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function sourceForYear(year: number): InitialAnnualForecastSnapshotSource {
  return year === 2026 ? "manual_excel_2026" : "admin";
}

function rowKey(companyName: string, businessUnit: string, year: number) {
  return [normalizeCompanyOwnershipKey(companyName), businessUnit, year].join("\u0000");
}

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();

  if ("result" in value && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text.trim();
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("").trim();
  }

  return cell.text.trim();
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getAnnualForecastReferences(year: number, companyNames: string[], warnings: string[]) {
  const values = new Map<string, number>();

  if (!(await relationExists("forecast_annual"))) {
    warnings.push("forecast_annual is missing, so Current annual forecast reference cells are blank.");
    return values;
  }

  const rows = await prisma.forecastAnnual.findMany({
    where: {
      year,
      companyName: { in: companyNames }
    }
  });

  for (const row of rows) {
    const normalized = normalizePetyrBusinessUnit(row.businessUnit);
    if (normalized.reason !== "official") continue;
    values.set(rowKey(row.companyName, normalized.businessUnit, row.year), decimalToNumber(row.value) ?? 0);
  }

  return values;
}

async function getInitialSnapshotReferences(year: number, warnings: string[]) {
  const values = new Map<string, { value: number; note: string }>();
  const diagnostics: string[] = [];
  const rows = await readInitialAnnualForecastSnapshots(year, diagnostics);

  warnings.push(...diagnostics);

  for (const row of rows) {
    const normalized = normalizePetyrBusinessUnit(row.businessUnit);
    if (normalized.reason !== "official") continue;
    values.set(rowKey(row.companyName, normalized.businessUnit, row.year), {
      value: decimalToNumber(row.value) ?? 0,
      note: row.note ?? ""
    });
  }

  return values;
}

async function loadExportData(year: number) {
  const ownershipPairs = (await getCanonicalCompanyOwnershipPairs()).sort((left, right) => {
    const csmComparison = left.csmName.localeCompare(right.csmName);
    if (csmComparison !== 0) return csmComparison;

    return left.companyName.localeCompare(right.companyName);
  });
  const companyNames = ownershipPairs.map((pair) => pair.companyName);
  const warnings: string[] = [];
  const [annualReferences, initialReferences] = await Promise.all([
    getAnnualForecastReferences(year, companyNames, warnings),
    getInitialSnapshotReferences(year, warnings)
  ]);
  const referenceCompanies = ownershipPairs.map<ReferenceCompanyRow>((pair) => ({
    csmName: pair.csmName,
    companyName: pair.companyName,
    branchName: pair.branchName ?? ""
  }));
  const rows: ExportInputRow[] = [];

  for (const pair of ownershipPairs) {
    for (const businessUnit of PETYR_BUSINESS_UNITS) {
      const key = rowKey(pair.companyName, businessUnit, year);
      const initialReference = initialReferences.get(key);

      rows.push({
        csmName: pair.csmName,
        companyName: pair.companyName,
        businessUnit,
        year,
        currentAnnualForecast: annualReferences.get(key) ?? null,
        initialForecastValue: initialReference?.value ?? null,
        note: initialReference?.note ?? ""
      });
    }
  }

  return {
    rows,
    referenceCompanies,
    warnings
  };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
}

function styleReadOnlyCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
  cell.font = { color: { argb: "FF1D4ED8" } };
}

function addInstructionsSheet(workbook: ExcelJS.Workbook, year: number, warnings: string[]) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 34 }, { width: 110 }];

  sheet.addRow(["Petyr Initial Forecast baseline"]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.addRow([]);
  sheet.addRows([
    ["What to fill", "Fill Initial forecast value only for the 2026 baseline. This does not update ongoing annual forecast."],
    ["Workbook year", `This workbook is prepared for ${year}. The default Initial Forecast bootstrap year is 2026.`],
    ["What not to modify", "Do not edit CSM, Company, Business Unit or Year unless you are correcting a validation issue before import."],
    ["Read-only reference", "Current annual forecast is reference-only. It is ignored during import and does not change Ongoing Forecast."],
    ["Forecast grain", "Initial Forecast is saved for Company + Business Unit + Year."],
    ["Scope", "Closed revenue, management objectives, monthly forecast and AI forecast are not imported or modified by this workbook."]
  ]);

  if (warnings.length > 0) {
    sheet.addRow([]);
    sheet.addRow(["Export warnings", warnings.join(" ")]);
  }

  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

function addInitialForecastInputSheet(workbook: ExcelJS.Workbook, rows: ExportInputRow[]) {
  const sheet = workbook.addWorksheet("Initial Forecast Input");

  sheet.columns = INITIAL_FORECAST_INPUT_HEADERS.map((header) => ({
    header: header.label,
    key: header.key,
    width: header.width
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: INITIAL_FORECAST_INPUT_HEADERS.length }
  };
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    const worksheetRow = sheet.addRow(row satisfies Record<InitialForecastInputHeaderKey, string | number | null>);
    worksheetRow.getCell("currentAnnualForecast").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("initialForecastValue").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("note").alignment = { wrapText: true, vertical: "top" };
    styleReadOnlyCell(worksheetRow.getCell("currentAnnualForecast"));
  }

  const lastDataRow = Math.max(rows.length + 1, 2);
  for (let rowNumber = 2; rowNumber <= lastDataRow; rowNumber += 1) {
    sheet.getCell(`C${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'Reference - Business Units'!$A$2:$A$${PETYR_BUSINESS_UNITS.length + 1}`]
    };
    sheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: false,
      formulae: [2000, 2100]
    };
    sheet.getCell(`F${rowNumber}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [0]
    };
  }
}

function addBusinessUnitsSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Reference - Business Units");
  sheet.columns = [{ header: "Official Business Unit", key: "businessUnit", width: 28 }];
  styleHeaderRow(sheet.getRow(1));

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    sheet.addRow({ businessUnit });
  }
}

function addCompaniesSheet(workbook: ExcelJS.Workbook, rows: ReferenceCompanyRow[]) {
  const sheet = workbook.addWorksheet("Reference - Companies");
  sheet.columns = [
    { header: "CSM", key: "csmName", width: 24 },
    { header: "Company", key: "companyName", width: 38 },
    { header: "Branch", key: "branchName", width: 24 }
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: 3 }
  };
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    sheet.addRow(row);
  }
}

export async function buildInitialForecastWorkbookXlsx(input: { year?: number | null } = {}) {
  const year = input.year ?? DEFAULT_TEMPLATE_YEAR;
  const data = await loadExportData(year);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Petyr Admin";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  addInstructionsSheet(workbook, year, data.warnings);
  addInitialForecastInputSheet(workbook, data.rows);
  addBusinessUnitsSheet(workbook);
  addCompaniesSheet(workbook, data.referenceCompanies);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

const HEADER_ALIASES = new Map<string, InitialForecastInputHeaderKey>([
  ["csm", "csmName"],
  ["csmname", "csmName"],
  ["company", "companyName"],
  ["companyname", "companyName"],
  ["businessunit", "businessUnit"],
  ["year", "year"],
  ["currentannualforecastreadonlyreference", "currentAnnualForecast"],
  ["currentannualforecast", "currentAnnualForecast"],
  ["initialforecastvalueeditable", "initialForecastValue"],
  ["initialforecastvalue", "initialForecastValue"],
  ["note", "note"]
]);

function buildImportFailure(input: {
  fileName?: string;
  totalRows?: number;
  importableRows?: number;
  startedAt: number;
  errors: ImportIssue[];
  warnings?: ImportIssue[];
  problemRows?: ProblemRow[];
}): InitialForecastImportResult {
  return {
    ok: false,
    source: EXCEL_IMPORT_SOURCE,
    fileName: input.fileName,
    totalRows: input.totalRows ?? 0,
    importableRows: input.importableRows ?? 0,
    changedRows: 0,
    unchangedRows: 0,
    lockedRowsSkipped: 0,
    importedRows: 0,
    skippedRows: input.totalRows ?? 0,
    snapshotUpserts: 0,
    changeLogRows: 0,
    durationMs: Date.now() - input.startedAt,
    errors: input.errors,
    warnings: input.warnings ?? [],
    problemRows: input.problemRows ?? []
  };
}

function buildProblemRows(recordsByRow: Map<number, Record<string, string>>, errors: ImportIssue[]) {
  const messagesByRow = new Map<number, string[]>();

  for (const error of errors) {
    if (!error.row || error.row < 2) continue;
    const messages = messagesByRow.get(error.row) ?? [];
    messages.push(`${error.field ?? "row"}: ${error.message}`);
    messagesByRow.set(error.row, messages);
  }

  return [...messagesByRow.entries()].slice(0, 10).map<ProblemRow>(([row, messages]) => ({
    row,
    values: recordsByRow.get(row) ?? {},
    messages
  }));
}

function validateImportRecord(input: {
  rowNumber: number;
  record: Record<InitialForecastInputHeaderKey, string>;
  ownershipByCompany: Map<string, Awaited<ReturnType<typeof getCanonicalCompanyOwnershipPairs>>[number]>;
  duplicateKeys: Set<string>;
  errors: ImportIssue[];
}) {
  const companyName = normalizeCellValue(input.record.companyName);
  const csmName = normalizeCellValue(input.record.csmName);
  const rawBusinessUnit = normalizeCellValue(input.record.businessUnit);
  const year = parseYear(input.record.year);
  const rawValue = normalizeCellValue(input.record.initialForecastValue);
  const note = normalizeCellValue(input.record.note) || null;

  if (!rawValue) return null;

  const company = input.ownershipByCompany.get(normalizeCompanyOwnershipKey(companyName));
  if (!companyName || !company) {
    input.errors.push({ row: input.rowNumber, field: "Company", message: "Company must exist in Company Ownership." });
  }

  if (!csmName) {
    input.errors.push({ row: input.rowNumber, field: "CSM", message: "CSM is required." });
  } else if (company && normalizeCompanyOwnershipKey(csmName) !== normalizeCompanyOwnershipKey(company.csmName)) {
    input.errors.push({
      row: input.rowNumber,
      field: "CSM",
      message: `CSM must match Company Ownership for this company (${company.csmName}).`
    });
  }

  const normalizedBusinessUnit = normalizePetyrBusinessUnit(rawBusinessUnit);
  const businessUnit = normalizedBusinessUnit.reason === "official" ? normalizedBusinessUnit.businessUnit : null;
  if (!businessUnit) {
    input.errors.push({
      row: input.rowNumber,
      field: "Business Unit",
      message: `Business Unit must be one of: ${PETYR_BUSINESS_UNITS.join(", ")}.`
    });
  }

  if (!year) {
    input.errors.push({ row: input.rowNumber, field: "Year", message: "Year must be an integer between 2000 and 2100." });
  }

  const value = parseDecimal(rawValue);
  if (!value) {
    input.errors.push({
      row: input.rowNumber,
      field: "Initial forecast value",
      message: "Initial forecast value must be numeric when provided."
    });
  } else if (isNegativeDecimal(value)) {
    input.errors.push({
      row: input.rowNumber,
      field: "Initial forecast value",
      message: "Initial forecast value must be greater than or equal to 0."
    });
  }

  if (!company || !businessUnit || !year || !value || isNegativeDecimal(value)) return null;

  const key = rowKey(company.companyName, businessUnit, year);
  if (input.duplicateKeys.has(key)) {
    input.errors.push({
      row: input.rowNumber,
      field: "row",
      message: "Duplicate Initial Forecast row for the same Company, Business Unit and Year."
    });
    return null;
  }
  input.duplicateKeys.add(key);

  return {
    rowNumber: input.rowNumber,
    companyName: company.companyName,
    csmName: company.csmName,
    businessUnit,
    year,
    value,
    note,
    source: sourceForYear(year)
  } satisfies ParsedImportRow;
}

export async function importInitialForecastWorkbookXlsx(
  buffer: Buffer,
  options: { fileName?: string } = {}
): Promise<InitialForecastImportResult> {
  const startedAt = Date.now();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.getWorksheet("Initial Forecast Input");
  const warnings: ImportIssue[] = [
    {
      message:
        "Current annual forecast is a read-only reference and was ignored. This import updates only Initial Forecast snapshots."
    }
  ];

  if (!sheet) {
    const hasMonthlySheet = Boolean(workbook.getWorksheet("Forecast Input"));
    return buildImportFailure({
      fileName: options.fileName,
      startedAt,
      errors: [
        {
          row: 1,
          field: "sheet",
          message: hasMonthlySheet
            ? 'This looks like a monthly forecast workbook. Upload an Initial Forecast workbook with sheet "Initial Forecast Input".'
            : 'Workbook must include an "Initial Forecast Input" sheet.'
        }
      ],
      warnings
    });
  }

  const headerIndexes = new Map<InitialForecastInputHeaderKey, number>();
  const unknownHeaders: string[] = [];
  const headerRow = sheet.getRow(1);

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const headerText = getCellText(cell);
    const mappedHeader = HEADER_ALIASES.get(normalizeHeader(headerText));

    if (!mappedHeader) {
      unknownHeaders.push(headerText);
      return;
    }

    headerIndexes.set(mappedHeader, columnNumber);
  });

  const headerErrors: ImportIssue[] = [];
  for (const header of INITIAL_FORECAST_INPUT_HEADERS) {
    if (!headerIndexes.has(header.key)) {
      headerErrors.push({ row: 1, field: header.label, message: `Missing required Initial Forecast Input column "${header.label}".` });
    }
  }

  if (unknownHeaders.length > 0) {
    warnings.push({
      field: "headers",
      message: `Ignored unrecognized Initial Forecast Input column(s): ${unknownHeaders.join(", ")}.`
    });
  }

  if (headerErrors.length > 0) {
    return buildImportFailure({
      fileName: options.fileName,
      totalRows: Math.max(sheet.actualRowCount - 1, 0),
      startedAt,
      errors: headerErrors,
      warnings
    });
  }

  const ownershipPairs = await getCanonicalCompanyOwnershipPairs();
  const ownershipByCompany = new Map(
    ownershipPairs.map((pair) => [normalizeCompanyOwnershipKey(pair.companyName), pair])
  );
  const recordsByRow = new Map<number, Record<string, string>>();
  const parsedRows: ParsedImportRow[] = [];
  const duplicateKeys = new Set<string>();
  const errors: ImportIssue[] = [];
  let totalRows = 0;
  let importableRows = 0;

  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record = Object.fromEntries(
      INITIAL_FORECAST_INPUT_HEADERS.map((header) => [
        header.key,
        getCellText(row.getCell(headerIndexes.get(header.key) ?? 1))
      ])
    ) as Record<InitialForecastInputHeaderKey, string>;
    const hasAnyValue = Object.values(record).some((value) => value.trim() !== "");

    if (!hasAnyValue) continue;

    totalRows += 1;
    recordsByRow.set(rowNumber, record);

    if (!normalizeCellValue(record.initialForecastValue)) continue;

    importableRows += 1;
    const parsed = validateImportRecord({
      rowNumber,
      record,
      ownershipByCompany,
      duplicateKeys,
      errors
    });

    if (parsed) parsedRows.push(parsed);
  }

  if (errors.length > 0) {
    return buildImportFailure({
      fileName: options.fileName,
      totalRows,
      importableRows,
      startedAt,
      errors,
      warnings,
      problemRows: buildProblemRows(recordsByRow, errors)
    });
  }

  if (parsedRows.length === 0) {
    return {
      ok: true,
      source: EXCEL_IMPORT_SOURCE,
      fileName: options.fileName,
      totalRows,
      importableRows,
      changedRows: 0,
      unchangedRows: 0,
      lockedRowsSkipped: 0,
      importedRows: 0,
      skippedRows: totalRows,
      snapshotUpserts: 0,
      changeLogRows: 0,
      durationMs: Date.now() - startedAt,
      message: "No Initial Forecast values found. Nothing was imported.",
      errors: [],
      warnings,
      problemRows: []
    };
  }

  const upsertRows: InitialAnnualForecastUpsertInput[] = parsedRows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    businessUnit: row.businessUnit,
    year: row.year,
    value: row.value,
    source: row.source,
    note: row.note,
    createdBy: SYSTEM_USER,
    lockedAt: new Date()
  }));
  const upsertResult = await upsertInitialAnnualForecastSnapshots(upsertRows);
  if (upsertResult.lockedRowsSkipped > 0) {
    warnings.push({
      message:
        `${upsertResult.lockedRowsSkipped} locked Initial Forecast row(s) were left unchanged. Use the protected consolidation endpoint with overrideLocked=true only for explicit admin recovery.`
    });
  }

  return {
    ok: true,
    source: EXCEL_IMPORT_SOURCE,
    fileName: options.fileName,
    totalRows,
    importableRows,
    changedRows: upsertResult.changedRows,
    unchangedRows: upsertResult.unchangedRows,
    lockedRowsSkipped: upsertResult.lockedRowsSkipped,
    importedRows: upsertResult.changedRows,
    skippedRows: totalRows - importableRows + upsertResult.lockedRowsSkipped,
    snapshotUpserts: upsertResult.snapshotUpserts,
    changeLogRows: upsertResult.changeLogRows,
    durationMs: Date.now() - startedAt,
    message:
      upsertResult.changedRows === 0
        ? "No Initial Forecast changes detected. Nothing was imported."
        : "Initial Forecast import completed.",
    errors: [],
    warnings,
    problemRows: []
  };
}
