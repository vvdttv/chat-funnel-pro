-- ============================================================================
-- Fix 1.2 — RPCs p/ a UI de permissões do Modo Treinador
-- list (sem expor hash) + delete. upsert já existe (upsert_feedback_permission).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.list_feedback_permissions()
RETURNS TABLE(id bigint, phone_e164 text, label text, is_active boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT fp.id, fp.phone_e164, fp.label, fp.is_active, fp.created_at
  FROM public.feedback_permissions fp
  WHERE fp.organization_id = public.current_org_id()
    AND (public.is_org_admin() OR public.is_superadmin(auth.uid()))
  ORDER BY fp.created_at ASC;
$fn$;
REVOKE ALL ON FUNCTION public.list_feedback_permissions() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_feedback_permissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_feedback_permission(p_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_org uuid := public.current_org_id();
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.feedback_permissions WHERE id = p_id AND organization_id = v_org;
END;
$fn$;
REVOKE ALL ON FUNCTION public.delete_feedback_permission(bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_feedback_permission(bigint) TO authenticated;

COMMIT;
