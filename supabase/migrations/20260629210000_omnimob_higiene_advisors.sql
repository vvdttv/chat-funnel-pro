-- Higiene pós-auditoria advisors (2026-06-29 sessão 2).
-- Originada da auditoria automática que rodou após J-2b-7.
-- 1) Fecha grant aberto a anon/authenticated em RPC *_internal.
--    Causa: DROP+CREATE da Fase 1.4b re-herdou DEFAULT PRIVILEGES do Supabase.
--    Lição "revoke-ultimo" já documentada (event trigger ddl_command_end reconcede).
-- 2) Cria índices em FKs novas (J-2b + I-B) que ainda não tinham leading index.
--    Mais barato manter agora (banco vazio) do que depois com carga real.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.generate_next_action_suggestion_internal(text, text)
  FROM anon, authenticated, public;

CREATE INDEX IF NOT EXISTS idx_pinsp_property_id ON public.property_inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_ife_org           ON public.ia_feedback_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ifs_org           ON public.ia_feedback_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ifs_perm          ON public.ia_feedback_sessions(permission_id);
CREATE INDEX IF NOT EXISTS idx_inspectors_user   ON public.inspectors(user_id);
CREATE INDEX IF NOT EXISTS idx_pii_org           ON public.property_inspection_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_ia_user           ON public.insurer_attendants(user_id);

COMMIT;
