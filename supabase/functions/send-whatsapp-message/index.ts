/**
 * Edge `send-whatsapp-message` — envia mensagem de TEXTO ao lead e persiste em
 * `messages`, escolhendo o canal pelo estado da janela de 24h.
 *
 * Roteamento (Seção 4 do plano-mestre):
 *  - Dentro da janela de 24h (lead respondeu há <24h)  → WAHA (não-oficial).
 *  - Fora da janela / 1º contato                        → Meta Cloud API + template.
 *    Nesta fase (1), o branch oficial está implementado mas DESLIGADO: retorna
 *    { ok:false, reason:'cloud_api_fase2' }. Ligar provisionando a conta Meta
 *    e os templates na Fase 2.
 *
 * Chamada internamente pelo worker `dispatch-ai-queue` (service-role). Também
 * aceita JWT de usuário (envio manual a partir do painel, uso futuro).
 *
 * Contrato:
 *   POST {
 *     conversation_id: string,   // conversa alvo (define org, telefone, canal)
 *     text: string,              // conteúdo a enviar
 *     sender_type?: 'ai' | 'broker' | 'system',   // default 'ai'
 *     sender_id?: string,        // usuário/corretor que enviou (quando aplicável)
 *   }
 *
 * A janela de 24h vem de `conversations.last_inbound_at` (mantido pelos triggers
 * da Fase 0). O destino (telefone/chatId) vem de `conversations.contact_phone_e164`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { wahaSendText } from "../_shared/waha.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const WINDOW_HOURS = 24;

interface SendBody {
  conversation_id: string;
  text: string;
  sender_type?: "ai" | "broker" | "system";
  sender_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const INTERNAL_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";

    // Auth: dois modos (padrão consistente com ia-respond-to-lead/compose-playbook).
    //  (a) Interno/M2M — header `x-internal-token` == INTERNAL_FUNCTION_TOKEN (worker).
    //  (b) Usuário — JWT no Authorization (envio manual pelo painel, uso futuro).
    const internalToken = req.headers.get("x-internal-token") ?? "";
    const isInternal = INTERNAL_TOKEN !== "" && internalToken === INTERNAL_TOKEN;

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!bearer) return json({ error: "sem_autorizacao" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u, error: uErr } = await userClient.auth.getUser();
      if (uErr || !u.user) return json({ error: "token_invalido" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as SendBody;
    if (!body.conversation_id) return json({ error: "conversation_id_obrigatorio" }, 400);
    if (!body.text?.trim()) return json({ error: "text_obrigatorio" }, 400);

    // 1) Carrega a conversa (org, telefone, janela)
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, organization_id, contact_phone_e164, last_inbound_at, provider")
      .eq("id", body.conversation_id)
      .maybeSingle();
    if (convErr || !conv) {
      console.error("[send-whatsapp-message] conversa não encontrada", convErr);
      return json({ ok: false, reason: "conversa_nao_encontrada" }, 200);
    }
    if (!conv.contact_phone_e164) {
      return json({ ok: false, reason: "sem_telefone_destino" }, 200);
    }

    // 2) Decide o canal pela janela de 24h
    const lastInboundTs = conv.last_inbound_at
      ? new Date(conv.last_inbound_at).getTime()
      : 0;
    const hoursSince = lastInboundTs ? (Date.now() - lastInboundTs) / 36e5 : Infinity;
    const dentroDaJanela = hoursSince <= WINDOW_HOURS;

    if (!dentroDaJanela) {
      // FORA DA JANELA → canal oficial (Meta Cloud API + template).
      // Estrutura pronta, desligada na Fase 1. Ligar na Fase 2.
      console.log("[send-whatsapp-message] fora da janela 24h — cloud_api adiado p/ Fase 2", {
        conversation_id: conv.id,
        hoursSince: Number.isFinite(hoursSince) ? Math.round(hoursSince) : "sem_inbound",
      });
      return json({
        ok: false,
        reason: "cloud_api_fase2",
        message:
          "Fora da janela de 24h: exige Meta Cloud API + template aprovado (Fase 2). Não enviado por WAHA.",
      }, 200);
    }

    // 3) DENTRO DA JANELA → WAHA (não-oficial)
    const senderType = body.sender_type ?? "ai";
    const result = await wahaSendText({
      chatId: conv.contact_phone_e164,
      text: body.text,
    });

    // 4) Persiste o outbound em messages (trigger atualiza last_outbound_at)
    const msgRow = {
      organization_id: conv.organization_id,
      conversation_id: conv.id,
      direction: "outbound" as const,
      sender_type: senderType,
      sender_id: body.sender_id ?? null,
      content_type: "text" as const,
      content: body.text,
      external_id: result.externalId ?? null,
      channel_route: "waha" as const,
      status: result.ok ? ("sent" as const) : ("failed" as const),
      error_message: result.ok ? null : (result.error ?? "falha_waha"),
    };
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert([msgRow])
      .select("id")
      .single();
    if (insErr) {
      console.error("[send-whatsapp-message] erro ao persistir message:", insErr);
    }

    if (!result.ok) {
      return json({
        ok: false,
        reason: "waha_send_failed",
        error: result.error,
        messageId: inserted?.id ?? null,
      }, 200);
    }

    return json({
      ok: true,
      channel: "waha",
      externalId: result.externalId ?? null,
      messageId: inserted?.id ?? null,
    });
  } catch (e) {
    console.error("[send-whatsapp-message] uncaught:", e);
    return json({ error: e instanceof Error ? e.message : "erro_interno" }, 500);
  }
});
