// Sugere novos LeadBehaviors (LBs) a partir dos últimos `ia_decision_logs`
// com outcome neutro/negativo. Usa Lovable AI Gateway com tool calling para
// extrair candidatos estruturados, e filtra duplicatas vs lead_behaviors
// já existentes na org.
//
// Segurança: valida JWT, descobre organization_id via profiles, exige admin.
// Não persiste nada — devolve drafts pro admin aprovar um a um pelo painel.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChatCompletion, getAIGatewayConfig } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LBDraft {
  code: string;
  label: string;
  category: "positive" | "neutral" | "evasive" | "negative" | "objection";
  detectionHints: string[];
  defaultReaction: string;
  nextStep: string;
}

const SYSTEM_PROMPT = `Você é um analista de comportamento de leads em vendas consultivas.
A partir de logs de decisão da IA (mensagens, intents, outcomes), proponha NOVOS
"comportamentos de lead" (LB) que ainda não estão catalogados. Cada LB deve ser
acionável, específico e usável como gatilho de uma reação automatizada.

Regras:
- Code em UPPER_SNAKE prefixado por LB- (ex.: LB-OBJ-PARCELAMENTO)
- Label curto em português (≤ 5 palavras)
- Category obrigatório
- detectionHints: 3-5 frases curtas/keywords que costumam aparecer na fala do lead
- defaultReaction: 1 frase, o que a IA deve fazer ao detectar
- nextStep: 1 frase, próximo passo concreto no funil
- Proponha entre 3 e 6 LBs novos, focando padrões recorrentes nos logs.
- Não repita LBs já existentes (lista enviada).`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "suggest_lead_behaviors",
    description: "Devolve uma lista de novos comportamentos de lead a serem aprovados.",
    parameters: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "LB-EXEMPLO-AQUI" },
              label: { type: "string" },
              category: {
                type: "string",
                enum: ["positive", "neutral", "evasive", "negative", "objection"],
              },
              detectionHints: { type: "array", items: { type: "string" } },
              defaultReaction: { type: "string" },
              nextStep: { type: "string" },
            },
            required: [
              "code", "label", "category", "detectionHints",
              "defaultReaction", "nextStep",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---------- Auth ----------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp({ error: "Sem autorização" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiConfig = getAIGatewayConfig();
    if (!aiConfig.apiKey) {
      return jsonResp({ error: "LOVABLE_API_KEY não configurada" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResp({ error: "Token inválido" }, 401);
    }
    const userId = userData.user.id;

    // org + admin
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (!profile?.organization_id) {
      return jsonResp({ error: "Sem organização" }, 403);
    }
    const orgId = profile.organization_id;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) {
      return jsonResp({ error: "Apenas admins podem sugerir LBs" }, 403);
    }

    // ---------- Coleta de logs e existentes ----------
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 200, 20), 500);

    const [logsRes, existingRes] = await Promise.all([
      adminClient
        .from("ia_decision_logs")
        .select("intent,tone,action_taken,outcome,detected_behavior_codes,context")
        .eq("organization_id", orgId)
        .in("outcome", ["neutral", "negative"])
        .order("created_at", { ascending: false })
        .limit(limit),
      adminClient
        .from("lead_behaviors")
        .select("code,label,detection_hints")
        .eq("organization_id", orgId),
    ]);

    if (logsRes.error) {
      console.error("[suggest-lead-behaviors] erro logs:", logsRes.error);
      return jsonResp({ error: "Erro ao ler logs" }, 500);
    }

    const logs = logsRes.data ?? [];
    const existing = existingRes.data ?? [];

    if (logs.length < 5) {
      return jsonResp({
        suggestions: [],
        info: "Poucos logs com outcome neutro/negativo para gerar sugestões (mínimo 5).",
        analyzed: logs.length,
      }, 200);
    }

    // ---------- Chamada à IA ----------
    const userPrompt = JSON.stringify({
      existing_behaviors: existing.map((b) => ({
        code: b.code, label: b.label, hints: b.detection_hints,
      })),
      logs_sample: logs.slice(0, 80).map((l) => ({
        intent: l.intent, tone: l.tone, action: l.action_taken,
        outcome: l.outcome, behaviors: l.detected_behavior_codes,
        context: l.context,
      })),
      total_logs: logs.length,
    });

    const aiResp = await aiChatCompletion({
      config: aiConfig,
      tier: "fast",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "suggest_lead_behaviors" } },
    });

    if (aiResp.status === 429) {
      return jsonResp({ error: "Limite de requisições. Tente novamente em alguns minutos." }, 429);
    }
    if (aiResp.status === 402) {
      return jsonResp({ error: "Créditos esgotados na workspace Lovable AI." }, 402);
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[suggest-lead-behaviors] gateway:", aiResp.status, txt);
      return jsonResp({ error: "Erro no gateway de IA" }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      return jsonResp({ error: "IA não retornou sugestões estruturadas" }, 502);
    }

    let parsed: { suggestions: LBDraft[] };
    try {
      parsed = JSON.parse(argsRaw);
    } catch {
      return jsonResp({ error: "Resposta inválida da IA" }, 502);
    }

    // ---------- Filtro de duplicatas ----------
    const existingCodes = new Set(existing.map((b) => normalize(b.code)));
    const existingLabels = new Set(existing.map((b) => normalize(b.label)));
    const filtered = (parsed.suggestions ?? [])
      .filter((s) => s && s.code && s.label)
      .map((s) => ({
        ...s,
        code: s.code.toUpperCase().trim(),
        label: s.label.trim(),
      }))
      .filter((s) =>
        !existingCodes.has(normalize(s.code)) &&
        !existingLabels.has(normalize(s.label))
      );

    return jsonResp({
      suggestions: filtered,
      analyzed: logs.length,
      duplicates_filtered: (parsed.suggestions?.length ?? 0) - filtered.length,
    }, 200);
  } catch (e) {
    console.error("[suggest-lead-behaviors] erro:", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function jsonResp(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
