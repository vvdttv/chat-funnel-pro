/**
 * Edge function `ai-response-dispatcher` (público, idempotente).
 *
 * Disparado por cron (a cada minuto). Para cada item em `ai_response_queue` com:
 *   - status = 'pending' E scheduled_send_at <= now()
 *   - OU status = 'approved' (aprovado por humano, pronto pra enviar)
 *
 * Faz:
 *   1. Pega item, marca attempts++.
 *   2. Se ainda não tem suggested_response (status pending), chama `ia-respond-to-lead` pra gerar.
 *   3. Decide com base no autonomy_mode:
 *      - 'autonomous'        → envia direto (envio fica num placeholder até provedor estar configurado)
 *      - 'suggest_only'      → marca como 'awaiting_approval'
 *      - 'approval_first_n'  → conta envios já feitos; <= threshold vira 'awaiting_approval', acima envia
 *      - 'disabled'          → cancela (não deveria chegar aqui)
 *   4. Se já está 'approved', envia (usa final_response se houver, senão suggested_response).
 *
 * Envio: por enquanto registra como 'sent' com placeholder; quando o provedor estiver definido,
 * o envio real entra no helper `dispatchOutbound`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BATCH_SIZE = 20;

interface QueueItem {
  id: string;
  organization_id: string;
  deal_id: string;
  funnel_id: string;
  stage_id: string;
  lead_message: string;
  suggested_response: string | null;
  final_response: string | null;
  status: string;
  autonomy_mode: string;
  attempts: number;
  context: Record<string, unknown>;
}

/**
 * Placeholder para envio real ao provedor (Cloud API / Evolution / Z-API / Twilio).
 * Quando o user escolher, plugar aqui chamando uma edge dedicada por provedor.
 */
async function dispatchOutbound(_item: QueueItem, _text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const provider = String((_item.context as any)?.provider ?? "unknown");
  // Hoje não há provedor de saída configurado — registramos como enviado pro fluxo seguir.
  // Quando configurado, aqui chama send-whatsapp-text/etc.
  console.log("[ai-response-dispatcher] dispatchOutbound stub", { provider, queueId: _item.id });
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const nowIso = new Date().toISOString();

  // Pega itens pendentes prontos OU já aprovados aguardando envio
  const { data: items, error } = await admin
    .from("ai_response_queue")
    .select("*")
    .or(`and(status.eq.pending,scheduled_send_at.lte.${nowIso}),status.eq.approved`)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[dispatcher] fetch err:", error);
    return json(500, { error: error.message });
  }
  if (!items?.length) return json(200, { processed: 0 });

  const results: Array<{ id: string; outcome: string }> = [];

  for (const it of items as QueueItem[]) {
    try {
      // Incrementa tentativas cedo (idempotência ao rodar de novo)
      await admin
        .from("ai_response_queue")
        .update({ attempts: it.attempts + 1 })
        .eq("id", it.id);

      // Branch 1: já está aprovado pelo humano → enviar
      if (it.status === "approved") {
        const text = (it.final_response ?? it.suggested_response ?? "").trim();
        if (!text) {
          await admin.from("ai_response_queue")
            .update({ status: "failed", failure_reason: "sem_resposta_para_enviar" })
            .eq("id", it.id);
          results.push({ id: it.id, outcome: "failed_empty" });
          continue;
        }
        const sent = await dispatchOutbound(it, text);
        if (sent.ok) {
          await admin.from("ai_response_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", it.id);
          results.push({ id: it.id, outcome: "sent_after_approval" });
        } else {
          await admin.from("ai_response_queue")
            .update({ status: "failed", failure_reason: sent.reason })
            .eq("id", it.id);
          results.push({ id: it.id, outcome: "send_failed" });
        }
        continue;
      }

      // Branch 2: pending → gerar resposta via ia-respond-to-lead (dry_run, sem log próprio)
      const composeResp = await fetch(`${SUPABASE_URL}/functions/v1/ia-respond-to-lead`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deal_id: it.deal_id,
          funnel_id: it.funnel_id,
          stage_id: it.stage_id,
          lead_message: it.lead_message,
          dry_run: false,
        }),
      });

      if (!composeResp.ok) {
        const t = await composeResp.text();
        console.error("[dispatcher] ia-respond falhou:", t);
        await admin.from("ai_response_queue")
          .update({ failure_reason: `ia_respond_falhou:${composeResp.status}` })
          .eq("id", it.id);
        results.push({ id: it.id, outcome: "ia_failed" });
        continue;
      }
      const aj = await composeResp.json();
      const suggested: string = aj.response ?? "";
      const handoffTriggered: boolean = aj.handoff?.triggered === true;
      const decisionLogId: string | null = aj.logId ?? null;

      // Se handoff foi disparado, não envia — vira awaiting_approval pra humano
      if (handoffTriggered) {
        await admin.from("ai_response_queue")
          .update({
            status: "awaiting_approval",
            suggested_response: suggested,
            ia_decision_log_id: decisionLogId,
            failure_reason: `handoff:${aj.handoff.reason ?? ""}`,
          })
          .eq("id", it.id);
        results.push({ id: it.id, outcome: "handoff_to_human" });
        continue;
      }

      if (!suggested.trim()) {
        await admin.from("ai_response_queue")
          .update({ status: "failed", failure_reason: "ia_resposta_vazia", ia_decision_log_id: decisionLogId })
          .eq("id", it.id);
        results.push({ id: it.id, outcome: "empty_response" });
        continue;
      }

      // Decide próximo passo conforme autonomia
      const mode = it.autonomy_mode;
      const threshold = Number((it.context as any)?.approvalThreshold ?? 3);

      let nextStatus: "awaiting_approval" | "sent" = "awaiting_approval";

      if (mode === "autonomous") {
        nextStatus = "sent";
      } else if (mode === "approval_first_n") {
        const { count: sentCount } = await admin
          .from("ai_response_queue")
          .select("id", { count: "exact", head: true })
          .eq("deal_id", it.deal_id)
          .eq("status", "sent");
        nextStatus = (sentCount ?? 0) >= threshold ? "sent" : "awaiting_approval";
      } else {
        nextStatus = "awaiting_approval"; // suggest_only
      }

      if (nextStatus === "sent") {
        const sent = await dispatchOutbound(it, suggested);
        if (sent.ok) {
          await admin.from("ai_response_queue")
            .update({
              status: "sent",
              suggested_response: suggested,
              final_response: suggested,
              sent_at: new Date().toISOString(),
              ia_decision_log_id: decisionLogId,
            })
            .eq("id", it.id);
          results.push({ id: it.id, outcome: "auto_sent" });
        } else {
          await admin.from("ai_response_queue")
            .update({
              status: "awaiting_approval",
              suggested_response: suggested,
              ia_decision_log_id: decisionLogId,
              failure_reason: sent.reason,
            })
            .eq("id", it.id);
          results.push({ id: it.id, outcome: "auto_send_failed_to_approval" });
        }
      } else {
        await admin.from("ai_response_queue")
          .update({
            status: "awaiting_approval",
            suggested_response: suggested,
            ia_decision_log_id: decisionLogId,
          })
          .eq("id", it.id);
        results.push({ id: it.id, outcome: "queued_for_approval" });
      }
    } catch (e) {
      console.error("[dispatcher] item err:", it.id, e);
      await admin.from("ai_response_queue")
        .update({ failure_reason: e instanceof Error ? e.message : "erro_desconhecido" })
        .eq("id", it.id);
      results.push({ id: it.id, outcome: "error" });
    }
  }

  return json(200, { processed: results.length, results });
});
