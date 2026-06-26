import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getPetyrApprovedRenderingData } from "@/services/petyrApprovedRenderingAdapter";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const data = await getPetyrApprovedRenderingData();
  return NextResponse.json(data);
}
