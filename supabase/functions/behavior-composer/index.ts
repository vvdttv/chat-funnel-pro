/**
 * Edge `behavior-composer` — orquestrador do Configurador Conversacional.
 *
 * Substitui visualmente a complexidade da aba "Fluxos IA": o usuário descreve
 * em pt-BR uma intenção comportamental, esta função gera perguntas customizadas,
 * monta um plano materializável (LBs + regras + skills + overrides) e persiste
 * tudo nas tabelas existentes — mesma fonte da verdade do modo avançado.
 *
 * 4 modos despachados por `body.mode`:
 *   - generate_questions: 2-5 perguntas em pt-BR + duplicateAlerts
 *   - compose_plan:       artefatos completos + humanSummary + warnings
 *   - persist_plan:       upsert idempotente + snapshot prévio + ia_config_sessions
 *   - revert_session:     desativa artefatos e restaura snapshots
 *
 * Padrões: CORS idêntico a compose-playbook/seed-ia-behavior, JWT validado,
 * organization_id derivado de profiles (nunca do cliente), service role só
 * dentro da edge. Modelo padrão `google/gemini-3-flash-preview` para perguntas
 * (rápido), `google/gemini-2.5-pro` para compose_plan (raciocínio composicional).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChatCompletion, getAIGatewayConfig } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_QUESTIONS = "google/gemini-3-flash-preview";
const MODEL_PLAN = "google/gemini-2.5-pro";

// ============================================================================
// TIPOS
// ============================================================================

type Polarity = "do" | "dont" | "noask" | "ask";
type Scope = "universal" | "funnel" | "stage" | "multi";

interface FixedAnswers {
  scope: Scope;
  scopeIds?: string[];
  trigger: "always" | "lead_action" | "message_moment";
  triggerDescription?: string;
  polarity: Polarity;
  kindHint?: "single_action" | "flow" | "forbidden_action" | "forbidden_question";
}

interface CustomAnswer { questionId: string; answer: unknown }

interface OrgSnapshot {
  leadBehaviors: Array<{ code: string; label: string; category: string }>;
  iaRules: Array<{ code: string; kind: string; scope: string; text: string }>;
  iaSkills: Array<{ code: string; name: string; scopeType: string; scopeId: string | null }>;
  funnels: Array<{ id: string; name: string; stages: unknown }>;
  stageArchetypes: Array<{ code: string; name: string }>;
  statusArchetypes: Array<{ code: string; name: string }>;
}

// ============================================================================
// HELPERS GERAIS
// ============================================================================

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Strip de ```json fences que o Gemini às vezes embrulha. */
const stripJsonFences = (raw: string): string => {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return s;
};

/** Tenta parsear JSON tolerando fences. Não lança — retorna null em falha. */
const tolerantParse = <T>(raw: string): T | null => {
  try { return JSON.parse(stripJsonFences(raw)) as T; }
  catch { return null; }
};

/** Slug curto (a-z0-9-) a partir de texto livre. */
const slugify = (text: string, maxLen = 40): string =>
  text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);

/** Sufixo aleatório curto (4 chars uppercase alphanumeric, sem ambíguos). */
const randomSuffix = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
};

/** Codes únicos com prefixo + slug + sufixo aleatório. */
const makeCode = (prefix: string, hint: string): string =>
  `${prefix}-${slugify(hint).toUpperCase().replace(/-/g, "_") || "CUSTOM"}-${randomSuffix()}`;

// ============================================================================
// AUTH + ORG
// ============================================================================

interface AuthCtx {
  userId: string;
  orgId: string;
  isAdmin: boolean;
  admin: ReturnType<typeof createClient>;
  user: ReturnType<typeof createClient>;
}

const authenticate = async (req: Request): Promise<AuthCtx | Response> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Sem autorização" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Token inválido" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.organization_id) return json({ error: "Sem organização" }, 403);

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("organization_id", profile.organization_id);
  const isAdmin = (roles ?? []).some((r) => (r as { role: string }).role === "admin");

  return {
    userId: userData.user.id,
    orgId: profile.organization_id as string,
    isAdmin,
    admin,
    user: userClient,
  };
};

// ============================================================================
// SNAPSHOT DO CATÁLOGO DA ORG
// ============================================================================

const loadOrgSnapshot = async (admin: AuthCtx["admin"], orgId: string): Promise<OrgSnapshot> => {
  const [lbs, rules, skills, funnels, sArch, stArch] = await Promise.all([
    admin.from("lead_behaviors").select("code,label,category").eq("organization_id", orgId).eq("is_active", true).limit(200),
    admin.from("ia_rules").select("code,kind,scope,text").eq("organization_id", orgId).eq("is_active", true).limit(300),
    admin.from("ia_skills").select("code,name,scope_type,scope_id").eq("organization_id", orgId).eq("is_active", true).limit(200),
    admin.from("funnels").select("id,name,stages").eq("organization_id", orgId).limit(50),
    admin.from("stage_archetypes").select("code,name").eq("is_active", true).limit(50),
    admin.from("status_archetypes").select("code,name").eq("is_active", true).limit(20),
  ]);
  return {
    leadBehaviors: (lbs.data ?? []) as OrgSnapshot["leadBehaviors"],
    iaRules: (rules.data ?? []) as OrgSnapshot["iaRules"],
    iaSkills: ((skills.data ?? []) as Array<{ code: string; name: string; scope_type: string; scope_id: string | null }>).map((s) => ({
      code: s.code, name: s.name, scopeType: s.scope_type, scopeId: s.scope_id,
    })),
    funnels: (funnels.data ?? []) as OrgSnapshot["funnels"],
    stageArchetypes: (sArch.data ?? []) as OrgSnapshot["stageArchetypes"],
    statusArchetypes: (stArch.data ?? []) as OrgSnapshot["statusArchetypes"],
  };
};

// ============================================================================
// CHAMADA AO LOVABLE AI GATEWAY (com retry de JSON inválido)
// ============================================================================

interface GatewayCallArgs {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

const callGateway = async ({ model, systemPrompt, userPrompt }: GatewayCallArgs): Promise<string | Response> => {
  const aiConfig = getAIGatewayConfig();
  if (!aiConfig.apiKey) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

  // MODEL_QUESTIONS (flash-preview) → fast; MODEL_PLAN (pro) → smart.
  const tier: "fast" | "smart" = model === MODEL_PLAN ? "smart" : "fast";

  const resp = await aiChatCompletion({
    config: aiConfig,
    tier,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
  });

  if (resp.status === 429) {
    return json({ error: "O sistema está com muita demanda agora. Tenta de novo em alguns minutos." }, 429);
  }
  if (resp.status === 402) {
    return json({ error: "Os créditos da IA da sua organização acabaram. Avise o admin." }, 402);
  }
  if (!resp.ok) {
    const t = await resp.text();
    console.error("[behavior-composer] Gateway error", resp.status, t);
    return json({ error: "Erro ao consultar a IA. Tenta de novo." }, 502);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return json({ error: "Resposta da IA em formato inesperado." }, 502);
  }
  return content;
};

// ============================================================================
// MODE: generate_questions
// ============================================================================

const SYSTEM_PROMPT_QUESTIONS = `Você é o arquiteto comportamental da IA de um CRM imobiliário.

Sua função NÃO é falar com o lead final. Sua função é ajudar o USUÁRIO DO CRM (corretor, gestor, admin) a configurar como a IA vai se comportar quando, em runtime, conversar com leads reais.

O usuário descreveu em português uma intenção comportamental. Sua tarefa: gerar entre 2 e 5 perguntas customizadas em pt-BR coloquial, calibradas para a intenção.

Regras estritas:
- NUNCA use jargão técnico (LB, override, arquétipo, payload, gatilho, escopo, runtime, skill, playbook). Fale em "comportamento", "regra", "ação", "anexo", "tom", "momento da conversa", "quando".
- Sempre que possível, use chips de opção em vez de campo livre — facilita resposta rápida em mobile.
- Cubra os eixos relevantes para essa intenção quando fizer sentido: tom (formal/neutro/caloroso), formato (texto/áudio/imagem), exceções, busca na web, anexo/imagem, notificação a quem.
- NÃO faça pergunta cuja resposta já está clara nas respostas anteriores.
- Detecte duplicatas: se a intenção parece equivalente a algo que já existe na lista do catálogo, sinalize em duplicateAlerts.
- Termine pelo "fechamento": uma pergunta de confirmação ou de tom, nunca uma aberta solta no final.
- Output APENAS JSON válido conforme o schema. Sem texto antes ou depois. Sem fences.

Schema de saída:
{
  "questions": [
    { "id": "q1", "type": "chips" | "open" | "multi_select" | "conditional", "text": "string", "options": ["opt1","opt2"]?, "conditionOn": "q1=valor"? }
  ],
  "clarifyingSummary": "frase curta resumindo o que entendi",
  "duplicateAlerts": [
    { "type": "lead_behavior" | "ia_rule" | "ia_skill", "existingCode": "...", "existingLabel": "...", "suggestion": "reuse" | "create_new" }
  ]
}`;

const handleGenerateQuestions = async (
  ctx: AuthCtx,
  body: {
    userMessage: string;
    fixedAnswers: FixedAnswers;
    previousAnswers?: CustomAnswer[];
  },
): Promise<Response> => {
  if (!body.userMessage || body.userMessage.trim().length < 5) {
    return json({ error: "Descreva a intenção em pelo menos uma frase." }, 400);
  }
  const snapshot = await loadOrgSnapshot(ctx.admin, ctx.orgId);

  const userPrompt = `INTENÇÃO ORIGINAL DO USUÁRIO:
"${body.userMessage}"

RESPOSTAS FIXAS JÁ DADAS:
- Abrangência: ${body.fixedAnswers.scope}${body.fixedAnswers.scopeIds?.length ? ` (alvos: ${body.fixedAnswers.scopeIds.join(", ")})` : ""}
- Quando disparar: ${body.fixedAnswers.trigger}${body.fixedAnswers.triggerDescription ? ` — "${body.fixedAnswers.triggerDescription}"` : ""}
- Polaridade: ${body.fixedAnswers.polarity}${body.fixedAnswers.kindHint ? ` (${body.fixedAnswers.kindHint})` : ""}

RESPOSTAS CUSTOMIZADAS JÁ DADAS:
${(body.previousAnswers ?? []).map((a) => `- ${a.questionId}: ${JSON.stringify(a.answer)}`).join("\n") || "(nenhuma ainda)"}

CATÁLOGO ATUAL DA ORGANIZAÇÃO (para detectar duplicatas):
- Comportamentos de lead já catalogados (${snapshot.leadBehaviors.length}):
${snapshot.leadBehaviors.slice(0, 40).map((b) => `  · ${b.code}: ${b.label} [${b.category}]`).join("\n")}
- Regras ativas (${snapshot.iaRules.length}):
${snapshot.iaRules.slice(0, 40).map((r) => `  · ${r.code} [${r.kind}/${r.scope}]: ${r.text.slice(0, 80)}`).join("\n")}
- Habilidades ativas (${snapshot.iaSkills.length}):
${snapshot.iaSkills.slice(0, 30).map((s) => `  · ${s.code}: ${s.name}`).join("\n")}
- Funis: ${snapshot.funnels.map((f) => f.name).join(", ")}

Devolva o JSON conforme o schema.`;

  let raw = await callGateway({ model: MODEL_QUESTIONS, systemPrompt: SYSTEM_PROMPT_QUESTIONS, userPrompt });
  if (raw instanceof Response) return raw;

  let parsed = tolerantParse<{ questions?: unknown[]; clarifyingSummary?: string; duplicateAlerts?: unknown[] }>(raw);
  if (!parsed || !Array.isArray(parsed.questions)) {
    // Retry uma vez com instrução reforçada
    raw = await callGateway({
      model: MODEL_QUESTIONS,
      systemPrompt: SYSTEM_PROMPT_QUESTIONS,
      userPrompt: userPrompt + "\n\nIMPORTANTE: Sua resposta anterior não foi JSON válido. Devolva APENAS o JSON conforme o schema, sem fences, sem texto adicional.",
    });
    if (raw instanceof Response) return raw;
    parsed = tolerantParse(raw);
  }

  if (!parsed || !Array.isArray(parsed.questions)) {
    return json({ error: "Não consegui processar essa parte. Pode reescrever de outro jeito?" }, 502);
  }

  return json({
    questions: parsed.questions,
    clarifyingSummary: parsed.clarifyingSummary ?? "",
    duplicateAlerts: parsed.duplicateAlerts ?? [],
  });
};

// ============================================================================
// MODE: compose_plan
// ============================================================================

const SYSTEM_PROMPT_PLAN = `Você é o arquiteto comportamental da IA de um CRM. Recebe uma intenção em pt-BR e respostas estruturadas. Sua tarefa: montar um PLANO MATERIALIZÁVEL que vai virar registros nas tabelas do sistema.

Regras críticas:
- REUSO É PREFERÍVEL A CRIAR. Se já existe LB/regra/skill que cobre semanticamente, marque "reuseOf" com o code existente e NÃO duplique.
- Decisão regra-vs-skill:
  · Uma única reação simples (frase fixa, nunca-faça) → regra DO/DONT/NOASK/ASK basta.
  · Sequência de ações com possível ramificação → skill com múltiplos nós.
  · "Perguntar uma coisa específica" → regra ASK.
  · "Nunca perguntar X" → regra NOASK.
- Override (playbookOverrides) SÓ quando abrangência é "funnel" ou "stage". Para "universal", use regras universais.
- Detectar conflitos: se a regra/skill nova contradiz uma IA-DONT-* ou IA-DO-* universal existente, adicione ao array warnings em frase clara em pt-BR.
- humanSummary: 2 a 4 frases em português claro, mencionando o que vai ser criado e onde vai valer. Um corretor entende de primeira leitura.

Capacidades novas que skills podem usar (em config dos nós send_message):
- useWebSearch: boolean — pesquisa online antes de gerar resposta
- generateImage: boolean + imagePromptTemplate: string — gera imagem na hora
- attachStatic: { storagePath: string } — anexa arquivo fixo
- whatsappAttachmentType: "none" | "image" | "document" | "audio"

Tipos válidos de nó (use APENAS estes, nada além):
trigger | send_message | wait | collect | set_tone | handoff | apply_ladder | call_skill | condition

A árvore SEMPRE começa com "trigger" como raiz (parentId: null). Demais nós encadeiam via parentId.

Output APENAS JSON válido conforme o schema. Sem texto antes ou depois. Sem fences.

Schema:
{
  "humanSummary": "string",
  "artifacts": {
    "leadBehaviors": [{ "label": "...", "category": "objection|positive|neutral|evasive|negative", "typicalStages": ["*"], "applicableContextTags": ["*"], "applicableStatuses": ["open"], "detectionHints": ["..."], "defaultReaction": "...", "nextStep": "...", "reuseOf": null | "LB-EXISTENTE" }],
    "iaRules": [{ "kind": "do|dont|ask|noask", "scope": "universal|E0|E1|E2|E3|E4a|E4b", "text": "...", "meta": "..." | null, "reuseOf": null | "IA-EXISTENTE" }],
    "skills": [{
      "name": "...", "description": "...",
      "scopeType": "universal|stage|context", "scopeId": null | "string",
      "guardrailRules": ["IA-DONT-014"],
      "nodes": [
        { "tempId": "n1", "kind": "trigger", "parentTempId": null, "config": { "behaviorCodes": ["LB-..."] } },
        { "tempId": "n2", "kind": "send_message", "parentTempId": "n1", "config": { "text": "...", "tone": "neutro", "useWebSearch": false, "generateImage": false } }
      ],
      "reuseOf": null | "SK-EXISTENTE"
    }],
    "playbookOverrides": [{ "scopeType": "funnel|stage", "scopeId": "string", "layer": "funnel_override|stage_override", "payload": {} }]
  },
  "warnings": ["frase em pt-BR descrevendo conflito potencial"]
}`;

interface PlanArtifacts {
  leadBehaviors?: Array<{
    label: string; category: string; typicalStages?: string[];
    applicableContextTags?: string[]; applicableStatuses?: string[];
    detectionHints?: string[]; defaultReaction?: string; nextStep?: string;
    reuseOf?: string | null;
  }>;
  iaRules?: Array<{
    kind: string; scope: string; text: string; meta?: string | null;
    reuseOf?: string | null;
  }>;
  skills?: Array<{
    name: string; description?: string; scopeType?: string; scopeId?: string | null;
    guardrailRules?: string[];
    nodes: Array<{
      tempId: string; kind: string; parentTempId: string | null;
      config?: Record<string, unknown>; branchLabel?: string | null;
    }>;
    reuseOf?: string | null;
  }>;
  playbookOverrides?: Array<{
    scopeType: string; scopeId: string; layer: string; payload: Record<string, unknown>;
  }>;
}

interface ComposedPlan {
  humanSummary: string;
  artifacts: PlanArtifacts;
  warnings: string[];
}

const handleComposePlan = async (
  ctx: AuthCtx,
  body: {
    userMessage: string;
    fixedAnswers: FixedAnswers;
    customAnswers: CustomAnswer[];
  },
): Promise<Response> => {
  const snapshot = await loadOrgSnapshot(ctx.admin, ctx.orgId);

  const userPrompt = `INTENÇÃO ORIGINAL:
"${body.userMessage}"

RESPOSTAS FIXAS:
${JSON.stringify(body.fixedAnswers, null, 2)}

RESPOSTAS CUSTOMIZADAS:
${JSON.stringify(body.customAnswers, null, 2)}

CATÁLOGO ATUAL (para reuso):
- LBs: ${snapshot.leadBehaviors.map((b) => `${b.code}=${b.label}`).join(" | ")}
- Regras: ${snapshot.iaRules.map((r) => `${r.code}[${r.kind}/${r.scope}]`).join(" | ")}
- Skills: ${snapshot.iaSkills.map((s) => `${s.code}=${s.name}`).join(" | ")}
- Funis disponíveis: ${snapshot.funnels.map((f) => `${f.id}:${f.name}`).join(" | ")}

Monte o plano. Devolva APENAS o JSON conforme o schema.`;

  let raw = await callGateway({ model: MODEL_PLAN, systemPrompt: SYSTEM_PROMPT_PLAN, userPrompt });
  if (raw instanceof Response) return raw;

  let parsed = tolerantParse<ComposedPlan>(raw);
  if (!parsed || !parsed.artifacts) {
    raw = await callGateway({
      model: MODEL_PLAN,
      systemPrompt: SYSTEM_PROMPT_PLAN,
      userPrompt: userPrompt + "\n\nSua resposta anterior não foi JSON válido. Devolva APENAS o JSON.",
    });
    if (raw instanceof Response) return raw;
    parsed = tolerantParse<ComposedPlan>(raw);
  }

  if (!parsed || !parsed.artifacts) {
    return json({ error: "Não consegui montar o plano. Tenta reformular sua intenção." }, 502);
  }

  // Pós-processamento: gerar codes e atribuir layout (position_x/y) aos nós.
  const arts = parsed.artifacts;

  // LBs novos ganham code com prefixo LB-CUSTOM-
  arts.leadBehaviors = (arts.leadBehaviors ?? []).map((b) => ({
    ...b,
    typicalStages: b.typicalStages ?? ["*"],
    applicableContextTags: b.applicableContextTags ?? ["*"],
    applicableStatuses: b.applicableStatuses ?? ["open"],
    detectionHints: b.detectionHints ?? [],
    defaultReaction: b.defaultReaction ?? "",
    nextStep: b.nextStep ?? "",
    code: b.reuseOf ?? makeCode("LB-CUSTOM", b.label),
  } as PlanArtifacts["leadBehaviors"][number] & { code: string }));

  // Regras novas ganham code IA-{KIND}-CUSTOM-...
  arts.iaRules = (arts.iaRules ?? []).map((r) => ({
    ...r,
    code: r.reuseOf ?? makeCode(`IA-${r.kind.toUpperCase()}-CUSTOM`, r.text.slice(0, 30)),
  } as PlanArtifacts["iaRules"][number] & { code: string }));

  // Skills novas: code SK-CUSTOM-..., nodes com layout em cascata vertical
  arts.skills = (arts.skills ?? []).map((s) => {
    const skillCode = s.reuseOf ?? makeCode("SK-CUSTOM", s.name);
    // Layout: BFS a partir da raiz (trigger), filhos com Y +180, X+250 por irmão
    const childrenMap = new Map<string | null, typeof s.nodes>();
    for (const n of s.nodes) {
      const arr = childrenMap.get(n.parentTempId) ?? [];
      arr.push(n);
      childrenMap.set(n.parentTempId, arr);
    }
    const positions = new Map<string, { x: number; y: number }>();
    const layout = (parentTempId: string | null, depth: number, xOffset: number) => {
      const kids = childrenMap.get(parentTempId) ?? [];
      kids.forEach((k, i) => {
        positions.set(k.tempId, { x: xOffset + i * 280, y: depth * 180 });
        layout(k.tempId, depth + 1, xOffset + i * 280);
      });
    };
    layout(null, 0, 100);

    return {
      ...s,
      scopeType: s.scopeType ?? "universal",
      scopeId: s.scopeId ?? null,
      description: s.description ?? "",
      guardrailRules: s.guardrailRules ?? [],
      code: skillCode,
      nodes: s.nodes.map((n) => ({
        ...n,
        positionX: positions.get(n.tempId)?.x ?? 100,
        positionY: positions.get(n.tempId)?.y ?? 100,
      })),
    };
  });

  return json({
    humanSummary: parsed.humanSummary ?? "",
    artifacts: arts,
    warnings: parsed.warnings ?? [],
  });
};

// ============================================================================
// MODE: persist_plan
// ============================================================================

interface PersistBody {
  userMessage: string;
  fixedAnswers: FixedAnswers;
  customQuestions: unknown[];
  customAnswers: CustomAnswer[];
  generatedPlan: ComposedPlan;
}

const handlePersistPlan = async (ctx: AuthCtx, body: PersistBody): Promise<Response> => {
  if (!ctx.isAdmin) {
    return json({ error: "Apenas admins podem salvar configurações da IA." }, 403);
  }
  const arts = body.generatedPlan?.artifacts ?? {};
  const createdIds: {
    leadBehaviors: string[];
    iaRules: string[];
    iaSkills: string[];
    iaSkillNodes: string[];
    iaSkillGuardrails: string[];
    playbookOverrides: string[];
    snapshots: string[];
  } = { leadBehaviors: [], iaRules: [], iaSkills: [], iaSkillNodes: [], iaSkillGuardrails: [], playbookOverrides: [], snapshots: [] };

  try {
    // 1) Snapshot prévio dos overrides afetados
    for (const ov of arts.playbookOverrides ?? []) {
      const { data: existing } = await ctx.admin
        .from("playbook_overrides")
        .select("id,payload,is_active")
        .eq("organization_id", ctx.orgId)
        .eq("scope_type", ov.scopeType)
        .eq("scope_id", ov.scopeId)
        .eq("layer", ov.layer)
        .maybeSingle();
      if (existing) {
        const { data: snap } = await ctx.admin.from("playbook_override_snapshots").insert([{
          organization_id: ctx.orgId,
          override_id: existing.id,
          scope_type: ov.scopeType,
          scope_id: ov.scopeId,
          layer: ov.layer,
          payload: existing.payload,
          is_active: existing.is_active,
          action: "upsert",
          note: "Snapshot pré-Configurador Conversacional",
          created_by: ctx.userId,
        }]).select("id").maybeSingle();
        if (snap?.id) createdIds.snapshots.push(snap.id);
      }
    }

    // 2) LBs (upsert por code)
    for (const lb of arts.leadBehaviors ?? []) {
      const code = (lb as PlanArtifacts["leadBehaviors"][number] & { code: string }).code;
      if (lb.reuseOf) continue; // não duplica
      const { data, error } = await ctx.admin.from("lead_behaviors").upsert([{
        organization_id: ctx.orgId,
        code,
        label: lb.label,
        category: lb.category,
        typical_stages: lb.typicalStages ?? ["*"],
        applicable_context_tags: lb.applicableContextTags ?? ["*"],
        applicable_statuses: lb.applicableStatuses ?? ["open"],
        detection_hints: lb.detectionHints ?? [],
        default_reaction: lb.defaultReaction ?? "",
        next_step: lb.nextStep ?? "",
        is_active: true,
      }], { onConflict: "organization_id,code" }).select("id").maybeSingle();
      if (error) throw new Error(`lead_behaviors: ${error.message}`);
      if (data?.id) createdIds.leadBehaviors.push(data.id);
    }

    // 3) Regras (upsert por code)
    for (const r of arts.iaRules ?? []) {
      const code = (r as PlanArtifacts["iaRules"][number] & { code: string }).code;
      if (r.reuseOf) continue;
      const { data, error } = await ctx.admin.from("ia_rules").upsert([{
        organization_id: ctx.orgId,
        code,
        kind: r.kind,
        scope: r.scope,
        text: r.text,
        meta: r.meta ?? null,
        is_active: true,
      }], { onConflict: "organization_id,code" }).select("id").maybeSingle();
      if (error) throw new Error(`ia_rules: ${error.message}`);
      if (data?.id) createdIds.iaRules.push(data.id);
    }

    // 4) Skills + nodes + guardrails
    for (const s of arts.skills ?? []) {
      if (s.reuseOf) continue;
      const skillCode = (s as PlanArtifacts["skills"][number] & { code: string }).code;
      const { data: skillRow, error: skillErr } = await ctx.admin.from("ia_skills").upsert([{
        organization_id: ctx.orgId,
        code: skillCode,
        name: s.name,
        description: s.description ?? "",
        scope_type: s.scopeType ?? "universal",
        scope_id: s.scopeId ?? null,
        is_active: true,
        is_auto_suggested: false,
        position: 0,
      }], { onConflict: "organization_id,code" }).select("id").maybeSingle();
      if (skillErr || !skillRow?.id) throw new Error(`ia_skills: ${skillErr?.message ?? "sem id"}`);
      const skillId = skillRow.id;
      createdIds.iaSkills.push(skillId);

      // Limpa nós antigos da skill (caso seja reuso por code)
      await ctx.admin.from("ia_skill_nodes").delete().eq("skill_id", skillId);
      await ctx.admin.from("ia_skill_guardrails").delete().eq("skill_id", skillId);

      // Insert nodes em duas passadas (1ª: cria sem parent_node_id; 2ª: liga)
      const tempToReal = new Map<string, string>();
      const enriched = s.nodes as Array<{ tempId: string; kind: string; parentTempId: string | null; config?: Record<string, unknown>; branchLabel?: string | null; positionX?: number; positionY?: number }>;
      for (let i = 0; i < enriched.length; i++) {
        const n = enriched[i];
        const { data: nodeRow, error: nodeErr } = await ctx.admin.from("ia_skill_nodes").insert([{
          skill_id: skillId,
          organization_id: ctx.orgId,
          kind: n.kind,
          parent_node_id: null,
          branch_label: n.branchLabel ?? null,
          position_x: n.positionX ?? 100,
          position_y: n.positionY ?? 100,
          config: n.config ?? {},
          position: i,
        }]).select("id").maybeSingle();
        if (nodeErr || !nodeRow?.id) throw new Error(`ia_skill_nodes: ${nodeErr?.message ?? "sem id"}`);
        tempToReal.set(n.tempId, nodeRow.id);
        createdIds.iaSkillNodes.push(nodeRow.id);
      }
      for (const n of enriched) {
        if (!n.parentTempId) continue;
        const realParent = tempToReal.get(n.parentTempId);
        const realSelf = tempToReal.get(n.tempId);
        if (!realParent || !realSelf) continue;
        await ctx.admin.from("ia_skill_nodes").update({ parent_node_id: realParent }).eq("id", realSelf);
      }

      for (const ruleCode of s.guardrailRules ?? []) {
        const { data: gr } = await ctx.admin.from("ia_skill_guardrails").insert([{
          skill_id: skillId, organization_id: ctx.orgId, rule_code: ruleCode,
        }]).select("id").maybeSingle();
        if (gr?.id) createdIds.iaSkillGuardrails.push(gr.id);
      }
    }

    // 5) Overrides
    for (const ov of arts.playbookOverrides ?? []) {
      const { data: existing } = await ctx.admin
        .from("playbook_overrides")
        .select("id")
        .eq("organization_id", ctx.orgId)
        .eq("scope_type", ov.scopeType)
        .eq("scope_id", ov.scopeId)
        .eq("layer", ov.layer)
        .maybeSingle();
      if (existing?.id) {
        await ctx.admin.from("playbook_overrides").update({
          payload: ov.payload, is_active: true,
        }).eq("id", existing.id);
        createdIds.playbookOverrides.push(existing.id);
      } else {
        const { data: ins, error: insErr } = await ctx.admin.from("playbook_overrides").insert([{
          organization_id: ctx.orgId,
          scope_type: ov.scopeType,
          scope_id: ov.scopeId,
          layer: ov.layer,
          payload: ov.payload,
          is_active: true,
        }]).select("id").maybeSingle();
        if (insErr) throw new Error(`playbook_overrides: ${insErr.message}`);
        if (ins?.id) createdIds.playbookOverrides.push(ins.id);
      }
    }

    // 6) Sessão
    const { data: sess, error: sessErr } = await ctx.admin.from("ia_config_sessions").insert([{
      organization_id: ctx.orgId,
      user_id: ctx.userId,
      original_message: body.userMessage,
      fixed_answers: body.fixedAnswers,
      custom_questions: body.customQuestions,
      custom_answers: body.customAnswers,
      generated_plan: body.generatedPlan,
      human_summary: body.generatedPlan.humanSummary ?? "",
      created_artifacts: createdIds,
      status: "approved",
      approved_at: new Date().toISOString(),
    }]).select("id").maybeSingle();
    if (sessErr || !sess?.id) throw new Error(`ia_config_sessions: ${sessErr?.message ?? "sem id"}`);

    // 7) Atualiza prefs do usuário
    const tone = body.customAnswers.find((a) => /tom/i.test(a.questionId))?.answer as string | undefined;
    const fmt = body.customAnswers.find((a) => /formato/i.test(a.questionId))?.answer as string | undefined;
    await ctx.admin.from("ia_config_prefs").upsert([{
      user_id: ctx.userId,
      organization_id: ctx.orgId,
      last_scope: body.fixedAnswers.scope,
      last_scope_ids: body.fixedAnswers.scopeIds ?? [],
      last_trigger: body.fixedAnswers.trigger,
      last_polarity: body.fixedAnswers.polarity,
      last_tone: tone ?? null,
      last_format: fmt ?? null,
    }], { onConflict: "user_id" });

    return json({ sessionId: sess.id, createdIds });
  } catch (e) {
    console.error("[behavior-composer] persist failed:", e);
    return json({ error: e instanceof Error ? e.message : "Falha ao salvar configuração" }, 500);
  }
};

// ============================================================================
// MODE: revert_session
// ============================================================================

const handleRevertSession = async (
  ctx: AuthCtx,
  body: { sessionId: string },
): Promise<Response> => {
  if (!ctx.isAdmin) {
    return json({ error: "Apenas admins podem desfazer configurações." }, 403);
  }
  const { data: sess, error: sessErr } = await ctx.admin
    .from("ia_config_sessions")
    .select("id,organization_id,status,created_artifacts")
    .eq("id", body.sessionId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (sessErr || !sess) return json({ error: "Sessão não encontrada" }, 404);
  if (sess.status === "reverted") return json({ ok: true, alreadyReverted: true });

  const ids = sess.created_artifacts as {
    leadBehaviors?: string[]; iaRules?: string[]; iaSkills?: string[];
    iaSkillNodes?: string[]; iaSkillGuardrails?: string[];
    playbookOverrides?: string[]; snapshots?: string[];
  };

  if (ids.leadBehaviors?.length) {
    await ctx.admin.from("lead_behaviors").update({ is_active: false }).in("id", ids.leadBehaviors);
  }
  if (ids.iaRules?.length) {
    await ctx.admin.from("ia_rules").update({ is_active: false }).in("id", ids.iaRules);
  }
  if (ids.iaSkills?.length) {
    await ctx.admin.from("ia_skills").update({ is_active: false }).in("id", ids.iaSkills);
  }
  if (ids.playbookOverrides?.length) {
    await ctx.admin.from("playbook_overrides").update({ is_active: false }).in("id", ids.playbookOverrides);
  }

  // Restaurar snapshots de overrides (se houver)
  if (ids.snapshots?.length) {
    const { data: snaps } = await ctx.admin
      .from("playbook_override_snapshots")
      .select("override_id,payload,is_active")
      .in("id", ids.snapshots);
    for (const s of snaps ?? []) {
      if (!s.override_id) continue;
      await ctx.admin.from("playbook_overrides").update({
        payload: s.payload, is_active: s.is_active,
      }).eq("id", s.override_id);
    }
  }

  await ctx.admin.from("ia_config_sessions").update({
    status: "reverted",
    reverted_at: new Date().toISOString(),
    reverted_by: ctx.userId,
  }).eq("id", body.sessionId);

  return json({ ok: true, reverted: true });
};

// ============================================================================
// SERVE
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ctx = await authenticate(req);
    if (ctx instanceof Response) return ctx;

    const body = await req.json() as { mode: string; [k: string]: unknown };
    const mode = body.mode;

    switch (mode) {
      case "generate_questions":
        return await handleGenerateQuestions(ctx, body as never);
      case "compose_plan":
        return await handleComposePlan(ctx, body as never);
      case "persist_plan":
        return await handlePersistPlan(ctx, body as never);
      case "revert_session":
        return await handleRevertSession(ctx, body as never);
      default:
        return json({ error: `Modo desconhecido: ${mode}` }, 400);
    }
  } catch (e) {
    console.error("[behavior-composer] uncaught:", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
