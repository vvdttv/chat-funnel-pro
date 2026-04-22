
CREATE TABLE public.playbook_override_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  override_id UUID,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  action TEXT NOT NULL DEFAULT 'upsert',
  note TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_override_snapshots_scope
  ON public.playbook_override_snapshots (organization_id, scope_type, scope_id, layer, created_at DESC);

CREATE INDEX idx_playbook_override_snapshots_override
  ON public.playbook_override_snapshots (override_id, created_at DESC);

ALTER TABLE public.playbook_override_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem snapshots da org"
  ON public.playbook_override_snapshots FOR SELECT
  TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam snapshots"
  ON public.playbook_override_snapshots FOR INSERT
  TO authenticated
  WITH CHECK ((organization_id = current_org_id()) AND is_org_admin());
