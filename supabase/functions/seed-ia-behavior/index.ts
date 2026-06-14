// Seed idempotente da camada comportamental da IA para a organização do usuário.
//
// Aceita os arrays do iaBehavior.ts (regras, comportamentos com tags de contexto,
// escadas, gatilhos, playbooks, overlays de status) e faz upsert por
// (organization_id, code) em cada tabela. Os arquétipos globais (stage_archetypes
// e status_archetypes) NÃO são populados aqui — vivem como catálogo global,
// semeados por migration.
//
// Segurança: valida JWT, descobre organization_id via tabela profiles, ignora
// qualquer organization_id que vier do cliente. Apenas admins podem semear.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AnyRecord = Record<string, unknown>;

interface SeedPayload {
  rules?: Array<{ id: string; kind: string; scope: string; text: string; meta?: string }>;
  behaviors?: Array<{
    id: string; label: string; category: string;
    typicalStages: string[]; detectionHints: string[];
    defaultReaction: string; nextStep: string;
    /** Sprint 3 — tags de contexto onde o LB se aplica (independente do funil). */
    applicableContextTags?: string[];
    /** Sprint 3 — status do deal em que o LB é elegível. */
    applicableStatuses?: string[];
  }>;
  ladders?: Array<{
    id: string; name: string; description: string;
    steps: Array<{ afterHours: number; tone: string; sampleMessage: string }>;
  }>;
  triggers?: Array<{
    id: string; priority: string; label: string; stage: string;
    condition: string; action: string;
  }>;
  playbooks?: Array<{
    stageCode: string; goal: string;
    successCriteria: string[]; failureCriteria: string[];
    expectedBehaviorIds: string[]; followUpLadderId: string;
    handoffTriggerIds?: string[];
    /** Sprint 3 — código do arquétipo associado (lookup contra stage_archetypes). */
    archetypeCode?: string;
    /** Sprint 3 — kind: seed | overlay | funnel | stage. Default 'stage'. */
    kind?: 'seed' | 'overlay' | 'funnel' | 'stage';
    /** Sprint 3 — quando kind='overlay', código do status_archetype. */
    statusArchetypeCode?: 'open' | 'won' | 'lost';
    /** Sprint 3 — payload livre (regras adicionais/desativadas em overlays). */
    identity?: Record<string, unknown>;
  }>;
  /** Sprint 3 — overlays de status (won/lost) gravados como playbooks kind='overlay'. */
  statusOverlays?: Array<{
    code: string;
    statusCode: 'won' | 'lost';
    name: string;
    additions: Record<string, unknown>;
    disabledRuleIds?: string[];
    followUpLadderId?: string | null;
  }>;
  /** Sprint 32 — skills (gatilho LB → ações + guardrails) com nós em formato linearizado. */
  skills?: Array<{
    skill: {
      code: string;
      name: string;
      description: string;
      scopeType: 'universal' | 'stage' | 'context';
      scopeId: string | null;
      isActive: boolean;
      isAutoSuggested: boolean;
      position: number;
    };
    nodes: Array<{
      kind: string;
      branchLabel: string | null;
      positionX: number;
      positionY: number;
      position: number;
      config: Record<string, unknown>;
      /** Índice do nó-pai dentro do mesmo array (-1 = raiz). */
      parentIdx: number;
    }>;
    guardrailRuleCodes: string[];
  }>;
  /** Quando true, faz upsert sobrescrevendo. Default false: pula se code já existe. */
  overwrite?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || !profile?.organization_id) {
      return json({ error: "Organização não encontrada para o usuário" }, 403);
    }
    const orgId = profile.organization_id as string;

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", orgId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "Apenas admin pode semear" }, 403);

    // Pré-carrega arquétipos globais para resolver archetype_code → archetype_id.
    const { data: stageArchetypes } = await admin
      .from("stage_archetypes")
      .select("id, code");
    const stageArchByCode = new Map<string, string>(
      (stageArchetypes ?? []).map((a: AnyRecord) => [a.code as string, a.id as string]),
    );

    const { data: statusArchetypes } = await admin
      .from("status_archetypes")
      .select("id, code");
    const statusArchByCode = new Map<string, string>(
      (statusArchetypes ?? []).map((a: AnyRecord) => [a.code as string, a.id as string]),
    );

    const payload = (await req.json()) as SeedPayload;
    const overwrite = !!payload.overwrite;
    const onConflict = "organization_id,code";

    const result: Record<string, number> = {};

    if (payload.rules?.length) {
      const rows = payload.rules.map((r) => ({
        organization_id: orgId,
        code: r.id,
        kind: r.kind,
        scope: r.scope,
        text: r.text,
        meta: r.meta ?? null,
      }));
      const { error, count } = await upsertOrSkip(admin, "ia_rules", rows, onConflict, overwrite);
      if (error) return json({ error: `ia_rules: ${error.message}` }, 500);
      result.rules = count ?? rows.length;
    }

    if (payload.behaviors?.length) {
      const rows = payload.behaviors.map((b) => ({
        organization_id: orgId,
        code: b.id,
        label: b.label,
        category: b.category,
        typical_stages: b.typicalStages,
        detection_hints: b.detectionHints,
        default_reaction: b.defaultReaction,
        next_step: b.nextStep,
        // Sprint 3 — novos campos do motor composicional
        applicable_context_tags: b.applicableContextTags ?? [],
        applicable_statuses: b.applicableStatuses ?? ['open'],
      }));
      const { error, count } = await upsertOrSkip(admin, "lead_behaviors", rows, onConflict, overwrite);
      if (error) return json({ error: `lead_behaviors: ${error.message}` }, 500);
      result.behaviors = count ?? rows.length;
    }

    if (payload.ladders?.length) {
      const rows = payload.ladders.map((l) => ({
        organization_id: orgId,
        code: l.id,
        name: l.name,
        description: l.description,
        steps: l.steps,
      }));
      const { error, count } = await upsertOrSkip(admin, "followup_ladders", rows, onConflict, overwrite);
      if (error) return json({ error: `followup_ladders: ${error.message}` }, 500);
      result.ladders = count ?? rows.length;
    }

    if (payload.triggers?.length) {
      const rows = payload.triggers.map((t) => ({
        organization_id: orgId,
        code: t.id,
        priority: t.priority,
        label: t.label,
        stage: t.stage,
        condition: t.condition,
        action: t.action,
      }));
      const { error, count } = await upsertOrSkip(admin, "handoff_triggers", rows, onConflict, overwrite);
      if (error) return json({ error: `handoff_triggers: ${error.message}` }, 500);
      result.triggers = count ?? rows.length;
    }

    if (payload.playbooks?.length) {
      const rows = payload.playbooks.map((p) => ({
        organization_id: orgId,
        code: p.stageCode,
        name: p.stageCode,
        goal: p.goal,
        success_criteria: p.successCriteria,
        failure_criteria: p.failureCriteria,
        default_ladder_code: p.followUpLadderId,
        typical_behavior_codes: p.expectedBehaviorIds,
        identity: p.identity ?? {},
        // Sprint 3 — vínculo com arquétipos + camada do playbook
        archetype_id: p.archetypeCode ? stageArchByCode.get(p.archetypeCode) ?? null : null,
        status_archetype_id: p.statusArchetypeCode ? statusArchByCode.get(p.statusArchetypeCode) ?? null : null,
        kind: p.kind ?? 'stage',
      }));
      const { error, count } = await upsertOrSkip(admin, "stage_playbooks", rows, onConflict, overwrite);
      if (error) return json({ error: `stage_playbooks: ${error.message}` }, 500);
      result.playbooks = count ?? rows.length;
    }

    // Sprint 3 — overlays de status gravados como playbooks de kind='overlay'.
    if (payload.statusOverlays?.length) {
      const rows = payload.statusOverlays.map((o) => ({
        organization_id: orgId,
        code: o.code,
        name: o.name,
        goal: `Overlay aplicado quando deal.status = '${o.statusCode}'.`,
        success_criteria: [],
        failure_criteria: [],
        default_ladder_code: o.followUpLadderId ?? null,
        typical_behavior_codes: (o.additions?.expectedBehaviorIds as string[]) ?? [],
        identity: {
          additions: o.additions ?? {},
          disabledRuleIds: o.disabledRuleIds ?? [],
        } as Record<string, unknown>,
        archetype_id: null,
        status_archetype_id: statusArchByCode.get(o.statusCode) ?? null,
        kind: 'overlay',
      }));
      const { error, count } = await upsertOrSkip(admin, "stage_playbooks", rows, onConflict, overwrite);
      if (error) return json({ error: `stage_playbooks (overlays): ${error.message}` }, 500);
      result.statusOverlays = count ?? rows.length;
    }

    // Sprint 32 — skills + nodes + guardrails. Como skills não têm restrição
    // unique global por code (mantemos por org), pulamos quando já existe um
    // skill com (organization_id, code), salvo overwrite=true.
    if (payload.skills?.length) {
      let skillsInserted = 0;
      let nodesInserted = 0;
      let guardsInserted = 0;

      for (const sk of payload.skills) {
        // Verifica se já existe
        const { data: existing } = await admin
          .from("ia_skills")
          .select("id")
          .eq("organization_id", orgId)
          .eq("code", sk.skill.code)
          .maybeSingle();

        let skillId: string | null = existing?.id ?? null;

        if (existing && !overwrite) {
          continue; // pula skill já presente
        }

        if (existing && overwrite) {
          // Limpa nodes e guardrails antigos para reconstruir
          await admin.from("ia_skill_nodes").delete().eq("skill_id", existing.id);
          await admin.from("ia_skill_guardrails").delete().eq("skill_id", existing.id);
          await admin.from("ia_skills").update({
            name: sk.skill.name,
            description: sk.skill.description,
            scope_type: sk.skill.scopeType,
            scope_id: sk.skill.scopeId,
            is_active: sk.skill.isActive,
            is_auto_suggested: sk.skill.isAutoSuggested,
            position: sk.skill.position,
          }).eq("id", existing.id);
        } else {
          const { data: created, error: cErr } = await admin.from("ia_skills").insert([{
            organization_id: orgId,
            code: sk.skill.code,
            name: sk.skill.name,
            description: sk.skill.description,
            scope_type: sk.skill.scopeType,
            scope_id: sk.skill.scopeId,
            is_active: sk.skill.isActive,
            is_auto_suggested: sk.skill.isAutoSuggested,
            position: sk.skill.position,
          }]).select("id").single();
          if (cErr || !created) {
            return json({ error: `ia_skills (${sk.skill.code}): ${cErr?.message ?? 'sem id'}` }, 500);
          }
          skillId = created.id as string;
          skillsInserted += 1;
        }

        if (!skillId) continue;

        // Insere nodes em ordem; resolve parentIdx → uuid
        const idMap = new Map<number, string>();
        for (let i = 0; i < sk.nodes.length; i++) {
          const n = sk.nodes[i];
          const parentNodeId = n.parentIdx >= 0 ? (idMap.get(n.parentIdx) ?? null) : null;
          const { data: nodeRow, error: nErr } = await admin.from("ia_skill_nodes").insert([{
            skill_id: skillId,
            organization_id: orgId,
            kind: n.kind,
            parent_node_id: parentNodeId,
            branch_label: n.branchLabel,
            position_x: n.positionX,
            position_y: n.positionY,
            position: n.position,
            config: n.config,
          }]).select("id").single();
          if (nErr || !nodeRow) {
            return json({ error: `ia_skill_nodes (${sk.skill.code}#${i}): ${nErr?.message ?? 'sem id'}` }, 500);
          }
          idMap.set(i, nodeRow.id as string);
          nodesInserted += 1;
        }

        // Insere guardrails
        if (sk.guardrailRuleCodes.length > 0) {
          const grows = sk.guardrailRuleCodes.map(rc => ({
            skill_id: skillId, organization_id: orgId, rule_code: rc,
          }));
          const { error: gErr } = await admin.from("ia_skill_guardrails").insert(grows);
          if (gErr) return json({ error: `ia_skill_guardrails (${sk.skill.code}): ${gErr.message}` }, 500);
          guardsInserted += grows.length;
        }
      }

      result.skills = skillsInserted;
      result.skill_nodes = nodesInserted;
      result.skill_guardrails = guardsInserted;
    }

    return json({ ok: true, organization_id: orgId, inserted: result });
  } catch (e) {
    console.error("seed-ia-behavior error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function upsertOrSkip(
  admin: ReturnType<typeof createClient>,
  table: string,
  rows: AnyRecord[],
  onConflict: string,
  overwrite: boolean,
) {
  if (overwrite) {
    return await admin.from(table).upsert(rows, { onConflict, count: "exact" });
  }
  return await admin.from(table).upsert(rows, {
    onConflict,
    ignoreDuplicates: true,
    count: "exact",
  });
}
