-- =====================================================================
-- OmniMob — Fase J-2b-0b (backend): sync_funnel_stages
-- Fecha a divida arquitetural: etapas vivem em DOIS lugares
--   (1) funnels.stages (jsonb, lido pelo FRONT)
--   (2) funnel_stages  (tabela fisica, lida pelo MOTOR: triggers, metricas,
--       kanban, papeis da 0a, trava 1.4b por position)
-- Hoje NADA sincroniza os dois (o useFunnels so grava o jsonb). Esta RPC
-- reconcilia as duas representacoes numa transacao, preservando role/
-- stage_archetype_id/ai_*/n1n2n3, com PROTECAO de papeis criticos (decisao 2)
-- e ATRIBUICAO de papel por etapa (decisao 1).
-- ATOMICA + idempotente. Catalogo de papeis e helper de validacao tambem aqui.
-- =====================================================================
BEGIN;

-- 1) Catalogo de papeis: quais sao criticos (a automacao quebra sem eles).
--    Tabela pequena, seed fixo, customizavel no futuro. RLS leitura p/ membros.
CREATE TABLE IF NOT EXISTS public.stage_roles (
  role        text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  is_critical boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0
);

INSERT INTO public.stage_roles (role, label, description, is_critical, position) VALUES
  ('analise_credito',     'Análise de crédito',      'Entrada nesta etapa cria a análise no correspondente bancário (funil de vendas IA).', true, 1),
  ('analise_garantia',    'Análise de garantia',     'Entrada nesta etapa cria a análise de garantia locatícia.', true, 2),
  ('aprovado_aguardando', 'Aprovado — aguardando',   'Aprovação dispara o agendamento (cria appointment + kickoff).', true, 3),
  ('transferido',         'Transferido ao corretor', 'Etapa para onde o deal vai após o agendamento confirmado.', true, 4),
  ('corretor_inicial',    'Etapa inicial do corretor','Etapa onde o card nasce no funil do corretor ao ser transferido.', true, 5),
  ('vistoria_entrada',    'Vistoria de entrada',     'Marco da vistoria de entrada (operada pelo administrativo).', false, 6),
  ('contrato',            'Contrato em elaboração',  'Marco de elaboração do contrato de locação.', false, 7),
  ('troca_voz',           'Troca de voz',            'Etapa de troca para atendimento humano.', false, 8)
ON CONFLICT (role) DO NOTHING;

ALTER TABLE public.stage_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omni_stage_roles_select ON public.stage_roles;
CREATE POLICY omni_stage_roles_select ON public.stage_roles FOR SELECT TO authenticated USING (true);

-- 2) RPC de sincronizacao. Recebe a lista COMPLETA de etapas do funil (na ordem
--    desejada) e reconcilia funnels.stages + funnel_stages numa transacao.
--    Payload por etapa (jsonb): { id, name, probability, maxDaysInStage,
--    touchpoints, playbookCode, playbookOverride, role, stage_archetype_id }.
--    - id ausente/novo => etapa nova (gera stage-<uuid> se nao vier id).
--    - etapas que sumiram do payload => DELETADAS de funnel_stages.
--    - position = ordem no array (0-based), igual nas duas representacoes.
--    PROTECAO: nao deixa remover a ULTIMA etapa de um papel CRITICO que ja
--    existia no funil (decisao 2). Bloqueia papel duplicado no mesmo funil.
CREATE OR REPLACE FUNCTION public.sync_funnel_stages(
  p_funnel_id text,
  p_stages jsonb)
  RETURNS TABLE(out_stage_id text, out_position integer, out_role text, out_action text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_is_admin boolean;
  v_elem jsonb;
  v_idx int := 0;
  v_sid text;
  v_role text;
  v_arch uuid;
  v_new_stages jsonb := '[]'::jsonb;
  v_incoming_ids text[] := ARRAY[]::text[];
  v_dup_role text;
  v_lost_role text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  v_is_admin := public.is_org_admin() OR public.is_superadmin(auth.uid());
  IF NOT v_is_admin THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF jsonb_typeof(p_stages) <> 'array' THEN RAISE EXCEPTION 'payload_invalido: stages deve ser array'; END IF;
  IF jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'funil_sem_etapas: um funil precisa de ao menos 1 etapa'; END IF;

  -- Serializa edicoes concorrentes do mesmo funil.
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_syncfunnel_' || p_funnel_id));

  -- Confirma que o funil pertence a org.
  IF NOT EXISTS (SELECT 1 FROM public.funnels f WHERE f.id = p_funnel_id AND f.organization_id = v_org) THEN
    RAISE EXCEPTION 'funil_nao_encontrado';
  END IF;

  -- 2a) Validacao previa: papel duplicado no payload?
  SELECT lower(e->>'role') INTO v_dup_role
  FROM jsonb_array_elements(p_stages) e
  WHERE NULLIF(e->>'role','') IS NOT NULL
  GROUP BY lower(e->>'role')
  HAVING count(*) > 1
  LIMIT 1;
  IF v_dup_role IS NOT NULL THEN
    RAISE EXCEPTION 'papel_duplicado: o papel "%" foi atribuido a mais de uma etapa do mesmo funil', v_dup_role;
  END IF;

  -- 2b) Protecao decisao 2: papel CRITICO que existia no funil e sumiu do payload.
  SELECT fs.role INTO v_lost_role
  FROM public.funnel_stages fs
  JOIN public.stage_roles sr ON sr.role = fs.role AND sr.is_critical
  WHERE fs.funnel_id = p_funnel_id AND fs.organization_id = v_org
    AND fs.role IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_stages) e
      WHERE lower(e->>'role') = fs.role)
  LIMIT 1;
  IF v_lost_role IS NOT NULL THEN
    RAISE EXCEPTION 'papel_critico_removido: a etapa com papel "%" e necessaria para as automacoes; reatribua o papel a outra etapa antes de remover', v_lost_role;
  END IF;

  -- 3) Loop pela lista desejada: upsert em funnel_stages + monta o jsonb novo.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_sid := NULLIF(v_elem->>'id','');
    IF v_sid IS NULL THEN
      v_sid := 'stage-' || replace(gen_random_uuid()::text, '-', '');
    END IF;
    v_role := NULLIF(lower(v_elem->>'role'),'');
    -- valida papel contra o catalogo (se informado)
    IF v_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stage_roles sr WHERE sr.role = v_role) THEN
      RAISE EXCEPTION 'papel_desconhecido: "%" nao esta no catalogo stage_roles', v_role;
    END IF;
    v_arch := NULLIF(v_elem->>'stage_archetype_id','')::uuid;

    v_incoming_ids := array_append(v_incoming_ids, v_sid);

    -- upsert na tabela do motor; preserva colunas operacionais existentes.
    INSERT INTO public.funnel_stages
      (organization_id, funnel_id, stage_id, position, role, stage_archetype_id, purpose)
    VALUES
      (v_org, p_funnel_id, v_sid, v_idx, v_role, v_arch,
       COALESCE(v_elem->>'name',''))
    ON CONFLICT (funnel_id, stage_id) DO UPDATE
      SET position = EXCLUDED.position,
          role = EXCLUDED.role,
          stage_archetype_id = COALESCE(EXCLUDED.stage_archetype_id, public.funnel_stages.stage_archetype_id),
          purpose = COALESCE(NULLIF(EXCLUDED.purpose,''), public.funnel_stages.purpose),
          updated_at = now();

    -- monta a etapa para o jsonb do front (preserva campos do payload).
    v_new_stages := v_new_stages || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', v_sid,
        'name', COALESCE(v_elem->>'name',''),
        'probability', COALESCE((v_elem->>'probability')::int, 50),
        'maxDaysInStage', COALESCE((v_elem->>'maxDaysInStage')::int, 5),
        'touchpoints', COALESCE(v_elem->'touchpoints', '[]'::jsonb),
        'playbookCode', v_elem->>'playbookCode',
        'playbookOverride', v_elem->'playbookOverride',
        'role', v_role
      )));

    v_idx := v_idx + 1;
  END LOOP;

  -- 4) Remove de funnel_stages as etapas que sairam do payload.
  DELETE FROM public.funnel_stages fs
  WHERE fs.funnel_id = p_funnel_id AND fs.organization_id = v_org
    AND fs.stage_id <> ALL (v_incoming_ids);

  -- 5) Atualiza o jsonb do front numa tacada.
  UPDATE public.funnels
     SET stages = v_new_stages, updated_at = now()
   WHERE id = p_funnel_id AND organization_id = v_org;

  -- 6) Retorna o estado final reconciliado.
  RETURN QUERY
    SELECT fs.stage_id, fs.position, fs.role,
           CASE WHEN fs.stage_id = ANY (v_incoming_ids) THEN 'kept_or_added' ELSE 'unknown' END
    FROM public.funnel_stages fs
    WHERE fs.funnel_id = p_funnel_id AND fs.organization_id = v_org
    ORDER BY fs.position;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_funnel_stages(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_funnel_stages(text,jsonb) TO authenticated, service_role;

COMMIT;
