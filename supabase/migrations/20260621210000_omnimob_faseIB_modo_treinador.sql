-- ============================================================================
-- Fase I-B — Modo Treinador (feedback em tempo real da IA)
-- Omnimob v3. Idempotente. Não destrutivo. Ver ~/SPEC-MODO-TREINADOR.md
--
-- Feedback em linguagem natural → IA interpreta → (admin confirma) → gera
-- playbook_override no escopo da ETAPA → compose-playbook já aplica na próxima
-- resposta. 2 canais (painel + WhatsApp #modofeedback). Senhas com bcrypt.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- 1. Permissões de feedback (quem pode treinar via WhatsApp) -------------
CREATE TABLE IF NOT EXISTS public.feedback_permissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid,
  phone_e164      text NOT NULL,
  password_hash   text NOT NULL,            -- bcrypt (crypt + gen_salt('bf'))
  label           text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_permissions_org_phone_key UNIQUE (organization_id, phone_e164)
);
ALTER TABLE public.feedback_permissions ENABLE ROW LEVEL SECURITY;
-- RLS: leitura/escrita só admin; password_hash NUNCA exposto a authenticated comum.
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feedback_permissions' AND policyname='omni_fbperm_admin') THEN
    CREATE POLICY omni_fbperm_admin ON public.feedback_permissions TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- ---- 2. Sessões de modo treinador (estado no WhatsApp) ----------------------
CREATE TABLE IF NOT EXISTS public.ia_feedback_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  permission_id   bigint REFERENCES public.feedback_permissions(id) ON DELETE SET NULL,
  phone_e164      text NOT NULL,
  status          text NOT NULL DEFAULT 'aguardando_senha',  -- aguardando_senha | ativo | encerrado
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- ex.: última interpretação pendente de salvar
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_fb_sessions_status_chk CHECK (status IN ('aguardando_senha','ativo','encerrado'))
);
CREATE INDEX IF NOT EXISTS ia_fb_sessions_phone_idx ON public.ia_feedback_sessions (phone_e164, status);
ALTER TABLE public.ia_feedback_sessions ENABLE ROW LEVEL SECURITY;
-- service-role only (gerida pelo webhook). Sem policy = deny p/ authenticated.

-- ---- 3. Eventos de feedback (auditoria + base p/ §4.13) ---------------------
CREATE TABLE IF NOT EXISTS public.ia_feedback_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id             uuid,
  channel             text NOT NULL DEFAULT 'painel',  -- painel | whatsapp
  source_decision_log_id uuid,
  deal_id             text,
  funnel_id           text,
  stage_id            text,
  feedback_text       text NOT NULL,
  interpreted_summary text,
  generated_override_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_fb_events_channel_chk CHECK (channel IN ('painel','whatsapp'))
);
ALTER TABLE public.ia_feedback_events ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_feedback_events' AND policyname='omni_fbevents_select') THEN
    CREATE POLICY omni_fbevents_select ON public.ia_feedback_events FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $p$;

-- ---- 4. Seed: permissão do Vinícius (5514998236041) + senha @Vivi2026 -------
INSERT INTO public.feedback_permissions (organization_id, user_id, phone_e164, password_hash, label, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '8c7fb47a-1055-418a-8f03-74a4c74e0e7a',
  '+5514998236041',
  extensions.crypt('@Vivi2026', extensions.gen_salt('bf')),
  'Vinícius (superadmin)', true
)
ON CONFLICT (organization_id, phone_e164) DO UPDATE SET is_active = true, updated_at = now();

-- ---- 5. RPC admin: cadastra/atualiza permissão de feedback (senha→hash) -----
CREATE OR REPLACE FUNCTION public.upsert_feedback_permission(
  p_phone_e164 text, p_password text, p_user_id uuid DEFAULT NULL, p_label text DEFAULT '')
RETURNS TABLE(permission_id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid := public.current_org_id();
  v_id bigint;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN RAISE EXCEPTION 'senha_fraca (min 6)'; END IF;

  INSERT INTO public.feedback_permissions (organization_id, user_id, phone_e164, password_hash, label, is_active)
  VALUES (v_org, p_user_id, p_phone_e164, extensions.crypt(p_password, extensions.gen_salt('bf')), COALESCE(p_label,''), true)
  ON CONFLICT (organization_id, phone_e164) DO UPDATE
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')), user_id = COALESCE(EXCLUDED.user_id, feedback_permissions.user_id),
        label = EXCLUDED.label, is_active = true, updated_at = now()
  RETURNING id INTO v_id;
  permission_id := v_id; RETURN NEXT;
END;
$fn$;
REVOKE ALL ON FUNCTION public.upsert_feedback_permission(text, text, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_feedback_permission(text, text, uuid, text) TO authenticated;

-- ---- 6. RPC interna: verifica senha de um número (p/ webhook, service-role) -
-- Retorna a permission_id se número ativo + senha correta; senão NULL.
CREATE OR REPLACE FUNCTION public.verify_feedback_password_internal(p_phone_e164 text, p_password text)
RETURNS TABLE(permission_id bigint, organization_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT fp.id, fp.organization_id, fp.user_id
  FROM public.feedback_permissions fp
  WHERE fp.phone_e164 = p_phone_e164 AND fp.is_active
    AND fp.password_hash = extensions.crypt(p_password, fp.password_hash)
  LIMIT 1;
END;
$fn$;
REVOKE ALL ON FUNCTION public.verify_feedback_password_internal(text, text) FROM anon, authenticated, public;

-- ---- 7. RPC interna: grava o override a partir do feedback interpretado -----
-- Aplica o ajuste no escopo da ETAPA (scope_type='stage', scope_id='funnel::stage')
-- na layer 'stage'. Faz MERGE no payload se já houver override stage p/ a etapa.
-- Registra o evento de feedback (auditoria §4.13). Retorna o override_id.
CREATE OR REPLACE FUNCTION public.apply_feedback_override_internal(
  p_org uuid, p_funnel_id text, p_stage_id text, p_payload jsonb,
  p_feedback_text text, p_interpreted_summary text, p_channel text DEFAULT 'painel',
  p_user_id uuid DEFAULT NULL, p_deal_id text DEFAULT NULL, p_source_log uuid DEFAULT NULL)
RETURNS TABLE(override_id uuid, event_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_scope_id text := p_funnel_id || '::' || p_stage_id;
  v_ovr uuid;
  v_evt uuid;
  v_existing uuid;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'org_obrigatoria'; END IF;

  -- Merge: se já existe override stage/stage p/ esta etapa, mescla o payload.
  SELECT id INTO v_existing FROM public.playbook_overrides
   WHERE organization_id = p_org AND layer = 'stage_override'
     AND scope_type = 'stage' AND scope_id = v_scope_id AND is_active
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.playbook_overrides
       SET payload = payload || p_payload, updated_at = now()
     WHERE id = v_existing
    RETURNING id INTO v_ovr;
  ELSE
    INSERT INTO public.playbook_overrides (organization_id, scope_type, scope_id, layer, payload, is_active)
    VALUES (p_org, 'stage', v_scope_id, 'stage_override', p_payload, true)
    RETURNING id INTO v_ovr;
  END IF;

  INSERT INTO public.ia_feedback_events
    (organization_id, user_id, channel, source_decision_log_id, deal_id, funnel_id, stage_id,
     feedback_text, interpreted_summary, generated_override_id)
  VALUES
    (p_org, p_user_id, p_channel, p_source_log, p_deal_id, p_funnel_id, p_stage_id,
     p_feedback_text, p_interpreted_summary, v_ovr)
  RETURNING id INTO v_evt;

  override_id := v_ovr; event_id := v_evt; RETURN NEXT;
END;
$fn$;
REVOKE ALL ON FUNCTION public.apply_feedback_override_internal(uuid, text, text, jsonb, text, text, text, uuid, text, uuid) FROM anon, authenticated, public;
