-- =====================================================================
-- seed_demo.populate_ia_and_ops() — Parte 4
-- IA: ~9.500 decision logs, 30 feedback events, 5 sessions, 12 overrides + ~40 snapshots
-- Ops: 180 credit_analyses, 140 guarantee_analyses, 90 inspections, 65 lease_contracts
-- =====================================================================

CREATE OR REPLACE FUNCTION seed_demo.populate_ia_and_ops()
RETURNS TABLE(entity text, qty bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_qty bigint;
  v_user uuid := '8c7fb47a-1055-418a-8f03-74a4c74e0e7a';  -- vinicius (superadmin)
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  -- ===== IA DECISION LOGS =====
  -- 6-10 decisões por deal em média; mais densas em meses iniciais (IA aprendendo)
  INSERT INTO public.ia_decision_logs (
    organization_id, deal_id, funnel_id, stage_id, playbook_code,
    detected_behavior_codes, applied_rule_codes, intent, tone, action_taken, outcome,
    context, context_tags, applied_override_ids, archetype_code, status_overlay_code,
    deal_status, activated_skill_code, created_at, is_demo
  )
  SELECT
    d.organization_id, d.id, d.funnel_id, d.stage_id,
    'pb-' || d.funnel_id || '-' || d.stage_id,
    jsonb_build_array(
      (ARRAY['interesse_alto','duvida_preco','duvida_doc','duvida_prazo','recusa_explicita','aguardando_familia','procrastinacao'])[1 + (s.salt + l.idx) % 7]
    ),
    jsonb_build_array(
      'rule-resposta-' || ((s.salt + l.idx) % 12 + 1)
    ),
    (ARRAY['qualify','schedule','negotiate','followup','recover','close'])[1 + (s.salt + l.idx) % 6],
    (ARRAY['neutro','consultivo','assertivo','empatico'])[1 + (s.salt + l.idx) % 4],
    'A IA respondeu ao lead seguindo o playbook da etapa.',
    (ARRAY['enviou_resposta','agendou_visita','escalou_corretor','aguardando_lead','encerrou_sem_resposta'])[1 + (s.salt + l.idx) % 5],
    jsonb_build_object('lead_name', d.lead_name, 'iteration', l.idx),
    '[]'::jsonb,
    '[]'::jsonb,
    (ARRAY['qualificacao','agendamento','negociacao','fechamento'])[1 + (s.salt + l.idx) % 4],
    NULL,
    d.status,
    (ARRAY['ask_qualify','propose_visit','handle_objection','recover_cold','close_deal'])[1 + (s.salt + l.idx) % 5],
    d.created_at + ((l.idx * 1.2 + random() * 0.5)::numeric || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (
    SELECT generate_series(1,
      -- Densidade decai ao longo dos 12 meses (IA aprendendo no início, madura depois)
      CASE
        WHEN EXTRACT(epoch FROM (now() - d.created_at)) / 86400 > 300 THEN 4 + (s.salt % 3)
        WHEN EXTRACT(epoch FROM (now() - d.created_at)) / 86400 > 200 THEN 5 + (s.salt % 4)
        WHEN EXTRACT(epoch FROM (now() - d.created_at)) / 86400 > 100 THEN 6 + (s.salt % 5)
        ELSE 7 + (s.salt % 6)
      END
    ) AS idx
  ) l
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'ia_decision_logs'; qty := v_qty; RETURN NEXT;

  -- ===== PLAYBOOK OVERRIDES (12 ativos) =====
  INSERT INTO public.playbook_overrides (organization_id, scope_type, scope_id, layer, payload, is_active, created_at, updated_at, is_demo)
  VALUES
    (v_org, 'stage', 'fun-ia-mcmv:ia-qualificacao', 'stage_override',
     '{"identity":"Refinamento: priorizar dúvidas sobre entrada antes de qualquer apresentação.","successCriteria":["Lead confirma renda","Lead aceita simulação"]}'::jsonb,
     true, now() - interval '320 days', now() - interval '320 days', true),
    (v_org, 'stage', 'fun-ia-mcmv:ia-visita-agendada', 'stage_override',
     '{"goal":"Confirmar visita 24h antes via WhatsApp com mensagem padrão.","expectedBehaviorIds":["confirma_visita","reagenda"]}'::jsonb,
     true, now() - interval '280 days', now() - interval '280 days', true),
    (v_org, 'funnel', 'fun-corretor-mcmv', 'funnel_override',
     '{"identity":"No funil do corretor, IA atua apenas como assistente — nunca envia mensagem sem aprovação."}'::jsonb,
     true, now() - interval '250 days', now() - interval '250 days', true),
    (v_org, 'stage', 'fun-ia-locacao:ia-garantia', 'stage_override',
     '{"identity":"Antes de oferecer Porto, perguntar se já tem fiador. Só ofertar seguro como fallback.","failureCriteria":["Lead aceitou outro corretor"]}'::jsonb,
     true, now() - interval '200 days', now() - interval '200 days', true),
    (v_org, 'stage', 'fun-ia-mcmv:ia-novo-lead', 'stage_override',
     '{"goal":"Primeira mensagem deve mencionar o nome do empreendimento que o lead pesquisou."}'::jsonb,
     true, now() - interval '180 days', now() - interval '180 days', true),
    (v_org, 'stage', 'fun-nutricao-mcmv:nut-aquecimento', 'stage_override',
     '{"identity":"Nutrição: tom mais educativo, sem chamadas para venda nos primeiros 7 dias."}'::jsonb,
     true, now() - interval '150 days', now() - interval '150 days', true),
    (v_org, 'stage', 'fun-corretor-mcmv:cor-negociacao', 'stage_override',
     '{"successCriteria":["Lead confirma faixa de financiamento aceita","Lead confirma data de assinatura"]}'::jsonb,
     true, now() - interval '120 days', now() - interval '120 days', true),
    (v_org, 'stage', 'fun-ia-locacao:ia-vistoria', 'stage_override',
     '{"goal":"Avisar locatário 2 dias antes com checklist do que levar."}'::jsonb,
     true, now() - interval '90 days', now() - interval '90 days', true),
    (v_org, 'stage', 'fun-ia-mcmv:ia-aprovacao-credito', 'stage_override',
     '{"identity":"Quando crédito é negado, abrir conversa sobre regularização e nutrir para 90 dias.","failureCriteria":["Não retornou em 7 dias"]}'::jsonb,
     true, now() - interval '60 days', now() - interval '60 days', true),
    (v_org, 'stage', 'fun-ia-locacao:ia-proposta', 'stage_override',
     '{"goal":"Anexar PDF da proposta na 1ª mensagem e perguntar dúvidas em 24h."}'::jsonb,
     true, now() - interval '45 days', now() - interval '45 days', true),
    (v_org, 'funnel', 'fun-ia-locacao', 'funnel_override',
     '{"identity":"Tom geral mais formal por padrão do mercado de locação corporativa."}'::jsonb,
     true, now() - interval '30 days', now() - interval '30 days', true),
    (v_org, 'stage', 'fun-corretor-locacao:cor-vistoria-entrada', 'stage_override',
     '{"successCriteria":["Inspector confirmou agenda","Locatário recebeu chaves"]}'::jsonb,
     true, now() - interval '14 days', now() - interval '14 days', true);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'playbook_overrides'; qty := v_qty; RETURN NEXT;

  -- ===== PLAYBOOK OVERRIDE SNAPSHOTS =====
  -- Histórico de evolução: cada override teve em média 3 revisões
  INSERT INTO public.playbook_override_snapshots (
    organization_id, override_id, scope_type, scope_id, layer, payload, is_active, action, note, created_by, created_at, is_demo
  )
  SELECT
    o.organization_id, o.id, o.scope_type, o.scope_id, o.layer, o.payload, true,
    CASE r.idx WHEN 1 THEN 'upsert' WHEN 2 THEN 'update' ELSE 'update' END,
    CASE r.idx
      WHEN 1 THEN 'Criado pelo admin após análise de decisões da IA.'
      WHEN 2 THEN 'Refinado após feedback de corretor — ajustou linguagem.'
      ELSE 'Versão atual após Modo Treinador (WhatsApp).'
    END,
    v_user,
    o.created_at + ((r.idx * 30 + random() * 10)::int || ' days')::interval,
    true
  FROM public.playbook_overrides o
  CROSS JOIN LATERAL (SELECT generate_series(1, 3) AS idx) r
  WHERE o.is_demo = true AND o.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'playbook_override_snapshots'; qty := v_qty; RETURN NEXT;

  -- ===== IA FEEDBACK EVENTS (30) =====
  -- Densos nos primeiros 3 meses (IA aprendendo), raros depois
  INSERT INTO public.ia_feedback_events (
    organization_id, user_id, channel, deal_id, funnel_id, stage_id,
    feedback_text, interpreted_summary, generated_override_id, created_at, is_demo
  )
  SELECT
    v_org, v_user,
    CASE WHEN r.idx % 3 = 0 THEN 'whatsapp' ELSE 'painel' END,
    d.id, d.funnel_id, d.stage_id,
    (ARRAY[
      'A IA tá oferecendo o imóvel antes de saber se a renda dá. Pede a renda primeiro.',
      'Quando o lead diz que vai pensar, não pergunta de novo no mesmo dia. Dá 48h.',
      'Não mande mensagem depois das 21h, fica invasivo.',
      'Se o lead pergunta sobre fiador, oferece seguro só se ele negar o fiador.',
      'Confirma a visita 24h antes, sempre.',
      'Quando o crédito é negado, abre conversa sobre regularização em vez de fechar o atendimento.',
      'Tom muito formal pra MCMV — relaxa um pouco.',
      'Locação corporativa precisa de tom mais formal e direto.',
      'Não cite valor antes de qualificar a renda do lead.',
      'Visita agendada precisa ter endereço completo, não só bairro.'
    ])[1 + r.idx % 10],
    (ARRAY[
      'Entendi: priorizar qualificação de renda antes de apresentar imóvel. Vou criar override na etapa de qualificação.',
      'Entendi: aguardar 48h após resposta evasiva antes de retomar conversa. Override na etapa de followup.',
      'Entendi: respeitar janela 8h-21h para envio de mensagens. Override universal.',
      'Entendi: fiador como opção preferencial, seguro como fallback. Override na etapa de garantia.',
      'Entendi: lembrete automático 24h antes da visita. Override na etapa de visita agendada.',
      'Entendi: ao invés de fechar, abrir trilha de nutrição em caso de crédito negado.',
      'Entendi: tom mais casual no funil MCMV. Override no funil.',
      'Entendi: tom formal e direto no funil de locação corporativa. Override no funil.',
      'Entendi: postergar oferta de valor até confirmação de renda. Override na etapa.',
      'Entendi: endereço completo na mensagem de confirmação de visita. Override na etapa.'
    ])[1 + r.idx % 10],
    NULL,
    now() - ((365 - r.idx * 12)::int || ' days')::interval,
    true
  FROM (SELECT generate_series(0, 29) AS idx) r
  CROSS JOIN LATERAL (
    SELECT id, funnel_id, stage_id FROM public.deals
    WHERE is_demo = true AND organization_id = v_org
    ORDER BY ((r.idx * 7919) % 1450)
    LIMIT 1
  ) d;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'ia_feedback_events'; qty := v_qty; RETURN NEXT;

  -- ===== IA FEEDBACK SESSIONS (5) =====
  INSERT INTO public.ia_feedback_sessions (
    organization_id, phone_e164, status, last_activity_at, expires_at, context, created_at, is_demo
  )
  VALUES
    (v_org, '+5514998236041', 'encerrado',  now() - interval '300 days', now() - interval '300 days' + interval '30 min',  '{}'::jsonb, now() - interval '300 days', true),
    (v_org, '+5514998236041', 'encerrado',  now() - interval '210 days', now() - interval '210 days' + interval '30 min',  '{}'::jsonb, now() - interval '210 days', true),
    (v_org, '+5514998236041', 'encerrado',  now() - interval '120 days', now() - interval '120 days' + interval '30 min',  '{}'::jsonb, now() - interval '120 days', true),
    (v_org, '+5514998236041', 'encerrado',  now() - interval '60 days',  now() - interval '60 days'  + interval '30 min',  '{}'::jsonb, now() - interval '60 days', true),
    (v_org, '+5514998236041', 'ativo',      now() - interval '4 min',    now() + interval '26 min',                         jsonb_build_object('last_feedback','Lembrete de visita 24h antes'), now() - interval '15 min', true);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'ia_feedback_sessions'; qty := v_qty; RETURN NEXT;

  -- ===== CREDIT ANALYSES (180) =====
  -- Apenas deals MCMV em etapas avançadas; uma análise por deal
  INSERT INTO public.credit_analyses (
    organization_id, deal_id, bank_id, status, result, result_conditions, result_reason,
    received_at, analysis_started_at, returned_at, approved_financing_amount, requires_entry,
    metadata, created_at, updated_at, is_demo
  )
  SELECT
    v_org, d.id,
    (SELECT id FROM public.correspondent_banks WHERE organization_id = v_org AND is_demo = true ORDER BY ((s.salt * 31) % 4) LIMIT 1),
    CASE
      WHEN s.salt % 10 < 6 THEN 'returned'
      WHEN s.salt % 10 < 8 THEN 'in_analysis'
      WHEN s.salt % 10 < 9 THEN 'cancelled'
      ELSE 'received'
    END,
    CASE
      WHEN s.salt % 10 < 6 THEN (ARRAY['approved','approved_conditioned','rejected'])[1 + s.salt % 3]
      ELSE NULL
    END,
    CASE WHEN s.salt % 6 = 1 THEN 'Aprovado mediante apresentação de comprovante adicional.' ELSE NULL END,
    CASE WHEN s.salt % 6 = 2 THEN 'Renda insuficiente para o valor solicitado.' ELSE NULL END,
    d.created_at + interval '20 days',
    d.created_at + interval '22 days',
    CASE WHEN s.salt % 10 < 6 THEN d.created_at + interval '30 days' ELSE NULL END,
    CASE WHEN s.salt % 10 < 6 THEN (150000 + (s.salt * 1717) % 200000)::numeric ELSE NULL END,
    s.salt % 3 = 0,
    '{}'::jsonb,
    d.created_at + interval '20 days',
    d.created_at + interval '30 days',
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND d.funnel_id LIKE 'fun-%-mcmv'
    AND d.created_at < now() - interval '30 days'
  ORDER BY d.created_at DESC
  LIMIT 180
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'credit_analyses'; qty := v_qty; RETURN NEXT;

  -- ===== GUARANTEE ANALYSES (140) =====
  INSERT INTO public.guarantee_analyses (
    organization_id, deal_id, guarantee_type, insurer_id, status, result,
    received_at, analysis_started_at, returned_at, metadata, created_at, updated_at, is_demo
  )
  SELECT
    v_org, d.id,
    (ARRAY['fiador','caucao','seguro_fianca','titulo_capitalizacao'])[1 + s.salt % 4],
    (SELECT id FROM public.insurers WHERE organization_id = v_org AND is_demo = true ORDER BY ((s.salt * 17) % 5) LIMIT 1),
    CASE
      WHEN s.salt % 10 < 7 THEN 'returned'
      WHEN s.salt % 10 < 9 THEN 'in_analysis'
      ELSE 'cancelled'
    END,
    CASE WHEN s.salt % 10 < 7 THEN (ARRAY['approved','approved_conditioned','rejected'])[1 + s.salt % 3] ELSE NULL END,
    d.created_at + interval '15 days',
    d.created_at + interval '17 days',
    CASE WHEN s.salt % 10 < 7 THEN d.created_at + interval '25 days' ELSE NULL END,
    '{}'::jsonb,
    d.created_at + interval '15 days',
    d.created_at + interval '25 days',
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND d.funnel_id LIKE '%locacao%'
    AND d.created_at < now() - interval '30 days'
  ORDER BY d.created_at DESC
  LIMIT 140
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'guarantee_analyses'; qty := v_qty; RETURN NEXT;

  -- ===== PROPERTY INSPECTIONS (90) =====
  INSERT INTO public.property_inspections (
    organization_id, deal_id, property_id, inspection_type, status, inspector_id,
    scheduled_at, completed_at, general_notes, metadata, created_at, updated_at, is_demo
  )
  SELECT
    v_org, d.id,
    (SELECT p.id FROM public.properties p WHERE p.organization_id = v_org AND p.is_demo = true ORDER BY (s.salt % 220) LIMIT 1),
    CASE WHEN s.salt % 2 = 0 THEN 'entrada' ELSE 'saida' END,
    CASE
      WHEN s.salt % 10 < 6 THEN 'concluida'
      WHEN s.salt % 10 < 8 THEN 'agendada'
      WHEN s.salt % 10 < 9 THEN 'em_andamento'
      ELSE 'pendente'
    END,
    (SELECT id FROM public.inspectors WHERE organization_id = v_org AND is_demo = true ORDER BY ((s.salt * 11) % 3) LIMIT 1),
    d.created_at + interval '40 days',
    CASE WHEN s.salt % 10 < 6 THEN d.created_at + interval '42 days' ELSE NULL END,
    CASE WHEN s.salt % 10 < 6 THEN 'Vistoria concluída sem ressalvas relevantes.' ELSE NULL END,
    '{}'::jsonb,
    d.created_at + interval '38 days',
    d.created_at + interval '42 days',
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND d.funnel_id LIKE '%locacao%'
    AND d.created_at < now() - interval '60 days'
  ORDER BY d.created_at DESC
  LIMIT 90
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'property_inspections'; qty := v_qty; RETURN NEXT;

  -- ===== LEASE CONTRACTS (65) =====
  INSERT INTO public.lease_contracts (
    organization_id, deal_id, property_id, locador_nome, locatario_nome,
    rent_value, condo_fee, iptu, dia_vencimento,
    start_date, end_date, duration_months, readjustment_index, readjustment_period_months,
    multa_rescisoria_meses, caucao_meses, status, signed_at, activated_at, metadata,
    created_at, updated_at, is_demo
  )
  SELECT
    v_org, d.id,
    (SELECT p.id FROM public.properties p WHERE p.organization_id = v_org AND p.is_demo = true ORDER BY (s.salt % 220) LIMIT 1),
    'Proprietário Demonstração ' || (s.salt % 50 + 1),
    d.lead_name,
    (1500 + (s.salt * 31) % 4500)::numeric,
    (300 + (s.salt * 7) % 600)::numeric,
    (80 + (s.salt * 3) % 250)::numeric,
    (1 + s.salt % 28)::int,
    (d.created_at + interval '45 days')::date,
    (d.created_at + interval '45 days' + interval '30 months')::date,
    30,
    'IGPM',
    12,
    3,
    CASE WHEN s.salt % 3 = 0 THEN 0 ELSE 3 END,
    CASE
      WHEN s.salt % 10 < 6 THEN 'ativo'
      WHEN s.salt % 10 < 8 THEN 'assinado'
      WHEN s.salt % 10 < 9 THEN 'enviado'
      ELSE 'rascunho'
    END,
    CASE WHEN s.salt % 10 < 8 THEN d.created_at + interval '43 days' ELSE NULL END,
    CASE WHEN s.salt % 10 < 6 THEN d.created_at + interval '45 days' ELSE NULL END,
    '{}'::jsonb,
    d.created_at + interval '40 days',
    d.created_at + interval '45 days',
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND d.funnel_id LIKE '%locacao%'
    AND d.created_at < now() - interval '60 days'
  ORDER BY d.created_at DESC
  LIMIT 65
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'lease_contracts'; qty := v_qty; RETURN NEXT;

  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION seed_demo.populate_ia_and_ops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_demo.populate_ia_and_ops() TO postgres, service_role;