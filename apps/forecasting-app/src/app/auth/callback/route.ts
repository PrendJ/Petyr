import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  joinAccessLayerUrl,
  PETYR_AUTH_SESSION_COOKIE,
  PETYR_AUTH_STATE_COOKIE,
  readPetyrAuthConfig,
  isValidAuthCallbackState,
  toAccessLayerIdentity,
  type AccessLayerExchangeResponse
} from "@/lib/petyr/authCore";
import { createPetyrSessionCookie } from "@/lib/petyr/auth";

export async function GET(request: Request) {
  const config = readPetyrAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(new URL("/forecasting", config.callbackUrl ?? request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(PETYR_AUTH_STATE_COOKIE)?.value;

  if (!code || !isValidAuthCallbackState(state, expectedState)) {
    cookieStore.delete(PETYR_AUTH_STATE_COOKIE);
    return NextResponse.json({ error: "Invalid Petyr auth callback state." }, { status: 400 });
  }

  cookieStore.delete(PETYR_AUTH_STATE_COOKIE);

  const response = await fetch(joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/exchange"), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      code,
      redirect_uri: config.callbackUrl
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Access Layer exchange failed." }, { status: 401 });
  }

  const exchanged = (await response.json()) as AccessLayerExchangeResponse;
  const identity = toAccessLayerIdentity(exchanged);
  cookieStore.set(PETYR_AUTH_SESSION_COOKIE, createPetyrSessionCookie(identity, config.sessionSecret ?? ""), {
    httpOnly: true,
    maxAge: 8 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return NextResponse.redirect(new URL("/forecasting", config.callbackUrl ?? request.url));
}
