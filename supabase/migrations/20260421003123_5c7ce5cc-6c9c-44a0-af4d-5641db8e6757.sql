-- ============================================================================
-- 1. ENUM de papéis
-- ============================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'corretor');

-- ============================================================================
-- 2. ORGANIZATIONS
-- ============================================================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. PROFILES
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  security_question TEXT,
  security_answer_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX idx_profiles_username ON public.profiles(username);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. USER_ROLES (tabela separada — segurança contra escalação)
-- ============================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_org ON public.user_roles(organization_id);

-- ============================================================================
-- 5. SECURITY DEFINER FUNCTIONS (evitam recursão em RLS)
-- ============================================================================

-- Verifica se o usuário tem um papel específico
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Retorna a organização do usuário logado
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Verifica se o usuário é admin da org atual
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.organization_id = p.organization_id
  )
$$;

-- ============================================================================
-- 6. RLS — organizations
-- ============================================================================
CREATE POLICY "Membros veem a própria organização"
  ON public.organizations FOR SELECT
  USING (id = public.current_org_id());

CREATE POLICY "Admins atualizam a própria organização"
  ON public.organizations FOR UPDATE
  USING (id = public.current_org_id() AND public.is_org_admin());

-- ============================================================================
-- 7. RLS — profiles
-- ============================================================================
CREATE POLICY "Usuários veem seu próprio perfil"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins veem perfis da própria org"
  ON public.profiles FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Usuários atualizam o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins atualizam perfis da própria org"
  ON public.profiles FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- INSERT/DELETE de profiles fica restrito à edge function (service role)

-- ============================================================================
-- 8. RLS — user_roles
-- ============================================================================
CREATE POLICY "Usuários veem seus próprios papéis"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins veem papéis da própria org"
  ON public.user_roles FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- INSERT/UPDATE/DELETE só via edge function (service role)

-- ============================================================================
-- 9. ALTERAR TABELAS EXISTENTES — adicionar organization_id
-- ============================================================================

-- Cria a empresa demo e o usuário admin antes de tornar as colunas NOT NULL
DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  -- Criar org demo
  INSERT INTO public.organizations (name) VALUES ('Empresa Demo')
  RETURNING id INTO v_org_id;

  -- Criar usuário no auth.users (vivi@app.local com senha @Vivi2026)
  -- Usando função interna do Supabase para hash de senha
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'vivi@app.local',
    crypt('@Vivi2026', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"vivi"}',
    false, '', '', '', ''
  ) RETURNING id INTO v_user_id;

  -- Criar profile
  INSERT INTO public.profiles (user_id, organization_id, username, display_name)
  VALUES (v_user_id, v_org_id, 'vivi', 'Vivi (Admin)');

  -- Atribuir papel admin
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_user_id, v_org_id, 'admin');

  -- Salvar o id da org demo para uso abaixo
  PERFORM set_config('app.demo_org_id', v_org_id::text, false);
  PERFORM set_config('app.demo_admin_id', v_user_id::text, false);
END $$;

-- Adicionar organization_id em funnels com default = org demo
ALTER TABLE public.funnels ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.funnels SET organization_id = current_setting('app.demo_org_id')::uuid;
ALTER TABLE public.funnels ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_funnels_org ON public.funnels(organization_id);

-- Adicionar organization_id e assigned_to em deals
ALTER TABLE public.deals ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.deals ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.deals SET organization_id = current_setting('app.demo_org_id')::uuid,
                         assigned_to = current_setting('app.demo_admin_id')::uuid;
ALTER TABLE public.deals ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_deals_org ON public.deals(organization_id);
CREATE INDEX idx_deals_assigned ON public.deals(assigned_to);

-- Adicionar organization_id em deal_stage_events
ALTER TABLE public.deal_stage_events ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.deal_stage_events SET organization_id = current_setting('app.demo_org_id')::uuid;
ALTER TABLE public.deal_stage_events ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_deal_stage_events_org ON public.deal_stage_events(organization_id);

-- ============================================================================
-- 10. REWRITE RLS — funnels
-- ============================================================================
DROP POLICY IF EXISTS "Funis são públicos para leitura" ON public.funnels;
DROP POLICY IF EXISTS "Qualquer um pode atualizar funis" ON public.funnels;
DROP POLICY IF EXISTS "Qualquer um pode criar funis" ON public.funnels;
DROP POLICY IF EXISTS "Qualquer um pode excluir funis" ON public.funnels;

CREATE POLICY "Membros veem funis da própria org"
  ON public.funnels FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam funis"
  ON public.funnels FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam funis"
  ON public.funnels FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem funis"
  ON public.funnels FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- ============================================================================
-- 11. REWRITE RLS — deals (corretor vê só os atribuídos a ele)
-- ============================================================================
DROP POLICY IF EXISTS "Deals públicos para leitura" ON public.deals;
DROP POLICY IF EXISTS "Qualquer um pode atualizar deals" ON public.deals;
DROP POLICY IF EXISTS "Qualquer um pode criar deals" ON public.deals;
DROP POLICY IF EXISTS "Qualquer um pode excluir deals" ON public.deals;

CREATE POLICY "Admins veem todos os deals da org"
  ON public.deals FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Corretores veem deals atribuídos a eles"
  ON public.deals FOR SELECT
  USING (organization_id = public.current_org_id() AND assigned_to = auth.uid());

CREATE POLICY "Admins criam deals"
  ON public.deals FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Corretores criam deals atribuídos a eles"
  ON public.deals FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND assigned_to = auth.uid());

CREATE POLICY "Admins atualizam todos os deals da org"
  ON public.deals FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Corretores atualizam seus deals"
  ON public.deals FOR UPDATE
  USING (organization_id = public.current_org_id() AND assigned_to = auth.uid());

CREATE POLICY "Admins excluem deals"
  ON public.deals FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- ============================================================================
-- 12. REWRITE RLS — deal_stage_events
-- ============================================================================
DROP POLICY IF EXISTS "Eventos públicos para leitura" ON public.deal_stage_events;
DROP POLICY IF EXISTS "Qualquer um pode registrar eventos" ON public.deal_stage_events;

CREATE POLICY "Admins veem todos os eventos da org"
  ON public.deal_stage_events FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Corretores veem eventos dos seus deals"
  ON public.deal_stage_events FOR SELECT
  USING (
    organization_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_stage_events.deal_id AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Eventos criados por membros da org"
  ON public.deal_stage_events FOR INSERT
  WITH CHECK (organization_id = public.current_org_id());

-- ============================================================================
-- 13. AJUSTAR get_stage_metrics para filtrar por org (segurança defense-in-depth)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_stage_metrics(p_funnel_id text, p_stage_id text)
RETURNS TABLE(total_value numeric, deal_count integer, close_probability integer, advance_probability integer, avg_days_to_advance numeric, avg_days_to_close numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passed_count int;
  v_won_count int;
  v_advanced_count int;
  v_avg_advance numeric;
  v_avg_close numeric;
  v_org UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_org := public.current_org_id();
  v_is_admin := public.is_org_admin();

  -- Valor e contagem ATUAIS na etapa (filtra por org + visibilidade)
  SELECT COALESCE(SUM(value), 0), COUNT(*)::int
    INTO total_value, deal_count
  FROM public.deals
  WHERE funnel_id = p_funnel_id
    AND stage_id = p_stage_id
    AND organization_id = v_org
    AND (v_is_admin OR assigned_to = auth.uid());

  -- Total de deals que JÁ passaram por essa etapa
  SELECT COUNT(DISTINCT e.deal_id)::int INTO v_passed_count
  FROM public.deal_stage_events e
  JOIN public.deals d ON d.id = e.deal_id
  WHERE e.funnel_id = p_funnel_id
    AND e.to_stage_id = p_stage_id
    AND e.organization_id = v_org
    AND (v_is_admin OR d.assigned_to = auth.uid());

  -- Quantos desses estão como ganhos
  SELECT COUNT(*)::int INTO v_won_count
  FROM public.deals d
  WHERE d.funnel_id = p_funnel_id
    AND d.status = 'won'
    AND d.organization_id = v_org
    AND (v_is_admin OR d.assigned_to = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.deal_stage_events e
      WHERE e.deal_id = d.id AND e.to_stage_id = p_stage_id
    );

  -- Quantos avançaram
  WITH entries AS (
    SELECT e.deal_id, MIN(e.entered_at) AS entered_at
    FROM public.deal_stage_events e
    JOIN public.deals d ON d.id = e.deal_id
    WHERE e.funnel_id = p_funnel_id
      AND e.to_stage_id = p_stage_id
      AND e.organization_id = v_org
      AND (v_is_admin OR d.assigned_to = auth.uid())
    GROUP BY e.deal_id
  ),
  next_event AS (
    SELECT e.deal_id, e.entered_at AS entered_at,
           (SELECT MIN(n.entered_at) FROM public.deal_stage_events n
              WHERE n.deal_id = e.deal_id AND n.entered_at > e.entered_at) AS next_at
    FROM entries e
  )
  SELECT COUNT(*) FILTER (WHERE next_at IS NOT NULL)::int,
         AVG(EXTRACT(EPOCH FROM (next_at - entered_at)) / 86400.0) FILTER (WHERE next_at IS NOT NULL)
    INTO v_advanced_count, v_avg_advance
  FROM next_event;

  -- Tempo médio para fechamento
  WITH entries AS (
    SELECT e.deal_id, MIN(e.entered_at) AS entered_at
    FROM public.deal_stage_events e
    JOIN public.deals d ON d.id = e.deal_id
    WHERE e.funnel_id = p_funnel_id
      AND e.to_stage_id = p_stage_id
      AND e.organization_id = v_org
      AND (v_is_admin OR d.assigned_to = auth.uid())
    GROUP BY e.deal_id
  )
  SELECT AVG(EXTRACT(EPOCH FROM (d.updated_at - e.entered_at)) / 86400.0)
    INTO v_avg_close
  FROM entries e
  JOIN public.deals d ON d.id = e.deal_id
  WHERE d.status = 'won';

  close_probability := CASE WHEN v_passed_count > 0 THEN ROUND((v_won_count::numeric / v_passed_count) * 100)::int ELSE 0 END;
  advance_probability := CASE WHEN v_passed_count > 0 THEN ROUND((v_advanced_count::numeric / v_passed_count) * 100)::int ELSE 0 END;
  avg_days_to_advance := COALESCE(ROUND(v_avg_advance, 1), 0);
  avg_days_to_close := COALESCE(ROUND(v_avg_close, 1), 0);

  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 14. TRIGGER no record_deal_stage_event para preencher organization_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_deal_stage_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_stage_events (deal_id, funnel_id, from_stage_id, to_stage_id, entered_at, organization_id)
    VALUES (NEW.id, NEW.funnel_id, NULL, NEW.stage_id, NEW.created_at, NEW.organization_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.deal_stage_events (deal_id, funnel_id, from_stage_id, to_stage_id, entered_at, organization_id)
    VALUES (NEW.id, NEW.funnel_id, OLD.stage_id, NEW.stage_id, now(), NEW.organization_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Recriar trigger se não existir
DROP TRIGGER IF EXISTS trg_record_deal_stage_event ON public.deals;
CREATE TRIGGER trg_record_deal_stage_event
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.record_deal_stage_event();