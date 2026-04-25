-- =========================================================================
-- Configurador Conversacional da IA — Fase 1
-- =========================================================================

-- Tabela: ia_config_sessions ------------------------------------------------
CREATE TABLE public.ia_config_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  original_message text NOT NULL,
  fixed_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_summary text NOT NULL DEFAULT '',
  created_artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','reverted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid
);

CREATE INDEX idx_ia_config_sessions_org_created
  ON public.ia_config_sessions(organization_id, created_at DESC);

CREATE INDEX idx_ia_config_sessions_user
  ON public.ia_config_sessions(user_id, created_at DESC);

ALTER TABLE public.ia_config_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem sessoes da org"
  ON public.ia_config_sessions
  FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "Membros criam sessoes da org"
  ON public.ia_config_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND user_id = auth.uid());

CREATE POLICY "Admins atualizam sessoes da org"
  ON public.ia_config_sessions
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- Tabela: ia_config_prefs ---------------------------------------------------
CREATE TABLE public.ia_config_prefs (
  user_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_scope text,
  last_scope_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_trigger text,
  last_polarity text,
  last_tone text,
  last_format text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_config_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve suas proprias prefs"
  ON public.ia_config_prefs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuario insere suas proprias prefs"
  ON public.ia_config_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org_id());

CREATE POLICY "Usuario atualiza suas proprias prefs"
  ON public.ia_config_prefs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_ia_config_prefs_updated_at
  BEFORE UPDATE ON public.ia_config_prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket: whatsapp-media-public --------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media-public', 'whatsapp-media-public', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Midia WhatsApp publicamente legivel"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'whatsapp-media-public');

CREATE POLICY "Autenticados sobem midia WhatsApp"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media-public');

CREATE POLICY "Autenticados removem midia WhatsApp"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'whatsapp-media-public');