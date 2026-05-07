import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DEFAULT_API_URL =
  "https://profilex-api.neokred.tech/core-svc/api/v2/exp/validation-service/aadhaar-kyc";
const DEFAULT_SERVICE_ID = "db29f416-69be-4830-a14b-194533f6e312";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: { sessionId?: string; otp?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const sessionId = String(body?.sessionId ?? "").trim();
  const otp = String(body?.otp ?? "").replace(/\D/g, "");
  if (!sessionId) {
    return json(400, { error: "sessionId is required" });
  }
  if (!/^\d{6}$/.test(otp)) {
    return json(400, { error: "otp must be 6 digits" });
  }

  const clientUserId = Deno.env.get("NEOKRED_CLIENT_USER_ID") ?? "";
  const secretKey = Deno.env.get("NEOKRED_SECRET_KEY") ?? "";
  const accessKey = Deno.env.get("NEOKRED_ACCESS_KEY") ?? "";
  const serviceId = Deno.env.get("NEOKRED_AADHAAR_VERIFY_SERVICE_ID") ?? DEFAULT_SERVICE_ID;
  const endpoint = Deno.env.get("NEOKRED_AADHAAR_VERIFY_URL") ?? DEFAULT_API_URL;

  if (!clientUserId || !secretKey || !accessKey) {
    return json(500, {
      error:
        "Missing required Neokred credentials. Set NEOKRED_CLIENT_USER_ID, NEOKRED_SECRET_KEY, NEOKRED_ACCESS_KEY.",
    });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "client-user-id": clientUserId,
        "secret-key": secretKey,
        "access-key": accessKey,
        "service-id": serviceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, otp }),
    });
  } catch {
    return json(502, { error: "Failed to reach Aadhaar verify provider" });
  }

  const rawText = await upstreamResponse.text();
  let upstreamBody: Record<string, unknown> | null = null;
  try {
    upstreamBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    upstreamBody = null;
  }

  if (!upstreamResponse.ok) {
    const message =
      (upstreamBody?.message as string | undefined) ||
      `Provider request failed (${upstreamResponse.status})`;
    return json(502, { error: message, upstream: upstreamBody ?? rawText });
  }

  const data = (upstreamBody?.data as Record<string, unknown> | undefined) ?? {};
  return json(200, {
    ok: true,
    transactionId: String(upstreamBody?.transactionId ?? "").trim() || null,
    data,
  });
});
