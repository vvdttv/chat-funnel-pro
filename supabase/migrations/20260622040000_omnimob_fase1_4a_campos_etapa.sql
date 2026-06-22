BEGIN;

-- =====================================================================
-- Fase 1.4a — Campos obrigatórios por etapa (modelo de dados)
-- Não-destrutivo. Preserva Fase C (4 criterios fun-ia-mcmv/ia-atendimento).
-- =====================================================================

-- (1) owner em stage_qualification_criteria (ia | corretor | ambos)
ALTER TABLE public.stage_qualification_criteria
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'ia';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sqc_owner_chk') THEN
    ALTER TABLE public.stage_qualification_criteria
      ADD CONSTRAINT sqc_owner_chk
      CHECK (owner = ANY (ARRAY['ia','corretor','ambos']));
  END IF;
END $$;

-- (2) ampliar criterion_type p/ select_single / select_multi (padronizacao via config.options)
ALTER TABLE public.stage_qualification_criteria
  DROP CONSTRAINT IF EXISTS sqc_type_chk;
ALTER TABLE public.stage_qualification_criteria
  ADD CONSTRAINT sqc_type_chk
  CHECK (criterion_type = ANY (ARRAY[
    'boolean','threshold','enum','text','select_single','select_multi'
  ]));

-- (3) deal_field_values — o dado DE FATO coletado por deal
CREATE TABLE IF NOT EXISTS public.deal_field_values (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id         text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  criterion_id    uuid REFERENCES public.stage_qualification_criteria(id) ON DELETE SET NULL,
  field_key       text NOT NULL,
  value           jsonb NOT NULL DEFAULT 'null'::jsonb,
  owner           text NOT NULL DEFAULT 'ia',
  source          text NOT NULL DEFAULT 'ia',
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dfv_owner_chk  CHECK (owner  = ANY (ARRAY['ia','corretor','ambos'])),
  CONSTRAINT dfv_source_chk CHECK (source = ANY (ARRAY['ia','corretor','admin'])),
  CONSTRAINT dfv_deal_field_uniq UNIQUE (deal_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_dfv_deal     ON public.deal_field_values (deal_id);
CREATE INDEX IF NOT EXISTS idx_dfv_org_deal ON public.deal_field_values (organization_id, deal_id);

DROP TRIGGER IF EXISTS trg_dfv_updated ON public.deal_field_values;
CREATE TRIGGER trg_dfv_updated BEFORE UPDATE ON public.deal_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- (4) RLS — padrao canonico (membro le da org; escrita admin OU corretor dono do deal)
ALTER TABLE public.deal_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_dfv_select ON public.deal_field_values;
CREATE POLICY omni_dfv_select ON public.deal_field_values
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

DROP POLICY IF EXISTS omni_dfv_insert ON public.deal_field_values;
CREATE POLICY omni_dfv_insert ON public.deal_field_values
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = current_org_id()
    AND (
      is_org_admin()
      OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS omni_dfv_update ON public.deal_field_values;
CREATE POLICY omni_dfv_update ON public.deal_field_values
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND (
      is_org_admin()
      OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.assigned_to = auth.uid())
    )
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND (
      is_org_admin()
      OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS omni_dfv_delete ON public.deal_field_values;
CREATE POLICY omni_dfv_delete ON public.deal_field_values
  FOR DELETE TO authenticated
  USING (organization_id = current_org_id() AND is_org_admin());

COMMIT;
