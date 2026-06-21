-- ============================================================================
-- Fase J-1 — Módulo de Locação: fundação (§4.15)
-- Omnimob v3. Idempotente + ATÔMICA (BEGIN/COMMIT). NÃO bloqueia vendas.
-- ============================================================================
BEGIN;

-- ---- 1. Imóveis: padroniza operation + status de locação --------------------
ALTER TABLE public.properties
  ALTER COLUMN operation SET DEFAULT 'venda';
UPDATE public.properties SET operation = 'venda' WHERE operation IS NULL OR operation = '';

-- operation chk (idempotente: dropa e recria)
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_operation_chk;
ALTER TABLE public.properties ADD CONSTRAINT properties_operation_chk
  CHECK (operation IN ('venda','locacao','ambos'));

-- status chk: dropa QUALQUER constraint de status existente e recria com 'alugado'
DO $c$
DECLARE v_con text;
BEGIN
  FOR v_con IN
    SELECT conname FROM pg_constraint
     WHERE conrelid='public.properties'::regclass AND contype='c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.properties DROP CONSTRAINT ' || quote_ident(v_con);
  END LOOP;
  ALTER TABLE public.properties ADD CONSTRAINT properties_status_chk
    CHECK (status IN ('disponivel','reservado','vendido','alugado','inativo'));
END $c$;

-- Campos de locação ficam em metadata (rent_value, condo_fee, iptu, garantias
-- aceitas). Sem nova coluna — flexível e não-destrutivo. Documentado aqui:
--   metadata.rent_value (numeric), metadata.condo_fee, metadata.iptu,
--   metadata.accepted_guarantees (array: fiador|caucao|seguro_fianca|titulo_capitalizacao)

-- ---- 2. Funil de IA de LOCAÇÃO ----------------------------------------------
-- Espelha a jornada do funil de venda, mas com contexto de locação: a "análise
-- de crédito" vira "análise de garantia locatícia" (J-2). Reusa arquétipos E0-E8
-- (comportamento-base genérico) + segmento de locação (tom próprio).
-- NOTA: só pode haver 1 funil is_ai_funnel por org (índice funnels_one_ai_per_org).
-- Por isso o funil de locação NÃO é is_ai_funnel=true; ele é operado pela IA via
-- context_tags (a IA sabe que é locação pelo segmento), e o webhook resolve o
-- funil pela operação do número/canal (futuro). Por ora, fica pronto p/ uso.
DO $do$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_funnel text := 'fun-ia-locacao';
  r record;
  v_arch uuid;
BEGIN
  INSERT INTO public.funnels (id, name, description, icon, color, stages, position, organization_id, is_default, context_tags, is_ai_funnel, segment_code)
  VALUES (v_funnel, 'Funil da IA — Locação',
          'Funil operado pela IA para LOCAÇÃO. Análise de garantia locatícia em vez de crédito.',
          'KeyRound', 'hsl(var(--primary))', '[]'::jsonb, 4, v_org, false,
          '["locacao","ia","seg-locacao"]'::jsonb, false, 'locacao')
  ON CONFLICT (id) DO NOTHING;

  -- Etapas (espelham o funil de venda, com rótulos de locação). Reusa arquétipos
  -- E0..E8 pelo code (comportamento-base); a diferença de contexto vem do segmento.
  FOR r IN
    SELECT * FROM (VALUES
      ('loc-novo-lead',          1, 'E0', 'Primeiro contato do interessado em alugar.'),
      ('loc-atendimento',        2, 'E1', 'Pré-qualificação: perfil, renda, garantia disponível, região.'),
      ('loc-coleta',             3, 'E2', 'Coleta de documentação do locatário e da garantia.'),
      ('loc-analise-garantia',   4, 'E3', 'Enviado para análise de garantia locatícia (fiador/caução/seguro-fiança).'),
      ('loc-aguardando',         5, 'E4a','Aguardando aprovação da garantia.'),
      ('loc-aprovado-aguardando',6, 'E5', 'Garantia aprovada — aguardando agendamento de visita.'),
      ('loc-agendamento',        7, 'E6', 'Agendamento de visita em andamento.'),
      ('loc-transferido',        8, 'E7', 'Transferido ao corretor — visita agendada.'),
      ('loc-troca-voz',          9, 'E8', 'Cadência esgotada — transfere ao corretor.')
    ) AS t(stage_id, pos, arch_code, purpose)
  LOOP
    SELECT id INTO v_arch FROM public.stage_archetypes WHERE code = r.arch_code;
    INSERT INTO public.funnel_stages
      (organization_id, funnel_id, stage_id, position, stage_archetype_id, purpose, context_tags, ai_autonomy_mode)
    VALUES
      (v_org, v_funnel, r.stage_id, r.pos, v_arch, r.purpose, '["locacao"]'::jsonb, 'suggest_only')
    ON CONFLICT (funnel_id, stage_id) DO UPDATE
      SET stage_archetype_id = EXCLUDED.stage_archetype_id, purpose = EXCLUDED.purpose, updated_at = now();
  END LOOP;

  -- Reflete no array stages (jsonb) p/ a UI Kanban.
  UPDATE public.funnels f
     SET stages = (
       SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', fs.stage_id, 'name', split_part(fs.purpose,'.',1),
                'probability', fs.position*10, 'touchpoints', '[]'::jsonb, 'maxDaysInStage', 3)
              ORDER BY fs.position), '[]'::jsonb)
       FROM public.funnel_stages fs WHERE fs.funnel_id = v_funnel
     ), updated_at = now()
   WHERE f.id = v_funnel;

  RAISE NOTICE 'Funil de locação criado com 9 etapas';
END $do$;

-- ---- 3. Segmento de LOCAÇÃO (tom/vocabulário próprios) ----------------------
INSERT INTO public.segment_profiles (organization_id, code, name, income_range, tone, vocabulary, notes, context_tag, position)
VALUES (
  '11111111-1111-1111-1111-111111111111','locacao','Locação','Renda compatível com 3x o aluguel (regra usual)',
  'Ágil, prático e transparente. Locação tem decisão mais rápida que compra.',
  'Fala direta sobre aluguel, garantias (fiador/caução/seguro-fiança), prazo de contrato e vistoria.',
  'Foco em destravar a garantia e agilizar a assinatura; locatário quer mudar logo. Esclarecer custos (aluguel+condomínio+IPTU).',
  'seg-locacao', 5)
ON CONFLICT (organization_id, code) DO UPDATE
  SET name=EXCLUDED.name, tone=EXCLUDED.tone, vocabulary=EXCLUDED.vocabulary, notes=EXCLUDED.notes, updated_at=now();

COMMIT;
