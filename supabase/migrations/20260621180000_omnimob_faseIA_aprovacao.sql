-- ============================================================================
-- Fase I-A — Aprovação humana de respostas da IA (modo assistido) (§4.13)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Rede de segurança ANTES de ligar autonomia: o admin/corretor vê as sugestões
-- da IA (status awaiting_approval), edita se quiser, e Aprova ou Rejeita.
-- Aprovar → status 'approved' + final_response gravado → o dispatch-ai-queue
-- envia no próximo tick (reusa send-whatsapp-message; NÃO reprocessa pela IA).
-- ============================================================================

-- ---- 1. Lista as sugestões pendentes de aprovação (da org do usuário) -------
CREATE OR REPLACE FUNCTION public.get_pending_ai_responses()
RETURNS TABLE(
  queue_id uuid, deal_id text, lead_name text, stage_id text,
  lead_message text, suggested_response text, autonomy_mode text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT q.id, q.deal_id, d.lead_name, q.stage_id,
         q.lead_message, q.suggested_response, q.autonomy_mode, q.created_at
  FROM public.ai_response_queue q
  JOIN public.deals d ON d.id = q.deal_id
  WHERE q.organization_id = public.current_org_id()
    AND q.status = 'awaiting_approval'
    AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR d.assigned_to = auth.uid())
  ORDER BY q.created_at ASC;
$fn$;

-- ---- 2. Aprovar (com edição opcional do texto) ------------------------------
CREATE OR REPLACE FUNCTION public.approve_ai_response(p_queue_id uuid, p_edited_text text DEFAULT NULL)
RETURNS TABLE(queue_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_text text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;

  SELECT q.id, q.status, q.deal_id, q.suggested_response, d.assigned_to
    INTO v_locked
  FROM public.ai_response_queue q
  JOIN public.deals d ON d.id = q.deal_id
  WHERE q.id = p_queue_id AND q.organization_id = v_org
  FOR UPDATE OF q;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestao_nao_encontrada'; END IF;

  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR v_locked.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF v_locked.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'sugestao_nao_esta_aguardando (status=%)', v_locked.status;
  END IF;

  v_text := COALESCE(NULLIF(btrim(p_edited_text), ''), v_locked.suggested_response);
  IF v_text IS NULL OR btrim(v_text) = '' THEN RAISE EXCEPTION 'texto_vazio'; END IF;

  UPDATE public.ai_response_queue
     SET status = 'approved',
         final_response = v_text,
         approved_by = auth.uid(),
         approved_at = v_now,
         updated_at = v_now
   WHERE id = p_queue_id;

  queue_id := p_queue_id; status := 'approved';
  RETURN NEXT;
END;
$fn$;

-- ---- 3. Rejeitar (não envia; encerra a sugestão com motivo) -----------------
CREATE OR REPLACE FUNCTION public.reject_ai_response(p_queue_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE(queue_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  SELECT q.id, q.status, d.assigned_to INTO v_locked
  FROM public.ai_response_queue q
  JOIN public.deals d ON d.id = q.deal_id
  WHERE q.id = p_queue_id AND q.organization_id = v_org
  FOR UPDATE OF q;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestao_nao_encontrada'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR v_locked.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF v_locked.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'sugestao_nao_esta_aguardando (status=%)', v_locked.status;
  END IF;

  UPDATE public.ai_response_queue
     SET status = 'rejected', rejected_reason = p_reason, updated_at = now()
   WHERE id = p_queue_id;

  queue_id := p_queue_id; status := 'rejected';
  RETURN NEXT;
END;
$fn$;

-- ---- 4. Permissões: só authenticated (RLS via current_org_id nas funcs) -----
REVOKE ALL ON FUNCTION public.get_pending_ai_responses() FROM anon, public;
REVOKE ALL ON FUNCTION public.approve_ai_response(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.reject_ai_response(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_pending_ai_responses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_ai_response(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_ai_response(uuid, text) TO authenticated;
