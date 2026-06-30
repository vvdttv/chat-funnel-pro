-- =====================================================================
-- seed_demo.populate_deals() — Parte 2: 1450 deals
-- Distribui em 5 funis com curva temporal de 12 meses,
-- status mix (won/lost/open), stage events, status events,
-- tag assignments, secondary contacts.
-- =====================================================================

CREATE OR REPLACE FUNCTION seed_demo.populate_deals()
RETURNS TABLE(entity text, qty bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_qty bigint;
  v_funnel record;
  v_stages jsonb;
  v_total int := 1450;
  v_i int;
  v_created timestamptz;
  v_status text;
  v_stage_count int;
  v_stage_idx int;
  v_stage_obj jsonb;
  v_stage_id text;
  v_lost_reason text;
  v_funnel_choice int;
  v_funnel_id text;
  v_lead_name text;
  v_property_pick record;
  v_value numeric;
  v_first_names text[] := ARRAY[
    'Pedro','Mariana','João','Beatriz','Lucas','Camila','Rafael','Juliana','Tiago','Fernanda',
    'Felipe','Larissa','Gabriel','Patrícia','Henrique','Letícia','Bruno','Vanessa','Diego','Renata',
    'Eduardo','Aline','Marcos','Tatiana','André','Sabrina','Vitor','Karen','Caio','Natália',
    'Ricardo','Priscila','Daniel','Bianca','Leonardo','Carolina','Igor','Adriana','Murilo','Débora',
    'Alex','Cristiane','Sergio','Vivian','Otávio','Rafaela','Davi','Marcela','Yuri','Camile'
  ];
  v_last_names text[] := ARRAY[
    'Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves','Pereira','Lima','Gomes',
    'Costa','Ribeiro','Martins','Carvalho','Almeida','Lopes','Soares','Fernandes','Vieira','Barbosa',
    'Rocha','Dias','Nascimento','Andrade','Moreira','Cardoso','Teixeira','Cavalcanti','Correia','Mendes'
  ];
  v_lost_reasons text[] := ARRAY[
    'preco_alto','sem_renda','desistiu','negativado','outro_imovel',
    'sem_resposta','prazo_muito_longo','financiamento_negado','mudou_de_ideia','encontrou_em_outra'
  ];
BEGIN
  -- Desabilita triggers para controlar exatamente o que entra como demo.
  PERFORM set_config('session_replication_role', 'replica', true);

  -- ===== DEALS =====
  FOR v_i IN 1..v_total LOOP
    -- Curva temporal: 12 meses para trás, distribuído com pico em Mar/Jul/Out
    v_created := date_trunc('day', now())
      - ((random() * 365)::int || ' days')::interval
      - ((random() * 86400)::int || ' seconds')::interval;

    -- Status mix: 28% concluído (35% won / 65% lost), 22% em curso, 50% histórico
    v_status := CASE
      WHEN v_i % 100 < 10 THEN 'won'
      WHEN v_i % 100 < 28 THEN 'lost'
      ELSE 'open'
    END;

    -- Funil: 35% IA MCMV, 25% Corretor MCMV, 10% Nutrição, 20% IA Locação, 10% Corretor Locação
    v_funnel_choice := v_i % 100;
    v_funnel_id := CASE
      WHEN v_funnel_choice < 35 THEN 'fun-ia-mcmv'
      WHEN v_funnel_choice < 60 THEN 'fun-corretor-mcmv'
      WHEN v_funnel_choice < 70 THEN 'fun-nutricao-mcmv'
      WHEN v_funnel_choice < 90 THEN 'fun-ia-locacao'
      ELSE 'fun-corretor-locacao'
    END;

    -- Busca stages do funil
    SELECT stages INTO v_stages
    FROM public.funnels
    WHERE id = v_funnel_id AND organization_id = v_org;

    v_stage_count := jsonb_array_length(v_stages);

    -- Etapa atual: won/lost terminam na última etapa relevante; open distribui ao longo
    IF v_status = 'won' THEN
      v_stage_idx := v_stage_count - 1;
    ELSIF v_status = 'lost' THEN
      v_stage_idx := (random() * (v_stage_count - 2))::int;
    ELSE
      -- open: distribuído com maior densidade nas etapas intermediárias
      v_stage_idx := (random() * (v_stage_count - 2))::int;
    END IF;

    v_stage_obj := v_stages -> v_stage_idx;
    v_stage_id := v_stage_obj ->> 'id';

    -- Nome do lead
    v_lead_name := v_first_names[1 + ((v_i * 13) % array_length(v_first_names, 1))]
                   || ' ' ||
                   v_last_names[1 + ((v_i * 17) % array_length(v_last_names, 1))];

    -- Pega um imóvel aleatório da nossa demo (apenas para locação ou venda conforme funil)
    SELECT id, code, title, price INTO v_property_pick
    FROM public.properties
    WHERE organization_id = v_org AND is_demo = true
      AND (
        (v_funnel_id LIKE '%locacao%' AND operation IN ('locacao','ambos'))
        OR (v_funnel_id NOT LIKE '%locacao%' AND operation IN ('venda','ambos'))
      )
    ORDER BY ((v_i * 7919 + extract(epoch from now())::int) % 10000)
    LIMIT 1;

    v_value := COALESCE(v_property_pick.price, 0);

    -- INSERT deal
    INSERT INTO public.deals (
      id, funnel_id, stage_id, lead_id, lead_name, property, property_code, value,
      status, status_changed_at, status_reason, won_date,
      organization_id, created_at, updated_at,
      secondary_contacts, is_demo
    ) VALUES (
      'deal-demo-' || lpad(v_i::text, 5, '0'),
      v_funnel_id, v_stage_id,
      'lead-demo-' || lpad(v_i::text, 5, '0'),
      v_lead_name,
      COALESCE(v_property_pick.title, 'Imóvel não atribuído'),
      COALESCE(v_property_pick.code, ''),
      v_value,
      v_status,
      v_created + ((random() * 30 + 1)::int || ' days')::interval,
      CASE WHEN v_status = 'lost' THEN v_lost_reasons[1 + (v_i % array_length(v_lost_reasons, 1))] ELSE NULL END,
      CASE WHEN v_status = 'won' THEN v_created + ((random() * 60 + 7)::int || ' days')::interval ELSE NULL END,
      v_org,
      v_created,
      now() - ((random() * 30)::int || ' days')::interval,
      CASE
        WHEN v_i % 7 = 0 THEN jsonb_build_array(
          jsonb_build_object('name', 'Cônjuge ' || v_lead_name, 'role', 'conjuge', 'phone', '+5511' || lpad((90000000 + v_i)::text, 9, '0'))
        )
        ELSE '[]'::jsonb
      END,
      true
    );
  END LOOP;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'deals'; qty := v_qty; RETURN NEXT;

  -- ===== STAGE EVENTS =====
  -- Cada deal passou por todas as etapas até a atual.
  -- Para won/lost, gera trajetória completa do funil; para open, parcial.
  INSERT INTO public.deal_stage_events (deal_id, funnel_id, from_stage_id, to_stage_id, entered_at, organization_id, is_demo)
  SELECT
    d.id,
    d.funnel_id,
    CASE WHEN s.ord = 0 THEN NULL ELSE (f.stages -> (s.ord - 1)::int ->> 'id') END,
    f.stages -> s.ord ->> 'id',
    d.created_at + ((s.ord * 1.5 + random() * 2)::int || ' days')::interval,
    d.organization_id,
    true
  FROM public.deals d
  JOIN public.funnels f ON f.id = d.funnel_id
  CROSS JOIN LATERAL (
    SELECT generate_series(0,
      LEAST(
        jsonb_array_length(f.stages) - 1,
        COALESCE(
          (SELECT pos FROM jsonb_array_elements(f.stages) WITH ORDINALITY AS x(stage, pos) WHERE stage->>'id' = d.stage_id) - 1,
          0
        )
      )::int
    ) AS ord
  ) s
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'deal_stage_events'; qty := v_qty; RETURN NEXT;

  -- ===== STATUS EVENTS =====
  -- Para cada deal, um evento de criação (status open).
  INSERT INTO public.deal_status_events (organization_id, deal_id, from_status, to_status, reason, changed_at, is_demo)
  SELECT d.organization_id, d.id, NULL, 'open', NULL, d.created_at, true
  FROM public.deals d
  WHERE d.is_demo = true AND d.organization_id = v_org;

  -- E para won/lost, evento de transição.
  INSERT INTO public.deal_status_events (organization_id, deal_id, from_status, to_status, reason, lost_substage, changed_at, is_demo)
  SELECT
    d.organization_id, d.id, 'open', d.status, d.status_reason, NULL,
    COALESCE(d.won_date, d.status_changed_at), true
  FROM public.deals d
  WHERE d.is_demo = true AND d.organization_id = v_org AND d.status IN ('won','lost');
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'deal_status_events'; qty := v_qty; RETURN NEXT;

  -- ===== TAG ASSIGNMENTS =====
  -- ~2 tags por deal em média (3000 total): "Quente/Morno/Frio" + tag de comportamento
  INSERT INTO public.deal_tag_assignments (deal_id, tag_id, assigned_at, status, source, confidence, is_demo)
  SELECT
    d.id,
    t.id,
    d.created_at + ((random() * 5)::int || ' days')::interval,
    'approved',
    CASE WHEN random() < 0.4 THEN 'ai' ELSE 'human' END,
    CASE WHEN random() < 0.4 THEN 0.7 + random() * 0.3 ELSE NULL END,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (
    SELECT id FROM public.deal_tags
    WHERE organization_id = v_org
      AND name IN ('Quente','Morno','Frio','Prioridade','Fervendo','Decide sozinho','Decide com cônjuge')
    ORDER BY ((d.id::text || (random())::text) || (id::text))
    LIMIT (1 + (random() * 2)::int)
  ) t
  WHERE d.is_demo = true AND d.organization_id = v_org
  ON CONFLICT (deal_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'deal_tag_assignments'; qty := v_qty; RETURN NEXT;

  -- Reabilita triggers
  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION seed_demo.populate_deals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_demo.populate_deals() TO postgres, service_role;

COMMENT ON FUNCTION seed_demo.populate_deals() IS
  'Popula 1450 deals distribuídos em 5 funis com curva temporal de 12 meses, stage events, status events e tag assignments.';