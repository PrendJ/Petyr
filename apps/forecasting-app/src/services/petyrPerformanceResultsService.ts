import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PETYR_PERFORMANCE_CHECKS } from "@/lib/petyr/performance";

type RelationExistsRow = {
  exists: boolean;
};

type MetadataValue = string | number | boolean | null;

export type PetyrPerformanceResultRow = {
  id: string | null;
  service: string;
  operation: string;
  measured: boolean;
  status: string;
  durationMs: number | null;
  rowCount: number | null;
  metadata: Record<string, MetadataValue>;
  measuredAt: string | null;
};

export type PetyrPerformanceResults = {
  ok: boolean;
  persistenceEnabled: boolean;
  checkedAt: string;
  checks: PetyrPerformanceResultRow[];
  recentHistory: PetyrPerformanceResultRow[];
  warnings: string[];
};

function expectedService(operation: string) {
  return operation.startsWith("Redash ") ? "redash-ingestor" : "forecasting-app";
}

async function performanceTableExists() {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass('petyr_performance_measurement') IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

function toMetadata(value: Prisma.JsonValue): Record<string, MetadataValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const metadata: Record<string, MetadataValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      metadata[key] = entry;
    }
  }

  return metadata;
}

function toRow(row: {
  id: string;
  service: string;
  operation: string;
  status: string;
  durationMs: number | null;
  rowCount: number | null;
  metadata: Prisma.JsonValue;
  measuredAt: Date;
}): PetyrPerformanceResultRow {
  return {
    id: row.id,
    service: row.service,
    operation: row.operation,
    measured: true,
    status: row.status,
    durationMs: row.durationMs,
    rowCount: row.rowCount,
    metadata: toMetadata(row.metadata),
    measuredAt: row.measuredAt.toISOString()
  };
}

function emptyRow(operation: string): PetyrPerformanceResultRow {
  return {
    id: null,
    service: expectedService(operation),
    operation,
    measured: false,
    status: "never_measured",
    durationMs: null,
    rowCount: null,
    metadata: {},
    measuredAt: null
  };
}

export async function getPetyrPerformanceResults(): Promise<PetyrPerformanceResults> {
  const checkedAt = new Date().toISOString();
  const operations = [...PETYR_PERFORMANCE_CHECKS];

  if (!(await performanceTableExists())) {
    return {
      ok: false,
      persistenceEnabled: false,
      checkedAt,
      checks: operations.map(emptyRow),
      recentHistory: [],
      warnings: [
        "petyr_performance_measurement is missing. Apply the forecasting app Prisma schema before Petyr Admin can show persisted performance results."
      ]
    };
  }

  const rows = await prisma.petyrPerformanceMeasurement.findMany({
    where: { operation: { in: operations } },
    orderBy: { measuredAt: "desc" },
    take: 200
  });
  const latestByOperation = new Map<string, PetyrPerformanceResultRow>();
  const history = rows.map(toRow);

  for (const row of history) {
    if (!latestByOperation.has(row.operation)) latestByOperation.set(row.operation, row);
  }

  return {
    ok: true,
    persistenceEnabled: true,
    checkedAt,
    checks: operations.map((operation) => latestByOperation.get(operation) ?? emptyRow(operation)),
    recentHistory: history.slice(0, 40),
    warnings: []
  };
}
