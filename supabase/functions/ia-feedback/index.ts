/**
 * Edge `ia-feedback` — Modo Treinador (Fase I-B).
 *
 * Motor ÚNICO dos dois canais (painel + WhatsApp). Recebe feedback em linguagem
 * natural sobre o comportamento da IA numa ETAPA e:
 *   - action='interpret' → usa a IA p/ interpretar o feedback e propor um ajuste
 *     estruturado (payload de override). NÃO grava. Devolve a interpretação.
 *   - action='apply'     → grava o override (apply_feedback_override_internal) no
 *     escopo da etapa + registra ia_feedback_events. A próxima resposta já aplica.
 *
 * Confirmação ANTES de gravar (decisão do cliente): interpret → (admin confirma)
 * → apply. compose-playbook lê o override (layer stage_override).
 *
 * Auth: x-internal-token (M2M, webhook) OU JWT de admin (painel).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChatCompletion, getAIGatewayConfig } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Body {
  action: "interpret" | "apply";
  feedback_text: string;
  funnel_id: string;
  stage_id: string;
  deal_id?: string;
  source_decision_log_id?: string;
  channel?: "painel" | "whatsapp";
  user_id?: string;
  organization_id?: string;
  payload?: Record<string, unknown>;
  interpreted_summary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const INTERNAL_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";

    const internalToken = req.headers.get("x-internal-token") ?? "";
    const isInternal = INTERNAL_TOKEN !== "" && internalToken === INTERNAL_TOKEN;

    const body = (await req.json()) as Body;
    if (!body.feedback_text?.trim()) return json(400, { error: "feedback_text_obrigatorio" });
    if (!body.funnel_id || !body.stage_id) return json(400, { error: "funnel_stage_obrigatorio" });

    let organizationId = body.organization_id ?? null;
    let userId = body.user_id ?? null;

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json(401, { error: "sem_autorizacao" });
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: u, error: uErr } = await userClient.auth.getUser();
      if (uErr || !u.user) return json(401, { error: "token_invalido" });
      userId = u.user.id;
      const { data: prof } = await userClient.from("profiles").select("organization_id").eq("id", u.user.id).maybeSingle();
      organizationId = (prof as { organization_id?: string } | null)?.organization_id ?? null;
    }
    if (!organizationId) return json(400, { error: "organizacao_indefinida" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const aiConfig = getAIGatewayConfig();

    // ---- APPLY: grava o override já interpretado ----
    if (body.action === "apply") {
      if (!body.payload || Object.keys(body.payload).length === 0) {
        return json(400, { error: "payload_vazio (interprete antes)" });
      }
      const { data, error } = await admin.rpc("apply_feedback_override_internal", {
        p_org: organizationId,
        p_funnel_id: body.funnel_id,
        p_stage_id: body.stage_id,
        p_payload: body.payload,
        p_feedback_text: body.feedback_text,
        p_interpreted_summary: body.interpreted_summary ?? null,
        p_channel: body.channel ?? "painel",
        p_user_id: userId,
        p_deal_id: body.deal_id ?? null,
        p_source_log: body.source_decision_log_id ?? null,
      });
      if (error) return json(200, { ok: false, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(200, { ok: true, applied: true, override_id: row?.override_id, event_id: row?.event_id });
    }

    // ---- INTERPRET: IA traduz o feedback num ajuste estruturado ----
    let priorPrompt = "";
    if (body.source_decision_log_id) {
      const { data: log } = await admin.from("ia_decision_logs")
        .select("context").eq("id", body.source_decision_log_id).maybeSingle();
      priorPrompt = ((log as { context?: { system_prompt_used?: string } } | null)?.context?.system_prompt_used ?? "").slice(0, 4000);
    }

    const sysPrompt = "Você ajusta o comportamento de uma IA de vendas imobiliária a partir do feedback de um gestor humano. "
      + "Traduza o feedback num AJUSTE ESTRUTURADO de playbook para a etapa atual. Campos possíveis (use só os relevantes): "
      + "identity (objeto com persona/tone/mission), goal (string), successCriteria (array), failureCriteria (array). "
      + "Seja fiel ao feedback, conservador e específico."
      + (priorPrompt ? ("\n\nPrompt atual da etapa (contexto):\n" + priorPrompt) : "");

    const resp = await aiChatCompletion({
      config: aiConfig,
      tier: "smart",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: 'Feedback do gestor: "' + body.feedback_text + '"\n\nProduza o ajuste e um resumo em 1 frase do que será mudado.' },
      ],
      tools: [{
        type: "function",
        function: {
          name: "propose_override",
          description: "Propõe o ajuste estruturado de comportamento para a etapa",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "resumo em 1 frase do que será mudado" },
              payload: {
                type: "object",
                description: "ajuste do playbook (só campos relevantes)",
                properties: {
                  goal: { type: "string" },
                  successCriteria: { type: "array", items: { type: "string" } },
                  failureCriteria: { type: "array", items: { type: "string" } },
                  identity: {
                    type: "object",
                    properties: { persona: { type: "string" }, tone: { type: "string" }, mission: { type: "string" } },
                  },
                },
                additionalProperties: false,
              },
            },
            required: ["summary", "payload"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "propose_override" } },
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("[ia-feedback] interpret failed:", t);
      return json(200, { ok: false, error: "interpretacao_falhou" });
    }
    const j = await resp.json();
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.arguments) return json(200, { ok: false, error: "sem_interpretacao" });
    const args = JSON.parse(tc.function.arguments);
    return json(200, {
      ok: true,
      interpreted: true,
      summary: args.summary ?? "",
      payload: args.payload ?? {},
      funnel_id: body.funnel_id,
      stage_id: body.stage_id,
    });
  } catch (e) {
    console.error("[ia-feedback] uncaught:", e);
    return json(500, { error: e instanceof Error ? e.message : "erro_interno" });
  }
});
