/**
 * Edge function `approve-ai-response`.
 *
 * Corretor/admin aprova, edita ou rejeita um item de `ai_response_queue` com status
 * `awaiting_approval`. Se aprovado, marca como 'approved' (dispatcher envia depois).
 *
 * Body: { queue_id: string, action: 'approve' | 'edit_and_approve' | 'reject',
 *         edited_text?: string, reject_reason?: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "auth_required" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userResp, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userResp?.user) return json(401, { error: "auth_invalid" });
    const userId = userResp.user.id;

    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "json_invalido" }); }
    const { queue_id, action, edited_text, reject_reason } = body ?? {};
    if (!queue_id || typeof queue_id !== "string") return json(400, { error: "queue_id_obrigatorio" });
    if (!["approve", "edit_and_approve", "reject"].includes(action)) return json(400, { error: "acao_invalida" });
    if (action === "edit_and_approve" && !edited_text?.trim()) return json(400, { error: "edited_text_obrigatorio" });

    // RLS já protege: corretor só vê itens dos próprios deals; admin vê tudo da org
    const { data: item, error: itemErr } = await supabase
      .from("ai_response_queue")
      .select("id, status, suggested_response")
      .eq("id", queue_id)
      .maybeSingle();
    if (itemErr || !item) return json(404, { error: "item_nao_encontrado" });
    if (item.status !== "awaiting_approval") return json(409, { error: "status_invalido", currentStatus: item.status });

    if (action === "reject") {
      const { error } = await supabase.from("ai_response_queue").update({
        status: "rejected",
        rejected_reason: reject_reason ?? "rejeitado pelo corretor",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).eq("id", queue_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, status: "rejected" });
    }

    const finalText = action === "edit_and_approve" ? edited_text.trim() : (item.suggested_response ?? "").trim();
    if (!finalText) return json(400, { error: "sem_texto_para_aprovar" });

    const { error } = await supabase.from("ai_response_queue").update({
      status: "approved",
      final_response: finalText,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", queue_id);
    if (error) return json(500, { error: error.message });

    return json(200, { ok: true, status: "approved" });
  } catch (e) {
    console.error("[approve-ai-response] unhandled:", e);
    return json(500, { error: e instanceof Error ? e.message : "erro_desconhecido" });
  }
});
