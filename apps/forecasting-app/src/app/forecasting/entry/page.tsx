import ForecastEntryWorkspace from "@/components/petyr/ForecastEntryWorkspace";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryData } from "@/services/forecastEntryService";

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
    companyName: firstParam(searchParams.companyName)?.trim() ?? "",
    csmName: firstParam(searchParams.csmName)?.trim() ?? "",
    year: firstParam(searchParams.year)?.trim() ?? "",
    month: firstParam(searchParams.month)?.trim() ?? ""
  };
}

export default async function ForecastEntryPage({ searchParams }: ForecastEntryPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialEntry = await getForecastEntryData({
    ...getForecastEntryQuery(resolvedSearchParams),
    preferredCsmName: identity.user.displayName
  });
  const canViewAdminTools = hasPetyrPermission(identity, PETYR_PERMISSIONS.admin);

  return <ForecastEntryWorkspace initialEntry={initialEntry} canViewAdminTools={canViewAdminTools} />;
}
