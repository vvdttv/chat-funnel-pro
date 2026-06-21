-- ============================================================================
-- Fix 2.1 — get_pending_ai_responses retorna funnel_id (corrige funnelId
-- hardcoded no TrainIADialog). Idempotente (CREATE OR REPLACE).
-- ============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.get_pending_ai_responses();
CREATE OR REPLACE FUNCTION public.get_pending_ai_responses()
RETURNS TABLE(
  queue_id uuid, deal_id text, lead_name text, funnel_id text, stage_id text,
  lead_message text, suggested_response text, autonomy_mode text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT q.id, q.deal_id, d.lead_name, q.funnel_id, q.stage_id,
         q.lead_message, q.suggested_response, q.autonomy_mode, q.created_at
  FROM public.ai_response_queue q
  JOIN public.deals d ON d.id = q.deal_id
  WHERE q.organization_id = public.current_org_id()
    AND q.status = 'awaiting_approval'
    AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR d.assigned_to = auth.uid())
  ORDER BY q.created_at ASC;
$fn$;
REVOKE ALL ON FUNCTION public.get_pending_ai_responses() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_pending_ai_responses() TO authenticated;
COMMIT;
