/**
 * Edge function: send-push-notification
 *
 * Cria uma notificacao por usuario (tabela public.notifications) e, se houver
 * provider de push configurado (Pushover), dispara o push. Sem API key, opera
 * em modo MOCK (apenas registra no banco) — util em dev/homolog.
 *
 * Entrada (POST JSON):
 *   { user_id, type, title, body?, organization_id?, data? }
 *   type in: deal_stalled | new_lead | credit_approved | briefing_ready | system
 *
 * Saida: { ok, notification_id, push }
 *
 * Auth: gateway exige JWT valido (verify_jwt=true). Para chamadas M2M
 * (RPC/cron) envie x-internal-token == INTERNAL_FUNCTION_TOKEN.
 *
 * SEGURANCA: este endpoint cria notificacao para um user_id arbitrario usando
 * service role. Em producao restrinja a chamadas internas (x-internal-token);
 * nao exponha o endpoint a clientes nao confiaveis com apenas a anon key.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_TYPES = ["deal_stalled", "new_lead", "credit_approved", "briefing_ready", "system"];

interface PushRequest {
  user_id: string;
  type: string;
  title: string;
  body?: string;
  organization_id?: string;
  data?: Record<string, unknown>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Dispara push via Pushover. Retorna status do envio (ou mock). */
async function sendPushover(title: string, message: string): Promise<{ status: string; provider: string; id?: string }> {
  const token = Deno.env.get("PUSHOVER_API_TOKEN");
  const userKey = Deno.env.get("PUSHOVER_USER_KEY");
  if (!token || !userKey) {
    console.log(`[send-push] MOCK push: ${title} - ${message}`);
    return { status: "mock", provider: "mock", id: `mock-${Date.now()}` };
  }
  try {
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, user: userKey, title, message }),
    });
    const data = await res.json();
    if (res.ok) return { status: "sent", provider: "pushover", id: String(data.request ?? "") };
    return { status: "failed", provider: "pushover" };
  } catch (e) {
    console.error("[send-push] pushover err:", e);
    return { status: "failed", provider: "pushover" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: PushRequest;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  if (!body.user_id || !body.type || !body.title) {
    return json(400, { error: "missing_fields", required: ["user_id", "type", "title"] });
  }
  if (!VALID_TYPES.includes(body.type)) {
    return json(400, { error: "invalid_type", valid: VALID_TYPES });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Insere a notificacao (fonte da verdade) via RPC SECURITY DEFINER.
  const { data: notifId, error: rpcErr } = await admin.rpc("create_notification", {
    p_user_id: body.user_id,
    p_type: body.type,
    p_title: body.title,
    p_body: body.body ?? null,
    p_organization_id: body.organization_id ?? null,
    p_data: body.data ?? {},
  });

  if (rpcErr) {
    console.error("[send-push] create_notification err:", rpcErr);
    return json(500, { ok: false, error: "insert_failed", detail: rpcErr.message });
  }

  // Dispara push (best-effort; falha de push nao invalida a notificacao).
  const push = await sendPushover(body.title, body.body ?? body.title);

  return json(200, { ok: true, notification_id: notifId, push });
});
