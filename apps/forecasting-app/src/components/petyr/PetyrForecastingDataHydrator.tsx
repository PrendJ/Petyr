"use client";

import { useEffect, useMemo, useState } from "react";
import PetyrMVPRendering from "@/components/petyr/PetyrMVPRendering";
import { PetyrForecastEntryPreloader } from "@/components/petyr/PetyrForecastEntryPreloader";
import { Button } from "@/components/ui/button";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import type { PetyrApprovedRenderingData } from "@/types/petyrApprovedRendering";

type ForecastingView = "management" | "csm";
type LoadState = "loading" | "ready" | "error";

type PetyrForecastingDataHydratorProps = {
  initialData: PetyrApprovedRenderingData;
  activeView: ForecastingView;
  userDisplayName: string | null;
  canViewAdminTools: boolean;
  canManageObjectives: boolean;
  canWriteForecast: boolean;
};

function preferredCsm(data: PetyrApprovedRenderingData, userDisplayName: string | null) {
  return resolvePreferredCsmName(
    userDisplayName,
    data.csmCustomersBase.map((company) => company.csm)
  );
}

function renderingDataUrl(view: ForecastingView | "all") {
  const params = new URLSearchParams({ view });
  return `/api/petyr/forecasting/rendering-data?${params.toString()}`;
}

export function PetyrForecastingDataHydrator({
  initialData,
  activeView,
  userDisplayName,
  canViewAdminTools,
  canManageObjectives,
  canWriteForecast
}: PetyrForecastingDataHydratorProps) {
  const [data, setData] = useState(initialData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let backgroundHandle: ReturnType<typeof setTimeout> | null = null;

    setLoadState("loading");

    void (async () => {
      try {
        const response = await fetch(renderingDataUrl(activeView), {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Unable to refresh Petyr forecasting data.");
        }

        const payload = (await response.json()) as PetyrApprovedRenderingData;
        setData(payload);
        setLoadState("ready");

        backgroundHandle = setTimeout(() => {
          void (async () => {
            try {
              const fullResponse = await fetch(renderingDataUrl("all"), {
                cache: "no-store",
                signal: controller.signal
              });

              if (!fullResponse.ok) return;

              const fullPayload = (await fullResponse.json()) as PetyrApprovedRenderingData;
              setData(fullPayload);
            } catch {
              // Background hydration is best-effort; the active view has already rendered.
            }
          })();
        }, 250);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error(error);
        setLoadState("error");
      }
    })();

    return () => {
      controller.abort();
      if (backgroundHandle) clearTimeout(backgroundHandle);
    };
  }, [activeView, attempt]);

  const preferredCsmName = useMemo(() => preferredCsm(data, userDisplayName), [data, userDisplayName]);
  const isLoading = loadState === "loading";
  const hasError = loadState === "error";

  return (
    <>
      <PetyrMVPRendering
        key={loadState === "ready" ? "ready:" + (preferredCsmName || "all") : "shell"}
        data={data}
        activeView={activeView}
        preferredCsmName={preferredCsmName}
        canViewAdminTools={canViewAdminTools}
        canManageObjectives={canManageObjectives}
      />
      <PetyrForecastEntryPreloader csmName={preferredCsmName} enabled={canWriteForecast} />
      {loadState !== "ready" ? (
        <div className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg shadow-slate-900/10">
          {isLoading ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" aria-hidden="true" /> : null}
          {hasError ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" /> : null}
          <span>{isLoading ? "Aggiornamento dati in corso..." : "Aggiornamento dati non riuscito."}</span>
          {hasError ? (
            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => setAttempt((value) => value + 1)}>
              Riprova
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
