-- ============================================================
-- OMNIMOB — Fase 3A: Crédito aprovado → corretor (MVP de agendamento)
--   Funil do corretor (8 etapas) + broker_profiles/availability +
--   roleta de corretores + appointments + briefing (WhatsApp) +
--   transição das etapas 6→7→8/9 do funil da IA.
-- ============================================================
-- PRÉ-REQUISITOS (já em produção): Fase 2B (funil fun-ia-mcmv, is_ai_funnel,
--   move_deal_stage_internal) e Fase 2C (correspondentes, internal_notifications,
--   claim_internal_notifications, current_attendant_ids, submit_credit_devolutiva
--   que entrega o deal aprovado na etapa 'ia-aprovado-aguardando').
--
-- Org de produção MCMV: 11111111-1111-1111-1111-111111111111
-- Funil da IA: fun-ia-mcmv
--   etapa 6 = 'ia-aprovado-aguardando'  (entrada: devolutiva aprovada)
--   etapa 7 = 'ia-agendamento'          (IA iniciou tratativas de agendamento)
--   etapa 8 = 'ia-transferido'          (agendou → transfere ao corretor)
--   etapa 9 = 'ia-troca-voz'            (cadência esgotada → transfere ao corretor)
--
-- Cria:
--   - Funil 'fun-corretor-mcmv' (8 etapas; NÃO is_ai_funnel) + funnel_stages
--   - deals.mirror_deal_id (lastro: liga card-corretor ↔ card-IA de origem)
--   - broker_profiles + broker_availability
--   - helper current_broker_ids() (SECURITY DEFINER)
--   - RLS org-scoped + role-scoped (corretor vê só os deals/appointments dele)
--   - appointments + RPC assign_broker_internal (roleta determinística ponderada)
--   - RPC propose_appointment_slots (2 slots "mais breve" conforme agenda)
--   - RPC confirm_appointment (IA 6/7 → 8 + cria card no funil corretor etapa 2
--     + lastro) — M2M
--   - RPC escalate_to_broker (IA → 9 + cria card no funil corretor etapa 1) — M2M
--   - broker_briefings + RPC generate_broker_briefing_internal (monta + enfileira)
--   - trigger: deal entra na etapa 6 → enfileira 1º contato de agendamento
--   - cron broker-scheduling-cadence (esgotamento → troca de voz silenciosa)
--
-- Aplicar via psql no container supabase-db. Idempotente.
-- NOTA: o role 'corretor' já existe no enum app_role (não precisa ALTER TYPE).
-- ============================================================

-- ============================================================
-- 1) LASTRO — liga o card do corretor ao card da IA de origem
-- ============================================================
-- O plano exige manter o card no funil da IA (lastro) ao transferir; o card
-- novo no funil do corretor referencia o de origem por mirror_deal_id.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS mirror_deal_id text REFERENCES public.deals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_mirror ON public.deals (mirror_deal_id)
  WHERE mirror_deal_id IS NOT NULL;

-- H2: garante no máximo 1 item 'pending' por deal na fila de resposta — evita
-- que o trigger de kickoff (ou reprocessos) enfileire mensagens duplicadas ao
-- lead. Índice parcial único (NULL deal_id não conflita).
CREATE UNIQUE INDEX IF NOT EXISTS ai_response_queue_one_pending_per_deal
  ON public.ai_response_queue (deal_id)
  WHERE status = 'pending' AND deal_id IS NOT NULL;

-- ============================================================
-- 2) TABELAS — corretores, agenda, agendamentos, briefings
-- ============================================================

-- 2.1 Perfil do corretor (espelha correspondent_attendants: %, contato, login)
CREATE TABLE IF NOT EXISTS public.broker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone_e164 text,                       -- WhatsApp do corretor (atende o lead via WAHA)
  waha_session text,                     -- sessão WAHA própria do corretor (opcional)
  distribution_pct integer NOT NULL DEFAULT 0,
  -- Canais que o corretor atende, em ordem de preferência. A hierarquia GLOBAL
  -- do plano é presencial > vídeo > ligação; aqui guardamos o que cada corretor
  -- oferece (sempre inclui presencial na imobiliária por padrão).
  channels jsonb NOT NULL DEFAULT '["presencial","video","ligacao"]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_profiles_pct_chk CHECK (distribution_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_broker_profiles_org
  ON public.broker_profiles (organization_id);
-- Um login de corretor mapeia a no máximo um perfil por org.
CREATE UNIQUE INDEX IF NOT EXISTS broker_profiles_user_uniq
  ON public.broker_profiles (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- 2.2 Disponibilidade semanal do corretor (janelas de atendimento)
-- weekday: 0=domingo … 6=sábado (compatível com EXTRACT(DOW)).
CREATE TABLE IF NOT EXISTS public.broker_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_avail_weekday_chk CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT broker_avail_time_chk CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_broker_avail_broker
  ON public.broker_availability (broker_id, weekday);

-- 2.3 Agendamentos (visita/apresentação). Hierarquia de canal e cronômetro.
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Vincula ao card do funil da IA (origem) E ao do corretor (destino).
  ia_deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
  broker_deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
  broker_id uuid REFERENCES public.broker_profiles(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'visita',          -- visita | apresentacao
  channel text NOT NULL DEFAULT 'presencial',   -- presencial | video | ligacao
  location text,                                 -- endereço da imobiliária (presencial)
  scheduled_at timestamptz,                      -- data/hora confirmada
  status text NOT NULL DEFAULT 'proposed',       -- proposed|confirmed|done|cancelled|no_show
  attempts integer NOT NULL DEFAULT 0,           -- tentativas de agendamento pela IA
  proposed_slots jsonb NOT NULL DEFAULT '[]'::jsonb,  -- 2 opções oferecidas por vez
  first_attempt_at timestamptz,                  -- início das tratativas (cronômetro)
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_kind_chk CHECK (kind IN ('visita','apresentacao')),
  CONSTRAINT appointments_channel_chk CHECK (channel IN ('presencial','video','ligacao')),
  CONSTRAINT appointments_status_chk CHECK (status IN ('proposed','confirmed','done','cancelled','no_show'))
);
CREATE INDEX IF NOT EXISTS idx_appointments_org_status
  ON public.appointments (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_broker
  ON public.appointments (broker_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_ia_deal
  ON public.appointments (ia_deal_id);
-- No máximo um agendamento ABERTO (proposed/confirmed) por deal de IA —
-- idempotência da criação ao entrar na etapa 6.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_open_per_ia_deal
  ON public.appointments (ia_deal_id)
  WHERE status IN ('proposed','confirmed');

-- 2.4 Briefing entregue ao corretor (~20 campos do plano §12).
CREATE TABLE IF NOT EXISTS public.broker_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ia_deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
  broker_deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
  broker_id uuid REFERENCES public.broker_profiles(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'agendamento',  -- agendamento | troca_voz
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,   -- os ~20 campos montados
  channels_sent jsonb NOT NULL DEFAULT '[]'::jsonb, -- ['whatsapp'] (email = TODO)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broker_briefings_broker
  ON public.broker_briefings (broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_briefings_ia_deal
  ON public.broker_briefings (ia_deal_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_broker_profiles_updated ON public.broker_profiles;
CREATE TRIGGER trg_broker_profiles_updated BEFORE UPDATE ON public.broker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_appointments_updated ON public.appointments;
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) HELPER — ids de corretor do usuário logado
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_broker_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.id
    FROM public.broker_profiles b
   WHERE b.user_id = auth.uid()
     AND b.organization_id = public.current_org_id()
$$;
REVOKE ALL ON FUNCTION public.current_broker_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_broker_ids() TO authenticated;

-- ============================================================
-- 4) RLS
-- ============================================================
ALTER TABLE public.broker_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_briefings    ENABLE ROW LEVEL SECURITY;

-- 4.1 broker_profiles: membros leem; admin escreve --------------------------
DROP POLICY IF EXISTS "Membros veem corretores"   ON public.broker_profiles;
DROP POLICY IF EXISTS "Admins criam corretores"   ON public.broker_profiles;
DROP POLICY IF EXISTS "Admins atualizam corretores" ON public.broker_profiles;
DROP POLICY IF EXISTS "Admins excluem corretores" ON public.broker_profiles;
CREATE POLICY "Membros veem corretores"
  ON public.broker_profiles FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam corretores"
  ON public.broker_profiles FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam corretores"
  ON public.broker_profiles FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem corretores"
  ON public.broker_profiles FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 4.2 broker_availability: membros leem; admin escreve ----------------------
DROP POLICY IF EXISTS "Membros veem agenda"   ON public.broker_availability;
DROP POLICY IF EXISTS "Admins criam agenda"   ON public.broker_availability;
DROP POLICY IF EXISTS "Admins atualizam agenda" ON public.broker_availability;
DROP POLICY IF EXISTS "Admins excluem agenda" ON public.broker_availability;
CREATE POLICY "Membros veem agenda"
  ON public.broker_availability FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam agenda"
  ON public.broker_availability FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam agenda"
  ON public.broker_availability FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem agenda"
  ON public.broker_availability FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 4.3 appointments: admin vê tudo; corretor vê só os seus -------------------
-- Ações de negócio (propor/confirmar/escalar) vão por RPC; aqui só leitura
-- (e UPDATE livre do dono/admin para ajustes de metadata/status manual).
DROP POLICY IF EXISTS "Veem agendamentos"   ON public.appointments;
DROP POLICY IF EXISTS "Atualizam agendamentos proprios" ON public.appointments;
CREATE POLICY "Veem agendamentos"
  ON public.appointments FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR broker_id IN (SELECT public.current_broker_ids())
    )
  );
CREATE POLICY "Atualizam agendamentos proprios"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR broker_id IN (SELECT public.current_broker_ids())
    )
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR broker_id IN (SELECT public.current_broker_ids())
    )
  );
-- INSERT/DELETE: sem policy authenticated → só service_role (RPC/roleta).

-- 4.4 broker_briefings: admin vê tudo; corretor vê só os seus ---------------
DROP POLICY IF EXISTS "Veem briefings"   ON public.broker_briefings;
CREATE POLICY "Veem briefings"
  ON public.broker_briefings FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR broker_id IN (SELECT public.current_broker_ids())
    )
  );
-- INSERT/UPDATE/DELETE: só service_role (gerado por RPC).

-- ============================================================
-- 5) FUNIL DO CORRETOR (8 etapas) — seed na org de produção
-- ============================================================
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_funnel_id text := 'fun-corretor-mcmv';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'Org % inexistente — pulando seed do funil do corretor.', v_org;
    RETURN;
  END IF;

  INSERT INTO public.funnels (id, name, description, icon, color, position, is_ai_funnel, organization_id, context_tags, stages)
  VALUES (
    v_funnel_id,
    'Funil do Corretor — MCMV',
    'Funil operado pelo corretor humano após o crédito aprovado (8 etapas).',
    'UserRound',
    'hsl(var(--primary))',
    2,
    false,
    v_org,
    '["mcmv","venda","corretor"]'::jsonb,
    '[
      {"id":"cor-agendar-visita","name":"Agendar visita","probability":40,"maxDaysInStage":2,"touchpoints":[]},
      {"id":"cor-visita-agendada","name":"Visita agendada","probability":50,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"cor-agendar-apresentacao","name":"Agendar apresentação do imóvel","probability":55,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"cor-apresentacao-agendada","name":"Apresentação de imóvel agendada","probability":60,"maxDaysInStage":3,"touchpoints":[]},
      {"id":"cor-acompanhamento","name":"Acompanhamento","probability":70,"maxDaysInStage":7,"touchpoints":[]},
      {"id":"cor-negociacao","name":"Negociação avançada","probability":80,"maxDaysInStage":7,"touchpoints":[]},
      {"id":"cor-assinar-contrato","name":"Assinar contrato","probability":90,"maxDaysInStage":5,"touchpoints":[]},
      {"id":"cor-assinado","name":"Contrato assinado","probability":100,"maxDaysInStage":1,"touchpoints":[]}
    ]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        stages = EXCLUDED.stages,
        updated_at = now();

  -- funnel_stages (sem arquétipo de IA; operado por humano).
  INSERT INTO public.funnel_stages
    (organization_id, funnel_id, stage_id, position, stage_archetype_id, context_tags, purpose, ai_autonomy_mode)
  VALUES
    (v_org, v_funnel_id, 'cor-agendar-visita',        1, NULL, '["corretor","mcmv"]'::jsonb, 'Lead aprovado, IA não agendou (troca de voz). Corretor contata.', 'disabled'),
    (v_org, v_funnel_id, 'cor-visita-agendada',       2, NULL, '["corretor","mcmv"]'::jsonb, 'Visita marcada, ainda não realizada.', 'disabled'),
    (v_org, v_funnel_id, 'cor-agendar-apresentacao',  3, NULL, '["corretor","mcmv"]'::jsonb, 'Pós-visita; agendar apresentação do imóvel.', 'disabled'),
    (v_org, v_funnel_id, 'cor-apresentacao-agendada', 4, NULL, '["corretor","mcmv"]'::jsonb, 'Apresentação marcada, não realizada.', 'disabled'),
    (v_org, v_funnel_id, 'cor-acompanhamento',        5, NULL, '["corretor","mcmv"]'::jsonb, 'Imóvel visitado; acompanhamento para avançar.', 'disabled'),
    (v_org, v_funnel_id, 'cor-negociacao',            6, NULL, '["corretor","mcmv"]'::jsonb, 'Negociação avançada antes da assinatura.', 'disabled'),
    (v_org, v_funnel_id, 'cor-assinar-contrato',      7, NULL, '["corretor","mcmv"]'::jsonb, 'OK verbal; administrativo confecciona o contrato.', 'disabled'),
    (v_org, v_funnel_id, 'cor-assinado',              8, NULL, '["corretor","mcmv"]'::jsonb, 'Cliente oficial. Status ganho. Etapa final.', 'disabled')
  ON CONFLICT (funnel_id, stage_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        position = EXCLUDED.position,
        purpose = EXCLUDED.purpose,
        ai_autonomy_mode = EXCLUDED.ai_autonomy_mode,
        updated_at = now();
END $$;

-- ============================================================
-- 6) ROLETA DE CORRETORES (determinística, ponderada, sem random)
-- ============================================================
-- Mesma fórmula da roleta de correspondentes (Fase 2C):
--   score = distribution_pct / (1 + carga_aberta)
-- carga = appointments abertos (proposed/confirmed) do corretor na org.
-- distribution_pct=0 nunca elegível. Determinístico, proporcional no tempo.
-- Empate → menor position → menor id. M2M (service_role).
CREATE OR REPLACE FUNCTION public.assign_broker_internal(
  p_org uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_broker_id uuid;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'org_obrigatoria';
  END IF;

  -- Serializa atribuições concorrentes da mesma org (evita corrida de contagem).
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_assign_broker_' || p_org::text));

  SELECT b.id INTO v_broker_id
  FROM public.broker_profiles b
  LEFT JOIN (
    SELECT ap.broker_id AS brid, count(*) AS n
    FROM public.appointments ap
    WHERE ap.organization_id = p_org
      AND ap.status IN ('proposed','confirmed')
    GROUP BY ap.broker_id
  ) c ON c.brid = b.id
  WHERE b.organization_id = p_org
    AND b.is_active
    AND b.distribution_pct > 0
  ORDER BY (b.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC,
           b.position ASC, b.id ASC
  LIMIT 1;

  RETURN v_broker_id;  -- pode ser NULL (sem corretor disponível → admin redistribui)
END;
$$;
REVOKE ALL ON FUNCTION public.assign_broker_internal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_broker_internal(uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.assign_broker_internal(uuid) TO service_role;

-- ============================================================
-- 7) PROPOSTA DE HORÁRIOS — "mais breve possível", 2 opções por vez
-- ============================================================
-- Gera até 2 slots a partir de p_from, dentro da disponibilidade do corretor,
-- respeitando granularidade de 1h. Sem corretor/agenda → cai na preferência da
-- imobiliária (seg–sex 8–18, sáb 8–12) como fallback. NÃO persiste; só calcula.
-- Determinística (recebe p_from; não usa now()) → testável.
CREATE OR REPLACE FUNCTION public.propose_appointment_slots(
  p_broker_id uuid,
  p_from timestamptz,
  p_count integer DEFAULT 2
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slots jsonb := '[]'::jsonb;
  v_cursor timestamptz := date_trunc('hour', p_from) + interval '1 hour';
  v_guard integer := 0;
  v_dow smallint;
  v_t time;
  v_ok boolean;
  v_limit integer := GREATEST(LEAST(p_count, 5), 1);
BEGIN
  -- Varre hora a hora (máx 14 dias = 336h) procurando janelas válidas.
  WHILE jsonb_array_length(v_slots) < v_limit AND v_guard < 336 LOOP
    v_guard := v_guard + 1;
    v_dow := EXTRACT(DOW FROM v_cursor)::smallint;
    v_t := v_cursor::time;
    v_ok := false;

    IF p_broker_id IS NOT NULL THEN
      -- Dentro de alguma janela ativa do corretor naquele weekday?
      SELECT EXISTS (
        SELECT 1 FROM public.broker_availability a
        WHERE a.broker_id = p_broker_id
          AND a.is_active
          AND a.weekday = v_dow
          AND v_t >= a.start_time
          AND v_t < a.end_time
      ) INTO v_ok;
    END IF;

    -- Fallback preferência da imobiliária quando o corretor não cobre ESTE
    -- weekday (sem corretor, sem agenda no dia, ou sem nenhuma agenda) — H3:
    -- seg–sex (1–5) 08–18; sáb (6) 08–12.
    IF NOT v_ok AND (p_broker_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.broker_availability a
        WHERE a.broker_id = p_broker_id AND a.is_active
          AND a.weekday = v_dow)) THEN
      IF v_dow BETWEEN 1 AND 5 AND v_t >= time '08:00' AND v_t < time '18:00' THEN
        v_ok := true;
      ELSIF v_dow = 6 AND v_t >= time '08:00' AND v_t < time '12:00' THEN
        v_ok := true;
      END IF;
    END IF;

    IF v_ok THEN
      v_slots := v_slots || jsonb_build_object('at', to_char(v_cursor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    v_cursor := v_cursor + interval '1 hour';
  END LOOP;

  RETURN v_slots;
END;
$$;
REVOKE ALL ON FUNCTION public.propose_appointment_slots(uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_appointment_slots(uuid, timestamptz, integer) TO service_role, authenticated;

-- ============================================================
-- 8) BRIEFING — monta os ~20 campos e enfileira o envio (WhatsApp)
-- ============================================================
-- M2M (service_role). Coleta dados do deal/IA e grava broker_briefings;
-- enfileira internal_notifications kind='broker_briefing' (drenada pelo
-- send-internal-notification → WhatsApp do corretor). E-mail = TODO.
-- O texto final do WhatsApp é montado pela edge (sanitiza nome do lead).
CREATE OR REPLACE FUNCTION public.generate_broker_briefing_internal(
  p_ia_deal_id text,
  p_broker_deal_id text,
  p_broker_id uuid,
  p_appointment_id uuid,
  p_reason text DEFAULT 'agendamento'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_deal record;
  v_appt record;
  v_fields jsonb;
  v_briefing_id uuid;
BEGIN
  SELECT d.organization_id, d.lead_name, d.lead_id, d.value, d.property, d.property_code,
         d.funnel_id, d.stage_id, d.last_activity_summary
    INTO v_deal
  FROM public.deals d
  WHERE d.id = p_ia_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  v_org := v_deal.organization_id;

  SELECT a.scheduled_at, a.channel, a.location, a.kind, a.attempts
    INTO v_appt
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  -- Telefone do lead (lead_channels ativo do deal de origem).
  v_fields := jsonb_build_object(
    'lead_name', COALESCE(v_deal.lead_name, ''),
    'lead_phone', (
      SELECT lc.phone_e164 FROM public.lead_channels lc
      WHERE lc.deal_id = p_ia_deal_id AND lc.is_active
      ORDER BY lc.created_at LIMIT 1
    ),
    'value', v_deal.value,
    'property', v_deal.property,
    'property_code', v_deal.property_code,
    'summary', COALESCE(v_deal.last_activity_summary, ''),
    'reason', p_reason,
    'appointment', CASE WHEN v_appt IS NOT NULL THEN jsonb_build_object(
        'scheduled_at', v_appt.scheduled_at,
        'channel', v_appt.channel,
        'location', v_appt.location,
        'kind', v_appt.kind,
        'attempts', v_appt.attempts
      ) ELSE NULL END,
    -- Match de imóveis entra na Fase 3B; por ora sinaliza captação a definir.
    'property_match', 'a_definir_fase3b',
    'history_link', '/?deal=' || p_ia_deal_id
  );

  INSERT INTO public.broker_briefings
    (organization_id, ia_deal_id, broker_deal_id, broker_id, appointment_id, reason, fields, channels_sent)
  VALUES
    (v_org, p_ia_deal_id, p_broker_deal_id, p_broker_id, p_appointment_id, p_reason, v_fields, '[]'::jsonb)
  RETURNING id INTO v_briefing_id;

  -- Enfileira o envio ao corretor (WhatsApp via cron drain).
  INSERT INTO public.internal_notifications
    (organization_id, kind, deal_id, attendant_id, payload, status)
  VALUES
    (v_org, 'broker_briefing', p_ia_deal_id, NULL,
     jsonb_build_object('briefing_id', v_briefing_id, 'broker_id', p_broker_id), 'pending');

  RETURN v_briefing_id;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) TO service_role;

-- ============================================================
-- 9) TRANSFERÊNCIA AO CORRETOR — cria card no funil do corretor + lastro
-- ============================================================
-- Função interna comum a "agendamento bem-sucedido" (etapa 8) e "troca de voz"
-- (etapa 9). Cria o card no funil do corretor (com mirror_deal_id apontando ao
-- card da IA = lastro), gera o briefing e enfileira o envio. Idempotente: se já
-- existe card-corretor espelhando este deal-IA, reusa.
CREATE OR REPLACE FUNCTION public.transfer_deal_to_broker_internal(
  p_ia_deal_id text,
  p_broker_id uuid,
  p_target_corretor_stage text,   -- 'cor-visita-agendada' (8) ou 'cor-agendar-visita' (9)
  p_reason text,
  p_appointment_id uuid DEFAULT NULL
) RETURNS TABLE (
  broker_deal_id text,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_deal record;
  v_new_id text;
  v_existing text;
BEGIN
  SELECT d.organization_id, d.lead_id, d.lead_name, d.property, d.property_code, d.value
    INTO v_deal
  FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  v_org := v_deal.organization_id;

  PERFORM pg_advisory_xact_lock(hashtext('omnimob_transfer_' || p_ia_deal_id));

  -- Idempotência: já há card-corretor espelhando este deal-IA? (filtra org — C3)
  SELECT d.id INTO v_existing
  FROM public.deals d
  WHERE d.organization_id = v_org
    AND d.funnel_id = 'fun-corretor-mcmv'
    AND d.mirror_deal_id = p_ia_deal_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    broker_deal_id := v_existing;
    created := false;
    RETURN NEXT; RETURN;
  END IF;

  v_new_id := 'cordeal-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.deals
    (id, funnel_id, stage_id, lead_id, lead_name, property, property_code, value,
     status, organization_id, assigned_to, mirror_deal_id, status_reason)
  VALUES
    (v_new_id, 'fun-corretor-mcmv', p_target_corretor_stage, v_deal.lead_id, v_deal.lead_name,
     v_deal.property, v_deal.property_code, v_deal.value, 'open', v_org,
     (SELECT user_id FROM public.broker_profiles WHERE id = p_broker_id),
     p_ia_deal_id, p_reason);

  -- Gera o briefing (best-effort; falha de briefing não desfaz a transferência).
  BEGIN
    PERFORM public.generate_broker_briefing_internal(
      p_ia_deal_id, v_new_id, p_broker_id, p_appointment_id,
      CASE WHEN p_target_corretor_stage = 'cor-agendar-visita' THEN 'troca_voz' ELSE 'agendamento' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'falha ao gerar briefing p/ deal %: %', p_ia_deal_id, SQLERRM;
  END;

  broker_deal_id := v_new_id;
  created := true;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_deal_to_broker_internal(text, uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_deal_to_broker_internal(text, uuid, text, text, uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.transfer_deal_to_broker_internal(text, uuid, text, text, uuid) TO service_role;

-- ============================================================
-- 10) CONFIRMAÇÃO DE AGENDAMENTO — IA 6/7 → 8 + transfere (sucesso)
-- ============================================================
-- Chamada pela edge quando o lead aceita um horário. Confirma o appointment,
-- move o deal-IA para 'ia-transferido' (8) e cria o card no funil do corretor
-- na etapa 2 ('cor-visita-agendada'), mantendo o lastro. M2M.
CREATE OR REPLACE FUNCTION public.confirm_appointment_internal(
  p_ia_deal_id text,
  p_scheduled_at timestamptz,
  p_channel text DEFAULT 'presencial',
  p_location text DEFAULT NULL
) RETURNS TABLE (
  appointment_id uuid,
  broker_deal_id text,
  broker_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_appt_id uuid;          -- C1: escalares separados em vez de record parcial
  v_appt_broker_id uuid;
  v_broker_id uuid;
  v_now timestamptz := now();
  v_transfer_deal text;
BEGIN
  SELECT d.organization_id INTO v_org FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  IF p_channel NOT IN ('presencial','video','ligacao') THEN
    RAISE EXCEPTION 'canal_invalido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('omnimob_confirm_' || p_ia_deal_id));

  -- Pega (ou cria) o appointment aberto do deal.
  SELECT a.id, a.broker_id INTO v_appt_id, v_appt_broker_id
  FROM public.appointments a
  WHERE a.ia_deal_id = p_ia_deal_id AND a.status IN ('proposed','confirmed')
  LIMIT 1;

  IF v_appt_id IS NOT NULL THEN
    v_broker_id := v_appt_broker_id;
  ELSE
    v_broker_id := public.assign_broker_internal(v_org);
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at)
    VALUES (v_org, p_ia_deal_id, v_broker_id, 'visita', p_channel, 'proposed', v_now)
    RETURNING id INTO v_appt_id;
  END IF;

  -- Se ainda não há corretor (roleta vazia no 1º caminho), tenta atribuir agora.
  IF v_broker_id IS NULL THEN
    v_broker_id := public.assign_broker_internal(v_org);
  END IF;

  -- Resolve o corretor final ANTES do UPDATE (evita referência à coluna
  -- broker_id no SET, que colide com a variável de saída da RETURNS TABLE).
  v_broker_id := COALESCE(v_appt_broker_id, v_broker_id);

  -- Confirma o appointment. Não referencia a coluna broker_id no lado direito
  -- do SET — usa só a variável já resolvida.
  UPDATE public.appointments
     SET status = 'confirmed',
         scheduled_at = p_scheduled_at,
         channel = p_channel,
         location = p_location,
         broker_id = v_broker_id,
         confirmed_at = v_now,
         updated_at = v_now
   WHERE id = v_appt_id;

  -- M1: sem corretor disponível mesmo após roleta — sinaliza p/ admin redistribuir.
  IF v_broker_id IS NULL THEN
    RAISE WARNING 'confirm_appointment: nenhum corretor disponível p/ deal % (org %) — appointment % confirmado sem corretor; redistribuir no painel', p_ia_deal_id, v_org, v_appt_id;
  END IF;

  -- Move o deal-IA para 'ia-transferido' (etapa 8).
  PERFORM public.move_deal_stage_internal(
    p_ia_deal_id, 'ia-transferido',
    'agendamento confirmado: ' || to_char(p_scheduled_at, 'DD/MM HH24:MI'), NULL);

  -- Cria o card no funil do corretor (etapa 2 = visita agendada) + lastro + briefing.
  SELECT t.broker_deal_id INTO v_transfer_deal
  FROM public.transfer_deal_to_broker_internal(
    p_ia_deal_id, v_broker_id, 'cor-visita-agendada',
    'transferência por agendamento bem-sucedido', v_appt_id) t;

  appointment_id := v_appt_id;
  broker_deal_id := v_transfer_deal;
  broker_id := v_broker_id;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_appointment_internal(text, timestamptz, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_appointment_internal(text, timestamptz, text, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_internal(text, timestamptz, text, text) TO service_role;

-- ============================================================
-- 11) TROCA DE VOZ — cadência esgotada → IA 9 + transfere p/ corretor etapa 1
-- ============================================================
-- M2M. Move o deal-IA para 'ia-troca-voz' (9) e cria o card no funil do corretor
-- na etapa 1 ('cor-agendar-visita'). Silenciosa (não comunica o lead). Idempotente.
CREATE OR REPLACE FUNCTION public.escalate_to_broker_internal(
  p_ia_deal_id text,
  p_reason text DEFAULT 'cadência de agendamento esgotada'
) RETURNS TABLE (
  broker_deal_id text,
  broker_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_broker_id uuid;
  v_transfer record;
BEGIN
  SELECT d.organization_id INTO v_org FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('omnimob_escalate_' || p_ia_deal_id));

  v_broker_id := public.assign_broker_internal(v_org);

  -- Marca o appointment aberto como cancelado (tentativas esgotadas).
  UPDATE public.appointments
     SET status = 'cancelled', updated_at = now(),
         metadata = metadata || jsonb_build_object('escalated_reason', p_reason)
   WHERE ia_deal_id = p_ia_deal_id AND status IN ('proposed','confirmed');

  PERFORM public.move_deal_stage_internal(p_ia_deal_id, 'ia-troca-voz', p_reason, NULL);

  SELECT t.broker_deal_id INTO v_transfer
  FROM public.transfer_deal_to_broker_internal(
    p_ia_deal_id, v_broker_id, 'cor-agendar-visita', p_reason, NULL) t;

  broker_deal_id := v_transfer.broker_deal_id;
  broker_id := v_broker_id;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_to_broker_internal(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.escalate_to_broker_internal(text, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.escalate_to_broker_internal(text, text) TO service_role;

-- ============================================================
-- 12) TRIGGER — deal entra na etapa 6 → enfileira 1º contato de agendamento
-- ============================================================
-- Quando o deal-IA chega em 'ia-aprovado-aguardando' (etapa 6, saída da
-- devolutiva aprovada), cria o appointment 'proposed' (com roleta de corretor)
-- e enfileira a fila de resposta (ai_response_queue) p/ a IA fazer o 1º contato.
-- suggest_only: NÃO move sozinho; só prepara o appointment + enfileira.
CREATE OR REPLACE FUNCTION public.tg_start_scheduling_on_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_ai boolean;
  v_broker_id uuid;
  v_channel_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Early return: UPDATE que não mexe na etapa não interessa.
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_id <> 'ia-aprovado-aguardando' THEN
    RETURN NEW;
  END IF;

  SELECT f.is_ai_funnel INTO v_is_ai FROM public.funnels f WHERE f.id = NEW.funnel_id;
  IF NOT COALESCE(v_is_ai, false) THEN
    RETURN NEW;
  END IF;

  -- Cria appointment 'proposed' (idempotente pelo índice parcial). Roleta define
  -- o corretor que vai receber a transferência ao fim do agendamento.
  v_broker_id := public.assign_broker_internal(NEW.organization_id);
  BEGIN
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at, attempts)
    VALUES
      (NEW.organization_id, NEW.id, v_broker_id, 'visita', 'presencial', 'proposed', v_now, 0);
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- já há appointment aberto p/ este deal
  END;

  -- Enfileira a 1ª resposta de agendamento (suggest_only; worker gera o texto).
  SELECT id INTO v_channel_id FROM public.lead_channels
   WHERE deal_id = NEW.id AND is_active ORDER BY created_at LIMIT 1;

  INSERT INTO public.ai_response_queue
    (organization_id, deal_id, funnel_id, stage_id, lead_channel_id,
     lead_message, status, autonomy_mode, context)
  VALUES
    (NEW.organization_id, NEW.id, NEW.funnel_id, 'ia-aprovado-aguardando', v_channel_id,
     '[gatilho interno: crédito aprovado — iniciar tratativas de agendamento]',
     'pending', 'suggest_only',
     jsonb_build_object('trigger', 'scheduling_kickoff', 'broker_id', v_broker_id))
  ON CONFLICT DO NOTHING;  -- H2: não duplica se já há item pending p/ o deal

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_scheduling_on_approved ON public.deals;
CREATE TRIGGER trg_start_scheduling_on_approved
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_start_scheduling_on_approved();

-- ============================================================
-- 13) SLA / CADÊNCIA DE AGENDAMENTO — esgotamento → troca de voz
-- ============================================================
-- Plano §9-E: 3 dias, até 3 tentativas/dia (manhã/tarde/noite até 20h) = até 9;
-- no 4º dia sem agendar → troca de voz silenciosa. Aqui: appointments 'proposed'
-- cujo first_attempt_at passou de p_days dias OU attempts >= p_max_attempts são
-- escalados. Idempotente (escalate marca cancelado). Chamada pelo cron.
CREATE OR REPLACE FUNCTION public.flag_scheduling_exhausted(
  p_days integer DEFAULT 3,
  p_max_attempts integer DEFAULT 9
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT a.ia_deal_id
    FROM public.appointments a
    WHERE a.status = 'proposed'
      AND a.ia_deal_id IS NOT NULL
      AND (
        a.first_attempt_at < now() - make_interval(days => GREATEST(p_days, 1))
        OR a.attempts >= GREATEST(p_max_attempts, 1)
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.escalate_to_broker_internal(
        r.ia_deal_id, 'cadência de agendamento esgotada (SLA)');
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'falha ao escalar deal %: %', r.ia_deal_id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_scheduling_exhausted(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_scheduling_exhausted(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_scheduling_exhausted(integer, integer) TO service_role;

-- ============================================================
-- 14) CRON — cadência de agendamento (a cada 30 min)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'broker-scheduling-cadence';

-- L1: avisa se a base URL não está no GUC (job ficará com URL NULL até o passo
-- pós-deploy recriar com token+URL inline).
DO $$
BEGIN
  IF current_setting('app.functions_base_url', true) IS NULL THEN
    RAISE WARNING 'app.functions_base_url ausente — job broker-scheduling-cadence criado com URL NULL; recriar manualmente (ver NOTA PÓS-DEPLOY).';
  END IF;
END $$;

-- Recriado pós-deploy com token + URL INLINE (GUC app.* bloqueada p/ postgres
-- no self-hosted; mesmo padrão de dispatch-ai-queue/credit-analysis-sla).
SELECT cron.schedule(
  'broker-scheduling-cadence',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.functions_base_url', true) || '/broker-scheduling-cadence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_dispatch_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTA PÓS-DEPLOY (manual, fora do git):
--   Recriar o job com token + URL INLINE (token = CRON_DISPATCH_TOKEN do stack):
--     SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='broker-scheduling-cadence';
--     SELECT cron.schedule('broker-scheduling-cadence','*/30 * * * *', $$
--       SELECT net.http_post(
--         url := 'https://supabase-vvdttv.duckdns.org/functions/v1/broker-scheduling-cadence',
--         headers := jsonb_build_object('Content-Type','application/json','x-cron-token','<TOKEN>'),
--         body := '{}'::jsonb); $$);
--   Conferir: SELECT jobname, active FROM cron.job WHERE jobname='broker-scheduling-cadence';
-- ============================================================
