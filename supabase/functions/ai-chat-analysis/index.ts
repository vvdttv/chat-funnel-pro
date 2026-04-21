/**
 * Edge `ai-chat-analysis` (Sprint 8 — proveniência composicional real).
 *
 * Quando o cliente envia `dealContext.funnelId` + `dealContext.stageId`, esta
 * função:
 *  1. Invoca `compose-playbook` (RLS aplicada) para resolver o `EffectivePlaybook`.
 *  2. Usa o `systemPrompt` composicional REAL como instruções de sistema da IA.
 *  3. Após receber a resposta da IA, grava `ia_decision_logs` com toda a
 *     proveniência (arquétipo, overlay, overrides, context tags, status, regras
 *     aplicadas) — base para auditoria e A/B comparativo.
 *
 * Se o playbook composicional não estiver disponível (org não semeada, deal sem
 * etapa válida), usa o systemPrompt legado e ainda assim grava log com prov vazia.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DealContext {
  leadName?: string;
  property?: string;
  value?: string | number;
  stage?: string;
  funnel?: string;
  // Sprint 8 — campos opcionais que ativam o pipeline composicional
  dealId?: string;
  funnelId?: string;
  stageId?: string;
  dealStatus?: 'open' | 'won' | 'lost';
  organizationId?: string;
}

interface ChatMessage { sender: string; content: string; timestamp: string }
interface Attachment { type: string; name: string; description?: string; dataUrl?: string }

// deno-lint-ignore no-explicit-any
const safeArr = (v: any): any[] => (Array.isArray(v) ? v : []);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, userQuestion, dealContext, attachments } = await req.json() as {
      messages: ChatMessage[];
      userQuestion: string;
      dealContext: DealContext;
      attachments?: Attachment[];
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? '';

    // ----- 1. Tentar compor playbook composicional ---------------------------
    // deno-lint-ignore no-explicit-any
    let effectivePlaybook: any = null;
    let composedPrompt: string | null = null;
    let organizationId: string | null = dealContext.organizationId ?? null;

    if (dealContext.funnelId && dealContext.stageId && authHeader) {
      try {
        const composeRes = await fetch(`${SUPABASE_URL}/functions/v1/compose-playbook`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deal_id: dealContext.dealId,
            funnel_id: dealContext.funnelId,
            stage_id: dealContext.stageId,
            deal_status: dealContext.dealStatus ?? 'open',
            render_prompt: true,
          }),
        });
        if (composeRes.ok) {
          const data = await composeRes.json();
          effectivePlaybook = data.effectivePlaybook;
          composedPrompt = data.systemPrompt;
          organizationId = data.organizationId ?? organizationId;
        } else {
          const errTxt = await composeRes.text();
          console.warn('[ai-chat-analysis] compose-playbook falhou:', composeRes.status, errTxt);
        }
      } catch (e) {
        console.warn('[ai-chat-analysis] compose-playbook erro:', e);
      }
    }

    // ----- 2. Montar contexto da conversa ------------------------------------
    const conversationSummary = messages
      .map((m) =>
        `[${m.timestamp}] ${m.sender === 'agent' ? 'Corretor' : m.sender === 'lead' ? 'Lead' : 'IA'}: ${m.content}`
      )
      .join('\n');

    let attachmentContext = '';
    if (attachments && attachments.length > 0) {
      attachmentContext = '\n\nAnexos na conversa:\n' + attachments.map((a) =>
        `- ${a.type}: ${a.name}${a.description ? ` (${a.description})` : ''}`
      ).join('\n');
    }

    const dealSummary = `Lead: ${dealContext.leadName ?? '(n/d)'}
Imóvel: ${dealContext.property ?? '(n/d)'}
Valor: ${dealContext.value ?? '(n/d)'}
Etapa: ${dealContext.stage ?? '(n/d)'}
Funil: ${dealContext.funnel ?? '(n/d)'}`;

    // System prompt: composicional (preferido) ou legacy fallback
    const systemPrompt = composedPrompt
      ? `${composedPrompt}\n\n# DADOS DO DEAL\n${dealSummary}\n\n# HISTÓRICO\n${conversationSummary}${attachmentContext}\n\nResponda de forma concisa e prática. Suas respostas são visíveis APENAS para o corretor.`
      : `Você é um assistente de IA especializado em vendas imobiliárias. Você ajuda corretores a analisar conversas com leads e tomar decisões estratégicas.

Contexto do negócio:
${dealSummary}

Histórico da conversa:
${conversationSummary}
${attachmentContext}

Responda de forma concisa e prática. Suas respostas são visíveis APENAS para o corretor (não para o lead).`;

    // ----- 3. Chamar IA ------------------------------------------------------
    // deno-lint-ignore no-explicit-any
    const aiMessages: Array<{ role: string; content: any }> = [
      { role: "system", content: systemPrompt },
    ];

    if (attachments?.some((a) => a.type === 'image')) {
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: userQuestion }
      ];
      for (const att of attachments) {
        if (att.type === 'image' && att.dataUrl) {
          content.push({ type: "image_url", image_url: { url: att.dataUrl } });
        }
      }
      aiMessages.push({ role: "user", content });
    } else {
      aiMessages.push({ role: "user", content: userQuestion });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao processar com IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "Não foi possível gerar uma análise.";

    // ----- 4. Gravar ia_decision_logs com proveniência -----------------------
    if (effectivePlaybook && organizationId && authHeader) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const prov = effectivePlaybook.provenance ?? {};
        // deno-lint-ignore no-explicit-any
        const ruleCodes = safeArr(prov.appliedRuleCodes ?? effectivePlaybook.applicableRules?.map((r: any) => r.code));
        await supabase.from('ia_decision_logs').insert([{
          organization_id: organizationId,
          deal_id: dealContext.dealId ?? null,
          funnel_id: dealContext.funnelId ?? null,
          stage_id: dealContext.stageId ?? null,
          playbook_code: prov.archetypeCode ?? null,
          action_taken: 'analise_chat',
          intent: 'assistente_corretor',
          tone: effectivePlaybook.identity?.tone ?? null,
          detected_behavior_codes: [],
          applied_rule_codes: ruleCodes,
          outcome: 'resposta_gerada',
          context: {
            user_question: userQuestion,
            response_preview: aiResponse.slice(0, 500),
            attachment_count: attachments?.length ?? 0,
            history_length: messages.length,
          },
          archetype_code: prov.archetypeCode ?? null,
          status_overlay_code: prov.statusOverlayCode ?? null,
          applied_override_ids: safeArr(prov.overrideIds),
          context_tags: safeArr(prov.contextTags),
          deal_status: prov.dealStatus ?? dealContext.dealStatus ?? 'open',
        }]);
      } catch (logErr) {
        // Log não-fatal: não derrubar a UX por falha de auditoria
        console.warn('[ai-chat-analysis] falha ao gravar ia_decision_logs:', logErr);
      }
    }

    return new Response(JSON.stringify({
      response: aiResponse,
      provenance: effectivePlaybook?.provenance ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
