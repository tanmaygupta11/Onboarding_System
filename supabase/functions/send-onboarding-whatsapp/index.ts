import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const D360_API_URL = "https://waba-v2.360dialog.io/messages";
const DEFAULT_TEMPLATE_NAME = "onboarding_form";
const DEFAULT_TEMPLATE_LANGUAGE = "en";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (raw == null) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = String(Deno.env.get("D360_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Missing D360_API_KEY secret." });
  }

  const templateName = String(Deno.env.get("D360_TEMPLATE_NAME") ?? "").trim() || DEFAULT_TEMPLATE_NAME;
  const templateLanguage = String(Deno.env.get("D360_TEMPLATE_LANGUAGE") ?? "").trim() || DEFAULT_TEMPLATE_LANGUAGE;
  const templateNamespace = String(Deno.env.get("D360_TEMPLATE_NAMESPACE") ?? "").trim();
  const messageActivitySharing = parseBoolean(Deno.env.get("D360_MESSAGE_ACTIVITY_SHARING"), true);
  const buttonIndex = String(Deno.env.get("D360_TEMPLATE_URL_BUTTON_INDEX") ?? "0").trim() || "0";

  let body: { recipients?: Array<Record<string, unknown>> } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (recipients.length === 0) {
    return json(400, { error: "recipients required (non-empty array)." });
  }

  const validRecipients = recipients
    .map((raw) => ({
      employee_id: String(raw?.employee_id ?? "").trim(),
      to: String(raw?.to ?? "").trim(),
      name: String(raw?.name ?? "").trim(),
      empid: String(raw?.empid ?? "").trim(),
    }))
    .filter((r) => r.employee_id && r.to && r.empid);

  if (validRecipients.length === 0) {
    return json(400, { error: "No valid recipients to send." });
  }

  const sent: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  await Promise.all(
    validRecipients.map(async (recipient) => {
      const template: Record<string, unknown> = {
        name: templateName,
        language: {
          policy: "deterministic",
          code: templateLanguage,
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                parameter_name: "name",
                text: recipient.name || "Employee",
              },
              {
                type: "text",
                parameter_name: "empid",
                text: recipient.empid,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: buttonIndex,
            parameters: [
              {
                type: "text",
                text: recipient.empid,
              },
            ],
          },
        ],
      };
      if (templateNamespace) {
        template.namespace = templateNamespace;
      }

      try {
        const resp = await fetch(D360_API_URL, {
          method: "POST",
          headers: {
            "D360-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient.to,
            type: "template",
            template,
            message_activity_sharing: messageActivitySharing,
          }),
        });

        const raw = await resp.text();
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }

        if (!resp.ok) {
          const upstreamErr = parsed?.error as Record<string, unknown> | undefined;
          failed.push({
            employee_id: recipient.employee_id,
            to: recipient.to,
            error: String(
              upstreamErr?.message ??
                upstreamErr?.["error_data"] ??
                parsed?.message ??
                `360dialog request failed (${resp.status})`,
            ),
          });
          return;
        }

        const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
        const firstMessage = (messages[0] as Record<string, unknown> | undefined) ?? null;
        sent.push({
          employee_id: recipient.employee_id,
          to: recipient.to,
          provider_id: firstMessage?.id ?? null,
        });
      } catch (err) {
        failed.push({
          employee_id: recipient.employee_id,
          to: recipient.to,
          error: String((err as Error)?.message ?? "WhatsApp send failed"),
        });
      }
    }),
  );

  return json(200, {
    ok: true,
    sent,
    failed,
  });
});
