-- =====================================================================
-- OmniMob — Fase J-2b-1a: Permissao de corretor por funil + roleta com acesso
-- Decisao do cliente: corretor de locacao != corretor de vendas. O acesso e
-- configuravel POR FUNIL (um corretor pode acessar 1 ou varios funis). A roleta
-- de cada funil so distribui entre quem tem acesso aquele funil.
-- Permissao por user_id (serve corretor/atendente). Admin/superadmin veem todos
-- (sem precisar de registro). Sem corretor com acesso => card sem corretor +
-- aviso (comportamento atual mantido).
-- ATOMICA + idempotente + nao-destrutiva (sem registro = comportamento atual).
-- =====================================================================
BEGIN;

-- 1) Tabela de acesso a funil por usuario.
CREATE TABLE IF NOT EXISTS public.funnel_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  funnel_id       text NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, funnel_id)
);
CREATE INDEX IF NOT EXISTS idx_funnel_access_user   ON public.funnel_access (user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_access_funnel ON public.funnel_access (funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_access_org    ON public.funnel_access (organization_id);

ALTER TABLE public.funnel_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omni_funnel_access_select ON public.funnel_access;
CREATE POLICY omni_funnel_access_select ON public.funnel_access FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS omni_funnel_access_write ON public.funnel_access;
CREATE POLICY omni_funnel_access_write ON public.funnel_access FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 2) Helper: usuario tem acesso ao funil? Admin/superadmin sempre TRUE.
--    Sem nenhum registro de acesso PARA O FUNIL na org => ninguem restrito ainda
--    (mas a regra e por usuario: se o user nao tem registro, NAO tem acesso,
--    exceto admin). STABLE.
CREATE OR REPLACE FUNCTION public.user_has_funnel_access(
  p_user_id uuid, p_funnel_id text, p_org uuid)
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  -- admin/superadmin da org veem/atuam em todos os funis
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role IN ('admin','superadmin') THEN RETURN true; END IF;
  IF public.is_superadmin(p_user_id) THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.funnel_access fa
    WHERE fa.user_id = p_user_id AND fa.funnel_id = p_funnel_id
      AND fa.organization_id = p_org);
END;
$function$;
REVOKE ALL ON FUNCTION public.user_has_funnel_access(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_funnel_access(uuid,text,uuid) TO authenticated, service_role;

-- 3) Roleta de corretor CIENTE DO FUNIL. Novo parametro opcional p_funnel_id:
--    quando informado, so sorteia entre corretores (broker_profiles) cujo
--    user_id tem acesso aquele funil (via funnel_access) OU e admin. Quando
--    NULL, mantem o comportamento atual (qualquer corretor ativo da org) =
--    nao-destrutivo p/ as chamadas existentes do funil de vendas.
--    ATENCAO: adicionar param muda a assinatura => DROP da versao 1-arg antes
--    (senao fica sobrecarga ambigua). As chamadas assign_broker_internal(org)
--    continuam validas pois p_funnel_id tem DEFAULT NULL.
DROP FUNCTION IF EXISTS public.assign_broker_internal(uuid);
CREATE OR REPLACE FUNCTION public.assign_broker_internal(
  p_org uuid, p_funnel_id text DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_broker_id uuid;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'org_obrigatoria';
  END IF;

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
    -- Filtro por acesso ao funil (so quando p_funnel_id informado).
    AND (p_funnel_id IS NULL
         OR public.user_has_funnel_access(b.user_id, p_funnel_id, p_org))
  ORDER BY (b.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC,
           b.position ASC, b.id ASC
  LIMIT 1;

  RETURN v_broker_id;  -- pode ser NULL (sem corretor com acesso => admin redistribui)
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_broker_internal(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_broker_internal(uuid,text) TO service_role;

COMMIT;
