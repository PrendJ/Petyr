import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getPetyrApprovedRenderingDataForView,
  type PetyrApprovedRenderingView
} from "@/services/petyrApprovedRenderingAdapter";

export const dynamic = "force-dynamic";

function parseView(value: string | null): PetyrApprovedRenderingView {
  if (value === "management" || value === "csm" || value === "all") return value;
  return "all";
}

function parseYear(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const data = await getPetyrApprovedRenderingDataForView(
    parseView(searchParams.get("view")),
    parseYear(searchParams.get("year"))
  );
  return NextResponse.json(data);
}
