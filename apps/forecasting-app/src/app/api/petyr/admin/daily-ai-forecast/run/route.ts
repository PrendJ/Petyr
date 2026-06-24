import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { runPetyrNightlyDeterministicAiForecast } from "@/services/petyrNightlyDeterministicAiForecastService";

export const dynamic = "force-dynamic";

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function formatRunError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist") || error.message.includes("missing")) {
    return "Petyr forecast tables are missing. Apply the forecasting app Prisma schema and confirm Redash materialized data before running Daily AI Forecast.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Petyr Daily AI Forecast operations."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({})) as { mode?: unknown; confirmed?: unknown };

    if (payload.mode !== undefined && payload.mode !== "all_active") {
      return NextResponse.json({ error: "Only all_active Daily AI Forecast runs are supported." }, { status: 400 });
    }

    if (payload.confirmed !== true) {
      return NextResponse.json({ error: "Daily AI Forecast run requires explicit confirmation." }, { status: 400 });
    }

    const result = await runPetyrNightlyDeterministicAiForecast();

    return NextResponse.json(
      {
        ...result,
        mode: "all_active",
        source: "petyr-admin-manual-run"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to run Petyr Daily AI Forecast",
        detail: formatRunError(error)
      },
      { status: 500 }
    );
  }
}
