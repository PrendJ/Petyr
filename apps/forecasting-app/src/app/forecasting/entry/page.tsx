import ForecastEntryMonthlyBatchWorkspace from "@/components/petyr/ForecastEntryMonthlyBatchWorkspace";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryBatch } from "@/services/forecastEntryBatchService";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastEntryPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getForecastEntryQuery(searchParams: SearchParams) {
  return {
    csmName: firstParam(searchParams.csmName)?.trim() ?? ""
  };
}

export default async function ForecastEntryPage({ searchParams }: ForecastEntryPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialBatch = await getForecastEntryBatch({
    ...getForecastEntryQuery(resolvedSearchParams),
    preferredCsmName: identity.user.displayName
  });

  return <ForecastEntryMonthlyBatchWorkspace initialBatch={initialBatch} />;
}
