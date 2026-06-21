-- ============================================================================
-- Fase C — Funil IA: arquétipos + playbooks das etapas 6–9 (pós-devolutiva)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- As etapas 6–9 do funil da IA estavam SEM stage_archetype (comportamento-base
-- nulo). Esta migration cria E5–E8 (arquétipo + playbook) e vincula às etapas,
-- completando as 9 etapas com norte para a IA. Alinhado ao §4.2 do plano v3.
-- ============================================================================

DO $do$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_funnel text := 'fun-ia-mcmv';
  r record;
  v_arch_id uuid;
BEGIN
  -- (code, name, purpose, playbook goal, success[], failure[], ladder, stage_id, ctx_tags)
  FOR r IN
    SELECT * FROM (VALUES
      ('E5','Crédito aprovado – aguardando agendamento',
       'Crédito aprovado (100% ou condicionado). Comemorar com o lead, confirmar o aceite e preparar o terreno para agendar — sem ainda iniciar a tratativa de horário.',
       'Transformar a aprovação em momentum: confirmar a boa notícia e obter sinal verde do lead para agendar a visita.',
       ARRAY['Lead ciente da aprovação','Lead demonstrou disponibilidade para agendar'],
       ARRAY['Lead esfriou após aprovação e não respondeu em 48h'],
       'ladder-rapida','ia-aprovado-aguardando','["fase-agendamento","mcmv"]'),
      ('E6','Crédito aprovado – agendamento em andamento',
       'IA conduz o agendamento: oferece horários (2 por vez), sente a preferência do lead (presencial > vídeo > ligação) e busca confirmar data+hora+local (imobiliária).',
       'Concretizar um agendamento com data, hora e local definidos, de forma flexível e sem pressão.',
       ARRAY['Lead aceitou um horário específico (data+hora+local)'],
       ARRAY['Tentativas de agendamento esgotadas sem aceite'],
       'ladder-media','ia-agendamento','["fase-agendamento","mcmv"]'),
      ('E7','Transferido p/ corretor – agendamento realizado',
       'Agendamento concreto. Passar o bastão ao corretor humano com briefing estruturado (tipo de funil + tags + match) e horário definido, sem perder o momentum.',
       'Handoff impecável: corretor recebe briefing completo + horário; lead sabe os próximos passos.',
       ARRAY['Briefing gerado e enviado ao corretor','Card criado no funil do corretor'],
       ARRAY['Handoff falhou ou corretor não assumiu'],
       'ladder-rapida','ia-transferido','["fase-handoff","mcmv"]'),
      ('E8','Troca de voz',
       'Cadência de agendamento esgotada (tentativas no limite). Transferir silenciosamente ao corretor com briefing (mesma lógica do handoff), para tentativa por voz humana.',
       'Repassar ao corretor um lead aprovado que a IA não conseguiu agendar, com contexto completo para a abordagem por voz.',
       ARRAY['Briefing gerado','Card criado no funil do corretor (etapa 1)'],
       ARRAY['Lead perdido sem repasse ao corretor'],
       'ladder-media','ia-troca-voz','["fase-handoff","mcmv"]')
    ) AS t(code,name,purpose,goal,succ,fail,ladder,stage_id,ctx)
  LOOP
    -- 1) Arquétipo (idempotente por code)
    INSERT INTO public.stage_archetypes (code, name, purpose, context_tags, default_playbook_code, position, is_active)
    VALUES (r.code, r.name, r.purpose, r.ctx::jsonb, r.code,
            5 + (substring(r.code from 2))::int, true)
    ON CONFLICT (code) DO UPDATE
      SET name=EXCLUDED.name, purpose=EXCLUDED.purpose, context_tags=EXCLUDED.context_tags,
          default_playbook_code=EXCLUDED.default_playbook_code, updated_at=now()
    RETURNING id INTO v_arch_id;

    -- 2) Playbook do arquétipo (idempotente por org+code)
    INSERT INTO public.stage_playbooks
      (organization_id, code, name, goal, success_criteria, failure_criteria,
       default_ladder_code, identity, typical_behavior_codes, archetype_id, kind, is_active)
    VALUES
      (v_org, r.code, r.name, r.goal, to_jsonb(r.succ), to_jsonb(r.fail),
       r.ladder, '{}'::jsonb, '[]'::jsonb, v_arch_id, 'stage', true)
    ON CONFLICT (organization_id, code) DO UPDATE
      SET goal=EXCLUDED.goal, success_criteria=EXCLUDED.success_criteria,
          failure_criteria=EXCLUDED.failure_criteria, archetype_id=EXCLUDED.archetype_id, updated_at=now();

    -- 3) Vincula a etapa do funil ao arquétipo
    UPDATE public.funnel_stages
       SET stage_archetype_id = v_arch_id, updated_at = now()
     WHERE organization_id = v_org AND funnel_id = v_funnel AND stage_id = r.stage_id;

    RAISE NOTICE 'Arquétipo % vinculado à etapa %', r.code, r.stage_id;
  END LOOP;
END
$do$;
