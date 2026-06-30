-- =====================================================================
-- seed_demo.populate_aux() — Parte 5
-- Notificações, e-mails, auditoria, billing, escala, documentação,
-- lead_channels, qualificação preenchida, fila da IA, webhooks.
-- =====================================================================

CREATE OR REPLACE FUNCTION seed_demo.populate_aux()
RETURNS TABLE(entity text, qty bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_user uuid := '8c7fb47a-1055-418a-8f03-74a4c74e0e7a';
  v_qty bigint;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  -- ===== LEAD_CHANNELS (1 por deal) =====
  INSERT INTO public.lead_channels (
    organization_id, deal_id, channel, provider, external_contact_id,
    phone_e164, display_name, is_active, metadata, created_at, updated_at, is_demo
  )
  SELECT
    d.organization_id, d.id, 'whatsapp', 'waha',
    '5511' || lpad((900000000 + s.salt * 17)::text, 9, '0') || '@c.us',
    '+5511' || lpad((900000000 + s.salt * 17)::text, 9, '0'),
    d.lead_name, true,
    jsonb_build_object('origin', (ARRAY['site','instagram','facebook','indicacao','portal_imobiliario','google'])[1 + s.salt % 6]),
    d.created_at, d.updated_at, true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
  ON CONFLICT (organization_id, channel, external_contact_id) DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'lead_channels'; qty := v_qty; RETURN NEXT;

  -- ===== LEGAL_ACCEPTANCES (1 por deal — LGPD) =====
  INSERT INTO public.legal_acceptances (user_id, policy_type, version, accepted_at, ip_address, is_demo)
  SELECT v_user, 'lgpd', '1.0', d.created_at + interval '1 hour',
         '187.' || (s.salt % 200 + 30) || '.' || (s.salt % 250 + 1) || '.' || (s.salt % 240 + 5),
         true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'legal_acceptances'; qty := v_qty; RETURN NEXT;

  -- ===== EMAIL_LOGS (~800 disparos) =====
  INSERT INTO public.email_logs (
    organization_id, deal_id, template, to_email, to_name, subject, body_text,
    status, provider, sent_at, delivered_at, metadata, created_at, is_demo
  )
  SELECT
    v_org, d.id,
    (ARRAY['welcome','followup_visita','followup_proposta','credito_aprovado','contrato_pronto'])[1 + (s.salt + e.idx) % 5],
    lower(replace(d.lead_name, ' ', '.')) || '@email.demo',
    d.lead_name,
    CASE (s.salt + e.idx) % 5
      WHEN 0 THEN 'Bem-vindo à OmniMob, ' || d.lead_name || '!'
      WHEN 1 THEN 'Lembrete: sua visita está agendada'
      WHEN 2 THEN 'Sua proposta está sendo analisada'
      WHEN 3 THEN 'Crédito aprovado! Próximos passos'
      ELSE 'Seu contrato está pronto para assinatura'
    END,
    'Conteúdo do e-mail de demonstração.',
    'delivered', 'resend',
    d.created_at + ((e.idx * 5)::int || ' days')::interval,
    d.created_at + ((e.idx * 5)::int || ' days 15 minutes')::interval,
    '{}'::jsonb,
    d.created_at + ((e.idx * 5)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (
    SELECT generate_series(1,
      CASE WHEN d.status = 'won' THEN 3 WHEN d.status = 'lost' THEN 1 ELSE (s.salt % 2) END
    ) AS idx
  ) e
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND d.status IN ('won','lost') OR (d.status = 'open' AND s.salt % 4 = 0);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'email_logs'; qty := v_qty; RETURN NEXT;

  -- ===== INTERNAL_NOTIFICATIONS (~1200) =====
  INSERT INTO public.internal_notifications (
    organization_id, kind, deal_id, payload, status, attempts, created_at, updated_at, is_demo
  )
  SELECT
    v_org,
    (ARRAY['new_lead','deal_stalled','credit_returned','briefing_ready','sla_violation'])[1 + (s.salt + n.idx) % 5],
    d.id,
    jsonb_build_object('lead_name', d.lead_name, 'stage', d.stage_id),
    CASE WHEN (s.salt + n.idx) % 10 < 8 THEN 'sent' ELSE 'pending' END,
    1 + (s.salt + n.idx) % 3,
    d.created_at + ((n.idx * 3)::int || ' days')::interval,
    d.created_at + ((n.idx * 3)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (SELECT generate_series(1, CASE WHEN s.salt % 2 = 0 THEN 1 ELSE 0 END) AS idx) n
  WHERE d.is_demo = true AND d.organization_id = v_org;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'internal_notifications'; qty := v_qty; RETURN NEXT;

  -- ===== NOTIFICATIONS (push para o admin — 600) =====
  INSERT INTO public.notifications (
    user_id, organization_id, type, title, body, data, read, read_at, created_at, is_demo
  )
  SELECT
    v_user, v_org,
    (ARRAY['new_lead','deal_stalled','credit_approved','briefing_ready','system'])[1 + i % 5],
    CASE i % 5
      WHEN 0 THEN 'Novo lead recebido'
      WHEN 1 THEN 'Deal parado há mais de 7 dias'
      WHEN 2 THEN 'Crédito aprovado'
      WHEN 3 THEN 'Briefing pronto para visita'
      ELSE 'Atualização do sistema'
    END,
    'Detalhes da notificação #' || i,
    '{}'::jsonb,
    i % 10 < 6,
    CASE WHEN i % 10 < 6 THEN now() - ((i * 0.5)::int || ' hours')::interval ELSE NULL END,
    now() - ((i * 12)::int || ' hours')::interval,
    true
  FROM generate_series(1, 600) i;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'notifications'; qty := v_qty; RETURN NEXT;

  -- ===== AUDIT_LOGS (~350) =====
  INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details, created_at, is_demo)
  SELECT
    v_user,
    (ARRAY['playbook.updated','funnel.stage.created','user.invited','tag.created','rule.updated','override.upserted','config.updated'])[1 + i % 7],
    (ARRAY['playbook','funnel_stage','user','tag','rule','override','config'])[1 + i % 7],
    gen_random_uuid(),
    jsonb_build_object('iteration', i),
    now() - ((i * 24)::int || ' hours')::interval,
    true
  FROM generate_series(1, 350) i;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'audit_logs'; qty := v_qty; RETURN NEXT;

  -- ===== BROKER_AVAILABILITY (escala 7d/semana por corretor) =====
  INSERT INTO public.broker_availability (
    organization_id, broker_id, weekday, start_time, end_time, is_active, created_at, is_demo
  )
  SELECT
    v_org, b.id, d.day, '08:00'::time, '19:00'::time, true, now() - interval '360 days', true
  FROM public.broker_profiles b
  CROSS JOIN (SELECT generate_series(1, 5) AS day) d
  WHERE b.organization_id = v_org AND b.is_demo = true;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'broker_availability'; qty := v_qty; RETURN NEXT;

  -- ===== TAG_SUGGESTIONS (80) =====
  INSERT INTO public.tag_suggestions (
    organization_id, deal_id, group_code, proposed_name, rationale, status, reviewed_by, reviewed_at, created_at, is_demo
  )
  SELECT
    v_org, d.id,
    (ARRAY['temperatura','decisor','objecao','intencao'])[1 + s.salt % 4],
    (ARRAY['Cliente VIP','Indicação','Recompra','Investidor','Primeira locação','Sem pressa'])[1 + s.salt % 6],
    'Sugestão automática gerada pela IA com base no histórico de mensagens.',
    (ARRAY['pending','approved','rejected'])[1 + s.salt % 3],
    CASE WHEN s.salt % 3 != 0 THEN v_user ELSE NULL END,
    CASE WHEN s.salt % 3 != 0 THEN now() - ((s.salt % 30)::int || ' days')::interval ELSE NULL END,
    now() - ((s.salt % 200)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
  ORDER BY s.salt
  LIMIT 80;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'tag_suggestions'; qty := v_qty; RETURN NEXT;

  -- ===== NURTURE_CADENCE_STATE (400 leads frios em nutrição) =====
  INSERT INTO public.nurture_cadence_state (
    deal_id, organization_id, ladder_code, entered_at, last_step_index, last_enqueued_at, updated_at, is_demo
  )
  SELECT
    d.id, v_org,
    (ARRAY['ladder-frio','ladder-recuperacao','ladder-pos-perda'])[1 + s.salt % 3],
    d.created_at + interval '30 days',
    s.salt % 5,
    d.created_at + ((30 + s.salt % 60)::int || ' days')::interval,
    now() - ((s.salt % 14)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  WHERE d.is_demo = true AND d.organization_id = v_org
    AND (d.status = 'lost' OR (d.status = 'open' AND s.salt % 7 = 0))
  ORDER BY s.salt
  LIMIT 400
  ON CONFLICT (deal_id) DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'nurture_cadence_state'; qty := v_qty; RETURN NEXT;

  -- ===== AI_RESPONSE_QUEUE (3500 histórico) =====
  INSERT INTO public.ai_response_queue (
    organization_id, deal_id, funnel_id, stage_id, lead_message, suggested_response, final_response,
    status, autonomy_mode, scheduled_send_at, sent_at, attempts, context, created_at, updated_at, is_demo
  )
  SELECT
    v_org, d.id, d.funnel_id, d.stage_id,
    'Mensagem do lead na queue #' || q.idx,
    'Resposta sugerida pela IA.',
    CASE WHEN (s.salt + q.idx) % 10 < 8 THEN 'Resposta final enviada.' ELSE NULL END,
    CASE
      WHEN (s.salt + q.idx) % 10 < 7 THEN 'sent'
      WHEN (s.salt + q.idx) % 10 < 8 THEN 'approved'
      WHEN (s.salt + q.idx) % 10 < 9 THEN 'awaiting_approval'
      ELSE 'rejected'
    END,
    (ARRAY['autonomous','suggest_only','approval_first_n'])[1 + (s.salt + q.idx) % 3],
    d.created_at + ((q.idx * 2)::int || ' days')::interval,
    CASE WHEN (s.salt + q.idx) % 10 < 8 THEN d.created_at + ((q.idx * 2)::int || ' days')::interval ELSE NULL END,
    1, '{}'::jsonb,
    d.created_at + ((q.idx * 2)::int || ' days')::interval,
    d.created_at + ((q.idx * 2)::int || ' days')::interval,
    true
  FROM public.deals d
  CROSS JOIN LATERAL (SELECT (substring(d.id from 'deal-demo-(.*)$'))::int AS salt) s
  CROSS JOIN LATERAL (SELECT generate_series(1, 2 + s.salt % 3) AS idx) q
  WHERE d.is_demo = true AND d.organization_id = v_org
  ORDER BY d.id, q.idx
  LIMIT 3500
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'ai_response_queue'; qty := v_qty; RETURN NEXT;

  -- ===== WEBHOOK_IDEMPOTENCY (2000) =====
  INSERT INTO public.webhook_idempotency (
    idempotency_key, payload_hash, response_status, response_body, created_at, expires_at, is_demo
  )
  SELECT
    'demo-webhook-' || lpad(i::text, 6, '0'),
    md5(i::text),
    200,
    jsonb_build_object('ok', true, 'idx', i),
    now() - ((i * 0.3)::int || ' hours')::interval,
    now() + interval '24 hours',
    true
  FROM generate_series(1, 2000) i;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'webhook_idempotency'; qty := v_qty; RETURN NEXT;

  -- ===== SUBSCRIPTIONS (1 da imobiliária + histórico) =====
  INSERT INTO public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, plan_type, status,
    license_paid_at, next_billing_at, failed_payments, created_at, updated_at, is_demo
  )
  VALUES (
    v_user, 'cus_demo_omnimob', 'sub_demo_omnimob_001', 'enterprise', 'active',
    now() - interval '15 days', now() + interval '15 days', 0,
    now() - interval '360 days', now() - interval '15 days', true
  );
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'subscriptions'; qty := v_qty; RETURN NEXT;

  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION seed_demo.populate_aux() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_demo.populate_aux() TO postgres, service_role;