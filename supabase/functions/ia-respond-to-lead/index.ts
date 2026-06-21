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
import { aiChatCompletion, getAIGatewayConfig } from "../_shared/aiGateway.ts";

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
  organization_id?: string;
  persona_id?: string;
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
      organization_id: typeof b.organization_id === 'string' ? b.organization_id : undefined,
      persona_id: typeof b.persona_id === 'string' ? b.persona_id : undefined,
    },
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const INTERNAL_TOKEN = Deno.env.get('INTERNAL_FUNCTION_TOKEN') ?? '';
    const aiConfig = getAIGatewayConfig();
    if (!aiConfig.apiKey) return json(500, { error: 'ai_gateway_key_missing' });

    let parsedBody: unknown;
    try { parsedBody = await req.json(); } catch { return json(400, { error: 'json_invalido' }); }
    const v = validate(parsedBody);
    if (!v.ok) return json(400, { error: v.error });
    const body = v.data;

    // Auth: dois modos (igual a compose-playbook).
    //  (a) Interno/M2M — header `x-internal-token`: usa service-role e exige
    //      `organization_id` no body. Repassado a compose-playbook adiante.
    //  (b) Usuário — JWT no Authorization. Comportamento ORIGINAL preservado.
    const internalToken = req.headers.get('x-internal-token') ?? '';
    const isInternal = INTERNAL_TOKEN !== '' && internalToken === INTERNAL_TOKEN;

    let supabase: ReturnType<typeof createClient>;
    let userId: string;
    if (isInternal) {
      if (!body.organization_id) return json(400, { error: 'organization_id_obrigatorio_interno' });
      userId = 'system';
      supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    } else {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'auth_required' });
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userResp, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userResp?.user) return json(401, { error: 'auth_invalid' });
      userId = userResp.user.id;
    }

    // ----- 1. Compor playbook -----
    // No modo usuário, repassa o JWT (RLS). No modo interno, repassa o
    // x-internal-token + organization_id para compose-playbook usar service-role.
    const composeHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isInternal) {
      composeHeaders['x-internal-token'] = internalToken;
      composeHeaders['Authorization'] = `Bearer ${SERVICE_ROLE}`;
    } else {
      composeHeaders['Authorization'] = req.headers.get('Authorization') ?? '';
    }
    const composeResp = await fetch(`${SUPABASE_URL}/functions/v1/compose-playbook`, {
      method: 'POST',
      headers: composeHeaders,
      body: JSON.stringify({
        deal_id: body.deal_id,
        funnel_id: body.funnel_id,
        stage_id: body.stage_id,
        deal_status: body.deal_status,
        render_prompt: true,
        ...(body.persona_id ? { persona_id: body.persona_id } : {}),
        ...(isInternal ? { organization_id: body.organization_id } : {}),
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
    // No modo interno a org vem do body; no modo usuário, do compose. Valida.
    const organizationId: string = composed.organizationId ?? body.organization_id ?? '';
    if (!organizationId) return json(500, { error: 'organization_id_ausente' });

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

      const detectResp = await aiChatCompletion({
        config: aiConfig,
        tier: 'fast',
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

      const aiResp = await aiChatCompletion({
        config: aiConfig,
        tier: 'smart',
        messages: respMsgs as { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[],
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

    // ----- 5b. Pré-qualificação + sugestão de transição de etapa -----
    // Só avalia quando há resposta (sem handoff) e estamos com org resolvida.
    // Carrega os critérios da etapa atual; se houver, pede à IA (tier fast)
    // para avaliar de forma conversacional contra o histórico+mensagem.
    // Resultado vira `stageTransition` (sugestão) — NÃO move o deal aqui.
    let stageTransition: {
      triggered: boolean;
      fromStageId: string;
      toStageId: string;
      reason: string;
      qualified: boolean;
      collected: Record<string, unknown>;
      missing: string[];
    } | null = null;
    let qualificationEval: {
      qualified: boolean;
      collected: Record<string, unknown>;
      missing: string[];
    } | null = null;

    if (!handoff.triggered && response && response.trim()) {
      // Critérios obrigatórios da etapa atual.
      const { data: criteria } = await supabase
        .from('stage_qualification_criteria')
        .select('key, label, criterion_type, config, question_hint, is_required')
        .eq('organization_id', organizationId)
        .eq('funnel_id', body.funnel_id)
        .eq('stage_id', body.stage_id)
        .eq('is_active', true)
        .order('position', { ascending: true });

      if (criteria && criteria.length > 0) {
        // deno-lint-ignore no-explicit-any
        const critList = (criteria as any[]).map(c =>
          `- ${c.key} (${c.is_required ? 'obrigatório' : 'opcional'}): ${c.label}${c.question_hint ? ` — ${c.question_hint}` : ''}`
        ).join('\n');

        const fullHistoryTxt = [
          ...(body.conversation_history ?? []).map(m => `${m.role.toUpperCase()}: ${m.content}`),
          `LEAD: ${body.lead_message}`,
        ].join('\n');

        const qualResp = await aiChatCompletion({
          config: aiConfig,
          tier: 'fast',
          messages: [
            { role: 'system', content: `Você avalia se um lead imobiliário satisfaz critérios de qualificação a partir da conversa. Avalie de forma conservadora: só marque um critério como satisfeito se a conversa traz evidência clara. Não invente. Critérios:\n${critList}` },
            { role: 'user', content: `Conversa:\n${fullHistoryTxt}` },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'report_qualification',
              description: 'Reporta a avaliação dos critérios de qualificação',
              parameters: {
                type: 'object',
                properties: {
                  collected: {
                    type: 'object',
                    description: 'Mapa key→valor avaliado para cada critério (boolean para tipo boolean; valor textual/numérico para os demais; null se não há evidência).',
                    additionalProperties: true,
                  },
                  missing: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keys dos critérios OBRIGATÓRIOS ainda não satisfeitos.',
                  },
                },
                required: ['collected', 'missing'],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'report_qualification' } },
        });

        if (qualResp.ok) {
          const qj = await qualResp.json();
          const tc = qj.choices?.[0]?.message?.tool_calls?.[0];
          if (tc?.function?.arguments) {
            try {
              const args = JSON.parse(tc.function.arguments);
              // collected deve ser objeto (não array/null). LLM pode devolver
              // array — nesse caso descarta e trata como vazio (tudo missing).
              const collected: Record<string, unknown> =
                args.collected !== null &&
                typeof args.collected === 'object' &&
                !Array.isArray(args.collected)
                  ? (args.collected as Record<string, unknown>)
                  : {};
              const requiredKeys = (criteria as Array<{ key: string; is_required: boolean }>)
                .filter(c => c.is_required).map(c => c.key);
              // missing = obrigatórios sem evidência positiva. `0` é valor válido
              // (não falsy aqui); false/''/null/undefined contam como não-satisfeito.
              const missing = requiredKeys.filter(k => {
                const val = collected[k];
                return val === undefined || val === null || val === false || val === '';
              });
              const qualified = missing.length === 0;
              qualificationEval = { qualified, collected, missing };

              if (qualified) {
                // Próxima etapa = position+1 no funil (linear). Resolve via funnel_stages.
                const { data: curStage } = await supabase
                  .from('funnel_stages')
                  .select('position')
                  .eq('organization_id', organizationId)
                  .eq('funnel_id', body.funnel_id)
                  .eq('stage_id', body.stage_id)
                  .maybeSingle();
                const curPos = (curStage as { position?: number } | null)?.position ?? null;
                if (curPos !== null) {
                  const { data: nextStage } = await supabase
                    .from('funnel_stages')
                    .select('stage_id')
                    .eq('organization_id', organizationId)
                    .eq('funnel_id', body.funnel_id)
                    .eq('position', curPos + 1)
                    .maybeSingle();
                  const nextStageId = (nextStage as { stage_id?: string } | null)?.stage_id ?? null;
                  if (nextStageId) {
                    stageTransition = {
                      triggered: true,
                      fromStageId: body.stage_id,
                      toStageId: nextStageId,
                      reason: 'pré-qualificação atingida',
                      qualified: true,
                      collected,
                      missing: [],
                    };
                  }
                }
              }
            } catch (e) {
              console.error('[ia-respond-to-lead] parse qualification args failed:', e);
            }
          }
        } else {
          const t = await qualResp.text();
          console.error('[ia-respond-to-lead] qualification eval failed:', t);
        }
      }
    }

    // ----- 5b2. Sugestão de TAGS pela IA (Fase G-2, §4.7) -----
    // Roda só no worker (isInternal), não impacta latência do cliente. Avalia a
    // conversa contra as tags dos grupos vinculados à etapa e SUGERE (não aplica)
    // via suggest_deal_tag_internal — tudo entra como 'suggested' p/ aprovação humana.
    if (isInternal && body.deal_id && !handoff.triggered) {
      try {
        // Tags candidatas: dos grupos com requisito nesta etapa (temperatura sempre;
        // objeções/decisão conforme stage_tag_requirements). Junta nome+critérios.
        const { data: reqGroups } = await supabase
          .from('stage_tag_requirements')
          .select('group_id')
          .eq('organization_id', organizationId)
          .eq('funnel_id', body.funnel_id)
          .eq('stage_id', body.stage_id);
        const groupIds = (reqGroups ?? []).map((r: { group_id: number }) => r.group_id);
        if (groupIds.length > 0) {
          const { data: candTags } = await supabase
            .from('deal_tags')
            .select('id, name, criteria, group_id')
            .eq('organization_id', organizationId)
            .in('group_id', groupIds)
            .eq('status', 'approved');
          const tags = (candTags ?? []) as Array<{ id: number; name: string; criteria: Record<string, unknown> }>;
          if (tags.length > 0) {
            const tagCatalog = tags.map(t =>
              `- id:${t.id} "${t.name}"${t.criteria?.regra ? ` (aplicar quando: ${t.criteria.regra})` : ''}`
            ).join('\n');
            const tagHistory = [
              ...(body.conversation_history ?? []).map(m => `${m.role.toUpperCase()}: ${m.content}`),
              `LEAD: ${body.lead_message}`,
            ].join('\n');
            const tagResp = await aiChatCompletion({
              config: aiConfig,
              tier: 'fast',
              messages: [
                { role: 'system', content: `Você classifica tags de um lead imobiliário a partir da conversa. Use SOMENTE as tags do catálogo. Aplique uma tag apenas com evidência clara no diálogo (seja conservador). Catálogo:\n${tagCatalog}` },
                { role: 'user', content: `Conversa:\n${tagHistory}` },
              ],
              tools: [{
                type: 'function',
                function: {
                  name: 'report_tags',
                  description: 'Reporta as tags aplicáveis ao lead com confiança e justificativa',
                  parameters: {
                    type: 'object',
                    properties: {
                      tags: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number', description: 'id da tag do catálogo' },
                            confidence: { type: 'number', description: '0..1' },
                            rationale: { type: 'string', description: 'evidência curta da conversa' },
                          },
                          required: ['id'],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ['tags'],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: 'function', function: { name: 'report_tags' } },
            });
            if (tagResp.ok) {
              const tj = await tagResp.json();
              const tc = tj.choices?.[0]?.message?.tool_calls?.[0];
              if (tc?.function?.arguments) {
                const args = JSON.parse(tc.function.arguments);
                const validIds = new Set(tags.map(t => t.id));
                for (const sug of (args.tags ?? [])) {
                  if (!validIds.has(sug.id)) continue; // só tags do catálogo
                  await supabase.rpc('suggest_deal_tag_internal', {
                    p_deal_id: body.deal_id,
                    p_tag_id: sug.id,
                    p_confidence: typeof sug.confidence === 'number' ? sug.confidence : null,
                    p_rationale: typeof sug.rationale === 'string' ? sug.rationale.slice(0, 300) : null,
                  });
                }
              }
            } else {
              console.error('[ia-respond-to-lead] tag classify failed:', await tagResp.text());
            }
          }
        }
      } catch (e) {
        // Sugestão de tags é best-effort: nunca derruba a resposta ao lead.
        console.error('[ia-respond-to-lead] sugestão de tags exceção:', e);
      }
    }

    // ----- 5c. Agendamento (etapas 6/7 do funil da IA) -----
    // Quando o crédito está aprovado e estamos nas etapas de agendamento
    // ('ia-aprovado-aguardando' = 6 ou 'ia-agendamento' = 7), a IA conduz a
    // marcação da visita: oferece 2 horários por vez ("mais breve possível",
    // hierarquia presencial>vídeo>ligação) e, quando o lead aceita um horário,
    // confirma — o que move o deal p/ etapa 8 e cria o card do corretor (RPC).
    // Só roda no modo interno (worker), com deal_id e org resolvidos, sem handoff.
    const SCHEDULING_STAGES = new Set(['ia-aprovado-aguardando', 'ia-agendamento']);
    let scheduling: {
      action: 'proposed' | 'confirmed' | 'none';
      slots?: string[];
      channel?: string;
      confirmedAt?: string | null;
      brokerDealId?: string | null;
    } | null = null;

    if (
      isInternal && body.deal_id && !handoff.triggered &&
      SCHEDULING_STAGES.has(body.stage_id)
    ) {
      // Detecta, via tool-call, se o lead ACEITOU um horário específico (e qual)
      // ou se ainda estamos oferecendo. Conservador: só confirma com data/hora clara.
      const schedHistory = [
        ...(body.conversation_history ?? []).map(m => `${m.role.toUpperCase()}: ${m.content}`),
        `LEAD: ${body.lead_message}`,
      ].join('\n');

      const schedResp = await aiChatCompletion({
        config: aiConfig,
        tier: 'fast',
        messages: [
          { role: 'system', content: `Você analisa uma conversa de agendamento de visita imobiliária. Decida se o lead JÁ ACEITOU um horário específico (com data e hora claras) ou se ainda não. Seja conservador: só reporte accepted=true com uma data/hora inequívoca. Hoje é ${new Date().toISOString()}. Canal preferido: presencial > vídeo > ligação.` },
          { role: 'user', content: `Conversa:\n${schedHistory}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'report_scheduling',
            description: 'Reporta o estado do agendamento a partir da conversa',
            parameters: {
              type: 'object',
              properties: {
                accepted: { type: 'boolean', description: 'true só se o lead aceitou um horário com data e hora claras' },
                scheduled_at: { type: 'string', description: 'ISO 8601 (UTC) do horário aceito, se accepted=true; senão vazio' },
                channel: { type: 'string', enum: ['presencial', 'video', 'ligacao'], description: 'canal combinado (default presencial)' },
              },
              required: ['accepted'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'report_scheduling' } },
      });

      let accepted = false;
      let acceptedAt: string | null = null;
      let acceptedChannel = 'presencial';
      if (schedResp.ok) {
        const sj = await schedResp.json();
        const tc = sj.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) {
          try {
            const a = JSON.parse(tc.function.arguments);
            accepted = a.accepted === true && typeof a.scheduled_at === 'string' && a.scheduled_at.trim() !== '';
            acceptedAt = accepted ? a.scheduled_at : null;
            if (typeof a.channel === 'string' && ['presencial', 'video', 'ligacao'].includes(a.channel)) {
              acceptedChannel = a.channel;
            }
          } catch (e) {
            console.error('[ia-respond-to-lead] parse scheduling args failed:', e);
          }
        }
      }

      if (accepted && acceptedAt) {
        // Confirma: move deal p/ 'ia-transferido' (8) + cria card corretor + briefing.
        const { data: confirmData, error: confirmErr } = await supabase.rpc('confirm_appointment_internal', {
          p_ia_deal_id: body.deal_id,
          p_scheduled_at: acceptedAt,
          p_channel: acceptedChannel,
          p_location: null,
        });
        if (confirmErr) {
          console.error('[ia-respond-to-lead] confirm_appointment_internal err:', confirmErr);
          scheduling = { action: 'none' };
        } else {
          const row = Array.isArray(confirmData) ? confirmData[0] : confirmData;
          if (!row) {
            console.error('[ia-respond-to-lead] confirm_appointment_internal retornou vazio — deal não encontrado ou já confirmado:', body.deal_id);
            scheduling = { action: 'none' };
          } else {
            scheduling = {
              action: 'confirmed',
              channel: acceptedChannel,
              confirmedAt: acceptedAt,
              brokerDealId: (row as { broker_deal_id?: string })?.broker_deal_id ?? null,
            };
          }
        }
      } else {
        // Ainda oferecendo: calcula 2 slots "mais breve" e incrementa tentativas.
        // Resolve o corretor já atribuído ao appointment aberto deste deal.
        const { data: appt } = await supabase
          .from('appointments')
          .select('id, broker_id, attempts')
          .eq('ia_deal_id', body.deal_id)
          .in('status', ['proposed', 'confirmed'])
          .maybeSingle();
        const apptRow = appt as { id?: string; broker_id?: string | null; attempts?: number } | null;
        if (!apptRow) {
          console.warn('[ia-respond-to-lead] sem appointment aberto p/ deal', body.deal_id, '— não há corretor/slots p/ propor (trigger de kickoff deveria ter criado)');
        }
        const { data: slotsData } = await supabase.rpc('propose_appointment_slots', {
          p_broker_id: apptRow?.broker_id ?? null,
          p_from: new Date().toISOString(),
          p_count: 2,
        });
        const slots = Array.isArray(slotsData)
          ? (slotsData as Array<{ at: string }>).map(s => s.at)
          : [];
        // Persiste os slots oferecidos + incrementa tentativas (cadência §9-E).
        if (apptRow?.id) {
          await supabase
            .from('appointments')
            .update({
              proposed_slots: (slotsData ?? []),
              attempts: (apptRow.attempts ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', apptRow.id);
        }
        scheduling = { action: 'proposed', slots, channel: 'presencial' };
      }
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
          qualification: qualificationEval,
          suggested_stage_transition: stageTransition,
          scheduling,
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
      stageTransition,
      qualification: qualificationEval,
      scheduling,
      dryRun: body.dry_run === true,
      userId,
    });
  } catch (e) {
    console.error('[ia-respond-to-lead] unhandled:', e);
    return json(500, { error: e instanceof Error ? e.message : 'erro_desconhecido' });
  }
});
