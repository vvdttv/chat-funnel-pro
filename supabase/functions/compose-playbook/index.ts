/**
 * Edge function `compose-playbook` (Sprint 5).
 *
 * Resolve o `EffectivePlaybook` no servidor — útil pro pipeline da IA real
 * (handler de mensagens recebidas, agendador de follow-ups) sem precisar
 * carregar tudo no client.
 *
 * Body JSON:
 *  {
 *    deal_id?: string,
 *    funnel_id: string,
 *    stage_id: string,
 *    deal_status?: 'open' | 'won' | 'lost' (default 'open'),
 *    render_prompt?: boolean (default true),
 *  }
 *
 * Resposta:
 *  { effectivePlaybook, systemPrompt? }
 *
 * Toda a operação é feita com a sessão do usuário (RLS aplicada).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    try { return JSON.parse(raw); } catch { return { identityNotes: raw }; }
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json();
    const funnelId = body.funnel_id as string;
    const stageId = body.stage_id as string;
    const dealStatus: DealStatus = body.deal_status ?? 'open';
    const renderPromptFlag = body.render_prompt !== false;
    if (!funnelId || !stageId) {
      return new Response(JSON.stringify({ error: "funnel_id e stage_id obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [
      funnel, archetypes, statusArchetypes, physicalStages,
      catalogPlaybooks, overrides, rules, behaviors, ladders, triggers,
    ] = await Promise.all([
      supabase.from('funnels').select('id,context_tags').eq('id', funnelId).maybeSingle(),
      supabase.from('stage_archetypes').select('id,code,default_playbook_code,context_tags').eq('is_active', true),
      supabase.from('status_archetypes').select('id,code').eq('is_active', true),
      supabase.from('funnel_stages').select('funnel_id,stage_id,stage_archetype_id,purpose,context_tags').eq('funnel_id', funnelId).eq('stage_id', stageId).maybeSingle(),
      supabase.from('stage_playbooks').select('code,archetype_id,status_archetype_id,kind,goal,success_criteria,failure_criteria,default_ladder_code,typical_behavior_codes,identity').eq('is_active', true),
      supabase.from('playbook_overrides').select('scope_type,scope_id,layer,payload').eq('is_active', true),
      supabase.from('ia_rules').select('code,kind,scope,text,meta').eq('is_active', true),
      supabase.from('lead_behaviors').select('code,label,default_reaction,next_step,applicable_context_tags,applicable_statuses').eq('is_active', true),
      supabase.from('followup_ladders').select('code,name,description,steps').eq('is_active', true),
      supabase.from('handoff_triggers').select('code,priority,label,stage,condition,action').eq('is_active', true),
    ]);

    const physical = physicalStages.data;
    const archetype = physical?.stage_archetype_id
      ? archetypes.data?.find((a: any) => a.id === physical.stage_archetype_id)
      : null;
    const statusArch = statusArchetypes.data?.find((s: any) => s.code === dealStatus);

    const funnelTags: string[] = Array.isArray(funnel.data?.context_tags) ? funnel.data.context_tags : [];
    const stageTags: string[] = Array.isArray(physical?.context_tags) ? physical.context_tags : [];
    const archTags: string[] = Array.isArray(archetype?.context_tags) ? archetype.context_tags : [];
    const contextTags = uniq([...funnelTags, ...stageTags, ...archTags]);

    const archetypePb = archetype?.default_playbook_code
      ? catalogPlaybooks.data?.find((p: any) => p.code === archetype.default_playbook_code)
      : null;

    let identity = mergeIdentity(DEFAULT_IDENTITY, archetypePb ? parseIdentity(archetypePb.identity) : null);
    let goal = archetypePb?.goal ?? '';
    let successCriteria: string[] = archetypePb?.success_criteria ?? [];
    let failureCriteria: string[] = archetypePb?.failure_criteria ?? [];
    let expectedCodes: string[] = archetypePb?.typical_behavior_codes ?? [];
    const ladderCode = archetypePb?.default_ladder_code ?? null;

    identity = mergeIdentity(identity, parseIdentity(physical?.purpose));

    const stageScopeId = `${funnelId}::${stageId}`;
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

    let statusOverlayCode: string | undefined;
    if (dealStatus !== 'open' && statusArch) {
      const overlayPb = catalogPlaybooks.data?.find((p: any) =>
        p.kind === 'overlay' && p.status_archetype_id === statusArch.id);
      if (overlayPb) {
        statusOverlayCode = overlayPb.code;
        identity = mergeIdentity(identity, parseIdentity(overlayPb.identity));
        if (overlayPb.goal) goal = overlayPb.goal;
        if (overlayPb.success_criteria?.length) successCriteria = uniq([...successCriteria, ...overlayPb.success_criteria]);
        if (overlayPb.failure_criteria?.length) failureCriteria = uniq([...failureCriteria, ...overlayPb.failure_criteria]);
        expectedCodes = uniq([...expectedCodes, ...(overlayPb.typical_behavior_codes ?? [])]);
      }
    }

    const explicit = expectedCodes
      .map(c => behaviors.data?.find((b: any) => b.code === c))
      .filter(Boolean);
    const matched = (behaviors.data ?? []).filter((b: any) => {
      const tags: string[] = Array.isArray(b.applicable_context_tags) && b.applicable_context_tags.length
        ? b.applicable_context_tags : ['*'];
      const sts: string[] = Array.isArray(b.applicable_statuses) && b.applicable_statuses.length
        ? b.applicable_statuses : ['open'];
      return intersects(tags, contextTags) && sts.includes(dealStatus);
    });
    const expectedBehaviors = uniq([
      ...explicit,
      ...matched.filter((m: any) => !explicit.some((e: any) => e?.code === m.code)),
    ]);

    const applicableRules = (rules.data ?? []).filter(
      (r: any) => r.scope === 'universal' || r.scope === stageId);

    const followUpLadder = ladderCode
      ? ladders.data?.find((l: any) => l.code === ladderCode) ?? null
      : null;
    const handoffTriggers = (triggers.data ?? []).filter(
      (t: any) => t.stage === '*' || t.stage === stageId);

    const effectivePlaybook = {
      identity, goal, successCriteria, failureCriteria,
      expectedBehaviors, applicableRules, followUpLadder, handoffTriggers,
      provenance: {
        archetypeCode: archetype?.code,
        statusOverlayCode,
        overrideIds,
        contextTags,
        dealStatus,
      },
    };

    let systemPrompt: string | undefined;
    if (renderPromptFlag) {
      const list = (xs: any[]) => xs.length ? xs.map(x => `  - ${x.text ?? x.label ?? ''}`).join('\n') : '  (nenhuma)';
      const dos = applicableRules.filter((r: any) => r.kind === 'do');
      const donts = applicableRules.filter((r: any) => r.kind === 'dont');
      const asks = applicableRules.filter((r: any) => r.kind === 'ask');
      const noasks = applicableRules.filter((r: any) => r.kind === 'noask');
      const lbs = expectedBehaviors.length
        ? expectedBehaviors.map((b: any) =>
            `  · [${b.code}] ${b.label}\n      reação: ${b.default_reaction}\n      próximo: ${b.next_step}`).join('\n')
        : '  (nenhum LB aplicável)';
      systemPrompt = `# IDENTIDADE
Persona: ${identity.persona}
Tom: ${identity.tone}
Missão: ${identity.mission}
${identity.identityNotes ? `Notas: ${identity.identityNotes}\n` : ''}
# OBJETIVO
${goal || '(não definido)'}

# SUCESSO
${successCriteria.length ? successCriteria.map(s => `  ✓ ${s}`).join('\n') : '  (nenhum)'}

# FALHA
${failureCriteria.length ? failureCriteria.map(s => `  ✗ ${s}`).join('\n') : '  (nenhum)'}

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

# CONTEXTO
arquétipo: ${archetype?.code ?? '(nenhum)'} | overlay: ${statusOverlayCode ?? '(nenhum)'}
context tags: ${contextTags.join(', ') || '(nenhum)'}
status: ${dealStatus}
overrides: ${overrideIds.join(' | ') || '(nenhum)'}`;
    }

    return new Response(JSON.stringify({ effectivePlaybook, systemPrompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compose-playbook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
