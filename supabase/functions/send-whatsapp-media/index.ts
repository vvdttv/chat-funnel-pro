/**
 * Edge `send-whatsapp-media` — envia mídia (imagem/documento/áudio) via
 * WhatsApp Cloud API.
 *
 * Capacidades:
 *  - Geração de imagem na hora via Gateway (`google/gemini-2.5-flash-image`)
 *    a partir de um `prompt`.
 *  - Upload no bucket público `whatsapp-media-public` (organização isolada
 *    em pasta {organization_id}/...).
 *  - Envio via WhatsApp Cloud API v23.0+ usando `image.link` ou `document.link`.
 *  - Verificação de janela 24h: se o último contato do lead foi há >24h,
 *    bloqueia envio livre (Meta exige template aprovado fora da janela).
 *
 * Sem secrets do WhatsApp configurados (PHONE_NUMBER_ID, ACCESS_TOKEN,
 * API_VERSION), retorna 200 com `{ ok: false, reason: 'capacidade_nao_configurada' }`
 * — nunca quebra a UX. Admin configura quando quiser ativar.
 *
 * Contrato:
 *   POST {
 *     leadPhone: string,
 *     dealId?: string,
 *     type: 'image' | 'document' | 'audio',
 *     link?: string,        // URL pública existente
 *     prompt?: string,      // gera imagem na hora
 *     caption?: string,
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAIGatewayConfig } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface SendBody {
  leadPhone: string;
  dealId?: string;
  type: "image" | "document" | "audio";
  link?: string;
  prompt?: string;
  caption?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sem autorização" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return json({ error: "Token inválido" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile } = await admin
      .from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    if (!profile?.organization_id) return json({ error: "Sem organização" }, 403);
    const orgId = profile.organization_id as string;

    const body = await req.json() as SendBody;
    if (!body.leadPhone) return json({ error: "leadPhone obrigatório" }, 400);
    if (!body.link && !body.prompt) {
      return json({ error: "Informe link OU prompt (para gerar imagem)" }, 400);
    }

    // 1) Verificar secrets do WhatsApp
    const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v23.0";

    if (!PHONE_ID || !TOKEN) {
      return json({
        ok: false,
        reason: "capacidade_nao_configurada",
        message: "Envio de mídia via WhatsApp ainda não foi configurado. Peça ao admin para conectar a API do WhatsApp.",
      }, 200);
    }

    // 2) Janela de 24h: olhar última atividade do lead com este telefone
    if (body.dealId) {
      const { data: lastIn } = await admin
        .from("deal_activities")
        .select("done_at")
        .eq("deal_id", body.dealId)
        .order("done_at", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      const lastTs = lastIn?.done_at ? new Date(lastIn.done_at).getTime() : 0;
      const hoursSince = lastTs ? (Date.now() - lastTs) / 36e5 : 999;
      if (hoursSince > 24) {
        return json({
          ok: false,
          reason: "fora_da_janela_24h",
          message: "O lead não responde há mais de 24h. Para envio fora da janela, é preciso usar um template aprovado pela Meta.",
        }, 200);
      }
    }

    // 3) Resolver link da mídia (gerar imagem se prompt fornecido)
    let mediaLink = body.link;
    if (!mediaLink && body.prompt && body.type === "image") {
      const aiConfig = getAIGatewayConfig();
      if (!aiConfig.apiKey) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);
      const imgResp = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${aiConfig.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: body.prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!imgResp.ok) {
        const t = await imgResp.text();
        console.error("[send-whatsapp-media] image gen error", imgResp.status, t);
        return json({ error: "Falha ao gerar imagem" }, 502);
      }
      const imgData = await imgResp.json();
      const imgUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imgUrl || !imgUrl.startsWith("data:")) {
        return json({ error: "Modelo não retornou imagem" }, 502);
      }
      // base64 → buffer → upload
      const [meta, b64] = imgUrl.split(",");
      const mime = meta.match(/data:([^;]+);/)?.[1] ?? "image/png";
      const ext = mime.split("/")[1] ?? "png";
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("whatsapp-media-public")
        .upload(path, bin, { contentType: mime, upsert: false });
      if (upErr) {
        console.error("[send-whatsapp-media] upload error", upErr);
        return json({ error: "Falha ao subir mídia" }, 500);
      }
      const { data: pub } = admin.storage.from("whatsapp-media-public").getPublicUrl(path);
      mediaLink = pub.publicUrl;
    }

    if (!mediaLink) return json({ error: "Sem link de mídia disponível" }, 400);

    // 4) Enviar via WhatsApp Cloud API
    const wpUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;
    const wpPayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: body.leadPhone.replace(/\D/g, ""),
      type: body.type,
    };
    wpPayload[body.type] = body.caption
      ? { link: mediaLink, caption: body.caption }
      : { link: mediaLink };

    const wpResp = await fetch(wpUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(wpPayload),
    });
    const wpJson = await wpResp.json();
    if (!wpResp.ok) {
      console.error("[send-whatsapp-media] WA error", wpResp.status, wpJson);
      return json({ ok: false, reason: "whatsapp_error", message: wpJson?.error?.message ?? "Falha no WhatsApp", details: wpJson }, 200);
    }
    return json({ ok: true, mediaLink, whatsappResponse: wpJson });
  } catch (e) {
    console.error("[send-whatsapp-media] uncaught", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
