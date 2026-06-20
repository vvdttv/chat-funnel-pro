-- ============================================================================
-- OmniMob — Fase 6: Restauração de policies RLS (drift banco vs repo)
-- ----------------------------------------------------------------------------
-- PROBLEMA: 18 tabelas que o frontend acessa direto tinham RLS HABILITADO mas
-- ZERO policies -> PostgREST nega todo acesso a authenticated/anon. Provado:
-- como usuario autenticado real, funnels=0/3, funnel_stages=0/10, deals=0.
-- O Kanban/funil ficaria vazio para qualquer usuario logado. As migrations do
-- repo definiam essas policies, mas elas nao existem no banco live.
--
-- CORRECAO: recriar policies (idempotente) seguindo o padrao canonico que ja
-- funciona no live (properties / devolutiva_field_defs, Fase 3B):
--   * SELECT  -> membros da org (organization_id = current_org_id())
--   * INSERT/UPDATE/DELETE -> admin OU superadmin
-- Excecoes:
--   * deals / deal_activities -> tambem o corretor dono (assigned_to=auth.uid())
--   * organizations -> escopo por id = current_org_id()
--
-- NAO TOCA tabelas deny-all de segredos (system_config, source_config,
-- stripe_events, webhook_*, processed_stripe_events) -- propositais (Fase 5).
-- REVERSIVEL: policies nomeadas (prefixo omni_); podem ser dropadas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- organizations: membro ve a propria; admin atualiza
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "omni_org_select" ON public.organizations;
CREATE POLICY "omni_org_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());
DROP POLICY IF EXISTS "omni_org_update" ON public.organizations;
CREATE POLICY "omni_org_update" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- ---------------------------------------------------------------------------
-- funnels
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "omni_funnels_select" ON public.funnels;
CREATE POLICY "omni_funnels_select" ON public.funnels FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS "omni_funnels_write" ON public.funnels;
CREATE POLICY "omni_funnels_write" ON public.funnels FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- ---------------------------------------------------------------------------
-- funnel_stages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "omni_funnel_stages_select" ON public.funnel_stages;
CREATE POLICY "omni_funnel_stages_select" ON public.funnel_stages FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS "omni_funnel_stages_write" ON public.funnel_stages;
CREATE POLICY "omni_funnel_stages_write" ON public.funnel_stages FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- ---------------------------------------------------------------------------
-- deals: corretor ve/edita os seus; admin ve/edita todos da org
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "omni_deals_select" ON public.deals;
CREATE POLICY "omni_deals_select" ON public.deals FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR assigned_to = auth.uid()));
DROP POLICY IF EXISTS "omni_deals_insert" ON public.deals;
CREATE POLICY "omni_deals_insert" ON public.deals FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id()
              AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR assigned_to = auth.uid()));
DROP POLICY IF EXISTS "omni_deals_update" ON public.deals;
CREATE POLICY "omni_deals_update" ON public.deals FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR assigned_to = auth.uid()))
  WITH CHECK (organization_id = public.current_org_id()
              AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR assigned_to = auth.uid()));
DROP POLICY IF EXISTS "omni_deals_delete" ON public.deals;
CREATE POLICY "omni_deals_delete" ON public.deals FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- ---------------------------------------------------------------------------
-- deal_activities: visivel/editavel se o deal-pai e visivel ao usuario
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "omni_deal_activities_all" ON public.deal_activities;
CREATE POLICY "omni_deal_activities_all" ON public.deal_activities FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND EXISTS (SELECT 1 FROM public.deals d
                     WHERE d.id = deal_activities.deal_id
                       AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR d.assigned_to = auth.uid())))
  WITH CHECK (organization_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- Tabelas de configuracao org-scoped (SELECT membros / escrita admin):
-- activity_types, followup_ladders, handoff_triggers, ia_config_sessions,
-- ia_decision_logs, ia_rules, ia_skills, ia_skill_nodes, ia_skill_guardrails,
-- lead_behaviors, playbook_overrides, playbook_override_snapshots, stage_playbooks
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'activity_types','followup_ladders','handoff_triggers','ia_config_sessions',
    'ia_decision_logs','ia_rules','ia_skills','ia_skill_nodes','ia_skill_guardrails',
    'lead_behaviors','playbook_overrides','playbook_override_snapshots','stage_playbooks'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'omni_'||t||'_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organization_id = public.current_org_id())',
      'omni_'||t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'omni_'||t||'_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid()))) '
      'WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))',
      'omni_'||t||'_write', t);
  END LOOP;
END
$do$;
