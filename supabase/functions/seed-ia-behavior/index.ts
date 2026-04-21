// Seed idempotente da camada comportamental da IA para a organização do usuário.
// Aceita os arrays do iaBehavior.ts (regras, comportamentos, escadas, gatilhos,
// playbooks) e faz upsert por (organization_id, code) em cada tabela.
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

    // Cliente com o JWT do usuário só para descobrir quem ele é
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Cliente admin para escrever (RLS exigiria policies que bypassam — mais
    // simples: validar org/role aqui e usar service role).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr || !profile?.organization_id) {
      return json({ error: "Organização não encontrada para o usuário" }, 403);
    }
    const orgId = profile.organization_id as string;

    // Confirma admin da organização
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", orgId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "Apenas admin pode semear" }, 403);

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
        identity: {},
      }));
      const { error, count } = await upsertOrSkip(admin, "stage_playbooks", rows, onConflict, overwrite);
      if (error) return json({ error: `stage_playbooks: ${error.message}` }, 500);
      result.playbooks = count ?? rows.length;
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
  // Sem overwrite: ignoreDuplicates evita sobrescrever existentes
  return await admin.from(table).upsert(rows, {
    onConflict,
    ignoreDuplicates: true,
    count: "exact",
  });
}
