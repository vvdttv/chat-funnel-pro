/**
 * Edge function `compose-playbook` (Sprint 5 + Sprint 8 hardening).
 *
 * Resolve o `EffectivePlaybook` no servidor — usado por:
 *   - `ai-chat-analysis` (injetar systemPrompt composicional + log de proveniência)
 *   - pipelines de follow-up automatizado
 *   - debugging operacional (curl direto)
 *
 * Body JSON:
 *  {
 *    deal_id?: string,        // opcional; se vier, valida que pertence à org do user
 *    funnel_id: string,
 *    stage_id: string,
 *    deal_status?: 'open' | 'won' | 'lost' (default 'open'),
 *    render_prompt?: boolean (default true),
 *  }
 *
 * Resposta (200):
 *  { effectivePlaybook, systemPrompt?, organizationId, userId }
 *
 * Toda a leitura é feita com a sessão do usuário — RLS aplicada em cima de
 * tudo. Se não houver sessão válida, retorna 401.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DealStatus = 'open' | 'won' | 'lost';

interface StageIdentity {
  persona?: string;
  tone?: string;
  mission?: string;
  identityNotes?: string;
}

const DEFAULT_IDENTITY = {
  persona: 'Assistente comercial profissional',
  tone: 'Cordial, direto, sem pressão',
  mission: 'Avançar o lead na jornada respeitando seu ritmo',
  identityNotes: '',
};

const parseIdentity = (raw: unknown): StageIdentity => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try { return JSON.parse(t); } catch { return { identityNotes: t }; }
  }
  if (typeof raw === 'object') return raw as StageIdentity;
  return {};
};

const mergeIdentity = (
  base: typeof DEFAULT_IDENTITY,
  patch?: StageIdentity | null,
) => ({
  persona: patch?.persona?.trim() || base.persona,
  tone: patch?.tone?.trim() || base.tone,
  mission: patch?.mission?.trim() || base.mission,
  identityNotes: patch?.identityNotes?.trim() || base.identityNotes,
});

const intersects = (a: string[], b: string[]) =>
  a.includes('*') || b.includes('*') || a.some(x => b.includes(x));

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ComposeBody {
  deal_id?: string;
  funnel_id: string;
  stage_id: string;
  deal_status?: DealStatus;
  render_prompt?: boolean;
  organization_id?: string;
  persona_id?: string;
}

const validate = (raw: unknown): { ok: true; data: ComposeBody } | { ok: false; error: string } => {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body deve ser objeto JSON' };
  const b = raw as Record<string, unknown>;
  if (typeof b.funnel_id !== 'string' || !b.funnel_id) return { ok: false, error: 'funnel_id obrigatório (string)' };
  if (typeof b.stage_id !== 'string' || !b.stage_id) return { ok: false, error: 'stage_id obrigatório (string)' };
  if (b.deal_id !== undefined && typeof b.deal_id !== 'string') return { ok: false, error: 'deal_id deve ser string' };
  const status = (b.deal_status as DealStatus) ?? 'open';
  if (!['open', 'won', 'lost'].includes(status)) return { ok: false, error: 'deal_status inválido' };
  return {
    ok: true,
    data: {
      deal_id: b.deal_id as string | undefined,
      funnel_id: b.funnel_id,
      stage_id: b.stage_id,
      deal_status: status,
      render_prompt: b.render_prompt !== false,
      organization_id: typeof b.organization_id === 'string' ? b.organization_id : undefined,
      persona_id: typeof b.persona_id === 'string' ? b.persona_id : undefined,
    },
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const INTERNAL_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? '';

    // Body é parseado antes da auth porque, no modo interno (worker M2M), a
    // organização vem do próprio body (não há JWT de usuário de onde derivá-la).
    let parsedBody: unknown;
    try { parsedBody = await req.json(); } catch { return json(400, { error: 'json_invalido' }); }
    const v = validate(parsedBody);
    if (!v.ok) return json(400, { error: v.error });

    // Auth: dois modos.
    //  (a) Interno/M2M — header `x-internal-token` == INTERNAL_FUNCTION_TOKEN.
    //      Usa service-role (bypassa RLS) e lê `organization_id` do body.
    //  (b) Usuário — JWT no Authorization; org derivada de profiles via RLS.
    //      Comportamento ORIGINAL preservado, sem alteração.
    const internalToken = req.headers.get('x-internal-token') ?? '';
    const isInternal = INTERNAL_TOKEN !== '' && internalToken === INTERNAL_TOKEN;

    let supabase;
    let userId: string;
    let organizationId: string | undefined;

    if (isInternal) {
      const orgFromBody = v.data.organization_id;
      if (typeof orgFromBody !== 'string' || !orgFromBody) {
        return json(400, { error: 'organization_id_obrigatorio_interno' });
      }
      organizationId = orgFromBody;
      userId = 'system';
      supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    } else {
      const authHeader = req.headers.get("Authorization") ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return json(401, { error: 'auth_required' });
      }
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userResp, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userResp?.user) return json(401, { error: 'auth_invalid' });
      userId = userResp.user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .maybeSingle();
      organizationId = profile?.organization_id;
      if (!organizationId) return json(403, { error: 'sem_organizacao' });
    }

    const { deal_id: dealId, funnel_id: funnelId, stage_id: stageId, deal_status: dealStatusInput, render_prompt: renderPromptFlag } = v.data;
    let dealStatus: DealStatus = dealStatusInput ?? 'open';
    let personaId: string | undefined = v.data.persona_id;

    // Se veio deal_id, busca status real (RLS garante org/permissão)
    if (dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('status, organization_id, funnel_id, stage_id')
        .eq('id', dealId)
        .maybeSingle();
      if (!deal) return json(404, { error: 'deal_nao_encontrado' });
      if (deal.organization_id !== organizationId) return json(403, { error: 'org_mismatch' });
      dealStatus = (deal.status as DealStatus) ?? 'open';
    }

    // Persona (Fase 2A): se não veio explícita no body, deriva da conversa do deal.
    // A persona é a camada FINAL da identity — sobrescreve persona/tom/missão do
    // playbook, dando ao lead a percepção de uma pessoa fixa atendendo.
    if (!personaId && dealId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('persona_id')
        .eq('deal_id', dealId)
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      personaId = (conv as { persona_id?: string | null } | null)?.persona_id ?? undefined;
    }

    // NOTA multi-tenant: as tabelas de domínio (funnels, funnel_stages,
    // stage_playbooks, playbook_overrides, ia_rules, lead_behaviors,
    // followup_ladders, handoff_triggers, ia_skills, ia_skill_nodes,
    // ia_skill_guardrails) têm organization_id e RLS deny-all (acesso só via
    // service-role). Como o modo interno usa service-role (bypassa RLS), o
    // filtro por organização é feito manualmente aqui — senão vazaria entre
    // orgs. stage_archetypes/status_archetypes são catálogo global (sem org).
    const [
      funnel, archetypes, statusArchetypes, physicalStages,
      catalogPlaybooks, overrides, rules, behaviors, ladders, triggers,
      skills, skillNodes, skillGuardrails, personaRow, segmentProfiles,
    ] = await Promise.all([
      supabase.from('funnels').select('id,context_tags,segment_code').eq('id', funnelId).eq('organization_id', organizationId).maybeSingle(),
      supabase.from('stage_archetypes').select('id,code,default_playbook_code,context_tags').eq('is_active', true),
      supabase.from('status_archetypes').select('id,code').eq('is_active', true),
      supabase.from('funnel_stages').select('funnel_id,stage_id,stage_archetype_id,purpose,context_tags').eq('funnel_id', funnelId).eq('stage_id', stageId).eq('organization_id', organizationId).maybeSingle(),
      supabase.from('stage_playbooks').select('code,archetype_id,status_archetype_id,kind,goal,success_criteria,failure_criteria,default_ladder_code,typical_behavior_codes,identity').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('playbook_overrides').select('scope_type,scope_id,layer,payload').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('ia_rules').select('code,kind,scope,text,meta').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('lead_behaviors').select('code,label,default_reaction,next_step,applicable_context_tags,applicable_statuses,detection_hints').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('followup_ladders').select('code,name,description,steps').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('handoff_triggers').select('code,priority,label,stage,condition,action').eq('is_active', true).eq('organization_id', organizationId),
      supabase.from('ia_skills').select('id,code,name,description,scope_type,scope_id,position').eq('is_active', true).eq('organization_id', organizationId).order('position'),
      supabase.from('ia_skill_nodes').select('id,skill_id,kind,parent_node_id,branch_label,config,position').eq('organization_id', organizationId).order('position'),
      supabase.from('ia_skill_guardrails').select('skill_id,rule_code').eq('organization_id', organizationId),
      personaId
        ? supabase.from('agent_personas').select('name,gender,personality,style,tone,mission,identity_notes').eq('id', personaId).eq('organization_id', organizationId).eq('is_active', true).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('segment_profiles').select('code,name,income_range,tone,vocabulary,notes,context_tag').eq('organization_id', organizationId).eq('is_active', true),
    ]);

    const physical = physicalStages.data;
    // deno-lint-ignore no-explicit-any
    const archetype: any = physical?.stage_archetype_id
      ? archetypes.data?.find((a: { id: string }) => a.id === physical.stage_archetype_id)
      : null;
    const statusArch = statusArchetypes.data?.find((s: { code: string }) => s.code === dealStatus);

    const funnelTags: string[] = Array.isArray(funnel.data?.context_tags) ? funnel.data.context_tags as string[] : [];
    const stageTags: string[] = Array.isArray(physical?.context_tags) ? physical.context_tags as string[] : [];
    const archTags: string[] = Array.isArray(archetype?.context_tags) ? archetype.context_tags : [];
    const contextTags = uniq([...funnelTags, ...stageTags, ...archTags]);

    // Perfil de SEGMENTO/FAIXA (Fase H): o funil declara segment_code; o perfil
    // define tom/vocabulário/faixa de renda aplicados COMO CAMADA à persona (§4.14
    // — NÃO troca a persona). Injetado no system prompt mais abaixo (bloco SEGMENTO).
    // deno-lint-ignore no-explicit-any
    const segmentCode: string | null = (funnel.data as any)?.segment_code ?? null;
    // deno-lint-ignore no-explicit-any
    const segmentProfile: any = segmentCode
      ? (segmentProfiles.data ?? []).find((sp: { code: string }) => sp.code === segmentCode)
      : null;

    // deno-lint-ignore no-explicit-any
    const archetypePb: any = archetype?.default_playbook_code
      ? catalogPlaybooks.data?.find((p: { code: string }) => p.code === archetype.default_playbook_code)
      : null;

    let identity = mergeIdentity(DEFAULT_IDENTITY, archetypePb ? parseIdentity(archetypePb.identity) : null);
    let goal: string = archetypePb?.goal ?? '';
    let successCriteria: string[] = archetypePb?.success_criteria ?? [];
    let failureCriteria: string[] = archetypePb?.failure_criteria ?? [];
    let expectedCodes: string[] = archetypePb?.typical_behavior_codes ?? [];
    const ladderCode: string | null = archetypePb?.default_ladder_code ?? null;

    identity = mergeIdentity(identity, parseIdentity(physical?.purpose));

    const stageScopeId = `${funnelId}::${stageId}`;
    // deno-lint-ignore no-explicit-any
    const stageOverrides = (overrides.data ?? []).filter((o: any) =>
      o.layer === 'stage' &&
      (o.scope_type === 'stage' ? o.scope_id === stageScopeId :
       o.scope_type === 'funnel' ? o.scope_id === funnelId : true));
    const overrideIds: string[] = [];
    for (const ov of stageOverrides) {
      overrideIds.push(`${ov.scope_type}:${ov.scope_id}:stage`);
      if (ov.payload?.identity) identity = mergeIdentity(identity, ov.payload.identity);
      if (ov.payload?.goal !== undefined) goal = ov.payload.goal;
      if (ov.payload?.successCriteria) successCriteria = ov.payload.successCriteria;
      if (ov.payload?.failureCriteria) failureCriteria = ov.payload.failureCriteria;
      if (ov.payload?.expectedBehaviorIds) expectedCodes = ov.payload.expectedBehaviorIds;
    }

    let statusOverlayCode: string | null = null;
    if (dealStatus !== 'open' && statusArch) {
      // deno-lint-ignore no-explicit-any
      const overlayPb: any = catalogPlaybooks.data?.find((p: any) =>
        p.kind === 'overlay' && p.status_archetype_id === statusArch.id);
      if (overlayPb) {
        statusOverlayCode = overlayPb.code;
        identity = mergeIdentity(identity, parseIdentity(overlayPb.identity));
        if (overlayPb.goal) goal = overlayPb.goal;
        if (overlayPb.success_criteria?.length) successCriteria = uniq([...successCriteria, ...overlayPb.success_criteria]);
        if (overlayPb.failure_criteria?.length) failureCriteria = uniq([...failureCriteria, ...overlayPb.failure_criteria]);
        expectedCodes = uniq([...expectedCodes, ...(overlayPb.typical_behavior_codes ?? [])]);
      }
      // deno-lint-ignore no-explicit-any
      const overlayOverrides = (overrides.data ?? []).filter((o: any) =>
        o.layer === 'overlay' &&
        (o.scope_type === 'stage' ? o.scope_id === stageScopeId :
         o.scope_type === 'funnel' ? o.scope_id === funnelId : true));
      for (const ov of overlayOverrides) {
        overrideIds.push(`${ov.scope_type}:${ov.scope_id}:overlay`);
        if (ov.payload?.identity) identity = mergeIdentity(identity, ov.payload.identity);
        if (ov.payload?.successCriteria) successCriteria = uniq([...successCriteria, ...ov.payload.successCriteria]);
        if (ov.payload?.failureCriteria) failureCriteria = uniq([...failureCriteria, ...ov.payload.failureCriteria]);
        if (ov.payload?.expectedBehaviorIds) expectedCodes = uniq([...expectedCodes, ...ov.payload.expectedBehaviorIds]);
      }
    }

    // ----- Persona (Fase 2A): camada FINAL da identity -----
    // Sobrescreve persona/tom/missão do playbook com a persona configurada,
    // garantindo identidade fixa percebida pelo lead. personality/style/notes
    // entram em identityNotes (acumulados, não perdem as notas anteriores).
    // deno-lint-ignore no-explicit-any
    const persona: any = (personaRow as { data?: any })?.data ?? null;
    if (persona) {
      const extraNotes = [persona.personality, persona.style, persona.identity_notes]
        .map((s: unknown) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      identity = mergeIdentity(identity, {
        persona: persona.name,
        tone: persona.tone,
        mission: persona.mission,
        identityNotes: [identity.identityNotes, extraNotes].filter(Boolean).join(' | '),
      });
    }

    // deno-lint-ignore no-explicit-any
    const explicit = expectedCodes
      .map((c: string) => behaviors.data?.find((b: any) => b.code === c))
      .filter(Boolean);
    // deno-lint-ignore no-explicit-any
    const matched = (behaviors.data ?? []).filter((b: any) => {
      const tags: string[] = Array.isArray(b.applicable_context_tags) && b.applicable_context_tags.length
        ? b.applicable_context_tags : ['*'];
      const sts: string[] = Array.isArray(b.applicable_statuses) && b.applicable_statuses.length
        ? b.applicable_statuses : ['open'];
      return intersects(tags, contextTags) && sts.includes(dealStatus);
    });
    const expectedBehaviors = uniq([
      // deno-lint-ignore no-explicit-any
      ...explicit.filter(Boolean) as any[],
      // deno-lint-ignore no-explicit-any
      ...matched.filter((m: any) => !explicit.some((e: any) => e?.code === m.code)),
    ]);

    // deno-lint-ignore no-explicit-any
    const applicableRules = (rules.data ?? []).filter(
      (r: any) => r.scope === 'universal' || r.scope === stageId);

    const followUpLadder = ladderCode
      // deno-lint-ignore no-explicit-any
      ? ladders.data?.find((l: any) => l.code === ladderCode) ?? null
      : null;
    // deno-lint-ignore no-explicit-any
    const handoffTriggers = (triggers.data ?? []).filter(
      (t: any) => t.stage === '*' || t.stage === stageId);

    // ----- Skills aplicáveis -----
    // deno-lint-ignore no-explicit-any
    const skillNodesBySkill = new Map<string, any[]>();
    for (const n of (skillNodes.data ?? [])) {
      const arr = skillNodesBySkill.get(n.skill_id) ?? [];
      arr.push(n);
      skillNodesBySkill.set(n.skill_id, arr);
    }
    const skillGuardrailsBySkill = new Map<string, string[]>();
    for (const g of (skillGuardrails.data ?? [])) {
      const arr = skillGuardrailsBySkill.get(g.skill_id) ?? [];
      arr.push(g.rule_code);
      skillGuardrailsBySkill.set(g.skill_id, arr);
    }
    // deno-lint-ignore no-explicit-any
    const applicableSkills = (skills.data ?? []).filter((s: any) => {
      if (s.scope_type === 'universal') return true;
      if (s.scope_type === 'stage') return s.scope_id === stageId || s.scope_id === stageScopeId;
      if (s.scope_type === 'context') {
        // scope_id pode ser uma context tag única
        return s.scope_id && contextTags.includes(s.scope_id);
      }
      return false;
    // deno-lint-ignore no-explicit-any
    }).map((s: any) => {
      const nodes = skillNodesBySkill.get(s.id) ?? [];
      // deno-lint-ignore no-explicit-any
      const trigger = nodes.find((n: any) => n.kind === 'trigger');
      const triggerBehaviorCodes: string[] = trigger?.config?.behaviorCodes ?? trigger?.config?.triggerBehaviorCodes ?? [];
      // deno-lint-ignore no-explicit-any
      const stepNodes = nodes.filter((n: any) => n.kind !== 'trigger').map((n: any) => ({
        kind: n.kind,
        config: n.config ?? {},
        branchLabel: n.branch_label,
      }));
      return {
        code: s.code,
        name: s.name,
        description: s.description ?? '',
        scopeType: s.scope_type,
        scopeId: s.scope_id,
        triggerBehaviorCodes,
        guardrailRuleCodes: skillGuardrailsBySkill.get(s.id) ?? [],
        steps: stepNodes,
      };
    });

    const archetypeCode: string | null = archetype?.code ?? null;
    const appliedRuleCodes = applicableRules.map((r: { code: string }) => r.code);

    const effectivePlaybook = {
      identity, goal, successCriteria, failureCriteria,
      expectedBehaviors, applicableRules, followUpLadder, handoffTriggers,
      availableSkills: applicableSkills,
      provenance: {
        archetypeCode,
        statusOverlayCode,
        overrideIds,
        contextTags,
        dealStatus,
        appliedRuleCodes,
      },
    };

    let systemPrompt: string | null = null;
    if (renderPromptFlag) {
      // deno-lint-ignore no-explicit-any
      const list = (xs: any[]) => xs.length ? xs.map((x: any) => `  - ${x.text ?? x.label ?? ''}`).join('\n') : '  (nenhuma)';
      // deno-lint-ignore no-explicit-any
      const dos = applicableRules.filter((r: any) => r.kind === 'do');
      // deno-lint-ignore no-explicit-any
      const donts = applicableRules.filter((r: any) => r.kind === 'dont');
      // deno-lint-ignore no-explicit-any
      const asks = applicableRules.filter((r: any) => r.kind === 'ask');
      // deno-lint-ignore no-explicit-any
      const noasks = applicableRules.filter((r: any) => r.kind === 'noask');
      const lbs = expectedBehaviors.length
        // deno-lint-ignore no-explicit-any
        ? expectedBehaviors.map((b: any) =>
            `  · [${b.code}] ${b.label}\n      reação: ${b.default_reaction}\n      próximo: ${b.next_step}`).join('\n')
        : '  (nenhum LB aplicável)';
      const skillsBlock = applicableSkills.length
        ? applicableSkills.map(s => {
            const triggers = s.triggerBehaviorCodes.length
              ? s.triggerBehaviorCodes.join(', ')
              : '(qualquer comportamento aplicável)';
            const stepsTxt = s.steps.length
              // deno-lint-ignore no-explicit-any
              ? s.steps.map((st: any, i: number) => {
                  const cfg = st.config ?? {};
                  const detail = cfg.message || cfg.text || cfg.tone || cfg.reason || cfg.skillCode || cfg.ladderCode || cfg.field || '';
                  return `      ${i + 1}. ${st.kind}${detail ? ` — ${typeof detail === 'string' ? detail.slice(0, 120) : ''}` : ''}`;
                }).join('\n')
              : '      (sem passos definidos)';
            const guardrails = s.guardrailRuleCodes.length
              ? `\n      restrições: ${s.guardrailRuleCodes.join(', ')}`
              : '';
            return `  · [${s.code}] ${s.name}\n      gatilho: ${triggers}${guardrails}\n${stepsTxt}`;
          }).join('\n')
        : '  (nenhuma habilidade aplicável)';
      systemPrompt = `# IDENTIDADE
Persona: ${identity.persona}
Tom: ${identity.tone}
Missão: ${identity.mission}
${identity.identityNotes ? `Notas: ${identity.identityNotes}\n` : ''}${segmentProfile ? `# SEGMENTO (faixa de mercado — adapte tom e vocabulário, mantendo a MESMA persona)
Faixa: ${segmentProfile.name}${segmentProfile.income_range ? ` (${segmentProfile.income_range})` : ''}
Tom para esta faixa: ${segmentProfile.tone}
Vocabulário: ${segmentProfile.vocabulary}
${segmentProfile.notes ? `Orientações: ${segmentProfile.notes}\n` : ''}
` : ''}# OBJETIVO
${goal || '(não definido)'}

# SUCESSO
${successCriteria.length ? successCriteria.map((s: string) => `  ✓ ${s}`).join('\n') : '  (nenhum)'}

# FALHA
${failureCriteria.length ? failureCriteria.map((s: string) => `  ✗ ${s}`).join('\n') : '  (nenhum)'}

# DO
${list(dos)}

# DON'T
${list(donts)}

# ASK
${list(asks)}

# NOASK
${list(noasks)}

# LBs ATIVOS
${lbs}

# HABILIDADES DISPONÍVEIS
Quando você detectar um comportamento listado em "gatilho", execute os passos da habilidade correspondente, respeitando suas restrições.
${skillsBlock}

# CONTEXTO
arquétipo: ${archetypeCode ?? '(nenhum)'} | overlay: ${statusOverlayCode ?? '(nenhum)'}
segmento: ${segmentProfile?.name ?? segmentCode ?? '(nenhum)'}
context tags: ${contextTags.join(', ') || '(nenhum)'}
status: ${dealStatus}
overrides: ${overrideIds.join(' | ') || '(nenhum)'}`;
    }

    return json(200, {
      effectivePlaybook,
      systemPrompt,
      organizationId,
      userId,
      personaId: personaId ?? null,
    });
  } catch (e) {
    console.error("compose-playbook error:", e);
    return json(500, { error: e instanceof Error ? e.message : "Erro desconhecido" });
  }
});
