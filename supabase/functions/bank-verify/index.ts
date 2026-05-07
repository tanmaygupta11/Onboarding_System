import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BANK_VERIFY_URL =
  "https://kyc-api.surepass.io/api/v1/bank-verification/pennyless";

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

  let body: { id_number?: string; ifsc?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const idNumber = String(body?.id_number ?? "").replace(/\D/g, "");
  const ifsc = String(body?.ifsc ?? "")
    .replace(/\s/g, "")
    .toUpperCase();

  if (!/^\d{6,18}$/.test(idNumber)) {
    return json(400, { error: "id_number must be 6-18 digits" });
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return json(400, { error: "ifsc is invalid" });
  }

  const token = Deno.env.get("SUREPASS_BANK_VERIFY_TOKEN") ?? "";
  if (!token) {
    return json(500, {
      error: "Missing SUREPASS_BANK_VERIFY_TOKEN secret",
    });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(BANK_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        id_number: idNumber,
        ifsc,
        ifsc_details: true,
      }),
    });
  } catch {
    return json(502, { error: "Failed to reach bank verification provider" });
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
    data,
    success: Boolean(upstreamBody?.success),
    messageCode: String(upstreamBody?.message_code ?? "").trim() || null,
  });
});
