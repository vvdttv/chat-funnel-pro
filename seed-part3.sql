-- =====================================================================
-- seed_demo.populate_comms() — Parte 3
-- ~1450 conversations, ~38k messages, ~11k deal_activities, ~2200 appointments.
-- Densidade variável por deal (alguns 80+ msgs, outros 3-5).
-- =====================================================================

CREATE OR REPLACE FUNCTION seed_demo.populate_comms()
RETURNS TABLE(entity text, qty bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_qty bigint;
  v_persona_id uuid;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Pega uma persona padrão
  SELECT id INTO v_persona_id FROM public.agent_personas
  WHERE organization_id = v_org LIMIT 1;

  -- ===== CONVERSATIONS (uma por deal) =====
  INSERT INTO public.conversations (
    organization_id, deal_id, channel, provider, contact_phone_e164, contact_name,
    persona_id, status, last_inbound_at, last_outbound_at, last_message_at,
    metadata, created_at, updated_at, is_demo
  )
  SELECT
    d.organization_id,
    d.id,
    'whatsapp',
    'waha',
    '+5511' || lpad((900000000 + (substring(d.id from 'deal-demo-(.*)$')::int * 17))::text, 9, '0'),
    d.lead_name,
    v_persona_id,
    CASE WHEN d.status = 'open' THEN 'active' ELSE 'closed' END,
    -- last_inbound/outbound: pra abas "não lidas pelo X" povoarem
    CASE
      WHEN d.status = 'open' AND (substring(d.id from 'deal-demo-(.*)$')::int % 4) < 2
        THEN now() - ((random() * 72)::int || ' hours')::interval
      ELSE d.updated_at - ((random() * 24)::int || ' hours')::interval
    END,
    CASE
      WHEN d.status = 'open' AND (substring(d.id from 'deal-demo-(.*)$')::int % 4) >= 2
        THEN now() - ((random() * 72)::int || ' hours')::interval
      ELSE d.updated_at - ((random() * 48)::int || ' hours')::interval
    END,
    d.updated_at,
    jsonb_build_object('source', 'demo_seed'),
    d.created_at,
    d.updated_at,
    true
  FROM public.deals d
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'conversations'; qty := v_qty; RETURN NEXT;

  -- ===== MESSAGES =====
  -- Densidade: distribuição log-normal, média ~26 msgs/deal.
  -- 5% têm 80+ msgs (negociação longa), 15% têm 3-5 (ghosting), resto entre 10-50.
  INSERT INTO public.messages (
    organization_id, conversation_id, direction, sender_type, content_type, content,
    status, created_at, updated_at, is_demo
  )
  SELECT
    c.organization_id,
    c.id,
    -- 75% inbound (lead-iniciado), 25% outbound
    CASE WHEN (m.idx + s.salt) % 4 = 0 THEN 'outbound' ELSE 'inbound' END,
    CASE
      WHEN (m.idx + s.salt) % 4 = 0 AND (m.idx + s.salt) % 8 < 5 THEN 'ai'
      WHEN (m.idx + s.salt) % 4 = 0 THEN 'broker'
      ELSE 'lead'
    END,
    -- Mix de mídia
    CASE
      WHEN (m.idx * 7 + s.salt) % 100 < 15 THEN 'image'
      WHEN (m.idx * 7 + s.salt) % 100 < 23 THEN 'audio'
      WHEN (m.idx * 7 + s.salt) % 100 < 28 THEN 'document'
      WHEN (m.idx * 7 + s.salt) % 100 < 30 THEN 'location'
      ELSE 'text'
    END,
    CASE
      WHEN m.idx = 1 THEN 'Olá! Vi o anúncio e tenho interesse no imóvel. Ainda está disponível?'
      WHEN m.idx % 9 = 0 THEN 'Perfeito! Quando podemos visitar?'
      WHEN m.idx % 7 = 0 THEN 'Vou ver com minha esposa e te retorno.'
      WHEN m.idx % 5 = 0 THEN 'O valor do aluguel inclui condomínio?'
      WHEN m.idx % 3 = 0 THEN 'Aceita financiamento Caixa?'
      WHEN (m.idx + s.salt) % 4 = 0 THEN 'Olá ' || c.contact_name || '! Posso te ajudar com mais detalhes do imóvel.'
      ELSE 'Mensagem ' || m.idx || ' do atendimento.'
    END,
    CASE WHEN (m.idx + s.salt) % 4 = 0 THEN 'delivered' ELSE 'received' END,
    c.created_at + ((m.idx * 0.4 + random() * 2)::numeric || ' hours')::interval,
    c.created_at + ((m.idx * 0.4 + random() * 2)::numeric || ' hours')::interval,
    true
  FROM public.conversations c
  CROSS JOIN LATERAL (
    SELECT (substring(c.deal_id from 'deal-demo-(.*)$'))::int AS salt
  ) s
  CROSS JOIN LATERAL (
    SELECT generate_series(1, GREATEST(
      3,
      CASE
        WHEN s.salt % 20 = 0 THEN 80 + (s.salt % 40)  -- 5% com 80-120 msgs
        WHEN s.salt % 7 = 0 THEN 3 + (s.salt % 3)    -- 14% com 3-5 msgs (ghosting)
        ELSE 10 + (s.salt % 40)                       -- restante 10-50 msgs
      END
    )) AS idx
  ) m
  WHERE c.is_demo = true AND c.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'messages'; qty := v_qty; RETURN NEXT;

  -- ===== DEAL_ACTIVITIES (~11k) =====
  -- 7-8 atividades por deal em média (ligações, reuniões, follow-ups, visitas)
  INSERT INTO public.deal_activities (
    deal_id, organization_id, type_code, title, description,
    scheduled_at, done_at, outcome_summary, next_action_required,
    created_at, updated_at, is_demo
  )
  SELECT
    d.id,
    d.organization_id,
    (ARRAY['ligacao','mensagem','reuniao','visita','followup'])[1 + ((a.idx + s.salt) % 5)],
    CASE (a.idx + s.salt) % 5
      WHEN 0 THEN 'Ligação de qualificação'
      WHEN 1 THEN 'Envio de mensagem com proposta'
      WHEN 2 THEN 'Reunião com o lead'
      WHEN 3 THEN 'Visita ao imóvel'
      ELSE 'Follow-up de retorno'
    END,
    'Atividade ' || a.idx || ' do deal ' || d.lead_name || '.',
    -- agendamento ao longo da jornada do deal
    d.created_at + ((a.idx * 4 + random() * 3)::int || ' days')::interval,
    -- 70% concluídas
    CASE WHEN (a.idx + s.salt) % 10 < 7 THEN d.created_at + ((a.idx * 4 + random() * 3 + 1)::int || ' days')::interval ELSE NULL END,
    CASE WHEN (a.idx + s.salt) % 10 < 7 THEN 'Concluída com sucesso.' ELSE '' END,
    a.idx < 5,
    d.created_at + ((a.idx * 4)::int || ' days')::interval,
    d.created_at + ((a.idx * 4 + 1)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (
    SELECT generate_series(1,
      CASE
        WHEN d.status = 'won' THEN 8 + (s.salt % 5)
        WHEN d.status = 'lost' THEN 4 + (s.salt % 4)
        ELSE 5 + (s.salt % 6)
      END
    ) AS idx
  ) a
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'deal_activities'; qty := v_qty; RETURN NEXT;

  -- ===== APPOINTMENTS (~2200): visitas e apresentações =====
  INSERT INTO public.appointments (
    organization_id, ia_deal_id, broker_id, kind, channel, location,
    scheduled_at, status, attempts, proposed_slots, first_attempt_at, confirmed_at,
    created_at, updated_at, is_demo
  )
  SELECT
    d.organization_id,
    d.id,
    (SELECT id FROM public.broker_profiles WHERE organization_id = v_org AND is_demo = true ORDER BY ((s.salt * 31 + a.idx)::int % 10) LIMIT 1),
    CASE WHEN a.idx % 2 = 0 THEN 'visita' ELSE 'apresentacao' END,
    (ARRAY['presencial','video','ligacao'])[1 + ((s.salt + a.idx) % 3)],
    'Endereço do imóvel ' || (s.salt % 220 + 1),
    d.created_at + ((a.idx * 7 + random() * 3)::int || ' days')::interval,
    CASE
      WHEN (s.salt + a.idx) % 10 < 5 THEN 'done'
      WHEN (s.salt + a.idx) % 10 < 7 THEN 'cancelled'
      WHEN (s.salt + a.idx) % 10 < 8 THEN 'no_show'
      WHEN d.status = 'open' THEN 'proposed'
      ELSE 'done'
    END,
    1 + ((s.salt + a.idx) % 3),
    jsonb_build_array(
      jsonb_build_object('slot', (d.created_at + ((a.idx * 7)::int || ' days')::interval)::text)
    ),
    d.created_at + ((a.idx * 7 - 1)::int || ' days')::interval,
    CASE WHEN (s.salt + a.idx) % 10 < 7 THEN d.created_at + ((a.idx * 7)::int || ' days')::interval ELSE NULL END,
    d.created_at + ((a.idx * 7 - 2)::int || ' days')::interval,
    d.created_at + ((a.idx * 7)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (
    SELECT generate_series(1, CASE WHEN s.salt % 3 = 0 THEN 2 WHEN s.salt % 7 = 0 THEN 0 ELSE 1 END) AS idx
  ) a
  WHERE d.is_demo = true AND d.organization_id = v_org
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'appointments'; qty := v_qty; RETURN NEXT;

  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION seed_demo.populate_comms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_demo.populate_comms() TO postgres, service_role;

COMMENT ON FUNCTION seed_demo.populate_comms() IS
  'Popula conversas, ~38k mensagens com mix de mídia, ~11k atividades e ~2200 appointments.';