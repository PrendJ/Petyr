import { logger } from "./logger";

type PerfMeta = Record<string, string | number | boolean | null | undefined>;

export function isPerfLogsEnabled() {
  return process.env.PETYR_PERF_LOGS?.trim().toLowerCase() === "true";
}

export function logPerformance(operation: string, meta: PerfMeta = {}) {
  if (!isPerfLogsEnabled()) return;

  logger.info("Redash Ingestor performance", {
    operation,
    ...meta
  });
}

export function startPerformanceTimer(operation: string, meta: PerfMeta = {}) {
  const startedAt = Date.now();

  return (extraMeta: PerfMeta = {}) => {
    logPerformance(operation, {
      ...meta,
      ...extraMeta,
      durationMs: Date.now() - startedAt
    });
  };
}
