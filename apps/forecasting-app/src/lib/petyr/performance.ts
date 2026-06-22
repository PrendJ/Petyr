type PerfMeta = Record<string, string | number | boolean | null | undefined>;

export const PETYR_PERFORMANCE_CHECKS = [
  "getPetyrApprovedRenderingData",
  "getManagementView",
  "getCsmOverviewWorkspace",
  "getCompanyDetail",
  "getForecastEntryContext",
  "getForecastEntryCompanies",
  "Petyr PostgreSQL row-count loads",
  "Redash sync execution",
  "Redash latest table materialization"
] as const;

export function isPetyrPerfLogsEnabled() {
  return process.env.PETYR_PERF_LOGS?.trim().toLowerCase() === "true";
}

function writePetyrPerfLog(message: string, meta: PerfMeta) {
  if (!isPetyrPerfLogsEnabled()) return;

  console.info(JSON.stringify({
    level: "info",
    message,
    time: new Date().toISOString(),
    meta
  }));
}

export function logPetyrPerformance(operation: string, meta: PerfMeta = {}) {
  writePetyrPerfLog("Petyr performance", {
    operation,
    ...meta
  });
}

export function startPetyrPerformanceTimer(operation: string, meta: PerfMeta = {}) {
  const startedAt = Date.now();

  return (extraMeta: PerfMeta = {}) => {
    logPetyrPerformance(operation, {
      ...meta,
      ...extraMeta,
      durationMs: Date.now() - startedAt
    });
  };
}
