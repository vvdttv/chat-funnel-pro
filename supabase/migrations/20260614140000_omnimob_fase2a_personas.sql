-- ============================================================================
-- Omnimob Fase 2A — Personas + Números WhatsApp
-- ============================================================================
-- Cria:
--   1. agent_personas    — identidade fixa que atende o lead (P1/P2). Nome, sexo,
--                          personalidade, estilo, tom, missão, foto.
--   2. whatsapp_numbers  — números (oficial/não-oficial) vinculados a uma persona.
--   3. FKs pendentes em conversations.persona_id / whatsapp_number_id (colunas
--      já criadas na Fase 0; aqui ligamos as constraints).
--
-- Padrões seguidos (verificados nas migrations existentes):
--   - RLS habilitado; SELECT para membros (current_org_id()), escrita só admin
--     (is_org_admin()), exatamente como playbook_overrides/funnel_stages.
--   - trigger updated_at reusa public.update_updated_at_column().
--   - escrita pelas edge functions é via service_role (bypassa RLS).
--   - FK a deals é text; aqui tudo é uuid (org-scoped).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agent_personas
-- ----------------------------------------------------------------------------
-- O lead percebe apenas 2 personas (P1 passiva/tráfego, P2 ativa/indicação),
-- mesmo que o backend rode vários agentes. "Trocou de número, trocou de persona".
CREATE TABLE IF NOT EXISTS public.agent_personas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  gender          text,                       -- livre: 'feminino' | 'masculino' | etc.
  personality     text NOT NULL DEFAULT '',   -- traços de personalidade
  style           text NOT NULL DEFAULT '',   -- estilo de escrita/abordagem
  tone            text NOT NULL DEFAULT '',    -- tom (entra na identity do playbook)
  mission         text NOT NULL DEFAULT '',    -- missão (entra na identity do playbook)
  identity_notes  text NOT NULL DEFAULT '',    -- notas livres injetadas no prompt
  photo_url       text,                        -- foto pública (bucket whatsapp-media-public)
  is_active       boolean NOT NULL DEFAULT true,
  position        int NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_personas_org_idx
  ON public.agent_personas (organization_id);

ALTER TABLE public.agent_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membros da org leem personas" ON public.agent_personas;
CREATE POLICY "membros da org leem personas"
  ON public.agent_personas FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "admins criam personas" ON public.agent_personas;
CREATE POLICY "admins criam personas"
  ON public.agent_personas FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS "admins atualizam personas" ON public.agent_personas;
CREATE POLICY "admins atualizam personas"
  ON public.agent_personas FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS "admins excluem personas" ON public.agent_personas;
CREATE POLICY "admins excluem personas"
  ON public.agent_personas FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_personas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. whatsapp_numbers
-- ----------------------------------------------------------------------------
-- Números ilimitados (oficial Cloud API e não-oficial WAHA). Operação padrão:
-- 2 personas em 2 números fixos. Mapeamento número -> persona -> provider.
CREATE TABLE IF NOT EXISTS public.whatsapp_numbers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  persona_id         uuid REFERENCES public.agent_personas(id) ON DELETE SET NULL,
  label              text NOT NULL DEFAULT '',
  provider           text NOT NULL DEFAULT 'waha'
                       CHECK (provider IN ('waha', 'cloud_api')),
  phone_e164         text NOT NULL,
  -- sessão WAHA (não-oficial). Para Cloud API fica NULL.
  waha_session       text,
  -- phone_number_id da Meta Cloud API (oficial). NULL enquanto não provisionado.
  external_number_id text,
  is_active          boolean NOT NULL DEFAULT true,
  is_default         boolean NOT NULL DEFAULT false,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS whatsapp_numbers_org_idx
  ON public.whatsapp_numbers (organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_numbers_persona_idx
  ON public.whatsapp_numbers (persona_id);
-- no máximo um número default por organização
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_numbers_one_default_per_org
  ON public.whatsapp_numbers (organization_id)
  WHERE is_default;

ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membros da org leem numeros" ON public.whatsapp_numbers;
CREATE POLICY "membros da org leem numeros"
  ON public.whatsapp_numbers FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "admins criam numeros" ON public.whatsapp_numbers;
CREATE POLICY "admins criam numeros"
  ON public.whatsapp_numbers FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS "admins atualizam numeros" ON public.whatsapp_numbers;
CREATE POLICY "admins atualizam numeros"
  ON public.whatsapp_numbers FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS "admins excluem numeros" ON public.whatsapp_numbers;
CREATE POLICY "admins excluem numeros"
  ON public.whatsapp_numbers FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

DROP TRIGGER IF EXISTS set_updated_at ON public.whatsapp_numbers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. FKs pendentes em conversations (colunas criadas na Fase 0)
-- ----------------------------------------------------------------------------
-- Ligadas agora que as tabelas-alvo existem. ON DELETE SET NULL: perder uma
-- persona/número não apaga o histórico de conversa (princípio de persistência total).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'conversations_persona_id_fkey'
      AND n.nspname = 'public' AND r.relname = 'conversations'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_persona_id_fkey
      FOREIGN KEY (persona_id) REFERENCES public.agent_personas(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'conversations_whatsapp_number_id_fkey'
      AND n.nspname = 'public' AND r.relname = 'conversations'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_whatsapp_number_id_fkey
      FOREIGN KEY (whatsapp_number_id) REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_persona_idx
  ON public.conversations (persona_id);
CREATE INDEX IF NOT EXISTS conversations_whatsapp_number_idx
  ON public.conversations (whatsapp_number_id);
