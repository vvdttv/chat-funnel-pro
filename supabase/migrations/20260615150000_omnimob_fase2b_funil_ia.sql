-- ============================================================
-- OMNIMOB — Fase 2B: Funil da IA (etapas 1–5) + Pré-qualificação
-- ============================================================
-- Cria: flag is_ai_funnel; tabela stage_qualification_criteria;
-- coluna suggested_stage_transition na fila; RPC M2M
-- move_deal_stage_internal (sem auth.uid()); arquétipos das etapas 1–5;
-- e o funil da IA MCMV (10 etapas estruturadas, autonomy suggest_only).
--
-- Org de produção alvo do seed do funil: 11111111-1111-1111-1111-111111111111
-- (Minha Casa Minha Vida). Idempotente — ON CONFLICT DO NOTHING.
-- Aplicar via psql no container supabase-db.
-- ============================================================

-- ========== 1) Flag do funil operado pela IA ==========
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS is_ai_funnel boolean NOT NULL DEFAULT false;

-- Garante no máximo um funil-IA por organização (resolução de lead novo
-- no webhook precisa ser determinística).
CREATE UNIQUE INDEX IF NOT EXISTS funnels_one_ai_per_org
  ON public.funnels (organization_id)
  WHERE is_ai_funnel;

-- ========== 2) Critérios de pré-qualificação por etapa ==========
CREATE TABLE IF NOT EXISTS public.stage_qualification_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id text NOT NULL,
  stage_id text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  criterion_type text NOT NULL DEFAULT 'boolean',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_hint text NOT NULL DEFAULT '',
  is_required boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sqc_type_chk CHECK (criterion_type IN ('boolean','threshold','enum','text')),
  CONSTRAINT sqc_org_funnel_stage_key_uniq UNIQUE (organization_id, funnel_id, stage_id, key)
);

CREATE INDEX IF NOT EXISTS idx_sqc_org_funnel_stage
  ON public.stage_qualification_criteria (organization_id, funnel_id, stage_id);

ALTER TABLE public.stage_qualification_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem criterios da org"   ON public.stage_qualification_criteria;
DROP POLICY IF EXISTS "Admins criam criterios"          ON public.stage_qualification_criteria;
DROP POLICY IF EXISTS "Admins atualizam criterios"      ON public.stage_qualification_criteria;
DROP POLICY IF EXISTS "Admins excluem criterios"        ON public.stage_qualification_criteria;

CREATE POLICY "Membros veem criterios da org"
  ON public.stage_qualification_criteria FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam criterios"
  ON public.stage_qualification_criteria FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins atualizam criterios"
  ON public.stage_qualification_criteria FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins excluem criterios"
  ON public.stage_qualification_criteria FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

DROP TRIGGER IF EXISTS trg_sqc_updated ON public.stage_qualification_criteria;
CREATE TRIGGER trg_sqc_updated BEFORE UPDATE ON public.stage_qualification_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 3) Transição sugerida na fila de resposta ==========
-- A IA grava aqui {from_stage_id,to_stage_id,reason,qualified,collected}.
-- Em suggest_only o admin aprova junto da resposta; não move sozinho.
ALTER TABLE public.ai_response_queue
  ADD COLUMN IF NOT EXISTS suggested_stage_transition jsonb;

-- ========== 4) RPC M2M de transição de etapa (sem auth.uid()) ==========
-- Espelha move_deal_stage() porém valida a org pelo próprio deal e recebe
-- o ator como parâmetro (worker = NULL/'system'). Só service_role executa.
-- p_actor_id fica registrado no status_reason p/ rastreabilidade (a auditoria
-- rica vive em ia_decision_logs, gravado pelo ia-respond-to-lead).
CREATE OR REPLACE FUNCTION public.move_deal_stage_internal(
  p_deal_id text,
  p_new_stage_id text,
  p_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS TABLE (
  deal_id text,
  from_stage_id text,
  to_stage_id text,
  moved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_deal record;
  v_now timestamptz := now();
BEGIN
  -- Trava a linha do deal. A org é a do próprio deal (sem current_org_id()).
  -- NOWAIT: se o deal estiver bloqueado (ex.: corretor editando no painel),
  -- falha imediato em vez de segurar a conexão do worker; o chamador reagenda.
  BEGIN
    SELECT id, funnel_id, stage_id, status, organization_id
      INTO v_locked_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'deal_bloqueado_por_outra_transacao';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_nao_encontrado';
  END IF;

  IF v_locked_deal.organization_id IS NULL THEN
    RAISE EXCEPTION 'deal_sem_organizacao';
  END IF;

  -- No-op se já está na etapa (evita evento duplicado).
  IF v_locked_deal.stage_id = p_new_stage_id THEN
    deal_id := v_locked_deal.id;
    from_stage_id := v_locked_deal.stage_id;
    to_stage_id := p_new_stage_id;
    moved_at := v_now;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atualiza o deal (trigger record_deal_stage_event registra o evento).
  UPDATE public.deals
     SET stage_id = p_new_stage_id,
         updated_at = v_now,
         status_reason = COALESCE(
           p_reason,
           CASE WHEN p_actor_id IS NOT NULL THEN 'transição IA (ator ' || p_actor_id::text || ')' END,
           status_reason
         )
   WHERE id = p_deal_id;

  deal_id := v_locked_deal.id;
  from_stage_id := v_locked_deal.stage_id;
  to_stage_id := p_new_stage_id;
  moved_at := v_now;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.move_deal_stage_internal(text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_deal_stage_internal(text, text, text, uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.move_deal_stage_internal(text, text, text, uuid) TO service_role;

-- ========== 5) Arquétipos das etapas 1–5 (catálogo global) ==========
-- Códigos reaproveitam a convenção do seed estático (E0–E4b) mapeados às
-- etapas 1–5 do plano. default_playbook_code casa com stage_playbooks.code
-- semeado por seed-ia-behavior (copy MCMV).
INSERT INTO public.stage_archetypes (code, name, purpose, context_tags, default_playbook_code, position)
VALUES
  ('E0', 'Novo lead',            'Primeiro contato: responder rápido, confirmar canal e capturar intenção sem espantar.', '["novo-lead","mcmv"]'::jsonb,       'E0', 1),
  ('E1', 'Em atendimento (IA)',  'Pré-qualificação consultiva: renda, interesse real, região, restrição declarada.',       '["pre-qualificacao","mcmv"]'::jsonb, 'E1', 2),
  ('E2', 'Coleta de dados',      'Receber a documentação completa e validável, com follow-up ativo.',                      '["coleta","mcmv"]'::jsonb,           'E2', 3),
  ('E3', 'Enviado para análise', 'Documentação completa validada e enviada ao correspondente; aguardar aceite.',           '["analise","mcmv"]'::jsonb,          'E3', 4),
  ('E4a','Aguardando devolutiva','Análise em curso: status honesto, cadência previsível, mantém o lead quente.',           '["devolutiva","mcmv"]'::jsonb,       'E4a', 5)
ON CONFLICT (code) DO NOTHING;

-- ========== 6) Funil da IA — MCMV (10 etapas estruturadas) ==========
-- Etapas 1–5 operam nesta fase; 6–10 ficam estruturadas (vazias) até Fase 3.
-- Seed só na org de produção MCMV. Idempotente.
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_funnel_id text := 'fun-ia-mcmv';
  v_arch_e0  uuid;
  v_arch_e1  uuid;
  v_arch_e2  uuid;
  v_arch_e3  uuid;
  v_arch_e4a uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'Org % inexistente — pulando seed do funil IA.', v_org;
    RETURN;
  END IF;

  -- Resolve os arquétipos das etapas 1–5 (semeados no passo 5). Falha ruidosa
  -- se algum não existir, em vez de inserir stage_archetype_id NULL silencioso.
  SELECT id INTO v_arch_e0  FROM public.stage_archetypes WHERE code = 'E0';
  SELECT id INTO v_arch_e1  FROM public.stage_archetypes WHERE code = 'E1';
  SELECT id INTO v_arch_e2  FROM public.stage_archetypes WHERE code = 'E2';
  SELECT id INTO v_arch_e3  FROM public.stage_archetypes WHERE code = 'E3';
  SELECT id INTO v_arch_e4a FROM public.stage_archetypes WHERE code = 'E4a';
  IF v_arch_e0 IS NULL OR v_arch_e1 IS NULL OR v_arch_e2 IS NULL
     OR v_arch_e3 IS NULL OR v_arch_e4a IS NULL THEN
    RAISE EXCEPTION 'seed de stage_archetypes incompleto (E0..E4a) — abortando funil IA';
  END IF;

  -- 6.1 Funil (stages no JSONB). Upsert da flag is_ai_funnel para corrigir
  -- um funil pré-existente que tenha ficado com a flag false.
  INSERT INTO public.funnels (id, name, description, icon, color, position, is_ai_funnel, organization_id, context_tags, stages)
  VALUES (
    v_funnel_id,
    'Funil da IA — MCMV',
    'Funil operado pela IA para vendas MCMV (etapas 1–5 ativas; 6–10 estruturadas).',
    'Bot',
    'hsl(var(--primary))',
    1,
    true,
    v_org,
    '["mcmv","venda","ia"]'::jsonb,
    '[
      {"id":"ia-novo-lead","name":"Novo lead","probability":10,"maxDaysInStage":1,"touchpoints":[]},
      {"id":"ia-atendimento","name":"Em atendimento pela IA","probability":20,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"ia-coleta","name":"Coleta de dados","probability":35,"maxDaysInStage":5,"touchpoints":[]},
      {"id":"ia-analise","name":"Enviado para análise","probability":50,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"ia-devolutiva","name":"Aguardando devolutiva","probability":60,"maxDaysInStage":7,"touchpoints":[]},
      {"id":"ia-aprovado-aguardando","name":"Crédito aprovado – aguardando agendamento","probability":70,"maxDaysInStage":2,"touchpoints":[]},
      {"id":"ia-agendamento","name":"Crédito aprovado – agendamento em andamento","probability":75,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"ia-transferido","name":"Transferido p/ corretor – agendamento realizado","probability":85,"maxDaysInStage":2,"touchpoints":[]},
      {"id":"ia-troca-voz","name":"Troca de voz","probability":65,"maxDaysInStage":2,"touchpoints":[]},
      {"id":"ia-reprovado","name":"Crédito não aprovado","probability":5,"maxDaysInStage":1,"touchpoints":[]}
    ]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET is_ai_funnel = true,
        updated_at = now();

  -- 6.2 funnel_stages (1–5 vinculadas a arquétipo; todas suggest_only).
  -- Upsert do arquétipo para corrigir re-runs que tenham gravado NULL.
  INSERT INTO public.funnel_stages
    (organization_id, funnel_id, stage_id, position, stage_archetype_id, context_tags, purpose, ai_autonomy_mode)
  VALUES
    (v_org, v_funnel_id, 'ia-novo-lead',            1, v_arch_e0,  '["novo-lead","mcmv"]'::jsonb,       'Primeiro contato com o lead.',                 'suggest_only'),
    (v_org, v_funnel_id, 'ia-atendimento',          2, v_arch_e1,  '["pre-qualificacao","mcmv"]'::jsonb, 'Pré-qualificação consultiva.',                 'suggest_only'),
    (v_org, v_funnel_id, 'ia-coleta',               3, v_arch_e2,  '["coleta","mcmv"]'::jsonb,           'Coleta de documentação.',                      'suggest_only'),
    (v_org, v_funnel_id, 'ia-analise',              4, v_arch_e3,  '["analise","mcmv"]'::jsonb,          'Enviado ao correspondente.',                   'suggest_only'),
    (v_org, v_funnel_id, 'ia-devolutiva',           5, v_arch_e4a, '["devolutiva","mcmv"]'::jsonb,       'Aguardando devolutiva do correspondente.',     'suggest_only'),
    (v_org, v_funnel_id, 'ia-aprovado-aguardando',  6, NULL, '["fase3","mcmv"]'::jsonb, 'Estruturada — ativa na Fase 3.', 'suggest_only'),
    (v_org, v_funnel_id, 'ia-agendamento',          7, NULL, '["fase3","mcmv"]'::jsonb, 'Estruturada — ativa na Fase 3.', 'suggest_only'),
    (v_org, v_funnel_id, 'ia-transferido',          8, NULL, '["fase3","mcmv"]'::jsonb, 'Estruturada — ativa na Fase 3.', 'suggest_only'),
    (v_org, v_funnel_id, 'ia-troca-voz',            9, NULL, '["fase3","mcmv"]'::jsonb, 'Estruturada — ativa na Fase 3.', 'suggest_only'),
    (v_org, v_funnel_id, 'ia-reprovado',           10, NULL, '["fase4","mcmv"]'::jsonb, 'Estruturada — ativa na Fase 4.', 'suggest_only')
  ON CONFLICT (funnel_id, stage_id) DO UPDATE
    SET stage_archetype_id = EXCLUDED.stage_archetype_id,
        position = EXCLUDED.position,
        ai_autonomy_mode = EXCLUDED.ai_autonomy_mode,
        updated_at = now()
    WHERE public.funnel_stages.stage_archetype_id IS DISTINCT FROM EXCLUDED.stage_archetype_id;

  -- 6.3 Critérios de pré-qualificação da etapa 2 (ia-atendimento) — MCMV
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, config, question_hint, is_required, position)
  VALUES
    (v_org, v_funnel_id, 'ia-atendimento', 'renda_compativel', 'Renda compatível com a faixa MCMV', 'boolean', '{}'::jsonb,
     'Confirmar de forma consultiva se a renda familiar se enquadra na faixa do MCMV.', true, 1),
    (v_org, v_funnel_id, 'ia-atendimento', 'interesse_real', 'Interesse real confirmado', 'boolean', '{}'::jsonb,
     'O lead demonstra intenção concreta de comprar, não só curiosidade.', true, 2),
    (v_org, v_funnel_id, 'ia-atendimento', 'regiao_atendida', 'Região atendida', 'boolean', '{}'::jsonb,
     'O lead busca imóvel em região coberta pela imobiliária.', true, 3),
    (v_org, v_funnel_id, 'ia-atendimento', 'sem_restricao_impeditiva', 'Sem restrição impeditiva declarada', 'boolean', '{}'::jsonb,
     'Não há, na fala do lead, restrição que impeça a análise de crédito (ex.: declarada explicitamente).', false, 4)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;
END $$;
