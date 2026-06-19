-- Correção RLS para deal_tags e email_logs
-- Usa organization_id direto com auth.uid() via profiles

DROP POLICY IF EXISTS deal_tags_org_access ON deal_tags;
DROP POLICY IF EXISTS deal_tag_assignments_access ON deal_tag_assignments;
DROP POLICY IF EXISTS email_logs_org_read ON email_logs;
DROP POLICY IF EXISTS email_logs_service_write ON email_logs;
DROP POLICY IF EXISTS email_logs_service_update ON email_logs;

-- deal_tags: usuários autenticados da mesma org
CREATE POLICY deal_tags_org_access ON deal_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      JOIN organizations o ON o.id = deal_tags.organization_id
      WHERE p.id = auth.uid() AND p.organization_id = deal_tags.organization_id
    )
  );

-- deal_tag_assignments: acesso via deal -> organização
CREATE POLICY deal_tag_assignments_access ON deal_tag_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN profiles p ON p.organization_id = d.organization_id
      WHERE d.id = deal_tag_assignments.deal_id AND p.id = auth.uid()
    )
  );

-- email_logs: acesso via organização do usuário
CREATE POLICY email_logs_org_read ON email_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.organization_id = email_logs.organization_id
    )
    OR email_logs.created_by = auth.uid()
  );

CREATE POLICY email_logs_service_write ON email_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY email_logs_service_update ON email_logs
  FOR UPDATE USING (true);
