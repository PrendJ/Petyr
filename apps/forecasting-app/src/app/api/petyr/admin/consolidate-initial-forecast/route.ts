import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  InitialAnnualForecastError,
  consolidateInitialAnnualForecast
} from "@/services/petyrInitialAnnualForecastService";

export const dynamic = "force-dynamic";

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function formatConsolidationError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist") || error.message.includes("forecast_annual_snapshot")) {
    return "Petyr Initial Forecast tables are missing. Apply the forecasting app Prisma schema before consolidating.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Initial Forecast consolidation."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawPayload = await request.json().catch(() => ({}));
    const payload = rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>) : {};
    const result = await consolidateInitialAnnualForecast(payload.year, {
      createdBy: payload.createdBy,
      note: payload.note,
      overrideLocked: payload.overrideLocked,
      timezone: payload.timezone
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof InitialAnnualForecastError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to consolidate Initial Forecast",
        detail: formatConsolidationError(error)
      },
      { status: 500 }
    );
  }
}
