import PetyrMVPRendering from "@/components/petyr/PetyrMVPRendering";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import { getPetyrApprovedRenderingData } from "@/services/petyrApprovedRenderingAdapter";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastingPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseForecastingView(value: string | undefined): "management" | "csm" {
  return value === "csm" ? "csm" : "management";
}

export default async function ForecastingPage({ searchParams }: ForecastingPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.read);
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeView = parseForecastingView(firstParam(resolvedSearchParams.view)?.trim());
  const renderingData = await getPetyrApprovedRenderingData();
  const preferredCsmName = resolvePreferredCsmName(
    identity.user.displayName,
    renderingData.csmCustomersBase.map((company) => company.csm)
  );
  const canViewAdminTools = hasPetyrPermission(identity, PETYR_PERMISSIONS.admin);
  const canManageObjectives = hasPetyrPermission(identity, PETYR_PERMISSIONS.managementWrite);

  return (
    <PetyrMVPRendering
      data={renderingData}
      activeView={activeView}
      preferredCsmName={preferredCsmName}
      canViewAdminTools={canViewAdminTools}
      canManageObjectives={canManageObjectives}
    />
  );
}
