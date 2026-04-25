/**
 * Edge function `ia-respond-to-lead` (Sprint Final).
 *
 * Recebe uma mensagem do lead, compõe o playbook efetivo (com habilidades),
 * detecta comportamentos via tool calling, escolhe a habilidade ativa,
 * verifica handoff, gera resposta e registra TUDO em `ia_decision_logs`.
 *
 * Body:
 *  {
 *    deal_id?: string,
 *    funnel_id: string,
 *    stage_id: string,
 *    deal_status?: 'open'|'won'|'lost',
 *    lead_message: string,
 *    conversation_history?: Array<{role:'lead'|'agent'|'ai', content:string}>,
 *    dry_run?: boolean,           // default false; quando true, não loga nem envia
 *  }
 *
 * Response 200:
 *  {
 *    detectedBehaviorCodes: string[],
 *    activatedSkillCode: string | null,
 *    handoff: { triggered: boolean, reason?: string, priority?: string, code?: string },
 *    response: string | null,     // null se handoff
 *    appliedRuleCodes: string[],
 *    appliedOverrideIds: string[],
 *    archetypeCode: string | null,
 *    statusOverlayCode: string | null,
 *    contextTags: string[],
 *    systemPrompt: string,        // para auditoria/simulador
 *    logId: string | null,        // null em dry_run
 *  }
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

interface ReqBody {
  deal_id?: string;
  funnel_id: string;
  stage_id: string;
  deal_status?: 'open' | 'won' | 'lost';
  lead_message: string;
  conversation_history?: Array<{ role: 'lead' | 'agent' | 'ai'; content: string }>;
  dry_run?: boolean;
}

const validate = (raw: unknown): { ok: true; data: ReqBody } | { ok: false; error: string } => {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body deve ser objeto JSON' };
  const b = raw as Record<string, unknown>;
  if (typeof b.funnel_id !== 'string' || !b.funnel_id) return { ok: false, error: 'funnel_id obrigatório' };
  if (typeof b.stage_id !== 'string' || !b.stage_id) return { ok: false, error: 'stage_id obrigatório' };
  if (typeof b.lead_message !== 'string' || !b.lead_message.trim()) return { ok: false, error: 'lead_message obrigatório' };
  return {
    ok: true,
    data: {
      deal_id: typeof b.deal_id === 'string' ? b.deal_id : undefined,
      funnel_id: b.funnel_id,
      stage_id: b.stage_id,
      deal_status: (b.deal_status as ReqBody['deal_status']) ?? 'open',
      lead_message: b.lead_message,
      conversation_history: Array.isArray(b.conversation_history) ? b.conversation_history as ReqBody['conversation_history'] : [],
      dry_run: b.dry_run === true,
    },
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return json(500, { error: 'lovable_api_key_missing' });

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'auth_required' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userResp, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userResp?.user) return json(401, { error: 'auth_invalid' });
    const userId = userResp.user.id;

    let parsedBody: unknown;
    try { parsedBody = await req.json(); } catch { return json(400, { error: 'json_invalido' }); }
    const v = validate(parsedBody);
    if (!v.ok) return json(400, { error: v.error });
    const body = v.data;

    // ----- 1. Compor playbook -----
    const composeResp = await fetch(`${SUPABASE_URL}/functions/v1/compose-playbook`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deal_id: body.deal_id,
        funnel_id: body.funnel_id,
        stage_id: body.stage_id,
        deal_status: body.deal_status,
        render_prompt: true,
      }),
    });
    if (!composeResp.ok) {
      const errTxt = await composeResp.text();
      console.error('[ia-respond-to-lead] compose failed:', errTxt);
      return json(502, { error: 'compose_falhou', detail: errTxt });
    }
    const composed = await composeResp.json();
    const pb = composed.effectivePlaybook;
    const systemPrompt: string = composed.systemPrompt ?? '';
    const organizationId: string = composed.organizationId;

    // deno-lint-ignore no-explicit-any
    const expectedBehaviors: any[] = pb.expectedBehaviors ?? [];
    // deno-lint-ignore no-explicit-any
    const availableSkills: any[] = pb.availableSkills ?? [];
    // deno-lint-ignore no-explicit-any
    const handoffTriggers: any[] = pb.handoffTriggers ?? [];

    // ----- 2. Detectar comportamentos via tool calling -----
    const historyTxt = (body.conversation_history ?? [])
      .map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    let detectedBehaviorCodes: string[] = [];
    if (expectedBehaviors.length > 0) {
      const lbCatalog = expectedBehaviors.map(b =>
        `- ${b.code}: ${b.label}${b.detection_hints?.length ? ` | dicas: ${(b.detection_hints as string[]).join('; ')}` : ''}`
      ).join('\n');

      const detectResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: `Você é um classificador de comportamentos de leads. Dada a mensagem do lead e o catálogo de comportamentos possíveis, retorne os códigos dos comportamentos detectados. Só retorne códigos que existem no catálogo. Catálogo:\n${lbCatalog}` },
            { role: 'user', content: `Histórico recente:\n${historyTxt || '(nenhum)'}\n\nMensagem atual do lead:\n${body.lead_message}` },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'report_detected_behaviors',
              description: 'Reporta os códigos dos comportamentos detectados',
              parameters: {
                type: 'object',
                properties: {
                  detected_codes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista de códigos do catálogo (ex: LB-DESCONTO)',
                  },
                },
                required: ['detected_codes'],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'report_detected_behaviors' } },
        }),
      });
      if (detectResp.status === 429) return json(429, { error: 'rate_limited' });
      if (detectResp.status === 402) return json(402, { error: 'sem_creditos' });
      if (!detectResp.ok) {
        const t = await detectResp.text();
        console.error('[ia-respond-to-lead] detect failed:', t);
      } else {
        const dj = await detectResp.json();
        const tc = dj.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) {
          try {
            const args = JSON.parse(tc.function.arguments);
            if (Array.isArray(args.detected_codes)) {
              const validCodes = new Set(expectedBehaviors.map(b => b.code));
              detectedBehaviorCodes = (args.detected_codes as string[]).filter(c => validCodes.has(c));
            }
          } catch (e) {
            console.error('[ia-respond-to-lead] parse detect args failed:', e);
          }
        }
      }
    }

    // ----- 3. Verificar handoff (antes de gerar) -----
    // deno-lint-ignore no-explicit-any
    const handoffMatch = handoffTriggers.find((t: any) => {
      const cond = (t.condition ?? '').toLowerCase();
      // matching simples: condição menciona um LB detectado OU palavra-chave da mensagem
      if (detectedBehaviorCodes.some(c => cond.includes(c.toLowerCase()))) return true;
      const msg = body.lead_message.toLowerCase();
      const keywords = cond.split(/[\s,;]+/).filter(w => w.length > 4);
      return keywords.some(k => msg.includes(k));
    });

    let activatedSkillCode: string | null = null;
    let response: string | null = null;
    const handoff = handoffMatch
      ? {
          triggered: true,
          reason: handoffMatch.label ?? handoffMatch.condition ?? 'gatilho disparado',
          priority: handoffMatch.priority ?? 'P2',
          code: handoffMatch.code ?? null,
        }
      : { triggered: false };

    if (!handoff.triggered) {
      // ----- 4. Selecionar habilidade -----
      const matchedSkill = availableSkills.find(s =>
        Array.isArray(s.triggerBehaviorCodes) &&
        s.triggerBehaviorCodes.some((c: string) => detectedBehaviorCodes.includes(c))
      ) ?? null;
      activatedSkillCode = matchedSkill?.code ?? null;

      // ----- 5. Gerar resposta ao lead -----
      let augmentedSystem = systemPrompt;
      if (matchedSkill) {
        // deno-lint-ignore no-explicit-any
        const stepsTxt = (matchedSkill.steps as any[]).map((st, i) => {
          const cfg = st.config ?? {};
          const detail = cfg.message || cfg.text || cfg.tone || cfg.reason || cfg.skillCode || cfg.ladderCode || cfg.field || '';
          return `  ${i + 1}. ${st.kind}${detail ? ` — ${typeof detail === 'string' ? detail : ''}` : ''}`;
        }).join('\n');
        augmentedSystem += `\n\n# HABILIDADE ATIVADA AGORA: ${matchedSkill.code} — ${matchedSkill.name}
Execute esta habilidade respeitando os passos abaixo:
${stepsTxt}
${matchedSkill.guardrailRuleCodes?.length ? `Restrições obrigatórias: ${matchedSkill.guardrailRuleCodes.join(', ')}` : ''}`;
      }
      if (detectedBehaviorCodes.length) {
        augmentedSystem += `\n\n# COMPORTAMENTOS DETECTADOS: ${detectedBehaviorCodes.join(', ')}`;
      }

      const respMsgs = [
        { role: 'system', content: augmentedSystem },
        ...(body.conversation_history ?? []).map(m => ({
          role: m.role === 'lead' ? 'user' : 'assistant',
          content: m.content,
        })),
        { role: 'user', content: body.lead_message },
      ];

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
          messages: respMsgs,
        }),
      });
      if (aiResp.status === 429) return json(429, { error: 'rate_limited' });
      if (aiResp.status === 402) return json(402, { error: 'sem_creditos' });
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error('[ia-respond-to-lead] respond failed:', t);
        return json(502, { error: 'ai_falhou', detail: t });
      }
      const aj = await aiResp.json();
      response = aj.choices?.[0]?.message?.content ?? '';
    }

    // ----- 6. Log -----
    let logId: string | null = null;
    if (!body.dry_run) {
      const { data: logRow, error: logErr } = await supabase.from('ia_decision_logs').insert([{
        organization_id: organizationId,
        deal_id: body.deal_id ?? null,
        funnel_id: body.funnel_id,
        stage_id: body.stage_id,
        playbook_code: pb.provenance?.archetypeCode ?? null,
        action_taken: handoff.triggered
          ? `handoff: ${handoff.reason}`
          : (response ? `respondeu ao lead${activatedSkillCode ? ` via ${activatedSkillCode}` : ''}` : 'sem resposta'),
        intent: detectedBehaviorCodes[0] ?? null,
        tone: pb.identity?.tone ?? null,
        detected_behavior_codes: detectedBehaviorCodes,
        applied_rule_codes: pb.provenance?.appliedRuleCodes ?? [],
        outcome: handoff.triggered ? 'handoff' : 'respondido',
        context: {
          lead_message: body.lead_message,
          generated_response: response,
          handoff,
          system_prompt_used: systemPrompt,
        },
        archetype_code: pb.provenance?.archetypeCode ?? null,
        status_overlay_code: pb.provenance?.statusOverlayCode ?? null,
        applied_override_ids: pb.provenance?.overrideIds ?? [],
        context_tags: pb.provenance?.contextTags ?? [],
        deal_status: pb.provenance?.dealStatus ?? null,
        activated_skill_code: activatedSkillCode,
      }]).select('id').maybeSingle();
      if (logErr) {
        console.error('[ia-respond-to-lead] log insert failed:', logErr);
      } else {
        logId = logRow?.id ?? null;
      }
    }

    return json(200, {
      detectedBehaviorCodes,
      activatedSkillCode,
      handoff,
      response,
      appliedRuleCodes: pb.provenance?.appliedRuleCodes ?? [],
      appliedOverrideIds: pb.provenance?.overrideIds ?? [],
      archetypeCode: pb.provenance?.archetypeCode ?? null,
      statusOverlayCode: pb.provenance?.statusOverlayCode ?? null,
      contextTags: pb.provenance?.contextTags ?? [],
      systemPrompt,
      logId,
      dryRun: body.dry_run === true,
      userId,
    });
  } catch (e) {
    console.error('[ia-respond-to-lead] unhandled:', e);
    return json(500, { error: e instanceof Error ? e.message : 'erro_desconhecido' });
  }
});
