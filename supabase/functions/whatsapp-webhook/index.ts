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
import { resolveWahaContact } from "../_shared/waha.ts";

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
  externalId?: string;
  contentType?: string;
  // Número/sessão RECEPTOR (para casar persona/whatsapp_number — Fase 2A).
  toNumber?: string;
  session?: string;
  raw: unknown;
}

const detectProvider = (req: Request, payload: any): string => {
  const hdr = req.headers.get("x-wa-provider")?.toLowerCase();
  if (hdr) return hdr;
  if (payload?.object === "whatsapp_business_account") return "cloud_api";
  // WAHA: { event: 'message', payload: { from, body, ... }, session }
  if (payload?.event === "message" && payload?.payload?.from !== undefined) return "waha";
  if (payload?.event && payload?.instance) return "evolution";
  if (payload?.MessageSid && payload?.From?.startsWith("whatsapp:")) return "twilio";
  if (payload?.messages?.[0]?.fromMe !== undefined) return "z_api";
  return "unknown";
};

const normalize = (provider: string, payload: any): NormalizedMessage | null => {
  try {
    if (provider === "waha") {
      // Formato WAHA (engine WEBJS): { event:'message', session, payload:{ from, to, body, fromMe, id, _data } }
      const p = payload?.payload ?? payload;
      if (p?.fromMe === true) return null; // ignora o que nós mesmos enviamos
      const from = p?.from ?? "";
      const data = p?._data ?? {};
      return {
        provider,
        externalContactId: from, // pode ser <id>@lid ou <num>@c.us — resolvido depois
        phoneE164: !String(from).includes("@lid")
          ? `+${String(from).split("@")[0].replace(/\D/g, "")}`
          : undefined,
        displayName: data?.notifyName ?? p?.notifyName,
        text: p?.body ?? "",
        receivedAt: new Date((p?.timestamp ? Number(p.timestamp) * 1000 : Date.now())).toISOString(),
        externalId: p?.id ?? data?.id?._serialized ?? data?.id?.id,
        contentType: p?.hasMedia ? "image" : "text",
        toNumber: p?.to ? String(p.to).split("@")[0].replace(/\D/g, "") : undefined,
        session: payload?.session ?? p?.session,
        raw: payload,
      };
    }
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
      const remoteDigits = remote ? String(remote).split("@")[0].replace(/\D/g, "") : "";
      return {
        provider,
        externalContactId: remote,
        phoneE164: remoteDigits ? `+${remoteDigits}` : undefined,
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
    // Token compartilhado: aceita via header `x-webhook-token` OU query `?token=`.
    // O query param permite proteger o webhook mesmo com provedores (ex.: WAHA
    // Core) que não enviam headers customizados — o token vai embutido na hook URL.
    const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
    if (expectedToken) {
      const url = new URL(req.url);
      const got = req.headers.get("x-webhook-token") ?? url.searchParams.get("token");
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

    // Resolução de LID (WhatsApp usa Linked ID opaco, não telefone, no `from`).
    // Se vier <id>@lid, resolve para o contato real via API de contatos do WAHA.
    let lookupContactId = msg.externalContactId;
    let lookupPhone = msg.phoneE164;
    if (String(msg.externalContactId).includes("@lid")) {
      const resolved = await resolveWahaContact(msg.externalContactId);
      if (resolved) {
        lookupContactId = resolved.id;          // <num>@c.us
        lookupPhone = resolved.phoneE164;        // +<num>
        msg.phoneE164 = resolved.phoneE164;
      } else {
        console.warn("[whatsapp-webhook] LID não resolvido:", msg.externalContactId);
      }
    }

    // Localiza canal (lead_channels) → deal. Casa por external_contact_id OU phone.
    // Sanitiza valores externos: PostgREST .or() interpola strings, então
    // vírgula/parênteses/aspas poderiam corromper o filtro. IDs de WhatsApp só
    // contêm [0-9a-zA-Z@._+-]; qualquer outro caractere é removido.
    const safe = (v: string) => String(v).replace(/[^0-9a-zA-Z@._+-]/g, "");
    const phoneDigits = (lookupPhone ?? "").replace(/[^0-9]/g, "");
    const orParts: string[] = [];
    for (const id of [lookupContactId, msg.externalContactId]) {
      const s = safe(id);
      if (s) orParts.push(`external_contact_id.eq.${s}`);
    }
    if (lookupPhone) orParts.push(`phone_e164.eq.${safe(lookupPhone)}`);
    if (phoneDigits) orParts.push(`phone_e164.eq.${phoneDigits}`);
    const { data: channel, error: chErr } = await admin
      .from("lead_channels")
      .select("id, organization_id, deal_id")
      .eq("channel", "whatsapp")
      .or(orParts.join(","))
      .eq("is_active", true)
      .maybeSingle();

    if (chErr) console.error("[whatsapp-webhook] channel lookup err:", chErr);

    if (!channel) {
      console.log("[whatsapp-webhook] canal não mapeado", {
        externalContactId: msg.externalContactId,
        resolved: lookupContactId,
        phoneE164: lookupPhone,
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

    // --- Resolve persona/número receptor (Fase 2A) ---
    // Casa o número que RECEBEU a mensagem (toNumber/session) com whatsapp_numbers
    // → persona. Define quem "atende" a conversa. Fallback: número default da org.
    let whatsappNumberId: string | null = null;
    let personaId: string | null = null;
    {
      const toDigits = (msg.toNumber ?? "").replace(/\D/g, "");
      const sess = String(msg.session ?? "").replace(/[^0-9a-zA-Z._-]/g, "");
      let numRow: { id: string; persona_id: string | null } | null = null;
      if (toDigits || sess) {
        const numOr: string[] = [];
        if (toDigits) {
          numOr.push(`phone_e164.eq.+${toDigits}`);
          numOr.push(`phone_e164.eq.${toDigits}`);
        }
        if (sess) numOr.push(`waha_session.eq.${sess}`);
        const { data } = await admin
          .from("whatsapp_numbers")
          .select("id, persona_id")
          .eq("organization_id", deal.organization_id)
          .eq("is_active", true)
          .or(numOr.join(","))
          .maybeSingle();
        numRow = (data as { id: string; persona_id: string | null } | null) ?? null;
      }
      if (!numRow) {
        // fallback: número default da org
        const { data } = await admin
          .from("whatsapp_numbers")
          .select("id, persona_id")
          .eq("organization_id", deal.organization_id)
          .eq("is_active", true)
          .eq("is_default", true)
          .maybeSingle();
        numRow = (data as { id: string; persona_id: string | null } | null) ?? null;
      }
      if (numRow) {
        whatsappNumberId = numRow.id;
        personaId = numRow.persona_id;
      }
    }

    // --- Persistência da conversa + mensagem inbound ---
    // Garante uma conversa (por deal). Cria se não existir; reusa a mais recente.
    let conversationId: string | null = null;
    const { data: existingConv } = await admin
      .from("conversations")
      .select("id, persona_id, whatsapp_number_id")
      .eq("deal_id", deal.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existingConv) {
      conversationId = (existingConv as { id: string }).id;
      // Backfill: se a conversa ainda não tem persona/número, grava agora.
      // Guarda `.is(col, null)` evita corrida entre entregas paralelas
      // sobrescreverem um valor já gravado por outra.
      const ex = existingConv as { persona_id: string | null; whatsapp_number_id: string | null };
      if (!ex.whatsapp_number_id && whatsappNumberId) {
        await admin.from("conversations")
          .update({ whatsapp_number_id: whatsappNumberId })
          .eq("id", conversationId)
          .is("whatsapp_number_id", null);
      }
      if (!ex.persona_id && personaId) {
        await admin.from("conversations")
          .update({ persona_id: personaId })
          .eq("id", conversationId)
          .is("persona_id", null);
      }
    } else {
      const { data: newConv, error: convErr } = await admin
        .from("conversations")
        .insert([{
          organization_id: deal.organization_id,
          deal_id: deal.id,
          lead_channel_id: channel.id,
          channel: "whatsapp",
          provider,
          contact_phone_e164: lookupPhone ?? null,
          contact_name: msg.displayName ?? null,
          whatsapp_number_id: whatsappNumberId,
          persona_id: personaId,
        }])
        .select("id")
        .single();
      if (convErr) {
        // Corrida: outra entrega criou a conversa em paralelo. Rebusca.
        console.error("[whatsapp-webhook] criar conversa err:", convErr);
        const { data: retryConv } = await admin
          .from("conversations")
          .select("id")
          .eq("deal_id", deal.id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        conversationId = (retryConv as { id: string } | null)?.id ?? null;
      } else {
        conversationId = (newConv as { id: string }).id;
      }
    }

    // Insere a mensagem inbound (dedup por external_id via índice único).
    // O trigger touch_conversation atualiza last_inbound_at (janela 24h).
    if (conversationId) {
      const { error: msgErr } = await admin
        .from("messages")
        .insert([{
          organization_id: deal.organization_id,
          conversation_id: conversationId,
          direction: "inbound",
          sender_type: "lead",
          content_type: msg.contentType ?? "text",
          content: msg.text,
          external_id: msg.externalId ?? null,
          channel_route: provider === "cloud_api" ? "cloud_api" : "waha",
          status: "received",
        }]);
      if (msgErr) {
        // 23505 = violação de unique (mensagem já recebida) → idempotente, ok
        if ((msgErr as { code?: string }).code === "23505") {
          console.log("[whatsapp-webhook] inbound duplicado ignorado", { externalId: msg.externalId });
          return json(200, { ok: true, ignored: "duplicado", externalId: msg.externalId });
        }
        console.error("[whatsapp-webhook] inserir message err:", msgErr);
      }
    }

    // Modo de autonomia real: lê da etapa do funil (default seguro suggest_only).
    let autonomyMode = "suggest_only";
    const { data: stageRow } = await admin
      .from("funnel_stages")
      .select("ai_autonomy_mode")
      .eq("funnel_id", deal.funnel_id)
      .eq("stage_id", deal.stage_id)
      .maybeSingle();
    const stageMode = (stageRow as { ai_autonomy_mode?: string } | null)?.ai_autonomy_mode;
    if (stageMode && ["autonomous", "suggest_only", "approval_first_n", "disabled"].includes(stageMode)) {
      autonomyMode = stageMode;
    }

    // Enfileira para o worker dispatch-ai-queue processar.
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
          autonomy_mode: autonomyMode,
          scheduled_send_at: new Date().toISOString(),
          context: {
            provider,
            externalContactId: msg.externalContactId,
            resolvedContactId: lookupContactId,
            phoneE164: lookupPhone,
            displayName: msg.displayName,
            receivedAt: msg.receivedAt,
            conversationId,
          },
        },
      ])
      .select("id")
      .single();

    if (qErr) {
      console.error("[whatsapp-webhook] enqueue err:", qErr);
      return json(200, { ok: false, error: "enqueue_failed" });
    }

    return json(200, { ok: true, queueId: queueRow.id, conversationId });
  } catch (e) {
    console.error("[whatsapp-webhook] unhandled:", e);
    return json(200, { ok: false, error: e instanceof Error ? e.message : "erro_desconhecido" });
  }
});
