-- 1. Campos de autonomia da IA em funnel_stages
ALTER TABLE public.funnel_stages
  ADD COLUMN IF NOT EXISTS ai_autonomy_mode text NOT NULL DEFAULT 'suggest_only',
  ADD COLUMN IF NOT EXISTS ai_approval_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_response_delay_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.funnel_stages
  ADD CONSTRAINT funnel_stages_ai_autonomy_mode_check
  CHECK (ai_autonomy_mode IN ('autonomous', 'suggest_only', 'approval_first_n', 'disabled'));

-- 2. lead_channels: mapeia telefone -> deal
CREATE TABLE IF NOT EXISTS public.lead_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  provider text,
  external_contact_id text NOT NULL,
  phone_e164 text,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_channels_org_channel_contact_uniq
  ON public.lead_channels (organization_id, channel, external_contact_id);
CREATE INDEX IF NOT EXISTS lead_channels_deal_idx ON public.lead_channels (deal_id);
CREATE INDEX IF NOT EXISTS lead_channels_phone_idx ON public.lead_channels (phone_e164);

ALTER TABLE public.lead_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem canais da org"
  ON public.lead_channels FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam canais"
  ON public.lead_channels FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Admins atualizam canais"
  ON public.lead_channels FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Admins excluem canais"
  ON public.lead_channels FOR DELETE TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE TRIGGER update_lead_channels_updated_at
  BEFORE UPDATE ON public.lead_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ai_response_queue: fila de respostas da IA
CREATE TABLE IF NOT EXISTS public.ai_response_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id text NOT NULL,
  funnel_id text NOT NULL,
  stage_id text NOT NULL,
  lead_channel_id uuid REFERENCES public.lead_channels(id) ON DELETE SET NULL,
  ia_decision_log_id uuid,
  lead_message text NOT NULL,
  suggested_response text,
  final_response text,
  status text NOT NULL DEFAULT 'pending',
  autonomy_mode text NOT NULL,
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  failure_reason text,
  attempts integer NOT NULL DEFAULT 0,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_response_queue
  ADD CONSTRAINT ai_response_queue_status_check
  CHECK (status IN ('pending', 'awaiting_approval', 'approved', 'sent', 'rejected', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS ai_response_queue_status_idx ON public.ai_response_queue (status, scheduled_send_at);
CREATE INDEX IF NOT EXISTS ai_response_queue_deal_idx ON public.ai_response_queue (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_response_queue_org_idx ON public.ai_response_queue (organization_id, status);

ALTER TABLE public.ai_response_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem fila da org"
  ON public.ai_response_queue FOR SELECT TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Corretores veem fila dos seus deals"
  ON public.ai_response_queue FOR SELECT TO authenticated
  USING (
    organization_id = current_org_id()
    AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = ai_response_queue.deal_id AND d.assigned_to = auth.uid())
  );

CREATE POLICY "Membros inserem itens na fila da org"
  ON public.ai_response_queue FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "Admins atualizam fila"
  ON public.ai_response_queue FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Corretores aprovam itens dos seus deals"
  ON public.ai_response_queue FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = ai_response_queue.deal_id AND d.assigned_to = auth.uid())
  );

CREATE POLICY "Admins excluem itens da fila"
  ON public.ai_response_queue FOR DELETE TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE TRIGGER update_ai_response_queue_updated_at
  BEFORE UPDATE ON public.ai_response_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();