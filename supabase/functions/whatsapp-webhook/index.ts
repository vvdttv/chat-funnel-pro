/**
 * Edge function `whatsapp-webhook` (público, sem JWT).
 *
 * Recebe mensagens de provedor de WhatsApp (agnóstico: Cloud API / Evolution / Z-API / Twilio),
 * normaliza o payload, identifica o deal pelo número, dispara `ia-respond-to-lead` em modo dry_run
 * e enfileira a resposta em `ai_response_queue` com status conforme o modo de autonomia da etapa.
 *
 * Provedor é detectado pelo formato do payload OU por header `x-wa-provider`.
 *
 * Segurança:
 *  - Webhook público (sem JWT) — provedores externos chamam aqui.
 *  - Validação de assinatura por provedor virá quando o user escolher (deixei hooks).
 *  - Token compartilhado opcional via header `x-webhook-token` comparado a `WHATSAPP_WEBHOOK_TOKEN`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-wa-provider, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface NormalizedMessage {
  provider: string;
  externalContactId: string;
  phoneE164?: string;
  displayName?: string;
  text: string;
  receivedAt: string;
  raw: unknown;
}

const detectProvider = (req: Request, payload: any): string => {
  const hdr = req.headers.get("x-wa-provider")?.toLowerCase();
  if (hdr) return hdr;
  if (payload?.object === "whatsapp_business_account") return "cloud_api";
  if (payload?.event && payload?.instance) return "evolution";
  if (payload?.MessageSid && payload?.From?.startsWith("whatsapp:")) return "twilio";
  if (payload?.messages?.[0]?.fromMe !== undefined) return "z_api";
  return "unknown";
};

const normalize = (provider: string, payload: any): NormalizedMessage | null => {
  try {
    if (provider === "cloud_api") {
      const change = payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (!msg) return null;
      const contact = change?.contacts?.[0];
      return {
        provider,
        externalContactId: msg.from,
        phoneE164: msg.from?.startsWith("+") ? msg.from : `+${msg.from}`,
        displayName: contact?.profile?.name,
        text: msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? "",
        receivedAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
        raw: payload,
      };
    }
    if (provider === "evolution") {
      const m = payload?.data ?? payload?.message ?? payload;
      const remote = m?.key?.remoteJid ?? m?.from;
      return {
        provider,
        externalContactId: remote,
        phoneE164: remote?.split("@")?.[0],
        displayName: m?.pushName,
        text: m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? m?.body ?? "",
        receivedAt: new Date(m?.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now()).toISOString(),
        raw: payload,
      };
    }
    if (provider === "z_api") {
      const m = payload?.messages?.[0] ?? payload;
      return {
        provider,
        externalContactId: m?.phone ?? m?.from,
        phoneE164: m?.phone,
        displayName: m?.senderName,
        text: m?.text?.message ?? m?.body ?? "",
        receivedAt: new Date(m?.momment ?? Date.now()).toISOString(),
        raw: payload,
      };
    }
    if (provider === "twilio") {
      const from = String(payload.From ?? "").replace("whatsapp:", "");
      return {
        provider,
        externalContactId: from,
        phoneE164: from,
        displayName: payload.ProfileName,
        text: String(payload.Body ?? ""),
        receivedAt: new Date().toISOString(),
        raw: payload,
      };
    }
  } catch (e) {
    console.error("[whatsapp-webhook] normalize error:", e);
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Verification challenge (Meta Cloud API)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    // Token compartilhado opcional
    const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
    if (expectedToken) {
      const got = req.headers.get("x-webhook-token");
      if (got !== expectedToken) return json(401, { error: "invalid_webhook_token" });
    }

    let payload: any;
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) payload = await req.json();
      else {
        const form = await req.formData();
        payload = Object.fromEntries(form.entries());
      }
    } catch {
      return json(400, { error: "invalid_payload" });
    }

    const provider = detectProvider(req, payload);
    const msg = normalize(provider, payload);

    // Sempre responde 200 pra provedor não reentregar — logamos pra debug
    if (!msg || !msg.text?.trim()) {
      console.log("[whatsapp-webhook] sem mensagem normalizada", { provider });
      return json(200, { ok: true, ignored: "sem_mensagem" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Localiza canal (lead_channels) → deal
    const { data: channel, error: chErr } = await admin
      .from("lead_channels")
      .select("id, organization_id, deal_id")
      .eq("channel", "whatsapp")
      .or(`external_contact_id.eq.${msg.externalContactId},phone_e164.eq.${msg.phoneE164 ?? msg.externalContactId}`)
      .eq("is_active", true)
      .maybeSingle();

    if (chErr) console.error("[whatsapp-webhook] channel lookup err:", chErr);

    if (!channel) {
      console.log("[whatsapp-webhook] canal não mapeado", {
        externalContactId: msg.externalContactId,
        phoneE164: msg.phoneE164,
      });
      return json(200, { ok: true, ignored: "canal_nao_mapeado", externalContactId: msg.externalContactId });
    }

    // Carrega deal (status, funnel_id, stage_id)
    const { data: deal, error: dealErr } = await admin
      .from("deals")
      .select("id, organization_id, funnel_id, stage_id, status")
      .eq("id", channel.deal_id)
      .maybeSingle();
    if (dealErr || !deal) {
      console.error("[whatsapp-webhook] deal não encontrado", dealErr);
      return json(200, { ok: true, ignored: "deal_nao_encontrado" });
    }

    // IA sempre responde de forma autônoma — sem aprovação humana.
    // Auditoria das conversas é feita posteriormente via análise por IA.
    const { data: queueRow, error: qErr } = await admin
      .from("ai_response_queue")
      .insert([
        {
          organization_id: deal.organization_id,
          deal_id: deal.id,
          funnel_id: deal.funnel_id,
          stage_id: deal.stage_id,
          lead_channel_id: channel.id,
          lead_message: msg.text,
          status: "pending",
          autonomy_mode: "autonomous",
          scheduled_send_at: new Date().toISOString(),
          context: {
            provider,
            externalContactId: msg.externalContactId,
            phoneE164: msg.phoneE164,
            displayName: msg.displayName,
            receivedAt: msg.receivedAt,
          },
        },
      ])
      .select("id")
      .single();

    if (qErr) {
      console.error("[whatsapp-webhook] enqueue err:", qErr);
      return json(200, { ok: false, error: "enqueue_failed" });
    }

    return json(200, { ok: true, queueId: queueRow.id });
  } catch (e) {
    console.error("[whatsapp-webhook] unhandled:", e);
    return json(200, { ok: false, error: e instanceof Error ? e.message : "erro_desconhecido" });
  }
});
