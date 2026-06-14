/**
 * Edge `dispatch-ai-queue` — worker/dispatcher da fila `ai_response_queue`.
 *
 * Disparado pelo pg_cron (a cada ~10s) via pg_net. Protegido por header
 * `x-cron-token` (vs env CRON_DISPATCH_TOKEN). Roda com service-role.
 *
 * Para cada item pending pronto (scheduled_send_at <= now):
 *   1. Reivindica um lote atômico via RPC `claim_ai_queue_batch` (marca
 *      status='processing' com FOR UPDATE SKIP LOCKED — sem corrida entre execuções).
 *   2. Monta conversation_history a partir de `messages` da conversa do deal.
 *   3. Chama `ia-respond-to-lead` em modo INTERNO (x-internal-token + organization_id).
 *   4. Roteia pelo autonomy_mode do item:
 *        - autonomous           → envia via send-whatsapp-message → status='sent'
 *        - suggest_only / approval_first_n → status='awaiting_approval' (não envia)
 *        - disabled             → status='cancelled'
 *      Handoff (sem resposta) → status='awaiting_approval'.
 *   5. Erro → attempts++, backoff (scheduled_send_at futuro), volta a 'pending';
 *      após MAX_ATTEMPTS → status='failed'.
 *
 * Nunca lança para o cron: sempre responde 200 com um resumo.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 4;
const HISTORY_LIMIT = 20;
const BACKOFF_BASE_SEC = 30;

interface QueueItem {
  id: string;
  organization_id: string;
  deal_id: string;
  funnel_id: string;
  stage_id: string;
  lead_channel_id: string | null;
  lead_message: string;
  autonomy_mode: string;
  attempts: number;
  context: Record<string, unknown> | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const CRON_TOKEN = Deno.env.get("CRON_DISPATCH_TOKEN") ?? "";
  const got = req.headers.get("x-cron-token") ?? "";
  if (!CRON_TOKEN || got !== CRON_TOKEN) {
    return json(401, { error: "invalid_cron_token" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const INTERNAL_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const summary = { claimed: 0, sent: 0, awaiting: 0, cancelled: 0, failed: 0, retried: 0, errors: [] as string[] };

  try {
    // 1) Reivindica um lote atômico (marca processing). RPC usa SKIP LOCKED.
    const { data: batch, error: claimErr } = await admin.rpc("claim_ai_queue_batch", {
      p_limit: BATCH_SIZE,
    });
    if (claimErr) {
      console.error("[dispatch-ai-queue] claim error:", claimErr);
      return json(200, { ok: false, error: "claim_failed", detail: claimErr.message });
    }
    const items = (batch ?? []) as QueueItem[];
    summary.claimed = items.length;
    if (items.length === 0) return json(200, { ok: true, ...summary });

    for (const item of items) {
      try {
        await processItem(item, { admin, SUPABASE_URL, SERVICE_ROLE, INTERNAL_TOKEN, summary });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erro_desconhecido";
        console.error("[dispatch-ai-queue] item error:", item.id, msg);
        summary.errors.push(`${item.id}: ${msg}`);
        await failOrRetry(admin, item, msg, summary);
      }
    }

    return json(200, { ok: true, ...summary });
  } catch (e) {
    console.error("[dispatch-ai-queue] unhandled:", e);
    return json(200, { ok: false, error: e instanceof Error ? e.message : "erro_desconhecido", ...summary });
  }
});

interface Ctx {
  admin: ReturnType<typeof createClient>;
  SUPABASE_URL: string;
  SERVICE_ROLE: string;
  INTERNAL_TOKEN: string;
  summary: { sent: number; awaiting: number; cancelled: number; failed: number; retried: number; errors: string[] };
}

async function processItem(item: QueueItem, ctx: Ctx) {
  const { admin, SUPABASE_URL, SERVICE_ROLE, INTERNAL_TOKEN, summary } = ctx;

  // autonomy_mode 'disabled' → cancela sem chamar a IA
  if (item.autonomy_mode === "disabled") {
    await admin.from("ai_response_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    summary.cancelled++;
    return;
  }

  // Localiza/garante a conversa do deal. Prioriza o conversationId já gravado
  // pelo whatsapp-webhook no context (evita query e janela de corrida).
  const ctxConvId = item.context?.conversationId as string | undefined;
  let conversation: { id: string; contact_phone_e164: string | null } | null = null;
  if (ctxConvId) {
    const { data } = await admin
      .from("conversations")
      .select("id, contact_phone_e164")
      .eq("id", ctxConvId)
      .maybeSingle();
    conversation = (data as { id: string; contact_phone_e164: string | null } | null) ?? null;
  }
  if (!conversation) {
    conversation = await ensureConversation(admin, item);
  }

  // Monta histórico recente a partir de messages
  let history: Array<{ role: "lead" | "ai" | "agent"; content: string }> = [];
  if (conversation?.id) {
    const { data: msgs } = await admin
      .from("messages")
      .select("direction, sender_type, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    history = ((msgs ?? []) as Array<{ direction: string; sender_type: string; content: string | null }>)
      .reverse()
      .filter((m) => m.content)
      .map((m) => ({
        role: m.direction === "inbound" ? "lead" : (m.sender_type === "broker" ? "agent" : "ai"),
        content: m.content as string,
      }));
  }

  // Carrega status do deal (open/won/lost) para o playbook
  const { data: deal } = await admin
    .from("deals").select("status").eq("id", item.deal_id).maybeSingle();
  const dealStatus = ((deal as { status?: string } | null)?.status ?? "open") as "open" | "won" | "lost";

  // 3) Chama ia-respond-to-lead em modo interno
  const iaResp = await fetch(`${SUPABASE_URL}/functions/v1/ia-respond-to-lead`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      deal_id: item.deal_id,
      funnel_id: item.funnel_id,
      stage_id: item.stage_id,
      deal_status: dealStatus,
      lead_message: item.lead_message,
      conversation_history: history,
      organization_id: item.organization_id,
    }),
  });

  if (!iaResp.ok) {
    const t = await iaResp.text();
    throw new Error(`ia_respond_${iaResp.status}: ${t.slice(0, 200)}`);
  }
  const ia = await iaResp.json();
  const suggested: string | null = ia.response ?? null;
  const handoffTriggered: boolean = ia.handoff?.triggered === true;
  const iaLogId: string | null = ia.logId ?? null;

  const baseUpdate: Record<string, unknown> = {
    suggested_response: suggested,
    ia_decision_log_id: iaLogId,
    updated_at: new Date().toISOString(),
  };

  // Handoff ou sem resposta → requer humano (não envia)
  if (handoffTriggered || !suggested?.trim()) {
    await admin.from("ai_response_queue")
      .update({ ...baseUpdate, status: "awaiting_approval" })
      .eq("id", item.id);
    summary.awaiting++;
    return;
  }

  // 4) Roteia por autonomy_mode
  if (item.autonomy_mode === "autonomous") {
    if (!conversation?.id) {
      // sem conversa não há como enviar/persistir o outbound corretamente
      await admin.from("ai_response_queue")
        .update({ ...baseUpdate, status: "awaiting_approval" })
        .eq("id", item.id);
      summary.awaiting++;
      return;
    }
    const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        conversation_id: conversation.id,
        text: suggested,
        sender_type: "ai",
      }),
    });
    const sendJson = await sendResp.json().catch(() => ({}));
    if (sendResp.ok && sendJson?.ok) {
      await admin.from("ai_response_queue")
        .update({ ...baseUpdate, final_response: suggested, status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);
      summary.sent++;
    } else {
      // envio falhou (ex.: fora da janela 24h → cloud_api_fase2) → aguarda humano
      const reason = sendJson?.reason ?? `send_${sendResp.status}`;
      await admin.from("ai_response_queue")
        .update({ ...baseUpdate, status: "awaiting_approval", failure_reason: reason })
        .eq("id", item.id);
      summary.awaiting++;
    }
    return;
  }

  // suggest_only / approval_first_n → guarda sugestão, aguarda aprovação humana
  await admin.from("ai_response_queue")
    .update({ ...baseUpdate, status: "awaiting_approval" })
    .eq("id", item.id);
  summary.awaiting++;
}

/**
 * Garante uma conversa para o deal (upsert por organization_id + telefone).
 * Reusa a conversa existente; cria se for o primeiro outbound sem inbound prévio.
 */
async function ensureConversation(
  admin: ReturnType<typeof createClient>,
  item: QueueItem,
): Promise<{ id: string; contact_phone_e164: string | null } | null> {
  const ctxPhone = (item.context?.phoneE164 as string | undefined) ?? null;

  // 1) por deal_id (caminho comum)
  const { data: byDeal } = await admin
    .from("conversations")
    .select("id, contact_phone_e164")
    .eq("deal_id", item.deal_id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (byDeal) return byDeal as { id: string; contact_phone_e164: string | null };

  // 2) cria (o inbound deveria ter criado; fallback defensivo)
  const { data: created, error } = await admin
    .from("conversations")
    .insert([{
      organization_id: item.organization_id,
      deal_id: item.deal_id,
      lead_channel_id: item.lead_channel_id,
      channel: "whatsapp",
      provider: (item.context?.provider as string | undefined) ?? "waha",
      contact_phone_e164: ctxPhone,
      contact_name: (item.context?.displayName as string | undefined) ?? null,
    }])
    .select("id, contact_phone_e164")
    .single();
  if (error) {
    console.error("[dispatch-ai-queue] ensureConversation erro:", error);
    return null;
  }
  return created as { id: string; contact_phone_e164: string | null };
}

/** Incrementa attempts e reagenda com backoff; após MAX_ATTEMPTS marca failed. */
async function failOrRetry(
  admin: ReturnType<typeof createClient>,
  item: QueueItem,
  reason: string,
  summary: { failed: number; retried: number },
) {
  const attempts = (item.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await admin.from("ai_response_queue")
      .update({ status: "failed", attempts, failure_reason: reason, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    summary.failed++;
    return;
  }
  const backoffSec = BACKOFF_BASE_SEC * Math.pow(2, attempts - 1);
  const next = new Date(Date.now() + backoffSec * 1000).toISOString();
  await admin.from("ai_response_queue")
    .update({ status: "pending", attempts, failure_reason: reason, scheduled_send_at: next, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  summary.retried++;
}
