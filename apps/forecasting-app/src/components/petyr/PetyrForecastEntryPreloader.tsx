"use client";

import { useEffect } from "react";

function runWhenIdle(callback: () => void) {
  return setTimeout(callback, 500);
}

function buildWarmupUrl(path: string, csmName: string) {
  const params = new URLSearchParams({
    csmName,
    warmup: "1"
  });

  return `${path}?${params.toString()}`;
}

export function PetyrForecastEntryPreloader({
  csmName,
  enabled
}: {
  csmName: string | null;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled || !csmName) return;

    const controller = new AbortController();
    const handle = runWhenIdle(() => {
      void (async () => {
        const startedAt = performance.now();

        try {
          await fetch(buildWarmupUrl("/api/petyr/forecast-entry/batch", csmName), {
            cache: "no-store",
            signal: controller.signal
          });
          await fetch(buildWarmupUrl("/api/petyr/forecast-entry/annual-batch", csmName), {
            cache: "no-store",
            signal: controller.signal
          });

          console.info("Petyr Forecast Entry warmup complete", {
            durationMs: Math.round(performance.now() - startedAt)
          });
        } catch {
          // Warmup is best-effort and must never affect the visible workspace.
        }
      })();
    });

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [csmName, enabled]);

  return null;
}
