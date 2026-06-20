-- OmniMob Fase 4A — Correcao de seguranca
-- Funcoes SECURITY DEFINER que escrevem para user_id arbitrario NAO podem ser
-- executaveis por anon/authenticated (Postgres concede a PUBLIC por padrao).
-- Mantem apenas service_role (edge functions / RPCs internas).

REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,uuid,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,uuid,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.notify_deal_owners(text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_deal_owners(text,text,text,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.notify_deal_owners(text,text,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_deal_owners(text,text,text,text,jsonb) TO service_role;

-- mark_* e get_unread operam sobre auth.uid() (so afetam o proprio usuario),
-- mas anon nao deve chamar. Restringe a authenticated + service_role.
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.get_unread_notification_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unread_notification_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;
